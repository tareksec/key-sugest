"use client";

import { useMemo } from "react";
import { CircleHelp, Info, PieChart, Ruler, Tags } from "lucide-react";
import { INTENT_LABELS, type Intent, type KeywordRecord } from "@/lib/keywords";
import {
  LENGTH_BUCKETS,
  OTHER_QUESTION,
  lengthBucketOf,
  questionBreakdown,
  relatedTerms,
  type LengthBucket,
} from "@/lib/analysis";

const INTENT_BAR: Record<Intent, string> = {
  question: "bg-violet-500",
  commercial: "bg-emerald-500",
  informational: "bg-sky-500",
};

const INTENT_HELP: Record<Intent, string> = {
  question: "Contains who / what / why / how / when / where / can / is / does — ideal for FAQ, PAA and AI answers.",
  commercial: "Contains best / top / vs / review / price / cost / buy / cheap / service / course / near me — buyer intent.",
  informational: "Everything else — topic, navigational and general research queries.",
};

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

function Card({ icon, title, help, children }: { icon: React.ReactNode; title: string; help: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
          <span className="text-indigo-600">{icon}</span>
          {title}
        </h3>
        <span title={help} className="cursor-help text-zinc-400 hover:text-zinc-600">
          <Info className="h-3.5 w-3.5" />
        </span>
      </div>
      {children}
    </div>
  );
}

export interface InsightsPanelProps {
  records: KeywordRecord[];
  seed: string;
  intentFilter: Intent | "all";
  lengthFilter: LengthBucket | "all";
  questionWord: string | null;
  activeTerm: string;
  onIntent: (intent: Intent) => void;
  onLength: (bucket: LengthBucket) => void;
  onQuestionWord: (word: string) => void;
  onTerm: (term: string) => void;
}

export default function InsightsPanel({
  records,
  seed,
  intentFilter,
  lengthFilter,
  questionWord,
  activeTerm,
  onIntent,
  onLength,
  onQuestionWord,
  onTerm,
}: InsightsPanelProps) {
  const total = records.length;

  const intents = useMemo(() => {
    const counts: Record<Intent, number> = { question: 0, commercial: 0, informational: 0 };
    records.forEach((r) => (counts[r.intent] += 1));
    return (Object.keys(counts) as Intent[]).map((intent) => ({ intent, count: counts[intent] }));
  }, [records]);

  const lengths = useMemo(() => {
    const counts: Record<LengthBucket, number> = { short: 0, mid: 0, long: 0 };
    records.forEach((r) => (counts[lengthBucketOf(r.wordCount)] += 1));
    return LENGTH_BUCKETS.map((b) => ({ ...b, count: counts[b.id] }));
  }, [records]);

  const avgWords = useMemo(
    () => (total ? (records.reduce((sum, r) => sum + r.wordCount, 0) / total).toFixed(1) : "0"),
    [records, total],
  );

  const questions = useMemo(() => questionBreakdown(records), [records]);
  const maxQuestion = questions[0]?.count ?? 0;
  const terms = useMemo(() => relatedTerms(records, seed), [records, seed]);
  const maxTerm = terms[0]?.count ?? 0;

  return (
    <section className="mt-6 grid gap-3 lg:grid-cols-3">
      <Card icon={<PieChart className="h-4 w-4" />} title="Intent Mix" help="How every unique keyword is classified. Click a row to filter.">
        <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
          {intents.map(({ intent, count }) => (
            <div key={intent} className={INTENT_BAR[intent]} style={{ width: `${percent(count, total)}%` }} />
          ))}
        </div>
        <ul className="space-y-1">
          {intents.map(({ intent, count }) => (
            <li key={intent}>
              <button
                type="button"
                onClick={() => onIntent(intent)}
                title={INTENT_HELP[intent]}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-50 ${
                  intentFilter === intent ? "bg-indigo-50 ring-1 ring-indigo-200" : ""
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-sm ${INTENT_BAR[intent]}`} />
                <span className="flex-1 text-zinc-700">{INTENT_LABELS[intent]}</span>
                <span className="font-semibold text-zinc-900 tabular-nums">{count}</span>
                <span className="w-10 text-right text-xs text-zinc-500 tabular-nums">{percent(count, total)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        icon={<Ruler className="h-4 w-4" />}
        title="Keyword Length"
        help="Long-tail keywords (5+ words) usually have lower competition and clearer intent. Click a bar to filter."
      >
        <div className="space-y-2.5">
          {lengths.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onLength(b.id)}
              className={`block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-50 ${
                lengthFilter === b.id ? "bg-indigo-50 ring-1 ring-indigo-200" : ""
              }`}
            >
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-zinc-700">
                  {b.label} <span className="text-xs text-zinc-400">({b.hint})</span>
                </span>
                <span className="font-semibold text-zinc-900 tabular-nums">
                  {b.count} <span className="text-xs font-normal text-zinc-500">{percent(b.count, total)}%</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent(b.count, total)}%` }} />
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
          Average length: <span className="font-semibold text-zinc-800">{avgWords} words</span>
        </p>
      </Card>

      <Card
        icon={<CircleHelp className="h-4 w-4" />}
        title="Question Types (AEO)"
        help="Which question words people use with your seed. Use these as FAQ / People Also Ask headings. Click to filter."
      >
        {questions.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">No question keywords found.</p>
        ) : (
          <ul className="max-h-[188px] space-y-1 overflow-y-auto pr-1">
            {questions.map(({ word, count }) => (
              <li key={word}>
                <button
                  type="button"
                  onClick={() => onQuestionWord(word)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-zinc-50 ${
                    questionWord === word ? "bg-violet-50 ring-1 ring-violet-200" : ""
                  }`}
                >
                  <span className="w-16 shrink-0 font-medium text-zinc-700 capitalize">
                    {word === OTHER_QUESTION ? "other" : word}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <span
                      className="block h-full rounded-full bg-violet-500"
                      style={{ width: `${percent(count, maxQuestion)}%` }}
                    />
                  </span>
                  <span className="w-8 text-right text-xs font-semibold text-zinc-800 tabular-nums">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="lg:col-span-3">
        <Card
          icon={<Tags className="h-4 w-4" />}
          title="Related Terms & Subtopics"
          help="Words that appear most often alongside your seed across all suggestions — great for subtopics, H2s and content clusters. Click a term to filter."
        >
          {terms.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">Not enough data for related terms.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {terms.map(({ term, count }) => {
                const weight = maxTerm ? count / maxTerm : 0;
                const active = activeTerm.toLocaleLowerCase() === term;
                return (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onTerm(term)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
                      active
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : weight > 0.5
                          ? "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                    } ${weight > 0.5 ? "text-sm font-semibold" : "text-xs font-medium"}`}
                  >
                    {term}
                    <span className={`tabular-nums ${active ? "text-indigo-100" : "text-zinc-400"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
