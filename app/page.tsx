"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  Filter,
  Globe,
  Hash,
  History,
  Languages,
  ListChecks,
  Loader2,
  LogOut,
  MonitorPlay,
  MousePointerClick,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import InsightsPanel from "@/components/InsightsPanel";
import {
  CATEGORY_LABELS,
  INTENT_LABELS,
  LETTERS,
  type Category,
  type Intent,
  type KeywordErrorResponse,
  type KeywordRecord,
  type KeywordResponse,
} from "@/lib/keywords";
import {
  LENGTH_BUCKETS,
  OTHER_QUESTION,
  buildFaqOutline,
  lengthBucketOf,
  questionWordOf,
  type LengthBucket,
} from "@/lib/analysis";

type Platform = "web" | "yt";
type Tab = "all" | "alphabet" | "questions" | "commercial" | "prepositions" | "custom";
type IntentFilter = "all" | Intent;
type LengthFilter = "all" | LengthBucket;
type SortMode = "relevance" | "az" | "short" | "long";

interface SearchOptions {
  gl: string;
  hl: string;
  platform: Platform;
  extra: string;
}

interface HistoryEntry extends SearchOptions {
  seed: string;
  count: number;
  at: string;
}

const HISTORY_KEY = "kwi:history";
const MODIFIERS_KEY = "kwi:modifiers";
const MAX_HISTORY = 8;

const COUNTRIES = [
  { value: "bd", label: "🇧🇩 Bangladesh (bd)" },
  { value: "us", label: "🇺🇸 United States (us)" },
  { value: "uk", label: "🇬🇧 United Kingdom (uk)" },
  { value: "in", label: "🇮🇳 India (in)" },
  { value: "pk", label: "🇵🇰 Pakistan (pk)" },
  { value: "ca", label: "🇨🇦 Canada (ca)" },
  { value: "au", label: "🇦🇺 Australia (au)" },
  { value: "ae", label: "🇦🇪 UAE (ae)" },
  { value: "sa", label: "🇸🇦 Saudi Arabia (sa)" },
  { value: "sg", label: "🇸🇬 Singapore (sg)" },
  { value: "my", label: "🇲🇾 Malaysia (my)" },
  { value: "de", label: "🇩🇪 Germany (de)" },
  { value: "global", label: "🌐 Global" },
];

const LANGUAGES = [
  { value: "en", label: "English (en)" },
  { value: "bn", label: "Bengali (bn)" },
  { value: "hi", label: "Hindi (hi)" },
  { value: "ur", label: "Urdu (ur)" },
  { value: "ar", label: "Arabic (ar)" },
  { value: "es", label: "Spanish (es)" },
  { value: "de", label: "German (de)" },
];

const TABS: { id: Tab; label: string; category?: Category }[] = [
  { id: "all", label: "All Keywords" },
  { id: "alphabet", label: "A-Z Alphabet View", category: "alphabetical" },
  { id: "questions", label: "Questions (AEO)", category: "questions" },
  { id: "commercial", label: "Commercial & Comparisons", category: "commercial" },
  { id: "prepositions", label: "Prepositions", category: "prepositions" },
  { id: "custom", label: "Custom Modifiers", category: "custom" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "relevance", label: "Google order" },
  { value: "az", label: "A → Z" },
  { value: "short", label: "Shortest first" },
  { value: "long", label: "Longest first" },
];

const INTENT_STYLES: Record<Intent, string> = {
  question: "border-violet-200 bg-violet-50 text-violet-700",
  commercial: "border-emerald-200 bg-emerald-50 text-emerald-700",
  informational: "border-sky-200 bg-sky-50 text-sky-700",
};

const INTENT_DOT: Record<Intent, string> = {
  question: "bg-violet-500",
  commercial: "bg-emerald-500",
  informational: "bg-sky-500",
};

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Clipboard is not available");
}

function fileSlug(seed: string) {
  return seed.trim().replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60) || "keywords";
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); history is a convenience only.
  }
}

