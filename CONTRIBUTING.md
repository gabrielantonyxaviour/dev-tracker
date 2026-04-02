# Contributing to dev-tracker

## Development Setup

### Prerequisites

- Node.js 18+
- npm

### First Time Setup

```bash
git clone https://github.com/gabrielantonyxaviour/dev-tracker.git
cd dev-tracker
npm install
cp .env.example .env.local
```

Edit `.env.local`:
- Set `CLAUDE_PROJECTS_DIR` to your `~/.claude/projects` path
- Adjust `PORT` if 3020 conflicts with something

```bash
# Import your session data
npm run import

# Start dev server
npm run dev
```

Visit [http://localhost:3020](http://localhost:3020) to verify it works.

### If You Don't Have Claude Code Session Data

The app works with an empty database — the dashboard will just show zeros. You can also create test JSONL files manually (see `src/lib/jsonl-parser.ts` for the expected format).

## Development Workflow

```bash
npm run dev       # Start dev server with hot reload
npm run build     # Production build
npm run lint      # ESLint
npm run import    # Re-import sessions from Claude projects dir
```

## Project Structure

```
src/
├── app/
│   ├── api/          # API routes (ingest, stats, sessions, projects)
│   ├── dashboard/    # Dashboard page
│   ├── sessions/     # Session list and detail pages
│   ├── projects/     # Project management
│   ├── costs/        # Cost analytics
│   ├── activity/     # Activity tracking
│   ├── tools/        # Tool usage analytics
│   └── settings/     # Settings and import controls
├── lib/
│   ├── db.ts             # Database init and schema
│   ├── db-queries.ts     # Query helpers
│   ├── constants.ts      # Model pricing, tool categories
│   ├── jsonl-parser.ts   # JSONL transcript parser
│   ├── cost-calculator.ts # Token cost math
│   └── aggregator.ts     # Stats rebuilding
├── components/           # React components
├── hooks/                # Custom hooks
└── scripts/
    └── import.ts         # Batch import script
```

## How to Propose Changes

1. **Open an issue first** — describe what you want to change and why
2. **Fork and branch** — create a feature branch from `main`
3. **Make your changes** — keep PRs focused on one thing
4. **Test locally** — verify the dashboard works, import succeeds, no build errors
5. **Submit a PR** — reference the issue, describe what changed

## Coding Conventions

- TypeScript strict mode
- Tailwind CSS for styling (no CSS modules)
- shadcn/ui for UI components
- Server components by default, `"use client"` only when needed
- SQLite queries in `src/lib/db-queries.ts`, not scattered across routes

## Adding New Models

Edit `MODEL_PRICING` in `src/lib/constants.ts`. Each model needs:
- `input` / `output` / `cache_write` / `cache_read` — USD per million tokens
- `display_name` — human-readable name for the UI

## Adding New Tool Categories

Edit `TOOL_CATEGORIES` and `getToolCategory()` in `src/lib/constants.ts`.

## Questions?

Open an issue — happy to help.
