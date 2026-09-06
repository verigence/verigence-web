# PC Overview — dashboard redesign (UC-003)

**Status:** Locked design reference · 2026-09-06
**Live canvas:** https://claude.ai/code/artifact/16e19d68-77a4-452f-ac0d-dfb72860aa09
**Applies to:** `verigence-web` — the Process Coordinator landing screen for the
Booking & Delivery journey (UC-003).

This folder is the source of truth for the redesigned PC dashboard. It contains
the design canvas (open `verigence-uc03-screens.html` in a browser to pan/zoom /
export PNG-PDF) and the four artboard sources it is seeded from.

| File | Screen |
|---|---|
| `Main.dc.html` | PC Overview — Web, busy day (1440×900) |
| `MainEmpty.dc.html` | PC Overview — Web, start of month / all caught up (1440×900) |
| `WorkQueueMobile.dc.html` | PC Overview — Mobile, busy day (390×844) |
| `WorkQueueMobileEmpty.dc.html` | PC Overview — Mobile, start of month (390×844) |
| `canvas.json` | Canvas layout + annotations |
| `verigence-uc03-screens.html` | Seeded, self-contained design canvas (published artifact) |

---

## Who it is for

A **Process Coordinator** (mid-20s) and their **Team Lead** (early-30s). Ordinary
computer skills, not power users. The screen has to answer, at a glance and with
no training:

1. What do I have to do right now? (returned documents, stale bookings, deliveries in flight)
2. Are there flags on my bookings / deliveries?
3. What is the state of everything I am running?
4. What is my week / month looking like?

## Design principles

- **Calm co-pilot, not a control tower.** The hero greets the PC by name, names
  the dealer + outlet in bold, and states in ONE plain sentence what needs them.
- **One journey = one row.** Booking → Delivery is one continuous case. The active
  list shows only journeys that are *in progress*; each row carries its pending
  mandatory-document count and its audit-flag status.
- **One verb per card.** Each "Do these next" card has exactly one obvious button
  (Re-upload / Add note / Continue / Open).
- **Progress rail.** Every journey shows a rail that fills with the brand gradient
  — blue at booking, mint at done — over four steps: Documents · Details · Delivery · Done.
- **No scrolling.** Web and mobile both fit one screen. Full lists open as
  sub-views via "See all →".
- **Never looks broken when empty.** Start-of-month flips the hero to "You're all
  caught up", shows 0 counts, and turns the work area into one warm
  *Capture New Booking* invitation with a faint preview of the journey path.
- **Colour = meaning.** Blue = your action. Teal / mint = done. A warm coral is
  used only for something returned or stale — never a generic alert red.
- **Capture a new booking from anywhere.** A persistent primary
  *Capture new booking* button sits in the full-width top bar, so it is one
  click away from every screen and every sub-view — not buried in a menu. On
  mobile it is the fixed bottom action button. Capturing bookings + deliveries
  is ~70% of the PC's day, so the action is always in reach.
- **Text is system-producible.** Every string on screen is a count-based template
  or a stored field (e.g. `Uc03AuditFlag.description`), not a generated sentence.

## Brand

- Exact lockup from `public/brand/svg/` — `verigence-logo-tagline.svg` on web,
  `verigence-logo.svg` (no descriptor) on mobile. Inlined verbatim; do not
  reconstruct (see `public/brand/README.md` / `BRANDING_GUIDELINES.md`).
- Top bar spans full width, logo top-left; the sidebar sits beneath it — matches
  the current app shell.
- Hero panel and sidebar share the **same** deep blue-teal gradient
  (`#04264f → #06466a → #0a5c6e`).
- Primary buttons use Deep Blue `#003A82` per the brand guidelines.
- Palette: Deep Blue `#003A82`, Electric Blue `#0057B8`, Teal `#00AFA8`,
  Mint `#00D3A7`, coral `#dd6f57` (returned / stale only).
- **One blue.** Every solid "your action / booking" element — the Capture
  button, every card action button, the Booking segment and its legend swatch —
  is the same Deep Blue `#003A82`. Gradients (the lockup, the journey progress
  rail) run the full brand ramp `#003A82 → #0057B8 → #00AFA8 → #00D3A7`.
