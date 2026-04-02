<div align="center">

# dev-tracker

### Claude Code sessions generate thousands of data points. None of it is visible to you.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)

[Install](#install) | [See It Work](#see-it-work) | [How It Works](#how-it-works) | [Contributing](CONTRIBUTING.md)

</div>

---

dev-tracker is a self-hosted analytics dashboard that ingests Claude Code session data and gives you visibility into token usage, costs, tool patterns, and project activity — all stored locally in SQLite.

It reads the JSONL transcript files that Claude Code already writes to `~/.claude/projects/`, parses every turn, tool call, and token count, then presents it through a web UI with charts, filters, and drill-downs.

---

## Install

```bash
git clone https://github.com/gabrielantonyxaviour/dev-tracker.git
cd dev-tracker
npm install
cp .env.example .env.local
```

Edit `.env.local` to point `CLAUDE_PROJECTS_DIR` at your Claude Code projects directory (defaults to `~/.claude/projects`).

```bash
# Import your historical sessions
npm run import

# Start the dashboard
npm run dev
```

Open [http://localhost:3020](http://localhost:3020).

> **What it touches:** Reads JSONL files from your Claude Code directory (read-only). Writes a SQLite database to `./data/`. Makes zero network calls — everything is local.
>
> **How to uninstall:** Delete the project directory. No global installs, no system modifications.

---

## See It Work

```
$ npm run import

Scanning /Users/you/.claude/projects/ ...
Found 847 session files across 23 projects
Importing... ████████████████████████████████ 847/847
Sessions: 847 | Turns: 12,403 | Tool calls: 41,209
Total equivalent cost: $284.52

$ npm run dev

  ▲ Next.js 16.2.1
  - Local: http://localhost:3020

```

Then open the dashboard to see:
- **Session timeline** — every session with duration, token count, model used, cost
- **Cost breakdown** — by model, project, day, with cache hit analysis
- **Tool usage** — which tools Claude used most, categorized (file ops, search, bash, agents, MCP)
- **Project stats** — time spent per project, session frequency, activity patterns
- **Activity streaks** — daily coding activity heatmap

---

## How It Works

dev-tracker has two data paths:

1. **Batch import** (`npm run import`) — Scans `~/.claude/projects/` for JSONL transcript files, parses each one, and loads sessions, turns, tool uses, and file changes into SQLite.

2. **Real-time ingestion** (API hooks) — Claude Code can POST events to `/api/ingest/*` endpoints during a session for live tracking of heartbeats, prompts, tool calls, and session completion.

<details>
<summary><b>Database schema</b></summary>

13 tables covering the full data model:

- **projects** — directory path, display name, category, aggregate stats
- **sessions** — timing, token totals, cost, model, git branch, agent lineage
- **turns** — per-prompt/response token breakdown, cache analysis, duration
- **tool_uses** — every tool invocation with category and error tracking
- **file_changes** — files modified during sessions
- **daily_stats / project_daily_stats / model_daily_stats** — pre-aggregated analytics
- **heartbeats** — live session status (context usage, rate limits, cost)
- **compact_events** — token compaction events during long sessions
- **import_runs** — batch import history and status

</details>

<details>
<summary><b>Cost calculation</b></summary>

Costs are calculated using equivalent API pricing (what the tokens would cost at API rates), useful for understanding the value you're getting from a Max plan. Pricing is maintained per-model in `src/lib/constants.ts` and includes input, output, cache write, and cache read rates.

</details>

<details>
<summary><b>Project categorization</b></summary>

Projects are auto-categorized based on directory path patterns (e.g., `/hackathons/` -> "hackathon", `/infra/` -> "infra"). Default patterns are in `src/lib/constants.ts` — edit `DEFAULT_PROJECT_CATEGORIES` to match your directory structure.

</details>

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Dev server port |
| `DB_PATH` | `./data/dev-tracker.db` | SQLite database location |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where Claude Code stores session files |

---

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **SQLite** via better-sqlite3 (WAL mode, zero config)
- **Tailwind CSS 4** + **shadcn/ui**
- **Recharts** for charts and visualizations

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

---

## License

MIT License — see [LICENSE](LICENSE).
