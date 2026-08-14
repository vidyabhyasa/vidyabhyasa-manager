# Vidyabhyasa — production setup (Neon + Vercel)

This version uses **Neon** for the database and a small set of
**Vercel serverless functions** (in the `api/` folder) for login,
registration, and everything staff-only. Total cost: $0 on both
free tiers for a single study center's traffic.

Vercel's free "Hobby" plan caps a deployment at **12 serverless
functions**. This project deliberately stays at **7** — related
actions are grouped into one file each (e.g. `api/pending.js` handles
listing, photo fetching, editing, approving, and rejecting requests,
routed by an `action` query/body param) — so there's room to add more
before ever hitting that limit. Shared code that isn't itself an
endpoint (database connection, auth helpers, email, config) lives in
`/lib`, outside `api/`, so it doesn't count against the limit at all.

## 1. Create your Neon database

1. Go to [neon.tech](https://neon.tech) and sign up / log in.
2. Create a new project (any name, e.g. `vidyabhyasa`). Pick a region
   close to Mysuru if offered (e.g. Singapore/Mumbai).
3. On the project dashboard, find the **connection string** — it
   looks like `postgresql://user:password@ep-xxxx.neon.tech/neondb`.
   Copy it; you'll need it in step 3.
4. Open the **SQL Editor** (in Neon's dashboard) and run the whole
   contents of `schema.sql` from this folder.
5. Then run `migration-01-approvals.sql` too (same SQL Editor) — this
   adds the pending-approval queue used by the new registration flow.
   Safe to run even if you're not sure whether it's already applied.
6. Then run `migration-02-notifications.sql` — adds the table that
   tracks seats/lockers needing a physical clean after auto-removal.
7. Then run `migration-03-audit-log.sql` — adds the audit log table
   used by the founder's Audit log page.
8. Then run `migration-04-cash-payment.sql` — adds a small column
   used to carry a registration's payment method (cash vs UPI) from
   submission through to approval.
9. Then run `migration-05-payment-method-column.sql` — adds a proper
   `payment_method` column to the payments table itself, so Reports
   can cleanly total cash vs UPI without parsing note text.
10. Then run `migration-06-partial-payments.sql` — adds the `charges`
    table that powers partial payments.

## 2. Push this project to GitHub

Vercel deploys from a Git repository, so this needs to be in one.

1. Create a new empty repository on GitHub (e.g. `vidyabhyasa-manager`).
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/vidyabhyasa-manager.git
   git push -u origin main
   ```

## 3. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new), sign in, and import
   the GitHub repo you just pushed.
2. Before deploying, open **Environment Variables** and add:
   - `DATABASE_URL` — the Neon connection string from step 1.
   - `JWT_SECRET` — any long random string (this signs staff login
     sessions). You can generate one at
     [1password.com/password-generator](https://1password.com/password-generator/)
     (64+ characters, no need to remember it).
   - `SETUP_SECRET` — another random string, used once to create your
     staff accounts (step 4). Delete this variable afterward.
   - `RESEND_API_KEY` — for emailing bills on approval. Sign up at
     [resend.com](https://resend.com) (free tier), create an API key,
     and paste it here. See "Setting up email" below for the full steps.
   - `RESEND_FROM_EMAIL` — the "from" address bills are sent from, e.g.
     `Vidyabhyasa <bills@yourdomain.com>` — also covered below.
   - `CRON_SECRET` — any random string. Vercel automatically sends this
     as a Bearer token when it triggers the nightly cleanup job, so
     the endpoint can verify the request actually came from Vercel's
     scheduler and not a random visitor. Generate one the same way as
     `JWT_SECRET`.
3. Click **Deploy**. In under a minute you'll get a live URL like
   `https://vidyabhyasa-manager.vercel.app`.

Vercel will also automatically pick up the **Cron Job** defined in
`vercel.json` — it runs once a day at 3am UTC and auto-removes any
student who's 3+ days overdue (Hobby plan supports daily cron jobs,
no upgrade needed).

## Setting up email (Resend)

Bills are emailed automatically when staff approve a registration. If
you skip this, approvals still work — the student just won't get an
emailed bill (staff will see a toast saying the email wasn't sent).

1. Sign up at [resend.com](https://resend.com) — free tier covers
   3,000 emails/month, plenty for a single center.
2. **Fastest way to start (no domain needed):** Resend gives you a
   test sending address on signup — use that as `RESEND_FROM_EMAIL`
   to get emails working today.
3. **For a real "from" address** (e.g. `bills@vidyabhyasa.in`): in
   Resend, go to Domains → Add Domain, and add the DNS records they
   give you at wherever your domain is registered. This can take up
   to a day to verify. Once verified, use an address on that domain
   as `RESEND_FROM_EMAIL`.
4. Go to Resend → API Keys → Create API Key, and paste it into
   Vercel's `RESEND_API_KEY` environment variable.
5. Redeploy (Vercel → Deployments → ⋯ → Redeploy) after adding these
   so the functions pick up the new environment variables.

## UPI payment, rules text, logo, and site URL

`lib/config.js` now has your real values already filled in:
- `UPI_ID` — `paytm.s21tdlt@pty`
- `UPI_PAYEE_NAME` — `Vidyabhyasa Study Center`
- `RULES_TEXT` — the 15 rules from your printed signage, each with an
  icon and short label, shown as a grid on the registration form
- `RULES_NOTES` — the late-payment/grace-period note, shown as a
  highlighted callout below the rules grid

**If you ever need to change any of these**, edit `lib/config.js`,
then copy the same values into the matching constants near the top of
`index.html`'s `<script>` section (the frontend renders its own copy
so it doesn't need a network call just to show the rules) — push both
files together so they don't drift out of sync.

Also set `SITE_URL` in `lib/config.js` to your actual deployed domain
once you know it (defaults to `https://vidyabhyasa-manager.vercel.app`)
— this is only used to build an absolute link to your logo for the
bill email, since emails can't use relative image paths.

**Logo**: `logo.jpeg` and `favicon.png` sit at the project root and
are served as plain static files (same as `index.html`) — no config
needed, just make sure both files are included when you push. They
show up in the sidebar, the staff login screen, the registration
rules step, the browser tab icon, and the bill email.

## 4. Create your two staff logins

Use `create-staff-tool.html` (in this folder) — just double-click it to
open in your browser, no terminal needed:

1. Fill in your site's URL, the `SETUP_SECRET` you set in Vercel, the
   staff member's email/password/role/display name, and click
   **Create login**.
2. Repeat once for the Manager and once for the Founder.

**This requires the current version of this project to be deployed**
(with `api/auth.js`) — if you set up Vercel before this was added,
push this folder's current contents to your GitHub repo again so
Vercel redeploys it:
```bash
git add .
git commit -m "Update to consolidated API"
git push
```

<details>
<summary>Prefer the terminal? (Mac/Linux/WSL only — not Windows cmd)</summary>

```bash
curl -X POST "https://your-site.vercel.app/api/auth?action=admin-create-staff" \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "the-SETUP_SECRET-you-set-in-step-3",
    "email": "manager@vidyabhyasa.example",
    "password": "choose-a-strong-password",
    "role": "manager",
    "displayName": "Manager name"
  }'
```

Windows Command Prompt doesn't handle the single quotes in this command
the same way — use the HTML tool above instead, or run this from
PowerShell/WSL/Git Bash if you'd rather stick with a terminal.
</details>

**After creating both accounts, remove the `SETUP_SECRET` environment
variable from Vercel** (Project Settings → Environment Variables) and
redeploy, so that endpoint can no longer be used by anyone else.

## 5. Try it

Open your Vercel URL:
- **Availability** and **New registration** work immediately, no login.
- Click **Staff login** in the header, sign in with the Manager or
  Founder account you just created, and you'll see Dashboard and
  Subscriptions.

## The new registration flow (Stage 1)

Registration is no longer instant. A student now goes through:

1. **Rules & regulations** — must tick "I agree" to continue.
2. **Their details** — name, phone, email, ID photo, exam, seat/locker choice.
3. **Payment** — a UPI QR code (built from your `UPI_ID`) for the chosen
   amount, plus a required screenshot upload as proof of payment.
4. **Submitted** — the seat/locker is now held (hidden from Availability
   for everyone else) but the student is **not yet a real occupant**.

Staff review these under the new **Pending approvals** page:
- Fetch the ID photo and/or payment screenshot on demand
- Edit any field before deciding
- **Approve** → creates the real student record, logs the payment, and
  emails the bill (if `RESEND_API_KEY` is set and the student gave an
  email)
- **Reject** (with an optional reason) → the seat/locker becomes free
  again immediately

## Partial payments

Recording a renewal payment no longer has to be all-or-nothing. When
staff record a payment for a student's seat or locker, they see the
amount actually due (based on the month selection) and a separate,
editable "amount to pay now" field:

- **Pay the full amount** → works exactly as before: the due date
  extends immediately.
- **Pay less than the full amount** → a "charge" is created with the
  remaining balance visible. The due date does **not** move yet. The
  student shows a small purple dot on their Dashboard tile and a
  "Balance" entry on the Subscriptions table.
- **Come back later and pay the rest** → the same student's Record
  Payment modal now shows the open balance directly, with a field
  pre-filled to the remaining amount. Once the cumulative payments
  reach the full due amount, the due date extends automatically at
  that point.
- **Cancel a stale charge** — if a student decides not to continue
  after a partial payment, staff can cancel the open charge from the
  same modal. The partial payment already logged stays on record;
  the balance just stops showing as pending.

At most one open charge exists per seat or per locker at a time —
staff must resolve (pay off or cancel) the current one before
starting a new renewal for that same seat/locker. Seat and locker
balances are tracked completely independently.

There's also a **"Log a one-off payment instead"** link in the same
modal, for anything that isn't a renewal at all (a late fee, a
replacement ID card charge, etc.) — it never touches a due date.

**Partial payment also works at initial registration approval.** The
Pending Approvals card shows both the amount due and the amount
claimed — if a student paid less than what's due, approving still
grants the full requested seat/locker term immediately (staff's call
to trust them for the balance), and the shortfall becomes an open
balance-only charge, visible and payable through the same Record
Payment flow as any renewal balance. No schema change was needed for
this — it reuses the same `charges` table with `months: 0`, which
means paying it off just clears the balance without granting any
further extension (there's nothing left to extend — they already
have the seat they asked for).

Reports now show a founder-visible **Outstanding balance** total
across all open charges, and payment history shows the method per
line with founders able to correct it after the fact.

## Notifications and auto-removal (Stage 2)

Every occupied seat/locker now has one of four statuses, based on
days until (or past) expiry:

| Status | Meaning | Color |
|---|---|---|
| Active | More than 2 days left | red (plain occupied) |
| Warning | 1-2 days left | orange |
| Error | Day of expiry through 2 days overdue | rose |
| Critical | 3+ days overdue | dark red, pulsing |

**A seat is "occupied" for as long as a student record exists for
it** — expiry status no longer determines availability by itself.
That's a deliberate change from Stage 1: it means an overdue student
keeps visibly holding their seat (in escalating warning colors)
instead of the seat silently reopening the moment their subscription
lapses.

**The nightly cron job** (`api/cron-cleanup.js`, scheduled in
`vercel.json`) is what actually frees a seat once someone is 3+ days
overdue:
- If the **seat** is 3+ days overdue, the whole student record is
  removed, and both the seat (and locker, if they had one) are
  flagged as **needing cleaning**.
- If only the **locker** is 3+ days overdue (the seat itself is still
  current — this happens because seat and locker renewals are
  tracked independently), just the locker assignment is cleared and
  flagged — the student keeps their seat.

Flagged items show up in a **Needs cleaning** panel on the Dashboard,
with a "Mark cleaned" button per item — this is purely a staff to-do
list; a flagged seat is already free for new bookings the moment it's
flagged, cleaning it is a separate physical task.

You can trigger the cleanup job manually (without waiting for 3am) by
being logged in as a founder and visiting
`https://your-site.vercel.app/api/cron-cleanup` — useful for testing.

## What changed from the Supabase version

- **Free-only Availability**: the public page shows *only* free seats
  and lockers — no occupied markers, no status colors, no personal
  data of any kind. Full detail (name, phone, photo, payment history)
  only ever appears on the staff-only Dashboard.
- **Custom auth**: staff log in with an email/password checked against
  a `staff` table (passwords hashed with bcrypt), with a signed,
  httpOnly session cookie — Neon has no built-in auth, so this is
  hand-built instead of using Supabase's.
- **ID photos and payment screenshots live in the database** (as
  bytea) instead of a separate storage bucket, to avoid needing a
  third service. Payment screenshots are deleted once a request is
  approved or rejected — they're only needed during review.
- **Access control moved from the database to the API code.** Supabase
  enforced who-can-see-what at the database level (row-level security).
  Neon has no equivalent tied to a public API layer, so every rule
  ("only staff can read personal data," "only staff can delete a
  student") is now enforced inside the `/api` functions instead. The
  database connection string only ever lives on the server (as a
  Vercel environment variable) — it's never sent to the browser.

## Staff tools and audit log (Stage 3)

Every occupied seat's detail modal now has:
- **Edit details** — correct name, phone, email, or exam without
  touching seat/subscription data.
- **Move seat / Move locker** — reassign an existing student to a
  different free seat or locker (their subscription dates travel with
  them).
- **Share bill** — WhatsApp a receipt summary, or resend the bill
  email.
- **Payment history** — every payment logged for that student; a
  **founder** login can also edit or delete individual payment rows
  here (correcting a typo'd amount, removing a duplicate, etc.) —
  managers can view but not edit.
- **Remove** now asks for an optional reason before deleting, kept in
  the audit log even after the student record itself is gone.

**Audit log** (founder-only, new nav item) records every approval,
rejection, edit, removal, payment change, and locker/seat move, with
who did it and when — the last 300 actions.

## Known limitations

- **This is Stage 3 of 3** — the originally planned feature set is now
  complete. Anything from here is a new request, not a missing piece.
- **Vercel Hobby cron timing isn't exact-to-the-minute** — it's
  documented to run within the scheduled hour, not necessarily at
  exactly 3:00am. Fine for a once-a-day cleanup job.
- **Same race-condition caveat as before**: two people requesting the
  exact same seat in the same instant is possible in theory; the app
  detects it and asks the second person to retry, but it's not a hard
  database-level guarantee.
- **Payment verification is manual** — the QR + screenshot is
  self-reported by the student; staff are expected to actually look at
  the screenshot before approving.
- **WhatsApp reminders and bill-sharing stay manual**, as you asked —
  those buttons open a pre-filled chat for staff to send themselves.
- **Password resets**: there's no self-serve "forgot password" flow.
  To reset one, use `create-staff-tool.html` again for that person
  with a new password (you'll need to briefly re-add the
  `SETUP_SECRET` env var to do this, then remove it again).
- **Audit log has no built-in retention/cleanup** — it will grow
  indefinitely; the page only shows the most recent 300 entries, but
  older ones stay in the database. Fine for a long while at this
  scale; worth revisiting if it ever becomes a real storage concern.