- **Terminology.** The shell context switcher is labelled **"Current Dealership"** /
  **"Switch Dealership"**, not "workspace" (see below).

---

## Data & APIs

Everything on this dashboard runs on **existing Audit Core / Security endpoints**
except one small new stats endpoint.

| Dashboard element | Source | Status |
|---|---|---|
| "Do these next" cards, journey list, pipeline, open-flag count | `GET /uc03/work-items` + `GET /uc03/landing-metrics` | exists |
| Returned by System / Team Lead | `Uc03WorkItem.nextActionCode` (`BOOKING_UPDATE_REQUIRED`, `UPDATE_BOOKING`, …) | exists |
| Card urgency chip | Flag **age** — `Uc03AuditFlag.createdAtUtc`. There is **no SLA / due-by field** in the model, so there is **no countdown**. | exists |
| The ask sentence on a card | `Uc03AuditFlag.description` (stored) | exists |
| Pending mandatory-doc count per journey | `Uc03WorkItem.processingDocumentCount` / mandatory-doc checklist | exists |
| "No action for N days" (stale booking) | Computed in the **Web UI**: `now − latestActivityAtUtc > N days`. Pure config, no backend. | UI only |
| Greeting name, dealer, outlet | session / `GET /me/projects` | exists |
| Performance strip (bookings & deliveries, completed & in-progress, week / month) | **NEW** — see below | to build |

### New endpoint (the only backend work)

```
GET /uc03/pc-stats?from={ISO}&to={ISO}&outletId={id}
→ 200
{
  "bookingsCompleted":    <int>,
  "deliveriesCompleted":  <int>,
  "bookingsInProgress":   <int>,
  "deliveriesInProgress": <int>
}
```

- Implemented in **audit-core**. The UI calls it twice (this week, this month)
  to fill the performance strip.
- "In progress" counts are point-in-time (as of `to`); "completed" counts are
  within `[from, to]`.
- Average cycle-time tiles were considered and **dropped** — not in this spec.

### Web-UI configuration

| Key | Meaning | Default |
|---|---|---|
| `staleBookingDays` | Days with no activity on a booking before it is surfaced as "No action for N days" | 7 |
| `staleDeliveryDays` | Days a booking is awaiting delivery before it is escalated to the PC | 5 |

Both are configurable; the number shown in the copy is driven by the config value.

---

## Implementation status

A first cut is wired into the app, kept fully parallel to the current dashboard:

| Piece | Where |
|---|---|
| New page | `src/pages/PcOverviewPage.tsx` |
| Styles | `src/styles/pc-overview.css` (imported in `src/main.tsx` just before `ui-governance.css`; all selectors namespaced `.pcov`) |
| Wiring | `src/App.tsx` → `DashboardEntry` |

**Fallback is trivial and the legacy path is untouched:**

- `PcOverviewPage` replaces **only** the Process Coordinator landing. Team Lead,
  PM and admin dashboards are unchanged.
- The legacy `DashboardPage` and every `dashboard-*.css` file are left exactly as
  they were — nothing deleted, nothing commented out in a way that stops it
  compiling.
- To roll back: set `PC_OVERVIEW_REDESIGN_ENABLED = false` in `src/App.tsx`, **or**
  open any dashboard link with `?legacyDashboard=1`.

**What it renders today** (all on existing endpoints):

- Hero — greeting, bold dealership + outlet, "N things need you", plain-language
  sub-line, and KPI tiles (bookings in progress, deliveries in progress, open
  observations, waiting on review) from `/uc03/landing-metrics`.
- "Do these next" — up to 4 cards derived from `/uc03/work-items`, prioritised
  Returned → Flagged → Delivery-in-progress → Stale, each with a progress rail,
  a plain instruction, an age/count chip and one action button to the right V2
  screen. Product labels lazy-enriched for the visible cards only.
- "Your journeys" pipeline strip; "See all →" opens the legacy list.
- Empty / all-caught-up states.

