# Database lock-down

The public (anon) key is visible in the page source, so it must not be able to read or change
the `quotes` / `settings` tables. These three scripts move the app to: admins sign in with
Supabase Auth (email + password) and use their own token; customers use three database
functions that only ever take the random short slug.

Run them in the Supabase **SQL Editor**, in this order:

| Script | When | What it does |
| --- | --- | --- |
| `block-a-functions.sql` | **First**, before or straight after the new code is merged. Safe at any time. | Adds `get_quote`, `record_view`, `submit_decision` (security definer, fixed `search_path`, executable by anon) and a policy letting signed-in users in. Removes nothing. |
| `block-b-lockdown.sql` | **Only once** the new code is live and you have checked that you can sign in and that a customer link loads. | Saves, then drops, every policy that applies to `anon`/`public` on `quotes` and `settings` (a table that doesn't exist is skipped), keeps RLS on, and leaves only the signed-in policy. **The old site stops working when this runs.** |
| `block-c-rollback.sql` | **Only if something breaks** after Block B. | Re-creates the policies Block B saved, so anon access is open again. Leaves the signed-in policy in place so the new site also keeps working. Run Block B again to re-lock. |

Also check in the Supabase dashboard (Authentication): public sign-ups are off, and **anonymous
sign-ins are off** (anonymous users share the `authenticated` role; the policies refuse them as a
second line of defence).

The `notify-decision` Edge Function and its database webhook are unchanged: `submit_decision()`
updates `quotes.status` and `quotes.response` exactly as the old code did, which fires the webhook.
