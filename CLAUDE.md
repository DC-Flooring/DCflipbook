# CLAUDE.md

## What this is
A flip-book style digital quote tool for flooring customers (Floors for Living / DC Flooring).
- **Customer side:** a quote link (`/q/<slug>`) opens a page-turning flipbook: five pages: cover, about, how we work, itemised quote (04), then the Decision page (05) to **sign to accept** or **decline**, with the shop's name, phone and email at the foot.
- **Admin side:** the same app, behind a Supabase email + password login. A quote builder, a quotes list, reminders, a dashboard and a Settings page.
- **Hosting:** static site on GitHub Pages (custom domain in `CNAME`). The database is Supabase (free project). There is no build step and no framework.

## Files
| Path | What it is |
| --- | --- |
| `index.html` | The whole app: CSS, HTML and JS in one file (customer flipbook, admin, signing dialog, print view). |
| `404.html` | **Must stay byte-identical to `index.html`** (`cp index.html 404.html`). GitHub Pages serves it for `/q/<slug>` links, which is how the single page handles those routes. |
| `1.webp` `2.webp` `3.png` | Flipbook cover, about and how-we-work pages (1000x1400, text baked in). Bump `IMG_VERSION` in `index.html` when you replace them. |
| `floors-for-living-logo.png` | Logo (light artwork on black; shown with `mix-blend-mode:lighten` on dark backgrounds). `DC Flooring Logo.png` is not used by the app. |
| `vendor/` | StPageFlip 2.0.7 (`page-flip.browser.js`), served locally on purpose. See `vendor/README.md`. |
| `fonts/` | Self-hosted Montserrat and Inter (woff2, OFL licences) for the admin. See `fonts/README.md`. |
| `design-check/` | Screenshots of every admin screen (390px and 1440px, dark and light), the contrast report, and `tests/` (Playwright scripts with mocked Supabase). See `design-check/README.md`. |
| `design-system/`, `.claude/skills/` | Output of the UI UX Pro Max skill. Its palette and fonts are **not** used (the admin theme below overrides them); use it for spacing, states, accessibility and chart guidance. |
| `supabase/sql-log.sql` | **The source of truth for the database.** Numbered, dated sections, run by hand in the Supabase SQL Editor. |
| `supabase/security/` | The original lock-down scripts (blocks A/B/C) and their README. Later changes are in `sql-log.sql`. |
| `supabase/functions/notify-decision/` | Edge Function that emails when a quote becomes accepted or declined (database webhook on `quotes` UPDATE). See `DEPLOY.md`. |
| `.github/workflows/keep-supabase-alive.yml` | Pings Supabase twice a week so the free project does not pause. |