**Not yet built:** the weekly / monthly "completed" performance tiles — they need
`GET /uc03/pc-stats` (below). Until then those tiles are simply not shown (no
fake numbers).

---

## Shell terminology change — "Dealership", not "Workspace"

**Decision (2026-09, product owner):** an operational user works a **Dealership**.
A Process Coordinator has one or more **Outlets** under that dealership. "Switch
Workspace" was the wrong words for that; "Project" is also wrong (internal only).

What changed in `src/layout/AppShell.tsx`:

- The context line and both switch buttons (top bar + sidebar) now read
  **"Current Dealership"** / **"Switch Dealership"**.
- For a PC, the sidebar context card now lists **every Outlet assigned to the
  signed-in user** (`selectedProject.scope.outlets`), with the active one marked
  "Current". Clicking another Outlet switches context in place
  (`selectOperationalOutlet`) and returns to the dashboard — no full re-selection
  flow. Styles: `.pcov-outlets*` in `src/styles/pc-overview.css`.
- TL / PM shells (which can span multiple dealers) still show the role label in
  that card; only the button wording changed for them.

Governance gate updated to match (`scripts/ui-governance-check.mjs`):

- `AppShell.tsx` now **must** contain `Current Dealership` and `Switch Dealership`,
  and **must not** contain `Current Workspace` / `Switch Workspace` /
  `Current Project` / `Switch Project`.
- The selection **gate** (`ProjectContextGate.tsx`) is unchanged and keeps its
  neutral "Choose Workspace" / "Choose Work Location" wording — dealer and outlet
  names still only appear *after* selection, per the existing rule.
- New check-output line: `ShellContextSwitcher=DEALERSHIP_AND_OUTLETS`.

---

## Performance budget

The current dashboard was reported as "too slow to navigate". This redesign is
built to a hard budget:

| Milestone | Target | Ceiling |
|---|---|---|
| Shell + hero skeleton painted | < 1.0 s | 2.5 s |
| "Do these next" cards usable | < 2.5 s | 5 s |
| Fully settled (pipeline + performance strip filled) | < 5 s | **10 s** |

How the layout hits it:

1. **Paint the shell immediately.** Top bar, sidebar, greeting, dealer + outlet
   render from the cached session / `me/projects` payload — no request on the
   critical path. Every data region shows a skeleton, never a spinner-blocked
   blank screen.
2. **Two parallel calls, independent render.** `/uc03/work-items` and
   `/uc03/landing-metrics` fire together; each fills its own region as it
   returns. The page is interactive as soon as `work-items` resolves — it never
   blocks on the slower response.
3. **Performance strip is non-blocking.** `/uc03/pc-stats` (week + month) is
   fetched after first paint; the five tiles show skeleton digits and fill in
   late. A slow or failed stats call never delays the work list.
4. **No enrich-on-load.** `productLabel` is resolved lazily, only for the cards
   actually on screen — not the whole list.
5. **Zero extra requests for derived data.** "No action for N days" is computed
   in the browser from `latestActivityAtUtc` already in the `work-items`
   payload.
6. **Instant revisit.** Last successful `work-items` / `landing-metrics` /
   `pc-stats` payloads are cached (React Query + `localStorage`); on return the
   screen paints from cache and revalidates in the background.
7. **Route-split bundle.** The dashboard route loads only its own chunk; the
   ~85 UC-03 stylesheets are not all pulled for this screen.
8. **One screen, no lazy sections.** Everything is above the fold, so there is
   nothing that "loads on scroll" and no layout shift after paint.

If any single call is still breaching the 10 s ceiling in the field, that is a
backend latency issue on that endpoint — the UI is structured so it degrades to
"cards visible, strip catching up" rather than a blank screen.

---

## Out of scope for this screen

- End-of-day captures (full-day Gate pass, DMS dump, Cash register dump, Daily
  Status Report) live under **Daily operations** in the nav — not as dashboard
  widgets. They are done once, at end of day.
- "Start delivery" is not a user action — delivery can be walk-in, same-day, with
  no prior intimation.
