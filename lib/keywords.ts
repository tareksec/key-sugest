export type Category = "base" | "alphabetical" | "questions" | "commercial" | "prepositions" | "custom";
export type Intent = "question" | "commercial" | "informational";

export interface KeywordRecord {
  keyword: string;
  /** Category of the first query that surfaced this keyword. */
  category: Category;
  /** Modifier of the first query that surfaced this keyword (e.g. "a", "how …", "… vs"). */
  modifier: string;
  /** Every category whose queries returned this keyword. */
  categories: Category[];
  intent: Intent;
  wordCount: number;
}

export interface KeywordGroups {
  base: string[];
  alphabetical: Record<string, string[]>;
  questions: string[];
  commercial: string[];
  prepositions: string[];
  custom: string[];
  all: string[];
}

export interface KeywordStats {
  totalQueries: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  totalUnique: number;
  questions: number;
  commercial: number;
  informational: number;
}

export interface KeywordResponse {
  seed: string;
  gl: string;
  hl: string;
  ds: string;
  customModifiers: string[];
  generatedAt: string;
  stats: KeywordStats;
  keywords: KeywordRecord[];
  groups: KeywordGroups;
}

export interface KeywordErrorResponse {
  error: string;
}

export const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

export const CATEGORY_LABELS: Record<Category, string> = {
  base: "Base",
  alphabetical: "A-Z",
  questions: "Question",
  commercial: "Commercial",
  prepositions: "Preposition",
  custom: "Custom",
};

export const INTENT_LABELS: Record<Intent, string> = {
  question: "Question / AEO",
  commercial: "Commercial",
  informational: "Informational",
};

export const QUESTION_TOKENS = new Set([
  "who",
  "what",
  "why",
  "how",
  "when",
  "where",
  "which",
  "can",
  "is",
  "does",
  // Bengali question words
  "কি",
  "কী",
  "কেন",
  "কিভাবে",
  "কীভাবে",
  "কোথায়",
  "কখন",
  "কে",
  "কোন",
  "কোনটি",
]);

const COMMERCIAL_TOKENS = new Set([
  "best",
  "top",
  "vs",
  "versus",
  "review",
  "reviews",
  "price",
  "prices",
  "pricing",
  "cost",
  "costs",
  "buy",
  "cheap",
  "cheapest",
  "service",
  "services",
  "agency",
  "agencies",
  "course",
  "courses",
  // Bengali commercial words
  "সেরা",
  "দাম",
  "মূল্য",
  "রিভিউ",
  "কিনুন",
  "কোর্স",
]);

export function tokenize(keyword: string): string[] {
  return keyword
    .toLocaleLowerCase()
    .split(/[\s,.!?;:()"'/\\|-]+/u)
    .filter(Boolean);
}

export function classifyIntent(keyword: string): Intent {
  const tokens = tokenize(keyword);
  if (tokens.some((t) => QUESTION_TOKENS.has(t)) || keyword.trim().endsWith("?")) return "question";
  if (tokens.some((t) => COMMERCIAL_TOKENS.has(t)) || /\bnear me\b/i.test(keyword)) return "commercial";
  return "informational";
}

export function countWords(keyword: string): number {
  return keyword.trim().split(/\s+/u).filter(Boolean).length;
}
