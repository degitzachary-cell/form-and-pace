# Form & Pace — Deployment Guide

## What you're deploying
An AI-powered coaching platform where athletes log session feedback,
get instant AI analysis, and you see everything in a coach dashboard.
Login is via Google — no passwords needed.

---

## Step 1: Set up Supabase (database + auth) — ~10 mins

1. Go to **supabase.com** → Create a free account
2. Click **New Project** → name it "form-and-pace" → set a database password → Create
3. Wait ~2 mins for it to spin up

### Create the database table
4. In your project → click **SQL Editor** → **New Query**
5. Paste the contents of `supabase-setup.sql` → click **Run**
6. You should see "Success" — your table is ready

### Enable Google login
7. In Supabase → **Authentication** → **Providers** → find **Google** → toggle ON
8. You'll need a Google Client ID and Secret:
   - Go to **console.cloud.google.com**
   - Create a new project (or use existing)
   - APIs & Services → **Credentials** → Create **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorised redirect URIs: add `https://your-project-id.supabase.co/auth/v1/callback`
     (find your project ID in Supabase → Settings → API)
   - Copy the Client ID and Secret back into Supabase

### Get your API keys
9. Supabase → **Settings** → **API**
10. Copy:
    - **Project URL** → this is your `VITE_SUPABASE_URL`
    - **anon public** key → this is your `VITE_SUPABASE_ANON_KEY`

---

## Step 2: Update the app code — ~5 mins

In `src/App.jsx`, update these two things:

```js
// Line ~8: your coach email(s)
const COACH_EMAILS = [
  "your.actual.email@gmail.com",
];

// In ATHLETE_PROGRAMS, replace the key with your athlete's actual email:
"siouxsie.actual.email@gmail.com": {
  name: "Siouxsie Sioux",
  ...
}
```

In `supabase-setup.sql` (if you haven't run it yet), replace `yourcoach@email.com`
with your actual email in the two policy sections.

---

## Step 3: Deploy to Vercel — ~10 mins

1. Push this folder to a **GitHub repository**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/yourusername/form-and-pace.git
   git push -u origin main
   ```

2. Go to **vercel.com** → Sign up / Log in → **Add New Project**
3. Import your GitHub repo
4. Vercel will detect it's a Vite/React app automatically
5. Before deploying, click **Environment Variables** and add:
   ```
   VITE_SUPABASE_URL      = https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY = your-anon-key
   ```
6. Click **Deploy** — takes about 60 seconds
7. You get a live URL like `form-and-pace.vercel.app`

### Add your Vercel URL to Supabase
8. Supabase → **Authentication** → **URL Configuration**
9. Add your Vercel URL to **Redirect URLs**: `https://form-and-pace.vercel.app`
10. Also add it to your Google OAuth redirect URIs in Google Console

---

## Step 4: Add an athlete — 2 mins

1. Get the athlete's Gmail address
2. In `src/App.jsx`, add their email as a key in `ATHLETE_PROGRAMS`:
   ```js
   "athlete@gmail.com": {
     name: "Their Name",
     goal: "1:50 HM",
     current: "1:55",
     avatar: "TN",
     weeks: [ ... ] // paste their training weeks here
   }
   ```
3. Push to GitHub → Vercel auto-deploys in ~30 seconds

---

## How it works day-to-day

**Athlete:**
- Opens `form-and-pace.vercel.app` on their phone
- Taps "Continue with Google" → instantly sees their program
- Can add it to their home screen (Add to Home Screen in Safari/Chrome)

**You (Coach):**
- Same URL, same Google login
- Automatically get the coach dashboard
- See all athletes, compliance, session feedback, reply to any session

---

## Optional: Custom domain
In Vercel → your project → **Settings** → **Domains**
Add something like `coaching.yourname.com` — Vercel walks you through it.
