import { NextRequest, NextResponse } from "next/server";
import {
  LETTERS,
  classifyIntent,
  countWords,
  type Category,
  type KeywordErrorResponse,
  type KeywordGroups,
  type KeywordRecord,
  type KeywordResponse,
} from "@/lib/keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUGGEST_ENDPOINT = "https://suggestqueries.google.com/complete/search";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_SEED_LENGTH = 120;
const MAX_CUSTOM_MODIFIERS = 20;
const MAX_MODIFIER_LENGTH = 40;

// Google expects ISO country codes; "uk" is accepted from the UI but sent as "gb".
const GL_ALIASES: Record<string, string> = { uk: "gb" };

interface SuggestParams {
  gl: string;
  hl: string;
  ds: string;
}

interface PlannedQuery {
  query: string;
  category: Category;
  modifier: string;
  letter?: string;
}

const QUESTION_WORDS = ["how", "what", "why", "where", "when", "which", "who", "can", "is", "does"];
const COMMERCIAL_SUFFIXES = ["vs", "best", "review", "price", "cost", "alternative", "for", "buy", "cheap", "top"];
const COMMERCIAL_PREFIXES = ["best", "top", "cheap"];
const PREPOSITION_SUFFIXES = ["with", "without", "near", "in", "to", "like", "and", "near me"];

function parseModifiers(raw: unknown): string[] {
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const seen = new Set<string>();
  const modifiers: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const modifier = item.trim().replace(/\s+/g, " ").slice(0, MAX_MODIFIER_LENGTH);
    const key = modifier.toLocaleLowerCase();
    if (!modifier || seen.has(key)) continue;
    seen.add(key);
    modifiers.push(modifier);
    if (modifiers.length >= MAX_CUSTOM_MODIFIERS) break;
  }
  return modifiers;
}

function buildQueries(seed: string, customModifiers: string[]): PlannedQuery[] {
  const queries: PlannedQuery[] = [{ query: seed, category: "base", modifier: "seed" }];

  for (const letter of LETTERS) {
    queries.push({ query: `${seed} ${letter}`, category: "alphabetical", modifier: letter, letter });
  }

  for (const word of QUESTION_WORDS) {
    queries.push({ query: `${word} ${seed}`, category: "questions", modifier: `${word} …` });
  }
  for (const word of QUESTION_WORDS) {
    queries.push({ query: `${seed} ${word}`, category: "questions", modifier: `… ${word}` });
  }

  for (const word of COMMERCIAL_SUFFIXES) {
    queries.push({ query: `${seed} ${word}`, category: "commercial", modifier: `… ${word}` });
  }
  for (const word of COMMERCIAL_PREFIXES) {
    queries.push({ query: `${word} ${seed}`, category: "commercial", modifier: `${word} …` });
  }

  for (const word of PREPOSITION_SUFFIXES) {
    queries.push({ query: `${seed} ${word}`, category: "prepositions", modifier: `… ${word}` });
  }
  queries.push({ query: `_ ${seed}`, category: "prepositions", modifier: "_ … (wildcard)" });
  queries.push({ query: `${seed} _`, category: "prepositions", modifier: "… _ (wildcard)" });

  // A "*" in a custom modifier is a template slot for the seed ("best * in dhaka"); otherwise it is a suffix.
  for (const modifier of customModifiers) {
    queries.push(
      modifier.includes("*")
        ? { query: modifier.replace(/\*/g, seed), category: "custom", modifier }
        : { query: `${seed} ${modifier}`, category: "custom", modifier: `… ${modifier}` },
    );
  }

  return queries;
}

