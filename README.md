# Keyword Intelligence — Autocomplete & AEO Research

Real-time Google / YouTube autocomplete scraper for keyword research and Answer Engine Optimization.
Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Lucide icons.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. For production: `npm run build` then `npm start`.

## Password protection

The whole app (pages and API) is behind a password set by the `APP_PASSWORD` environment variable
(see `.env.example`). Copy it to `.env.local` for local use. In development the app is open when
`APP_PASSWORD` is empty; in production it stays locked until the variable is set. Sessions last 30 days;
changing `APP_PASSWORD` signs everyone out.

## Deploy to Vercel

1. Import the GitHub repository at https://vercel.com/new (framework preset: Next.js, no other settings needed).
2. In **Settings → Environment Variables** add `APP_PASSWORD` with a strong password (Production + Preview).
3. Deploy. If you add or change the variable after the first deploy, redeploy so it takes effect.

## API

`GET /api/keywords?seed=seo&gl=bd&hl=en&ds=` (or `POST` with the same fields as JSON)

| Param  | Default | Notes                                                        |
| ------ | ------- | ------------------------------------------------------------ |
| `seed` | —       | Required, max 120 chars                                      |
| `gl`   | `us`    | Two-letter country code; `global` or empty for no country    |
| `hl`   | `en`    | Language code (`en`, `bn`, …)                                |
| `ds`   | `""`    | `""` = Google Web, `yt` = YouTube                            |
| `extra`| `""`    | Comma-separated custom modifiers (max 20). `*` = seed slot, e.g. `best * in dhaka` |

Each request fires 70 suggest queries (base, A-Z, 20 question variants, 13 commercial, 10 preposition/wildcard)
in concurrent batches of 20, dedupes the results, and classifies each keyword as Question/AEO, Commercial,
or Informational. Response includes `stats`, `keywords[]` (keyword, category, modifier, categories, intent,
wordCount) and `groups` (`base`, `alphabetical` A-Z map, `questions`, `commercial`, `prepositions`, `all`).

## Dashboard features

- Light UI with KPI cards and an Insights panel: intent mix, keyword length (short/mid/long-tail),
  question types for AEO, and related terms / subtopics — click any of them to filter the results
- Filters: text, exclude words, intent, length, question word; sort by Google order, A-Z or length
- Recent searches and custom modifiers are remembered in the browser (localStorage)
- Per-row copy, open Google/YouTube results, and "use as new seed"
- Exports: Copy, CSV (UTF-8 BOM), JSON, and a Markdown FAQ outline of question keywords

## Files

- `app/api/keywords/route.ts` — scraping, batching, dedupe, aggregation
- `lib/keywords.ts` — shared types and rule-based intent classifier (English + Bengali words)
- `lib/analysis.ts` — length buckets, question breakdown, related terms, FAQ outline builder
- `components/InsightsPanel.tsx` — the clickable insights cards
- `app/page.tsx` — dashboard UI, filtering, selection, exports, recent searches
