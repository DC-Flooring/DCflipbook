# Design check

Evidence for the admin redesign (dark and light theme, new shell and dashboard).

- `*-390-*.png`, `*-1440-*.png`: every admin screen at phone and desktop width, in `dark` and `light`
  (login, dashboard, empty dashboard, collapsed sidebar, quotes, quote editor, accepted quote, reminders, settings,
  record-decision dialog, toast, snooze menu). Taken from mocked data, so no real customer data is shown.
- `contrast-report.txt`: WCAG ratios for every token pair the admin uses, read straight from the CSS (text 4.5:1, UI parts 3:1).
- `tests/`: the Playwright scripts behind the checks. They run the app from this repo against a mocked Supabase and a frozen clock
  (30 Oct 2026) with 20 seeded quotes covering every state.

## Running the tests

```
npm i -D playwright            # or set PLAYWRIGHT_PATH / CHROME_PATH to an existing install
git worktree add ../dcf-old origin/main~N   # a checkout of the OLD version, only needed for cmp.js and booklet.js
cd design-check/tests
OLD=../../../dcf-old node cmp.js       # every dashboard number, old code vs new code, 4 periods x (full, empty) data
OLD=../../../dcf-old node booklet.js   # customer booklet (6 pages, sign dialog, zoom view) and print HTML: pixel-identical to before?
node audit.js      # off-token backgrounds / text / borders / fonts, and text under 12px, on every admin screen and theme
node contrast.js   # contrast of every token pair
node interact.js   # keyboard walkthrough, tabs and rows, actions and Undo, theme and sidebar memory, mobile layout and 44px targets
node screens.js    # regenerates the screenshots in this folder
```

## Last run (30 Oct 2026)

| Check | Result |
| --- | --- |
| Dashboard numbers vs the old code (KPIs, Needs attention lists and counts, snoozed count, weekly chart), 4 periods, full and empty data | identical |
| Customer booklet at 390px and 1440px (6 pages, signing dialog, zoom view) and both print layouts | pixel-identical / identical HTML |
| Colour audit (8 admin screens x 2 themes x 2 widths) | 0 off-token colours, 0 stray fonts, 0 text under 12px |
| Contrast (94 token pairs) | 0 failures |
| Interaction and keyboard walkthrough | 57 checks pass, 0 fail, 0 console errors |
| Touch targets on the mobile dashboard | all 44px or more |
