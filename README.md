# Weekly Report Generator

A full-stack Next.js application for creative studio managers to generate and review weekly team reports. It pulls tasks and time tracking data from Monday.com, generates AI-powered summaries using Claude, and allows work sample uploads to Dropbox.

## Features

- **Week navigation** — browse any past or future week
- **Per-member dashboards** — tab through each team member
- **Last week summary** — AI-generated recap of completed tasks with streaming text
- **This week preview** — AI-generated look-ahead based on upcoming tasks
- **Time tracking** — bar chart of hours logged per week (video team members)
- **Work sample uploads** — drag-and-drop files directly to Dropbox
- **Settings page** — manage API keys, team members, and Monday.com board IDs
- **AI caching** — summaries are stored in Postgres so they don't regenerate on every reload

---

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- A PostgreSQL database (Vercel Postgres or standalone)
- API keys for Monday.com, Anthropic (Claude), and Dropbox

---

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values.

| Variable | Description |
|---|---|
| `POSTGRES_URL` | Full PostgreSQL connection string (pooled) |
| `POSTGRES_PRISMA_URL` | PostgreSQL connection string with `?pgbouncer=true` |
| `POSTGRES_URL_NON_POOLING` | Direct (non-pooled) PostgreSQL connection string |
| `POSTGRES_USER` | Database username |
| `POSTGRES_HOST` | Database host |
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_DATABASE` | Database name |

API keys (Monday token, Claude key, Dropbox token) are stored in the database via the Settings page — you do **not** need to put them in `.env.local`.

---

## Local Setup

### Option 1: Vercel Dev (recommended)

This approach links the project to a Vercel project and automatically provisions Vercel Postgres credentials.

```bash
# Install Vercel CLI globally
npm i -g vercel

# Link to your Vercel project (creates .vercel/ directory)
vercel link

# Pull environment variables including Postgres credentials
vercel env pull .env.local

# Install dependencies
npm install

# Run the dev server
npm run dev
```

### Option 2: Standalone Local PostgreSQL

If you prefer a local Postgres instance:

```bash
# Create a local database
createdb weekly_report

# Copy and edit the example env file
cp .env.local.example .env.local
# Edit .env.local with your local Postgres credentials

# Install dependencies
npm install

# Run the dev server
npm run dev
```

The database tables are created automatically on the first API request via `initDB()`.

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## Vercel Postgres Setup

1. Go to your Vercel project dashboard
2. Navigate to **Storage** tab
3. Click **Create Database** and choose **Postgres**
4. Follow the prompts — Vercel will automatically add the environment variables to your project
5. Run `vercel env pull .env.local` to sync them locally

---

## Deployment to Vercel

```bash
# Deploy to production
vercel --prod
```

Or connect your GitHub repository to Vercel for automatic deployments on push.

---

## Settings Configuration

After starting the app, go to [/settings](http://localhost:3000/settings) to configure:

### API Keys

| Key | Where to get it |
|---|---|
| **Monday.com API Token** | Monday.com → Profile picture → Developers → API v2 Token |
| **Claude API Key** | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| **Dropbox Access Token** | [dropbox.com/developers](https://www.dropbox.com/developers) → App Console → Generate access token |

### Finding Monday.com User IDs

1. Open Monday.com and go to any board
2. Open your browser's developer tools → Network tab
3. Make any API request or use Monday's API explorer at `https://monday.com/developers/v2`
4. Run this query in the API Explorer:
   ```graphql
   query {
     users {
       id
       name
       email
     }
   }
   ```
5. Copy the `id` value for each team member

### Finding Monday.com Board IDs

1. Open the board in Monday.com
2. The board ID is in the URL: `https://yourteam.monday.com/boards/BOARD_ID_HERE`
3. Or use the API Explorer:
   ```graphql
   query {
     boards {
       id
       name
     }
   }
   ```

---

## Project Structure

```
app/
  layout.tsx              # Root layout with nav header
  page.tsx                # Main dashboard page
  globals.css             # Tailwind base styles + CSS variables
  settings/page.tsx       # Settings management page
  api/
    settings/route.ts     # GET/POST API keys and overview
    settings/members/     # CRUD for team members
    settings/boards/      # CRUD for Monday.com board IDs
    monday/tasks/         # Fetch tasks from Monday.com
    monday/time-tracking/ # Fetch time tracking data
    ai/summary/           # Generate + stream AI summaries
    dropbox/upload/       # Upload files to Dropbox
    reports/              # Retrieve cached weekly summaries

components/
  WeekSelector.tsx        # Week navigation control
  TeamMemberTabs.tsx      # Tab layout per team member
  LastWeekSummary.tsx     # AI summary + task list for last week
  ThisWeekPreview.tsx     # AI preview + task list for this week
  TimeTracking.tsx        # Hours bar chart (video team)
  WorkSampleUpload.tsx    # Drag-and-drop Dropbox uploader
  ui/                     # Base UI components (button, card, badge, etc.)

lib/
  db.ts                   # Vercel Postgres helpers + table init
  monday.ts               # Monday.com GraphQL API client
  anthropic.ts            # Claude AI client + prompt builders
  dropbox.ts              # Dropbox upload helper
  utils.ts                # Date utilities + cn() helper
```

---

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **@vercel/postgres** — serverless Postgres
- **@anthropic-ai/sdk** — Claude AI with streaming
- **Recharts** — time tracking bar charts
- **lucide-react** — icons
- **date-fns** — date manipulation
