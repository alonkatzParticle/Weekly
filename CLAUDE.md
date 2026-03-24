# Weekly Report App — Claude Context

## What This Is
A Next.js 14 (App Router, TypeScript) internal tool for a creative studio. It pulls tasks from Monday.com, shows weekly reports per team member, and generates AI-written summaries for management. It also integrates with Dropbox for file previews.

## Running the App
```bash
npm run dev -- -p 3007   # runs on http://localhost:3007
```
The `package.json` dev script unsets `ANTHROPIC_API_KEY` before starting — this is intentional (the key is set in `.env.local` and the unset prevents conflicts with the Claude Code environment).

## Key Architecture

### Stack
- **Next.js 14 App Router** — all routes under `app/`
- **TypeScript** throughout
- **Tailwind CSS** + shadcn/ui components (`components/ui/`)
- **SQLite** (dev) / **Postgres** (prod) via `lib/db.ts`
- **Anthropic Claude** (claude-haiku-4-5) for AI summaries — streaming responses
- **Monday.com GraphQL API** (`https://api.monday.com/v2`)
- **Dropbox API** for file listing, thumbnails, and uploads

### Caching (Critical)
Board data is cached in `globalThis` (survives Next.js HMR reloads):
- `boardItemCache` — 5-min TTL, caches all board items per board ID
- `boardMetaCache` — 1-hour TTL, caches column IDs and status colors per board
- `inflightFetches` — deduplicates concurrent in-flight fetches for the same board

**Why `globalThis`**: Next.js dev mode re-evaluates modules per request, destroying module-level variables. `globalThis` persists for the entire process lifetime.

### Monday.com API Notes
- Filtering by timeline date range (`between`, `ends_before`, `ends_after`) returns `no_operator_config` — **not supported** for timeline columns
- Only `is_not_empty` and `any_of` operators work on timeline columns
- Person column filtering via `any_of` returns 0 results — always filter persons in JavaScript
- Status colors are in the column's `settings_str` JSON (at board level), not per item
- Activity logs are available: `boards { activity_logs(limit, from, to) { event data } }`
- `update_column_value` event + `column_type: "color"` = status change

### Dropbox API Notes
- Cross-account shared folders: `path_lower` is `null` in `list_folder` responses
- For thumbnails of cross-account files: `get_thumbnail_v2` with `{ ".tag": "link", "url": "<shared_folder_url>", "path": "/<filename>" }` — the tag is `"link"` (not `"shared_link_file_arg"` or `"shared_link_metadata"`)
- For own-account files: `get_thumbnail_v2` with `{ ".tag": "path", "path": "<absolute_path>" }`
- For playback of cross-account videos: `sharing/get_shared_link_file` with Range header passthrough
- Token is refreshed via OAuth refresh token (stored in `.env.local`)

## Pages & Routes

| Page | Route | Description |
|------|-------|-------------|
| Weekly Report | `/` | Per-member weekly task view with AI summary |
| Studio | `/studio` | Team-wide view grouped by member |
| Status Report | `/status-report` | High/critical priority tasks + Boss Update AI summary + Daily Update tab |
| Settings | `/settings` | Configure Monday boards and team members |

### Status Report — Boss Update vs Daily Update
- **Boss Update tab**: Shows all high/critical open tasks, AI summary of team status
- **Daily Update tab**: Uses `activity_logs` to detect tasks whose status changed to a "completed" state today (`approved`, `completed`, `done`, `for approval`, `sent to client`), plus all in-progress tasks. Generates a daily standup-style summary.

## Key Files

```
lib/
  monday.ts       — All Monday.com API logic, caching, fetchDailyActivity()
  dropbox.ts      — Dropbox token management and upload helpers
  db.ts           — SQLite/Postgres abstraction (boards, members)
  utils.ts        — Date helpers (use local date methods, NOT toISOString() for dates)

app/api/
  monday/tasks/         — Per-user task fetch
  monday/team-tasks/    — All users task fetch
  status-report/        — Boss update data (high/critical tasks)
  status-report/daily/  — Daily activity data (uses activity_logs)
  status-report/summary/        — AI summary for boss update
  status-report/daily-summary/  — AI summary for daily update
  dropbox/thumbnail/    — Proxies Dropbox thumbnails and video playback
  dropbox/folder/       — Lists files in a Dropbox shared folder
  dropbox/weekly-files/ — Lists this week's uploaded files per member

components/
  WeeklyFilesPreview.tsx  — Horizontal scroll file gallery with lightbox
  DropboxPreviewModal.tsx — Task Dropbox folder preview modal
  LastWeekSummary.tsx     — Last week tasks component
  ThisWeekPreview.tsx     — This week tasks component
  AppSidebar.tsx          — Navigation sidebar
```

## Environment Variables
See `.env.local.example` for all required variables:
- `MONDAY_TOKEN` — Monday.com API token
- `ANTHROPIC_API_KEY` — Claude API key
- `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` — Dropbox OAuth
- `DROPBOX_TOKEN` — Static fallback token
- `DROPBOX_PATH` — Root path for weekly file uploads (e.g. `/Creative 2026/Documents/Weekly Update/`)
- `POSTGRES_URL` — Only needed in production (Vercel); SQLite is used in dev

## Known Bugs / Gotchas
- **Timezone bug (fixed)**: Never use `toISOString()` for local dates — it returns UTC. Use `date.getFullYear()`, `date.getMonth()`, `date.getDate()` instead (see `formatDate()` in `lib/utils.ts`)
- **macOS Gatekeeper**: If the dev server fails to start with an SWC binary error after moving the project folder, run: `xattr -r -d com.apple.quarantine /path/to/project/node_modules`
- **Monday.com activity log `created_at`**: This field is in a non-standard format — use the `from`/`to` query parameters to filter by date instead of parsing `created_at`

## Git Workflow
Currently pushing directly to `main`. Branch workflow not yet set up — worth doing before working across multiple devices simultaneously.
