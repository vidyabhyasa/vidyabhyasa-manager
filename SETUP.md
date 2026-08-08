# Vidyabhyasa — production setup (Neon + Vercel)

This version uses **Neon** for the database and a small set of
**Vercel serverless functions** (in the `api/` folder) for login,
registration, and everything staff-only. Total cost: $0 on both
free tiers for a single study center's traffic.

## 1. Create your Neon database

1. Go to [neon.tech](https://neon.tech) and sign up / log in.
2. Create a new project (any name, e.g. `vidyabhyasa`). Pick a region
   close to Mysuru if offered (e.g. Singapore/Mumbai).
3. On the project dashboard, find the **connection string** — it
   looks like `postgresql://user:password@ep-xxxx.neon.tech/neondb`.
   Copy it; you'll need it in step 3.
4. Open the **SQL Editor** (in Neon's dashboard) and run the whole
   contents of `schema.sql` from this folder.

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
3. Click **Deploy**. In under a minute you'll get a live URL like
   `https://vidyabhyasa-manager.vercel.app`.

## 4. Create your two staff logins

With the site deployed, run this once for the Manager and once for
the Founder (replace the values, keep the URL pointed at your deployed
site):

```bash
curl -X POST https://your-site.vercel.app/api/admin-create-staff \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "the-SETUP_SECRET-you-set-in-step-3",
    "email": "manager@vidyabhyasa.example",
    "password": "choose-a-strong-password",
    "role": "manager",
    "displayName": "Manager name"
  }'
```

Run it again with `"role": "founder"` for the founder's account. Any
computer with `curl` works for this (Mac/Linux terminal, or Windows
via WSL or Git Bash) — or ask me and I can build you a one-time HTML
form instead if you'd rather not use the terminal.

**After creating both accounts, remove the `SETUP_SECRET` environment
variable from Vercel** (Project Settings → Environment Variables) and
redeploy, so that endpoint can no longer be used by anyone else.

## 5. Try it

Open your Vercel URL:
- **Availability** and **New registration** work immediately, no login.
- Click **Staff login** in the header, sign in with the Manager or
  Founder account you just created, and you'll see Dashboard and
  Subscriptions.

## What changed from the Supabase version

- **Free-only Availability**: the public page now shows *only* free
  seats and lockers — no occupied markers, no status colors, no
  personal data of any kind. Full detail (name, phone, photo, payment
  history) only ever appears on the staff-only Dashboard.
- **Custom auth**: staff log in with an email/password checked against
  a `staff` table (passwords hashed with bcrypt), with a signed,
  httpOnly session cookie — Neon has no built-in auth, so this is
  hand-built instead of using Supabase's.
- **ID photos live in the database** (as bytea) instead of a separate
  storage bucket, to avoid needing a third service.
- **Access control moved from the database to the API code.** Supabase
  enforced who-can-see-what at the database level (row-level security).
  Neon has no equivalent tied to a public API layer, so every rule
  ("only staff can read personal data," "only staff can delete a
  student") is now enforced inside the `/api` functions instead. The
  database connection string only ever lives on the server (as a
  Vercel environment variable) — it's never sent to the browser.

## Known limitations

- **Same race-condition caveat as before**: two people registering the
  exact same seat in the same instant is possible in theory; the app
  detects it and asks the second person to retry, but it's not a
  hard database-level guarantee.
- **WhatsApp reminders stay manual**, as you asked — the "Send
  WhatsApp" button opens a pre-filled chat for staff to send.
- **Password resets**: there's no self-serve "forgot password" flow.
  To reset one, run the `admin-create-staff` curl command again for
  that person with a new password (you'll need to briefly re-add the
  `SETUP_SECRET` env var to do this, then remove it again).
