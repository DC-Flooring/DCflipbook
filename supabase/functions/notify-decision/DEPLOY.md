# Deploying the accept/decline email notification

This sends an email to alex.j@mdf-uk.com whenever a quote's status changes to
`accepted` or `declined`, via a Supabase Edge Function + Resend.

I (Claude) don't have access to your Supabase project or a Resend account, so I
can't deploy this myself — but everything below is copy/paste. Should take
about 10 minutes.

## 1. Get a Resend API key (free)

1. Sign up at https://resend.com (free tier: 3,000 emails/month, no card required).
2. In the Resend dashboard, go to **API Keys** → **Create API Key**.
3. Copy the key (starts with `re_`).

You don't need to verify a domain to test this — Resend's shared sandbox sender
(`onboarding@resend.dev`) works out of the box and can deliver to any address.
Swap it for a verified `@dc-flooring...` address later if you want branded
"from" addresses.

## 2. Install the Supabase CLI and log in

```bash
npm install -g supabase
supabase login
```

This opens a browser to authorize the CLI against your Supabase account.

## 3. Link this folder to your project

```bash
cd "DC Flooring"
supabase link --project-ref <your-project-ref>
```

Your project ref is the subdomain in your Supabase URL — for
`https://lpkdsdfltejgczsuvpay.supabase.co` it's `lpkdsdfltejgczsuvpay`.

## 4. Deploy the function and set the secret

```bash
supabase functions deploy notify-decision
supabase secrets set RESEND_API_KEY=re_your_key_here
```

The function also needs a `WEBHOOK_SECRET` (see **Securing the webhook** below). Without it the function
rejects every request with a 401, so it can never be triggered by anyone else, but it also won't send
your emails until the secret and the webhook header are set.

## 5. Wire it up with a Database Webhook

In the Supabase Dashboard:

1. Go to **Database → Webhooks → Create a new webhook**.
2. Name: `notify-decision`
3. Table: `quotes`
4. Events: **Update** only (leave Insert/Delete unchecked)
5. Type: **Supabase Edge Functions**
6. Edge Function: `notify-decision`
7. HTTP Method: POST, HTTP Headers: keep the defaults (the dashboard signs the
   request automatically) **and add `x-webhook-secret`** (see **Securing the webhook** below).
8. Save.

That's it — no SQL needed. The webhook fires on every update to the `quotes`
table; the function itself checks `old_record.status` vs `record.status` and
only sends an email when it actually *changed* to `accepted` or `declined`
(so editing notes on an already-declined quote won't re-notify).

## 6. Test it

The webhook fires on any UPDATE to `quotes`. Customer accept/decline now goes
through the `submit_decision()` database function (see `supabase/security/`),
which performs that UPDATE, so the email still fires. Nothing about this
function or the webhook changes.

Easiest: sign in to the admin, open a quote whose status is **sent** (a draft or
an already-decided quote can't be accepted/declined), click **Preview as
customer**, go to the Decision page, and click Accept (or Decline with a
reason). Check alex.j@mdf-uk.com for the email; it should arrive within a few
seconds. Use a throwaway test quote: the decision is real and can't be undone.

If it doesn't arrive:
- Check **Supabase Dashboard → Edge Functions → notify-decision → Logs** for
  errors (e.g. a bad Resend key shows up here).
- Check **Resend Dashboard → Logs** to see if the send was attempted/rejected.
- Check spam — sandbox-sender emails occasionally land there on first send.

## Later: switching the recipient

When you're ready to point this at Dave's real email instead of the test
address, edit `NOTIFY_TO` in `index.ts` and redeploy:

```bash
supabase functions deploy notify-decision
```

## Securing the webhook (WEBHOOK_SECRET)

The function only does anything for a request that carries the shared secret in an `x-webhook-secret`
header (compared in constant time); everything else gets `401 unauthorized`. If you are adding this to a
webhook that is already working, do the three steps **in this order**, so emails never stop in between:

**(a) Generate a random value and store it as the `WEBHOOK_SECRET` secret**

1. In any browser tab press F12, open the **Console** and run:

   ```js
   crypto.randomUUID()
   ```

   (For a longer one:
   `Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')`.)
   Copy the value without the quotes. Keep it out of the repo, chat and screenshots.
2. In a terminal, in the project folder (the same place you ran `supabase link`):

   ```bash
   supabase secrets set WEBHOOK_SECRET=paste-the-value-here
   ```

   Or in the Dashboard: **Edge Functions → Secrets → Add new secret**, name `WEBHOOK_SECRET`, paste the value.
   (The Dashboard avoids leaving the value in your shell history.) `supabase secrets list` should now show it.

   Nothing changes yet: the function that is currently deployed doesn't read it.

**(b) Add the header to the database webhook**

1. Dashboard → **Database → Webhooks** → open `notify-decision` → edit.
2. Under **HTTP Headers** click **Add a new header**: name `x-webhook-secret`, value = the same value as in (a)
   (no quotes, no spaces). Leave the existing headers as they are.
3. Save.

The old function ignores the extra header, so emails keep working.

**(c) Deploy the updated function**

```bash
supabase functions deploy notify-decision
```

**Check it**

- Open the admin, **Preview as customer** on a throwaway quote whose status is **sent**, accept it, and check
  alex.j@mdf-uk.com for the email.
- Dashboard → **Edge Functions → notify-decision → Logs**: you should see the invocation succeed, not a 401.
- A request without the header must not send anything. For example, this must not result in an email (it
  should answer 401; depending on your project's JWT settings the 401 may come from Supabase's gateway rather
  than from the function itself):

  ```bash
  curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/notify-decision" \
    -H "Content-Type: application/json" -d '{"record":{"status":"accepted"}}'
  ```

**If emails stop after this**: the secret and the header value don't match. Re-set both from the same value
(a) and (b). To go back to the previous function while you sort it out, check out the previous
`index.ts` (`git log -- supabase/functions/notify-decision/index.ts`) and run the deploy command again.

To rotate the secret later, set a new value in the same three steps (there is a short window between
(a)-then-(c) and (b) where emails are rejected, so do it when no quotes are about to be answered).