function serpUrl(keyword: string, data: KeywordResponse) {
  if (data.ds === "yt") return `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
  const params = new URLSearchParams({ q: keyword, hl: data.hl });
  if (data.gl) params.set("gl", data.gl === "uk" ? "gb" : data.gl);
  return `https://www.google.com/search?${params.toString()}`;
}

function countryLabel(value: string) {
  return COUNTRIES.find((c) => c.value === (value || "global"))?.label.split(" (")[0] ?? value;
}

function HighlightedKeyword({ keyword, seed }: { keyword: string; seed: string }) {
  const index = seed ? keyword.toLocaleLowerCase().indexOf(seed.toLocaleLowerCase()) : -1;
  if (index < 0) return <span className="font-medium text-zinc-900">{keyword}</span>;
  return (
    <span className="text-zinc-900">
      <span className="font-semibold">{keyword.slice(0, index)}</span>
      <span className="text-zinc-500">{keyword.slice(index, index + seed.length)}</span>
      <span className="font-semibold">{keyword.slice(index + seed.length)}</span>
    </span>
  );
}

function IntentBadge({ intent }: { intent: Intent }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium", INTENT_STYLES[intent])}>
      {INTENT_LABELS[intent]}
    </span>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
        checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 bg-white hover:border-zinc-500",
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

function KpiCard({ icon, label, value, hint, accent }: { icon: ReactNode; label: string; value: number | string; hint: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className={cn("absolute inset-y-0 left-0 w-1", accent)} />
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-zinc-900 tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{hint}</div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  children,
  disabled,
  title,
  variant = "default",
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary"
          ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500"
          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function RowAction({ onClick, href, label, children }: { onClick?: () => void; href?: string; label: string; children: ReactNode }) {
  const className =
    "rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} onClick={(e) => e.stopPropagation()} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={className}
    >
      {children}
    </button>
  );
}

export default function HomePage() {
  const [seed, setSeed] = useState("");
  const [gl, setGl] = useState("us");
  const [hl, setHl] = useState("en");
  const [platform, setPlatform] = useState<Platform>("web");
  const [extra, setExtra] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KeywordResponse | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [filterText, setFilterText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("all");
  const [questionWord, setQuestionWord] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setHistory(readStorage<HistoryEntry[]>(HISTORY_KEY, []));
    const savedModifiers = readStorage<string>(MODIFIERS_KEY, "");
    if (savedModifiers) {
      setExtra(savedModifiers);
      setShowAdvanced(true);
    }
    return () => {
      abortRef.current?.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const resetFilters = useCallback(() => {
    setFilterText("");
    setExcludeText("");
    setIntentFilter("all");
    setLengthFilter("all");
    setQuestionWord(null);
  }, []);

  const runSearch = useCallback(
    async (rawSeed: string, options: SearchOptions) => {
      const query = rawSeed.trim();
      if (!query) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          seed: query,
          gl: options.gl,
          hl: options.hl,
          ds: options.platform === "yt" ? "yt" : "",
        });
        if (options.extra.trim()) params.set("extra", options.extra);
        const res = await fetch(`/api/keywords?${params.toString()}`, { signal: controller.signal });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const json = (await res.json()) as KeywordResponse | KeywordErrorResponse;
        if (!res.ok || "error" in json) {
          throw new Error("error" in json ? json.error : `Request failed with HTTP ${res.status}`);
        }
        setData(json);
        setSelected(new Set());
        resetFilters();
        setTab((current) => (current === "custom" && json.groups.custom.length === 0 ? "all" : current));

        writeStorage(MODIFIERS_KEY, options.extra.trim());
        setHistory((prev) => {
          const entry: HistoryEntry = { seed: query, ...options, count: json.stats.totalUnique, at: json.generatedAt };
          const next = [
            entry,
            ...prev.filter(
              (h) => !(h.seed.toLocaleLowerCase() === query.toLocaleLowerCase() && h.gl === options.gl && h.hl === options.hl && h.platform === options.platform),
            ),
          ].slice(0, MAX_HISTORY);
          writeStorage(HISTORY_KEY, next);
          return next;
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [resetFilters],
  );

  const currentOptions: SearchOptions = { gl, hl, platform, extra };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch(seed, currentOptions);
  };

  const drillDown = (keyword: string) => {
    setSeed(keyword);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void runSearch(keyword, currentOptions);
  };

  const rerunHistory = (entry: HistoryEntry) => {
    setSeed(entry.seed);
    setGl(entry.gl);
    setHl(entry.hl);
    setPlatform(entry.platform);
    setExtra(entry.extra);
    if (entry.extra) setShowAdvanced(true);
    void runSearch(entry.seed, entry);
  };

  const clearHistory = () => {
    setHistory([]);
    writeStorage(HISTORY_KEY, []);
  };

  const recordMap = useMemo(() => {
    const map = new Map<string, KeywordRecord>();
    data?.keywords.forEach((k) => map.set(k.keyword, k));
    return map;
  }, [data]);

  const excludeTerms = useMemo(
    () =>
      excludeText
        .split(",")
        .map((t) => t.trim().toLocaleLowerCase())
        .filter(Boolean),
    [excludeText],
  );

  const passes = useCallback(
    (record: KeywordRecord, skip?: "intent" | "length") => {
      if (skip !== "intent" && intentFilter !== "all" && record.intent !== intentFilter) return false;
      if (skip !== "length" && lengthFilter !== "all" && lengthBucketOf(record.wordCount) !== lengthFilter) return false;
      if (questionWord && (questionWordOf(record.keyword) ?? (record.intent === "question" ? OTHER_QUESTION : null)) !== questionWord) {
        return false;
      }
      const lower = record.keyword.toLocaleLowerCase();
      const needle = filterText.trim().toLocaleLowerCase();
      if (needle && !lower.includes(needle)) return false;
      return !excludeTerms.some((term) => lower.includes(term));
    },
    [intentFilter, lengthFilter, questionWord, filterText, excludeTerms],
  );

  const tabRecords = useMemo(() => {
    if (!data) return [];
    const category = TABS.find((t) => t.id === tab)?.category;
    return category ? data.keywords.filter((k) => k.categories.includes(category)) : data.keywords;
  }, [data, tab]);

  const visibleRecords = useMemo(() => {
    const list = tabRecords.filter((r) => passes(r));
    if (sortMode === "az") return [...list].sort((a, b) => a.keyword.localeCompare(b.keyword));
    if (sortMode === "short") return [...list].sort((a, b) => a.wordCount - b.wordCount || a.keyword.length - b.keyword.length);
    if (sortMode === "long") return [...list].sort((a, b) => b.wordCount - a.wordCount || b.keyword.length - a.keyword.length);
    return list;
  }, [tabRecords, passes, sortMode]);

  const intentCounts = useMemo(() => {
    const counts: Record<IntentFilter, number> = { all: 0, question: 0, commercial: 0, informational: 0 };
    for (const record of tabRecords) {
      if (!passes(record, "intent")) continue;
      counts.all += 1;
      counts[record.intent] += 1;
    }
    return counts;
  }, [tabRecords, passes]);

  const lengthCounts = useMemo(() => {
    const counts: Record<LengthFilter, number> = { all: 0, short: 0, mid: 0, long: 0 };
    for (const record of tabRecords) {
      if (!passes(record, "length")) continue;
      counts.all += 1;
      counts[lengthBucketOf(record.wordCount)] += 1;
    }
    return counts;
  }, [tabRecords, passes]);

  const tabCounts = useMemo(() => {
    const counts: Record<Tab, number> = { all: 0, alphabet: 0, questions: 0, commercial: 0, prepositions: 0, custom: 0 };
    if (!data) return counts;
    counts.all = data.keywords.length;
    for (const k of data.keywords) {
      if (k.categories.includes("alphabetical")) counts.alphabet += 1;
      if (k.categories.includes("questions")) counts.questions += 1;
      if (k.categories.includes("commercial")) counts.commercial += 1;
      if (k.categories.includes("prepositions")) counts.prepositions += 1;
      if (k.categories.includes("custom")) counts.custom += 1;
    }
    return counts;
  }, [data]);

  const visibleTabs = TABS.filter((t) => t.id !== "custom" || (data?.customModifiers.length ?? 0) > 0);

  const filtersActive =
    !!filterText || !!excludeText || intentFilter !== "all" || lengthFilter !== "all" || questionWord !== null;

  const allVisibleSelected = visibleRecords.length > 0 && visibleRecords.every((r) => selected.has(r.keyword));

  const toggle = (keyword: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });

  const toggleSelectAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleRecords.forEach((r) => next.delete(r.keyword));
      else visibleRecords.forEach((r) => next.add(r.keyword));
      return next;
    });

  const toggleLetter = (records: KeywordRecord[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = records.every((r) => next.has(r.keyword));
      records.forEach((r) => (all ? next.delete(r.keyword) : next.add(r.keyword)));
      return next;
    });

  // Export the curated selection when there is one, otherwise everything visible in the current view.
  const exportRecords = useMemo(() => {
    if (!data) return [];
    if (selected.size > 0) return data.keywords.filter((k) => selected.has(k.keyword));
    return visibleRecords;
  }, [data, selected, visibleRecords]);
  const exportScope = selected.size > 0 ? "selected" : "visible";
  const exportQuestionCount = exportRecords.filter((r) => r.intent === "question").length;

  const handleCopy = async () => {
    if (!exportRecords.length) return;
    try {
      await copyText(exportRecords.map((r) => r.keyword).join("\n"));
      showToast(`Copied ${exportRecords.length} ${exportScope} keywords`);
    } catch {
      showToast("Clipboard access was blocked by the browser");
    }
  };

  const copySingle = async (keyword: string) => {
    try {
      await copyText(keyword);
      showToast(`Copied “${keyword}”`);
    } catch {
      showToast("Clipboard access was blocked by the browser");
    }
  };

  const handleCsv = () => {
    if (!data || !exportRecords.length) return;
    const header = ["Keyword", "Category", "Modifier", "Intent", "Word Count"];
    const rows = exportRecords.map((r) =>
      [r.keyword, CATEGORY_LABELS[r.category], r.modifier, INTENT_LABELS[r.intent], r.wordCount].map(csvEscape).join(","),
    );
    const csv = "﻿" + [header.join(","), ...rows].join("\r\n");
    downloadFile(csv, `${fileSlug(data.seed)}-keywords.csv`, "text/csv;charset=utf-8");
    showToast(`Downloaded CSV with ${exportRecords.length} keywords`);
  };

  const handleJson = () => {
    if (!data || !exportRecords.length) return;
    const payload = {
      seed: data.seed,
      country: data.gl || "global",
      language: data.hl,
      platform: data.ds === "yt" ? "youtube" : "google",
      customModifiers: data.customModifiers,
      generatedAt: data.generatedAt,
      exportedAt: new Date().toISOString(),
      scope: exportScope,
      count: exportRecords.length,
      keywords: exportRecords.map((r) => ({
        keyword: r.keyword,
        category: r.category,
        categories: r.categories,
        modifier: r.modifier,
        intent: r.intent,
        wordCount: r.wordCount,
      })),
    };
    downloadFile(JSON.stringify(payload, null, 2), `${fileSlug(data.seed)}-keywords.json`, "application/json;charset=utf-8");
    showToast(`Downloaded JSON with ${exportRecords.length} keywords`);
  };

  const handleFaq = () => {
    if (!data || !exportQuestionCount) return;
    downloadFile(buildFaqOutline(exportRecords, data.seed), `${fileSlug(data.seed)}-faq-outline.md`, "text/markdown;charset=utf-8");
    showToast(`Downloaded FAQ outline with ${exportQuestionCount} questions`);
  };

  const logout = async () => {
    try {
      await fetch("/api/login", { method: "DELETE" });
    } finally {
      window.location.href = "/login";
    }
  };

  const focusResults = () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const alphabetCards = useMemo(() => {
    if (!data) return [];
    return LETTERS.map((letter) => ({
      letter,
      records: (data.groups.alphabetical[letter] ?? [])
        .map((k) => recordMap.get(k))
        .filter((r): r is KeywordRecord => !!r && passes(r)),
    }));
  }, [data, recordMap, passes]);

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12),transparent_70%)]"
      />

      <main className="relative mx-auto max-w-7xl px-4 pt-10 pb-24 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
              <Sparkles className="h-3 w-3" />
              Real-time Autocomplete Intelligence
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Keyword & AEO Research</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              Pull 100% real search suggestions from Google and YouTube across 70+ modifiers — A-Z, questions,
              comparisons and prepositions — then analyse, curate and export.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 shadow-sm">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                {data.stats.succeeded}/{data.stats.totalQueries} queries in {(data.stats.durationMs / 1000).toFixed(2)}s
                {data.stats.failed > 0 && <span className="font-medium text-amber-600"> · {data.stats.failed} failed</span>}
              </div>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:text-zinc-900"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </header>

        {/* Control bar */}
        <form onSubmit={onSubmit} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Seed keyword</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Enter a seed keyword, e.g. digital marketing"
                maxLength={120}
                autoFocus
                className="h-12 w-full rounded-xl border border-zinc-300 bg-zinc-50 pr-10 pl-12 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
              />
              {seed && (
                <button
                  type="button"
                  onClick={() => setSeed("")}
                  aria-label="Clear seed keyword"
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            <button
              type="submit"
              disabled={loading || !seed.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Generating…" : "Generate Keywords"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white pl-2.5 text-sm text-zinc-700">
              <Globe className="h-4 w-4 text-zinc-400" />
              <span className="sr-only">Country</span>
              <select value={gl} onChange={(e) => setGl(e.target.value)} className="h-9 cursor-pointer rounded-lg bg-transparent pr-2 text-sm focus:outline-none">
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white pl-2.5 text-sm text-zinc-700">
              <Languages className="h-4 w-4 text-zinc-400" />
              <span className="sr-only">Language</span>
              <select value={hl} onChange={(e) => setHl(e.target.value)} className="h-9 cursor-pointer rounded-lg bg-transparent pr-2 text-sm focus:outline-none">
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>

            <div role="radiogroup" aria-label="Platform" className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              {(
                [
                  { id: "web", label: "Google Search", icon: <Search className="h-3.5 w-3.5" /> },
                  { id: "yt", label: "YouTube Search", icon: <MonitorPlay className="h-3.5 w-3.5" /> },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={platform === p.id}
                  onClick={() => setPlatform(p.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                    platform === p.id
                      ? p.id === "yt"
                        ? "bg-white text-red-600 shadow-sm ring-1 ring-zinc-200"
                        : "bg-white text-indigo-700 shadow-sm ring-1 ring-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  {p.icon}
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                showAdvanced || extra.trim()
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Custom modifiers
              {extra.trim() && <span className="rounded bg-indigo-600 px-1 text-[10px] text-white">{extra.split(",").filter((m) => m.trim()).length}</span>}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
            </button>
          </div>

          {showAdvanced && (
            <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3">
              <label className="block text-xs font-medium text-zinc-700" htmlFor="custom-modifiers">
                Extra modifiers (comma-separated, up to 20)
              </label>
              <input
                id="custom-modifiers"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="e.g. bangladesh, 2026, for beginners, best * in dhaka"
                className="mt-1.5 h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Each modifier is added after the seed (<code className="rounded bg-white px-1">seed 2026</code>). Use{" "}
                <code className="rounded bg-white px-1">*</code> to place the seed yourself:{" "}
                <code className="rounded bg-white px-1">best * in dhaka</code>. Saved in this browser for next time.
              </p>
            </div>
          )}
        </form>

        {history.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
              <History className="h-3.5 w-3.5" />
              Recent:
            </span>
            {history.map((h) => (
              <button
                key={`${h.seed}-${h.gl}-${h.hl}-${h.platform}`}
                type="button"
                onClick={() => rerunHistory(h)}
                disabled={loading}
                title={`${countryLabel(h.gl)} · ${h.hl} · ${h.platform === "yt" ? "YouTube" : "Google"} · ${h.count} keywords`}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
              >
                {h.platform === "yt" && <MonitorPlay className="h-3 w-3 text-red-500" />}
                {h.seed}
                <span className="text-[10px] text-zinc-400 uppercase">{h.gl || "global"}</span>
              </button>
            ))}
            <button type="button" onClick={clearHistory} className="ml-1 text-xs text-zinc-400 underline-offset-2 hover:text-zinc-700 hover:underline">
              Clear
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* KPI cards */}
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            icon={<Hash className="h-3.5 w-3.5" />}
            label="Unique Keywords"
            value={data?.stats.totalUnique ?? 0}
            hint="Deduplicated across all modifiers"
            accent="bg-indigo-500"
          />
          <KpiCard
            icon={<CircleHelp className="h-3.5 w-3.5" />}
            label="Questions"
            value={data?.stats.questions ?? 0}
            hint="AEO-ready question queries"
            accent="bg-violet-500"
          />
          <KpiCard
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            label="Commercial"
            value={data?.stats.commercial ?? 0}
            hint="High-intent & comparison terms"
            accent="bg-emerald-500"
          />
          <KpiCard
            icon={<MousePointerClick className="h-3.5 w-3.5" />}
            label="Selected"
            value={selected.size}
            hint="Curated for export"
            accent="bg-amber-500"
          />
        </section>

        {data && (
          <InsightsPanel
            records={data.keywords}
            seed={data.seed}
            intentFilter={intentFilter}
            lengthFilter={lengthFilter}
            questionWord={questionWord}
            activeTerm={filterText}
            onIntent={(intent) => {
              setIntentFilter((v) => (v === intent ? "all" : intent));
              focusResults();
            }}
            onLength={(bucket) => {
              setLengthFilter((v) => (v === bucket ? "all" : bucket));
              focusResults();
            }}
            onQuestionWord={(word) => {
              setQuestionWord((v) => (v === word ? null : word));
              focusResults();
            }}
            onTerm={(term) => {
              setFilterText((v) => (v.toLocaleLowerCase() === term ? "" : term));
              focusResults();
            }}
          />
        )}

        {/* Results */}
        <section ref={resultsRef} className="mt-6 scroll-mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {/* Tabs */}
          <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-zinc-200 px-2 pt-2">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  tab === t.id ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                    tab === t.id ? "bg-indigo-100 text-indigo-700" : "bg-zinc-100 text-zinc-500",
                  )}
                >
                  {tabCounts[t.id]}
                </span>
                {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600" />}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="space-y-3 border-b border-zinc-200 bg-zinc-50/60 p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <label className="relative md:w-64">
                <span className="sr-only">Filter within results</span>
                <Filter className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter within results..."
                  className="h-8 w-full rounded-lg border border-zinc-300 bg-white pr-7 pl-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none"
                />
                {filterText && (
                  <button
                    type="button"
                    onClick={() => setFilterText("")}
                    aria-label="Clear filter"
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
              <label className="relative md:w-64">
                <span className="sr-only">Exclude words</span>
                <X className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-red-400" />
                <input
                  value={excludeText}
                  onChange={(e) => setExcludeText(e.target.value)}
                  placeholder="Exclude words (comma-separated)"
                  className="h-8 w-full rounded-lg border border-zinc-300 bg-white pr-2 pl-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                Sort
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="h-8 cursor-pointer rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-800 focus:border-indigo-500 focus:outline-none"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {filtersActive && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 md:ml-auto"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset filters
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Intent</span>
              {(["all", "question", "commercial", "informational"] as const).map((intent) => (
                <button
                  key={intent}
                  type="button"
                  onClick={() => setIntentFilter(intent)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                    intentFilter === intent
                      ? intent === "all"
                        ? "border-zinc-800 bg-zinc-800 text-white"
                        : INTENT_STYLES[intent]
                      : "border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  {intent === "all" ? "All intents" : INTENT_LABELS[intent]}
                  <span className="tabular-nums opacity-70">{intentCounts[intent]}</span>
                </button>
              ))}
              <span className="mx-2 hidden h-5 w-px bg-zinc-200 sm:block" />
              <span className="mr-1 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Length</span>
              {[{ id: "all" as const, label: "Any length", hint: "" }, ...LENGTH_BUCKETS].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setLengthFilter(b.id)}
                  title={b.hint}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                    lengthFilter === b.id ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  {b.label}
                  <span className="tabular-nums opacity-70">{lengthCounts[b.id]}</span>
                </button>
              ))}
              {questionWord && (
                <button
                  type="button"
                  onClick={() => setQuestionWord(null)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-2.5 text-xs font-medium text-violet-700"
                >
                  Question: {questionWord}
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 border-b border-zinc-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-zinc-500">
              {data ? (
                <>
                  Showing <span className="font-semibold text-zinc-800">{visibleRecords.length}</span> of {tabRecords.length} · exporting{" "}
                  <span className="font-semibold text-zinc-800">{exportScope === "selected" ? "your selection" : "the current view"}</span>
                </>
              ) : (
                "Results will appear here"
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ToolbarButton onClick={toggleSelectAllVisible} disabled={!visibleRecords.length} icon={<ListChecks className="h-3.5 w-3.5" />}>
                {allVisibleSelected ? "Deselect All" : "Select All"}
              </ToolbarButton>
              {selected.size > 0 && (
                <ToolbarButton onClick={() => setSelected(new Set())} icon={<X className="h-3.5 w-3.5" />}>
                  Clear ({selected.size})
                </ToolbarButton>
              )}
              <span className="mx-1 hidden h-5 w-px bg-zinc-200 sm:block" />
              <ToolbarButton onClick={handleCopy} disabled={!exportRecords.length} variant="primary" icon={<Copy className="h-3.5 w-3.5" />}>
                Copy {exportRecords.length ? `(${exportRecords.length})` : ""}
              </ToolbarButton>
              <ToolbarButton onClick={handleCsv} disabled={!exportRecords.length} icon={<Download className="h-3.5 w-3.5" />}>
                CSV
              </ToolbarButton>
              <ToolbarButton onClick={handleJson} disabled={!exportRecords.length} icon={<FileJson className="h-3.5 w-3.5" />}>
                JSON
              </ToolbarButton>
              <ToolbarButton
                onClick={handleFaq}
                disabled={!exportQuestionCount}
                title="Download the question keywords as a Markdown FAQ outline grouped by question type"
                icon={<FileText className="h-3.5 w-3.5" />}
              >
                FAQ Outline {exportQuestionCount ? `(${exportQuestionCount})` : ""}
              </ToolbarButton>
            </div>
          </div>

          {/* Body */}
          <div className="min-h-[320px]">
            {loading && !data && (
              <div className="space-y-2 p-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-zinc-100" />
                ))}
              </div>
            )}

            {!loading && !data && !error && (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
                  <Search className="h-6 w-6 text-indigo-600" />
                </div>
                <h2 className="text-base font-semibold text-zinc-900">Start with a seed keyword</h2>
                <p className="mt-1 max-w-md text-sm text-zinc-500">
                  We query Google&apos;s Suggest API with A-Z, question, commercial and preposition modifiers, then dedupe,
                  classify by search intent and surface insights you can act on.
                </p>
                <div className="mt-6 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-3">
                  {[
                    { title: "Find questions", text: "Build FAQ and People Also Ask sections for AEO from real queries." },
                    { title: "Spot buyer intent", text: "Commercial terms like best, vs, price — perfect for money pages." },
                    { title: "Discover subtopics", text: "Related terms reveal clusters and H2 ideas for your content." },
                  ].map((tip) => (
                    <div key={tip.title} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-sm font-semibold text-zinc-800">{tip.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">{tip.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data && (
              <div className={cn("transition-opacity", loading && "pointer-events-none opacity-50")}>
                {tab === "alphabet" ? (
                  <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {alphabetCards.map(({ letter, records }) => {
                      const allChecked = records.length > 0 && records.every((r) => selected.has(r.keyword));
                      return (
                        <div
                          key={letter}
                          className={cn("flex flex-col rounded-xl border bg-white", records.length ? "border-zinc-200 shadow-sm" : "border-zinc-100 opacity-60")}
                        >
                          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white uppercase">
                                {letter}
                              </span>
                              <span className="text-xs text-zinc-500 tabular-nums">{records.length} keywords</span>
                            </div>
                            {records.length > 0 && (
                              <Checkbox checked={allChecked} onChange={() => toggleLetter(records)} label={`Select all keywords for letter ${letter}`} />
                            )}
                          </div>
                          <ul className="flex-1 space-y-0.5 p-1.5">
                            {records.length === 0 && <li className="px-2 py-1.5 text-xs text-zinc-400">No suggestions</li>}
                            {records.map((r) => (
                              <li
                                key={r.keyword}
                                onClick={() => toggle(r.keyword)}
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-zinc-50",
                                  selected.has(r.keyword) && "bg-indigo-50",
                                )}
                              >
                                <Checkbox checked={selected.has(r.keyword)} onChange={() => toggle(r.keyword)} label={`Select ${r.keyword}`} />
                                <span className="min-w-0 flex-1 truncate" title={r.keyword}>
                                  <HighlightedKeyword keyword={r.keyword} seed={data.seed} />
                                </span>
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", INTENT_DOT[r.intent])} title={INTENT_LABELS[r.intent]} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                ) : visibleRecords.length === 0 ? (
                  <div className="px-6 py-16 text-center text-sm text-zinc-500">
                    No keywords match the current filters.
                    {filtersActive && (
                      <button type="button" onClick={resetFilters} className="ml-1 font-medium text-indigo-600 hover:underline">
                        Reset filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-[11px] tracking-wide text-zinc-500 uppercase">
                          <th className="w-10 px-4 py-2">
                            <Checkbox checked={allVisibleSelected} onChange={toggleSelectAllVisible} label="Select all visible" />
                          </th>
                          <th className="px-2 py-2 font-medium">Keyword</th>
                          <th className="px-2 py-2 font-medium">Intent</th>
                          <th className="hidden px-2 py-2 font-medium md:table-cell">Source</th>
                          <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Words</th>
                          <th className="w-28 px-4 py-2 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRecords.map((r) => {
                          const isSelected = selected.has(r.keyword);
                          return (
                            <tr
                              key={r.keyword}
                              onClick={() => toggle(r.keyword)}
                              className={cn(
                                "group cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50",
                                isSelected && "bg-indigo-50/70 hover:bg-indigo-50",
                              )}
                            >
                              <td className="px-4 py-2">
                                <Checkbox checked={isSelected} onChange={() => toggle(r.keyword)} label={`Select ${r.keyword}`} />
                              </td>
                              <td className="px-2 py-2">
                                <HighlightedKeyword keyword={r.keyword} seed={data.seed} />
                              </td>
                              <td className="px-2 py-2">
                                <IntentBadge intent={r.intent} />
                              </td>
                              <td className="hidden px-2 py-2 md:table-cell">
                                <span className="font-mono text-xs text-zinc-500">
                                  {CATEGORY_LABELS[r.category]} · {r.modifier}
                                </span>
                              </td>
                              <td className="hidden px-2 py-2 text-right text-xs text-zinc-500 tabular-nums sm:table-cell">{r.wordCount}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center justify-end gap-0.5">
                                  <RowAction label={`Copy ${r.keyword}`} onClick={() => void copySingle(r.keyword)}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </RowAction>
                                  <RowAction
                                    label={`Open ${data.ds === "yt" ? "YouTube" : "Google"} results for ${r.keyword}`}
                                    href={serpUrl(r.keyword, data)}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </RowAction>
                                  <RowAction label={`Use ${r.keyword} as new seed keyword`} onClick={() => drillDown(r.keyword)}>
                                    <ArrowUpRight className="h-4 w-4" />
                                  </RowAction>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {toast && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2.5 text-sm text-white shadow-xl"
        >
          <Check className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
