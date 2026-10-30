import { QUESTION_TOKENS, tokenize, type KeywordRecord } from "./keywords";

export type LengthBucket = "short" | "mid" | "long";

export const LENGTH_BUCKETS: { id: LengthBucket; label: string; hint: string }[] = [
  { id: "short", label: "Short-tail", hint: "1–2 words" },
  { id: "mid", label: "Mid-tail", hint: "3–4 words" },
  { id: "long", label: "Long-tail", hint: "5+ words" },
];

export function lengthBucketOf(wordCount: number): LengthBucket {
  if (wordCount <= 2) return "short";
  if (wordCount <= 4) return "mid";
  return "long";
}

/** The first question word in a keyword ("how", "what", "কেন" …), or null. */
export function questionWordOf(keyword: string): string | null {
  return tokenize(keyword).find((t) => QUESTION_TOKENS.has(t)) ?? null;
}

export const OTHER_QUESTION = "other";

export function questionBreakdown(records: KeywordRecord[]): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.intent !== "question") continue;
    const word = questionWordOf(record.keyword) ?? OTHER_QUESTION;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "without", "at", "by", "from", "as",
  "into", "about", "near", "me", "my", "your", "you", "i", "it", "its", "be", "are", "was", "do", "vs", "&",
  "এবং", "ও", "এর", "না", "করে", "জন্য", "থেকে", "সাথে", "মধ্যে",
]);

/** Terms that co-occur most with the seed, counted once per keyword. */
export function relatedTerms(records: KeywordRecord[], seed: string, limit = 40): { term: string; count: number }[] {
  const seedTokens = new Set(tokenize(seed));
  const counts = new Map<string, number>();
  for (const record of records) {
    const seen = new Set<string>();
    for (const token of tokenize(record.keyword)) {
      if (token.length < 2 || seen.has(token) || seedTokens.has(token) || STOPWORDS.has(token) || QUESTION_TOKENS.has(token)) {
        continue;
      }
      seen.add(token);
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

/** Markdown FAQ outline of the question keywords, grouped by question word. */
export function buildFaqOutline(records: KeywordRecord[], seed: string): string {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    if (record.intent !== "question") continue;
    const word = questionWordOf(record.keyword) ?? OTHER_QUESTION;
    const question = record.keyword.charAt(0).toLocaleUpperCase() + record.keyword.slice(1);
    const list = groups.get(word) ?? [];
    list.push(question.endsWith("?") ? question : `${question}?`);
    groups.set(word, list);
  }

  const sections = [...groups]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([word, questions]) => {
      const title = word === OTHER_QUESTION ? "Other questions" : `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)} …`;
      return `## ${title}\n\n${questions.map((q) => `- ${q}`).join("\n")}`;
    });

  return `# FAQ ideas: ${seed}\n\n${sections.join("\n\n")}\n`;
}
