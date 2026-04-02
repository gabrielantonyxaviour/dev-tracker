# Dev Tracker

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- SQLite via better-sqlite3 (WAL mode)
- Tailwind CSS 4 + shadcn/ui
- Recharts for data visualization

## Architecture
- `src/app/api/ingest/` — Real-time event ingestion from Claude Code hooks
- `src/app/api/stats/` — Analytics query endpoints
- `src/app/api/sessions/` / `projects/` — CRUD endpoints
- `src/lib/db.ts` — Database initialization and schema
- `src/lib/jsonl-parser.ts` — Parses Claude Code JSONL transcripts
- `src/lib/constants.ts` — Model pricing, tool categories, project categorization
- `src/scripts/import.ts` — Batch import of historical session data
- `src/cli/` — CLI commands (setup, hook, start, import)
- `src/lib/auth.ts` — API key validation and machine management
- `src/app/api/ingest/session/` — Unified remote session ingest endpoint
- `src/app/api/machines/` — Machine management CRUD endpoints

## Key conventions
- Database path defaults to `./data/dev-tracker.db`, configurable via `DB_PATH`
- Claude projects dir defaults to `~/.claude/projects`, configurable via `CLAUDE_PROJECTS_DIR`
- Project categories are derived from directory path patterns (see `constants.ts`)
- All cost calculations use equivalent API pricing for Max plan usage tracking

## Development
```bash
cp .env.example .env.local   # configure env vars
npm install
npm run import                # import historical sessions
npm run dev                   # start dev server on port 3020
```

@AGENTS.md
