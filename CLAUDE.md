# CLAUDE.md

## What this is
A flip-book style digital quote tool for flooring customers (Floors for Living / DC Flooring).
- **Customer side:** a quote link (`/q/<slug>`) opens a page-turning flipbook: cover, about, how we work, itemised quote, service, then a last page to **sign to accept** or **decline**.
- **Admin side:** the same app, behind a Supabase email + password login. A quote builder, a quotes list, reminders, a dashboard and a Settings page.
- **Hosting:** static site on GitHub Pages (custom domain in `CNAME`). The database is Supabase (free project). There is no build step and no framework.

## Files
| Path | What it is |
| --- | --- |
| `index.html` | The whole app: CSS, HTML and JS in one file (customer flipbook, admin, signing dialog, print view). |
| `404.html` | **Must stay byte-identical to `index.html`** (`cp index.html 404.html`). GitHub Pages serves it for `/q/<slug>` links, which is how the single page handles those routes. |
| `1.png` `2.png` `3.png` | Flipbook cover, about and how-we-work pages (images with text baked in). Bump `IMG_VERSION` in `index.html` when you replace them. |
| `floors-for-living-logo.png` | Logo (light artwork on black; shown with `mix-blend-mode:lighten` on dark backgrounds). `DC Flooring Logo.png` is not used by the app. |
| `vendor/` | StPageFlip 2.0.7 (`page-flip.browser.js`), served locally on purpose. See `vendor/README.md`. |
| `supabase/sql-log.sql` | **The source of truth for the database.** Numbered, dated sections, run by hand in the Supabase SQL Editor. |
| `supabase/security/` | The original lock-down scripts (blocks A/B/C) and their README. Later changes are in `sql-log.sql`. |
| `supabase/functions/notify-decision/` | Edge Function that emails when a quote becomes accepted or declined (database webhook on `quotes` UPDATE). See `DEPLOY.md`. |
| `.github/workflows/keep-supabase-alive.yml` | Pings Supabase twice a week so the free project does not pause. |

Routes: `/q/<slug>` is the customer flipbook (`?preview=1` is the admin's preview and is not counted as a view). Everything else is the admin (`#/dashboard`, `#/quotes`, `#/reminders`, `#/settings`).

## Design system (use these, do not invent new ones)
**Colour tokens** (`:root` in `index.html`):
`--bark #241a14`, `--walnut #3c2c22`, `--oak #a97e4f`, `--brass #b08d57` (the accent), `--linen #f3ede1`, `--linen-soft rgba(243,237,225,.62)`, `--paper #faf6ee` (page background), `--ink #2a2019`, `--ink-soft #6b5c4d`, `--line #d9cbb2`, `--ok #4c6b4f`, `--bad #a1493f`, `--dark #272727`.
The dark pages (Quote, Service, Decision) and the admin sidebar use `#272727`, borders `#3d3d3d`, inputs `#1d1d1d`. Status pills: accepted `#dbe6dc`, declined `#f0dcd9`, sent `#e0d3ba`, expired `#efe0c8`.

**Fonts** (Google Fonts, `@import` at the top): `Fraunces` (serif, headings and titles), `Work Sans` (body), `IBM Plex Mono` (small uppercase labels, numbers, totals), `Poppins` (titles on the dark pages).

**Book:** pages are 480 x 672 (portrait, stretches 260-700 wide). Page padding is `26px 22px 22px 32px`; page background `--paper`, border `1px solid --line`, radius 6px, `overflow:hidden auto`.

**Buttons:** admin `.btn` is `10px 18px`, radius 4px, 13px/600; `.btn-primary` is brass with white text (hover `--oak`); `.btn-ghost` is outlined (`--line`, hover brass). Customer `.dbtn` (last page) has radius 5px, `min-height:56px`; the Sign button is `--ok` green, Decline is the outlined red secondary. The signing dialog uses `.sg-btn` (primary brass, secondary brass outline, 56px+).

**Cards:** `.qcard` (white, `1px --line`, radius 5), `.stream` and signed card (gradient `#fff` to `--paper`, `1px --line`, radius 4), `.quotebox` (`1px --line`, radius 4), `.editor-summary` (`--paper`, radius 6). Soft shadow used for raised cards: `0 10px 25px -10px rgba(0,0,0,.5)`. Spacing is mostly 12-16px gaps.

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
- **Zoom:** every flipbook page has a magnifier button (top right) that opens that page full screen and larger (1x to 2.5x, starts at 1.5x) with +, - and Close. The zoom view scrolls and pinches like a normal page and never turns the page. Page turns come from `installSwipe()` (one finger, mostly horizontal) and the Prev / Next buttons.
- **Decline:** "Decline this quote" shows a reason box, then `submit_decision(..., 'declined', reason)`. A declined quote shows no signing button.
- **Dashboard:** worked out in the browser from the quotes list. Won = accepted quotes created in the period; win rate = accepted / non-draft; average time to decision; lost = declined; sent vs accepted per week (8 weeks); "Needs attention" lists (expiring soon, opened repeatedly with no answer, never opened). Reminders use `reminder_days` from Settings.

## Rules for future changes
1. **Never collect or store customer email addresses or any extra personal data.** Only what the quote and signature need (name, signature, timestamp, quote snapshot).
2. **Never remove or change the Decline flow** unless explicitly asked.
3. **Keep customer pages simple for older customers:** text at least 18px, buttons at least 56px tall, high contrast, plain words. (Some older flipbook pages use smaller text; the zoom button covers those. New customer-facing UI must meet the rule.)
4. **Customer-facing flipbook pages use the zoom button for zooming. Page-turn swipes must only respond to single-finger horizontal swipes, never to pinch gestures.**
5. **Reuse the design tokens above.** Do not hardcode new colours or fonts.
6. **No secrets in the repo.** Only the publishable Supabase key belongs in `index.html`. Never commit a service-role key, a Resend key or a webhook secret.
7. **Always open a pull request. Never push to `main`.**
8. Keep `index.html` and `404.html` identical, and keep the SQL log up to date.

## Testing
No build or test suite. Serve the folder with a single-page fallback (`npx serve -s .`) and open `/q/<slug>`; it talks to the live Supabase, so use a test quote. For automated checks, Playwright with the Supabase `rpc` calls mocked works well (the flipbook, swipes, zoom view and signing dialog were all tested that way).
