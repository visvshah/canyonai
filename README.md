## Canyon AI — CPQ MVP

This is a focused CPQ/Deal Desk MVP for rapid quote creation, approvals, and insights. It includes an AI copilot that can find similar quotes or create a new quote with minimal input, automatic approval workflow gating, and a lightweight analytics dashboard.

### Tech Stack
- **Web framework**: Next.js (App Router) with React
- **API & data layer**: tRPC
- **Auth**: NextAuth.js with Google OAuth
- **Database/ORM**: PostgreSQL (on supabase) + Prisma
- **UI**: Material UI (MUI); Tailwind CSS 
- **Drag & drop**: dnd-kit
- **AI**: OpenAI Chat Completions (`gpt-4o-mini`)

### Core Functionality
- **Quotes list and detail**
  - `/quotes`: Filter by search term, packages, add-ons, and payment kinds.
  - `/quotes/[id]`: Full details, live financials, payment terms, read-only workflow view, DnD editor to reorder/adjust workflow, approve as next persona.

- **Home & insights**
  - `/home`: Role-based "Your Approval Queue" to action the next pending step.
  - `/insights`: Outcome mix, quotes-by-stage, timing metrics, discount insights, value breakdown by package/add-on.

- **AI quote copilot** (`/create-quote`)
  - Two modes: "find" similar approved/sold quotes, or "create" a new quote.
  
### Key Routes
- `/create-quote` — AI copilot to find or create quotes
- `/quotes` — Quotes table with filters
- `/quotes/[id]` — Quote detail + workflow
- `/home` — KPI tiles + approval queue by role
- `/insights` — Analytics dashboard