function decodeBody(buffer: ArrayBuffer, contentType: string | null): string {
  const charset = /charset=([^;]+)/i.exec(contentType ?? "")?.[1]?.trim().toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

async function fetchSuggestions(query: string, { gl, hl, ds }: SuggestParams): Promise<string[]> {
  const params = new URLSearchParams({ client: "firefox", ie: "UTF-8", oe: "UTF-8", hl, q: query });
  if (gl) params.set("gl", gl);
  if (ds) params.set("ds", ds);

  const response = await fetch(`${SUGGEST_ENDPOINT}?${params.toString()}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/javascript, */*",
      "Accept-Language": hl,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Suggest API responded with HTTP ${response.status}`);

  const text = decodeBody(await response.arrayBuffer(), response.headers.get("content-type"));
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];

  return (data[1] as unknown[])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

async function runInBatches(
  plan: PlannedQuery[],
  params: SuggestParams,
): Promise<PromiseSettledResult<string[]>[]> {
  const results: PromiseSettledResult<string[]>[] = [];
  for (let i = 0; i < plan.length; i += BATCH_SIZE) {
    const batch = plan.slice(i, i + BATCH_SIZE);
    results.push(...(await Promise.allSettled(batch.map((q) => fetchSuggestions(q.query, params)))));
  }
  return results;
}

function aggregate(plan: PlannedQuery[], results: PromiseSettledResult<string[]>[]) {
  const records = new Map<string, KeywordRecord>();
  const groups: KeywordGroups = {
    base: [],
    alphabetical: Object.fromEntries(LETTERS.map((l) => [l, [] as string[]])),
    questions: [],
    commercial: [],
    prepositions: [],
    custom: [],
    all: [],
  };
  const seenPerGroup = new Map<string, Set<string>>();

  const addToGroup = (groupKey: string, list: string[], keyword: string, key: string) => {
    let seen = seenPerGroup.get(groupKey);
    if (!seen) {
      seen = new Set();
      seenPerGroup.set(groupKey, seen);
    }
    if (seen.has(key)) return;
    seen.add(key);
    list.push(keyword);
  };

  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const planned = plan[index];

    for (const suggestion of result.value) {
      const key = suggestion.toLocaleLowerCase();
      let record = records.get(key);
      if (!record) {
        record = {
          keyword: suggestion,
          category: planned.category,
          modifier: planned.modifier,
          categories: [planned.category],
          intent: classifyIntent(suggestion),
          wordCount: countWords(suggestion),
        };
        records.set(key, record);
        groups.all.push(record.keyword);
      } else if (!record.categories.includes(planned.category)) {
        record.categories.push(planned.category);
      }

      if (planned.category === "alphabetical" && planned.letter) {
        addToGroup(`az:${planned.letter}`, groups.alphabetical[planned.letter], record.keyword, key);
      } else if (planned.category !== "alphabetical") {
        addToGroup(planned.category, groups[planned.category], record.keyword, key);
      }
    }
  });

  return { keywords: [...records.values()], groups };
}

function errorResponse(message: string, status: number) {
  return NextResponse.json<KeywordErrorResponse>({ error: message }, { status });
}

async function handle(input: { seed?: unknown; gl?: unknown; hl?: unknown; ds?: unknown; extra?: unknown }) {
  const seed = typeof input.seed === "string" ? input.seed.trim().replace(/\s+/g, " ") : "";
  const glRaw = typeof input.gl === "string" ? input.gl.trim().toLowerCase() : "us";
  const hl = typeof input.hl === "string" && input.hl.trim() ? input.hl.trim().toLowerCase() : "en";
  const ds = typeof input.ds === "string" ? input.ds.trim().toLowerCase() : "";

  if (!seed) return errorResponse("The `seed` parameter is required.", 400);
  if (seed.length > MAX_SEED_LENGTH) {
    return errorResponse(`The seed keyword must be at most ${MAX_SEED_LENGTH} characters.`, 400);
  }
  if (glRaw && glRaw !== "global" && !/^[a-z]{2}$/.test(glRaw)) {
    return errorResponse("`gl` must be a two-letter country code or empty for global.", 400);
  }
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(hl)) return errorResponse("`hl` must be a valid language code.", 400);
  if (ds !== "" && ds !== "yt") return errorResponse("`ds` must be empty (Google Web) or \"yt\" (YouTube).", 400);

  const gl = glRaw === "global" ? "" : glRaw;
  const params: SuggestParams = { gl: GL_ALIASES[gl] ?? gl, hl, ds };

  const customModifiers = parseModifiers(input.extra);

  const started = performance.now();
  const plan = buildQueries(seed, customModifiers);
  const results = await runInBatches(plan, params);
  const durationMs = Math.round(performance.now() - started);

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  if (succeeded === 0) {
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    const reason = firstError?.reason instanceof Error ? firstError.reason.message : "Unknown error";
    return errorResponse(`All ${plan.length} suggest requests failed (${reason}). Google may be rate limiting this IP.`, 502);
  }

  const { keywords, groups } = aggregate(plan, results);
  const body: KeywordResponse = {
    seed,
    gl,
    hl,
    ds,
    customModifiers,
    generatedAt: new Date().toISOString(),
    stats: {
      totalQueries: plan.length,
      succeeded,
      failed: plan.length - succeeded,
      durationMs,
      totalUnique: keywords.length,
      questions: keywords.filter((k) => k.intent === "question").length,
      commercial: keywords.filter((k) => k.intent === "commercial").length,
      informational: keywords.filter((k) => k.intent === "informational").length,
    },
    keywords,
    groups,
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return handle({
    seed: sp.get("seed") ?? undefined,
    gl: sp.get("gl") ?? undefined,
    hl: sp.get("hl") ?? undefined,
    ds: sp.get("ds") ?? undefined,
    extra: sp.get("extra") ?? undefined,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }
  if (!body || typeof body !== "object") return errorResponse("Request body must be a JSON object.", 400);
  return handle(body as Record<string, unknown>);
}