Routes: `/q/<slug>` is the customer flipbook (`?preview=1` is the admin's preview and is not counted as a view). Everything else is the admin (`#/dashboard`, `#/quotes`, `#/reminders`, `#/settings`).

## Design system (use these, do not invent new ones)
There are two looks. They must not leak into each other.

### Admin (dark by default, light option)
Everything is scoped to `html[data-theme="dark"|"light"]`, which is set only on the admin side (before first paint, from `localStorage` `dcf.theme`). It is removed on customer pages, including "Preview as customer". New admin CSS goes in the "ADMIN THEME" block and must start with `html[data-theme]`.
- **Tokens** (`--bg --panel --tile --tile-active --border --text --muted --accent --accent-hover --on-accent --accent-text --focus`): dark `#1c1c1c #272727 #303030 #3a3a3a #3a3a3a #f5f5f5 #a8a8a8 #b08d57 #c29d65 #1c1c1c #c9a66f #b08d57`; light `#f2f2ef #ffffff #f6f6f3 #eeeeea #e2e2dd #1c1c1c #6b6b66 #b08d57 #c29d65 #1c1c1c #7a5a2c #7a5a2c`. Status colours: `--green #5fae7a / --red #d0675f / --amber #d9a441` for fills, dots and borders (dark; the light values are darker) and `--green-text --red-text --amber-text` when used as text. Other: `--control-border` (form fields, 3:1), `--red-solid` (destructive buttons), `--chart-sent --chart-won`.
- **Shape and spacing:** `--radius-panel 20px`, `--radius-tile 14px`, `--radius-pill 999px`; `--space-0..5` = 4, 8, 16, 24, 32, 48px (an 8px grid, 16 and 24 are the usual gaps); `--target 44px` minimum touch target. No gradients, glows or heavy shadows.
- **Fonts:** `--font-display` Montserrat 600/700 (headings, numbers, small uppercase labels), `--font-body` Inter 400/500/600. Money and counts use tabular figures. Text is never under 12px.
- **Pieces:** panels (`--panel`, 20px) holding inner tiles (`--tile`, 14px); the sidebar (logo panel, collapse chevron, nav panel with a light active pill, theme toggle and Log out; a bottom bar under 800px); segmented period control; brass pill buttons; status pills carry a dot as well as a colour; a 2px `--focus` outline on keyboard focus.
- **Dashboard:** KPI row (Potential revenue is the brass highlight tile), Needs attention (tablist) next to the selected quote's detail panel (desktop only; a phone opens the full-screen quote), and a plain-SVG weekly chart. The numbers come from `dashboardStats()`, `attentionLists()` and `weeklySeries()`: change how they look, not what they say.

### Customer booklet (leave alone)
**Colour tokens** (`:root`): `--bark #241a14`, `--walnut #3c2c22`, `--oak #a97e4f`, `--brass #b08d57`, `--linen #f3ede1`, `--linen-soft rgba(243,237,225,.62)`, `--paper #faf6ee` (page background), `--ink #2a2019`, `--ink-soft #6b5c4d`, `--line #d9cbb2`, `--ok #4c6b4f`, `--bad #a1493f`, `--dark #272727`. The dark pages (Quote, Decision) use `#272727`, borders `#3d3d3d`, inputs `#1d1d1d`.
**Fonts** (Google Fonts, `@import` at the top; the booklet needs it): `Fraunces` (serif titles), `Work Sans` (body), `IBM Plex Mono` (labels, numbers), `Poppins` (dark-page titles).
**Book:** pages are 480 x 672 (portrait, stretches 260-700 wide). Page padding `26px 22px 22px 32px`; page background `--paper`, border `1px solid --line`, radius 6px, `overflow:hidden auto`.
**Buttons:** customer `.dbtn` (last page) has radius 5px, `min-height:56px`; Sign is `--ok` green, Decline is the outlined red secondary. The signing dialog uses `.sg-btn` (primary brass, secondary brass outline, 56px+). Cards: `.stream` and the signed card (gradient `#fff` to `--paper`, `1px --line`, radius 4), raised-card shadow `0 10px 25px -10px rgba(0,0,0,.5)`.

## Supabase
Project URL and the **publishable** key are in `index.html`. Admins sign in with Supabase Auth (email + password); public sign-ups and anonymous sign-ins must stay off.

| Table | Holds |
| --- | --- |
| `quotes` | One row per quote, keyed by `ref` (`DCF-######`). Customer name, dates, `line_items` (json: product, qty, unitPrice), `notes` (terms), `status` (draft / sent / accepted / declined), `response` (json decision), `short_slug` (the secret 10-character link), view tracking, `sent_at`, chase / snooze, `hidden`. |
| `settings` | One row (`id = 1`): business name, phone, email, address, default terms, quote valid days, reminder days. |
| `quote_signatures` | One row per signed quote: `quote_ref`, `full_name`, `signature` (PNG data URL), `signed_at`, `snapshot` (lines and totals at signing). Nothing else. |
| `_policy_backup` | Copy of the old open policies saved by Block B (for rollback). |

**RLS:** on for every table. `quotes` and `settings` have one policy, "authenticated users only" (signed-in, non-anonymous users). `quote_signatures` has no anon access at all and a read-only policy for signed-in admins. The anon (public) key can only call these functions, which all need the secret slug: `get_quote`, `record_view`, `submit_decision` (decline), `sign_quote` (accept), `get_signature`, and `get_business` (name, phone, email, address only).

Change the database by adding a **new numbered, dated section at the bottom of `supabase/sql-log.sql`**, make it safe to re-run where possible, and tell the owner to run it in the SQL Editor **before** the code that needs it goes live.

## Key flows
- **Create a quote:** admin "New quote" makes a blank quote (ref `DCF-` + 6 digits, random 10-character slug, valid-until from Settings, default terms), then Save upserts it. Copy link (or Mark as sent) shares it; staff can also record a phone answer or reopen a quote.
- **Customer views it:** `/q/<slug>` calls `get_quote` and `get_business`, then `record_view` (counts the view; a draft becomes "sent"). Expired quotes (past valid-until, UK date) cannot be answered.
- **Sign (accept):** last page, "Sign to accept this quote" opens the full-screen dialog: 1 type name, 2 sign on the `signature_pad` canvas (loaded from cdnjs, pinned, with an integrity hash), 3 check and tick the box, then `sign_quote()` accepts the quote and stores the signature in one step. The page then shows "Signed by NAME on DATE" with the signature and a "Save a copy" print view. The admin sees the signature in the quote's Decision box.
- **Zoom:** a small magnifier button above the book (top right) opens the page being read full screen and larger (1x to 2.5x, starts at 1.5x) with +, - and Close. The zoom view scrolls and pinches like a normal page and never turns the page. Page turns come from `installSwipe()` (one finger, mostly horizontal) and the Prev / Next buttons.
- **Decline:** "Decline this quote" shows a reason box, then `submit_decision(..., 'declined', reason)`. A declined quote shows no signing button.
- **Dashboard:** worked out in the browser from the quotes list. Won = accepted quotes created in the period; win rate = accepted / non-draft; average time to decision; lost = declined; sent vs accepted per week (8 weeks); "Needs attention" lists (expiring soon, opened repeatedly with no answer, never opened). Reminders use `reminder_days` from Settings.

## Rules for future changes
1. **Never collect or store customer email addresses or any extra personal data.** Only what the quote and signature need (name, signature, timestamp, quote snapshot).
2. **Never remove or change the Decline flow** unless explicitly asked.
3. **Keep customer pages simple for older customers:** text at least 18px, buttons at least 56px tall, high contrast, plain words. (Some older flipbook pages use smaller text; the zoom button covers those. New customer-facing UI must meet the rule.)
4. **Customer-facing flipbook pages use the zoom button for zooming. Page-turn swipes must only respond to single-finger horizontal swipes, never to pinch gestures.**
5. **Reuse the design tokens above.** Do not hardcode new colours or fonts. Admin changes use the admin tokens under `html[data-theme]`; never set `data-theme` on a customer page, and never let an admin change alter the booklet or the print layout (compare screenshots before and after).
6. **No secrets in the repo.** Only the publishable Supabase key belongs in `index.html`. Never commit a service-role key, a Resend key or a webhook secret.
7. **Always open a pull request. Never push to `main`.**
8. Keep `index.html` and `404.html` identical, and keep the SQL log up to date.

## Testing
No build step. `design-check/tests/` has Playwright scripts that run the app against mocked Supabase data (see `design-check/README.md`): old-vs-new dashboard numbers, booklet pixel comparison, an off-token colour audit, a contrast check that reads the real tokens, and a keyboard/behaviour walkthrough. To look at the app by hand, serve the folder with a single-page fallback (`npx serve -s .`) and open `/q/<slug>`; it talks to the live Supabase, so use a test quote. For automated checks, Playwright with the Supabase `rpc` calls mocked works well (the flipbook, swipes, zoom view and signing dialog were all tested that way).
