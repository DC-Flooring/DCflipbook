// Supabase Edge Function: sends an email via Resend whenever a quote's status
// transitions into "accepted" or "declined".
//
// Deploy with:
//   supabase functions deploy notify-decision
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//   supabase secrets set WEBHOOK_SECRET=<random value, also set as the x-webhook-secret header on the webhook>
//
// Then wire it up with a Database Webhook (Dashboard > Database > Webhooks):
//   Table: quotes | Events: Update | Type: Supabase Edge Function | Function: notify-decision
//   HTTP Headers: add  x-webhook-secret = <the same value as WEBHOOK_SECRET>
// The webhook payload includes both `record` (new row) and `old_record` (previous row),
// which is what this function uses to detect an actual status change rather than firing
// on every unrelated edit to the quote.
//
// Security: the function only does anything for requests that carry the shared secret in the
// x-webhook-secret header (compared in constant time). Everything that comes from the quote
// (customer name, reason, category: some of it typed by anonymous customers) is HTML-escaped
// before it goes into the email.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_TO = "alex.j@mdf-uk.com"; // temporary routing for testing — swap for Dave's real address later
const SENDER_EMAIL = "onboarding@resend.dev"; // Resend's shared sandbox sender; works with no domain setup. Swap once a sending domain is verified in Resend.
const BRAND_FALLBACK = "Floors for Living"; // used when no business name has been saved on the Settings page

// The business name from the Settings page, read through the public get_business() function (run section 12 of
// supabase/sql-log.sql once). Any problem, or an empty name, falls back to BRAND_FALLBACK: the email is never held up by it.
async function businessName(): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) return BRAND_FALLBACK;
    const res = await fetch(`${url}/rest/v1/rpc/get_business`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return BRAND_FALLBACK;
    const b = await res.json();
    const name = b && typeof b.business_name === "string" ? oneLine(b.business_name) : "";
    return name ? name.slice(0, 100) : BRAND_FALLBACK;
  } catch {
    return BRAND_FALLBACK;
  }
}

Deno.serve(async (req: Request) => {
  // Reject anything that doesn't carry the shared secret. If WEBHOOK_SECRET isn't configured this
  // fails closed (everything is rejected) rather than letting anyone trigger emails.
  if (!(await secretMatches(req.headers.get("x-webhook-secret")))) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const record = payload.record;
    const oldRecord = payload.old_record;

    if (!record) {
      return new Response("no record in payload", { status: 200 });
    }

    const decision = record.status;
    if (decision !== "accepted" && decision !== "declined") {
      return new Response("status is not accepted/declined, ignoring", { status: 200 });
    }

    // only notify on the transition INTO this status, not on every subsequent save
    // (e.g. an admin editing notes on an already-declined quote shouldn't re-notify)
    if (oldRecord && oldRecord.status === decision) {
      return new Response("status unchanged, ignoring", { status: 200 });
    }

    // a decision that staff recorded themselves in the admin (phone call, in the shop...) needs no email
    if (record.response && typeof record.response === "object" && record.response.source === "staff") {
      return new Response("recorded by staff, ignoring", { status: 200 });
    }

    const ref = record.ref ?? "(no ref)";
    const customerName = record.customer_name || "Unnamed customer";
    const response = record.response && typeof record.response === "object" ? record.response : {};
    const reason = response.reason ? String(response.reason) : null;
    // new rows store reason_category; older rows may have reasonCategory
    const category = response.reason_category || response.reasonCategory || null;

    const brand = await businessName();
    // the sender's display name goes in a header: keep it to plain characters
    const fromName = brand.replace(/[<>"\\,;:@()\[\]]/g, "").trim() || BRAND_FALLBACK;
    const subject = oneLine(`Quote ${ref} ${decision} — ${customerName}`).slice(0, 150);
    const html = `
      <div style="font-family:sans-serif; max-width:480px;">
        <h2 style="margin:0 0 12px;">Quote ${decision === "accepted" ? "Accepted" : "Declined"}</h2>
        <table style="border-collapse:collapse; width:100%;">
          <tr><td style="padding:4px 0; color:#666;">Ref</td><td style="padding:4px 0;"><strong>${escapeHtml(ref)}</strong></td></tr>
          <tr><td style="padding:4px 0; color:#666;">Customer</td><td style="padding:4px 0;">${escapeHtml(customerName)}</td></tr>
          <tr><td style="padding:4px 0; color:#666;">Decision</td><td style="padding:4px 0; text-transform:capitalize;">${decision}</td></tr>
          ${category ? `<tr><td style="padding:4px 0; color:#666;">Category</td><td style="padding:4px 0;">${escapeHtml(category)}</td></tr>` : ""}
          ${reason ? `<tr><td style="padding:4px 0; color:#666; vertical-align:top;">Reason</td><td style="padding:4px 0;">${escapeHtml(reason)}</td></tr>` : ""}
        </table>
        <p style="margin:14px 0 0; color:#999; font-size:12px;">${escapeHtml(brand)} quote notification</p>
      </div>
    `.trim();

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${SENDER_EMAIL}>`,
        to: [NOTIFY_TO],
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      return new Response(`Resend error: ${errText}`, { status: 502 });
    }

    return new Response("email sent", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(`error: ${(e as Error).message}`, { status: 500 });
  }
});

// Constant-time comparison: both values are hashed to a fixed length first (so the length of the
// secret doesn't leak), then every byte of the two digests is compared with no early exit.
async function secretMatches(provided: string | null): Promise<boolean> {
  const expected = Deno.env.get("WEBHOOK_SECRET");
  if (!expected || !provided) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Escapes &, <, >, " and ' (and backtick), so it is safe in text and in attribute values.
function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"'`]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c] as string)
  );
}

// Subject lines are plain text: collapse any line breaks / control characters.
function oneLine(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}
