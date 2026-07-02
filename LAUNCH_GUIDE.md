# CV Matcher — Production Launch Guide

> Complete deployment roadmap from local machine to public-facing production.  
> Follow each section **in order**. Do not skip steps.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables](#2-environment-variables)
3. [Database Setup & Migration](#3-database-setup--migration)
4. [Local Build Verification](#4-local-build-verification)
5. [Vercel Deployment](#5-vercel-deployment)
6. [Cron Job Configuration](#6-cron-job-configuration)
7. [Post-Launch Smoke Tests](#7-post-launch-smoke-tests)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Next.js 16 App                    │
├─────────────────┬───────────────────────────────────┤
│   Frontend      │   API Routes                      │
│   /upload-cv    │   /api/parse-cv          (Groq)   │
│   /recommendations│ /api/recommendations   (Prisma) │
│   Analytics     │   /api/generate-cover-letter      │
│   Dashboard     │   /api/cron/fetch-opportunities   │
└────────┬────────┴──────────────┬────────────────────┘
         │                       │
    Groq API                Neon PostgreSQL
  (llama-3.1-8b)        (5 tables via Prisma 7)
```

**API Routes summary:**

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/parse-cv` | Parse CV + generate AI jobs/scholarships | None (public) |
| `GET/POST /api/recommendations` | DB-backed matching engine | None (public) |
| `POST /api/generate-cover-letter` | One-click cover letter generator | None (public) |
| `GET /api/cron/fetch-opportunities` | Automated job/scholarship scraper | `CRON_SECRET` |

---

## 2. Environment Variables

### 2a. Required variables — set ALL of these in production

```bash
# ── Database (Neon PostgreSQL) ──────────────────────────────────────────────
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require&channel_binding=require"
# Get from: https://console.neon.tech → Your project → Connection string
# Format:   postgresql://neondb_owner:<password>@<host>/neondb?sslmode=require

# ── Groq AI API ─────────────────────────────────────────────────────────────
GROQ_API_KEY="gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# Get from: https://console.groq.com → API Keys → Create API Key
# Free tier: 131,072 tokens/minute on llama-3.1-8b-instant

GROQ_MODEL="llama-3.1-8b-instant"
# Recommended free-tier model. Alternatives (all free):
#   llama-3.3-70b-versatile  → higher quality, 12,000 TPM limit
#   gemma2-9b-it             → fastest, very high limits
#   mixtral-8x7b-32768       → best for long documents (32k context)

# ── Cron Job Security ────────────────────────────────────────────────────────
CRON_SECRET="replace-with-a-long-random-string-min-32-chars"
# Generate one: https://generate-secret.vercel.app/32
# Used to authenticate calls to /api/cron/fetch-opportunities
```

### 2b. Variables NOT required (already removed from codebase)

```bash
# ❌ ANTHROPIC_API_KEY  — not used. Switched to Groq.
# ❌ GEMINI_API_KEY     — not used. Switched to Groq.
# ❌ NEXT_PUBLIC_*      — no public env vars needed.
```

### 2c. Local development (.env.local)

Your local file should look exactly like this:

```bash
# c:\Users\Rafay Computer\Desktop\project five\.env.local

DATABASE_URL="postgresql://neondb_owner:<your-password>@<your-host>/neondb?sslmode=require&channel_binding=require"
GROQ_API_KEY="gsk_<your-key>"
GROQ_MODEL="llama-3.1-8b-instant"
CRON_SECRET="your-local-secret-for-testing"
```

> **Security note:** `.env.local` is already in `.gitignore`. Never commit it.  
> Never share `GROQ_API_KEY` or `DATABASE_URL` publicly.

---

## 3. Database Setup & Migration

### Step 1 — Verify connection

```bash
# In your project directory:
npx prisma db pull
# Expected output: "Introspected X models and wrote them into prisma/schema.prisma"
# If this fails: check DATABASE_URL in .env.local
```

### Step 2 — Push schema to production database

```bash
# Syncs prisma/schema.prisma → live database (creates/alters tables)
npx prisma db push
```

Expected output:
```
Datasource "db": PostgreSQL database "neondb" at "your-host.neon.tech"
Your database is now in sync with your Prisma schema. Done in ~20s
```

Tables created/updated:
- `User`
- `UserProfile`
- `JobOpportunity`  ← includes new `externalId`, `sourceUrl` columns
- `ScholarshipOpportunity` ← includes new `externalId`, `sourceUrl` columns
- `AIMatchResult`

### Step 3 — Regenerate Prisma Client

```bash
npx prisma generate
```

Expected output:
```
✔ Generated Prisma Client (v7.8.0) to ./node_modules/@prisma/client in ~230ms
```

### Step 4 — Seed initial data (one-time)

```bash
npm run prisma:seed
```

Expected output:
```
🌱  Seeding database…
✅  Seeded 19 jobs and 18 scholarships.
```

> **Note:** The seed adds high-quality starter data. The cron job will keep adding  
> fresh jobs automatically after deployment. Only run seed once.

### Step 5 — Inspect database (optional, verify data)

```bash
npx prisma studio
# Opens http://localhost:5555 — visual DB browser
# Check: JobOpportunity and ScholarshipOpportunity tables have rows
```

### All-in-one setup command

```bash
# Run all 4 steps above with a single command:
npm run db:setup
```

---

## 4. Local Build Verification

**Run this before every deployment.** Catches TypeScript errors, missing imports, and Next.js config issues.

### Step 1 — Install all dependencies

```bash
npm install
```

### Step 2 — Generate Prisma client (required before build)

```bash
npx prisma generate
```

### Step 3 — Run the production build

```bash
npm run build
```

**What a successful build looks like:**

```
▲ Next.js 16.x
   Creating an optimized production build ...
 ✓ Compiled successfully
 ✓ Linting and checking validity of types
 ✓ Collecting page data
 ✓ Generating static pages (X/X)
 ✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                   ...
├ ○ /upload-cv                          ...
├ ○ /recommendations                    ...
├ ƒ /api/parse-cv                       ...
├ ƒ /api/recommendations                ...
├ ƒ /api/generate-cover-letter          ...
└ ƒ /api/cron/fetch-opportunities       ...
```

### Step 4 — Run locally in production mode (optional double-check)

```bash
npm run start
# Visit http://localhost:3000
# Upload a real CV and test the full flow end-to-end
```

### Common build errors and fixes

| Error | Fix |
|---|---|
| `Cannot find module '@/lib/prisma'` | Run `npx prisma generate` first |
| `Type error: Property X does not exist` | Check TypeScript types in the relevant route file |
| `Error: GROQ_API_KEY is not defined` | Add the variable to `.env.local` |
| `Module not found: 'pdf2json'` | Run `npm install` |
| `PrismaClientInitializationError` | Verify `DATABASE_URL` is correct and DB is reachable |

---

## 5. Vercel Deployment

### Step 1 — Push code to GitHub

```bash
git init                          # if not already a git repo
git add .
git commit -m "feat: cv matcher production ready"
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

### Step 2 — Import project on Vercel

1. Go to **https://vercel.com/new**
2. Click **"Import Git Repository"**
3. Select your GitHub repo
4. Framework: **Next.js** (auto-detected)
5. Root directory: leave as `/` (default)
6. Click **"Deploy"** — let the first build finish (it will fail — that is expected, env vars not set yet)

### Step 3 — Set Environment Variables on Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add each variable below for **all environments** (Production + Preview + Development):

```
DATABASE_URL         = postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require...
GROQ_API_KEY         = gsk_...
GROQ_MODEL           = llama-3.1-8b-instant
CRON_SECRET          = your-32-char-random-secret
```

### Step 4 — Redeploy

After adding all env vars:

```
Vercel Dashboard → Deployments → Click the failed deployment → "Redeploy"
```

Or trigger via git:

```bash
git commit --allow-empty -m "trigger: redeploy with env vars"
git push
```

### Step 5 — Verify deployment

Visit your Vercel URL: `https://your-project.vercel.app`

Check these routes load without errors:
- `https://your-project.vercel.app/` → redirects to `/upload-cv`
- `https://your-project.vercel.app/upload-cv` → upload page loads

---

## 6. Cron Job Configuration

### How the cron works

The file `vercel.json` already configures automated execution:

```json
{
  "crons": [
    {
      "path": "/api/cron/fetch-opportunities",
      "schedule": "0 2 * * *"
    }
  ]
}
```

- **Runs at:** 2:00 AM UTC every day
- **Does:** Fetches jobs from RemoteOK + Arbeitnow + Remotive APIs (up to 150 new jobs/day)
- **Also:** Refreshes the 18 curated scholarship records
- **Auth:** Vercel auto-sends `Authorization: Bearer <CRON_SECRET>` header

> **Vercel Cron is available on the free Hobby plan** (max 1 cron job, daily minimum).

### Manual trigger (test or force-refresh)

```bash
# From terminal — replace values with yours:
curl -X GET "https://your-project.vercel.app/api/cron/fetch-opportunities" \
  -H "Authorization: Bearer your-cron-secret"
```

Expected response:
```json
{
  "success": true,
  "timestamp": "2026-07-01T02:00:00.000Z",
  "duration": "8.4s",
  "summaries": [...],
  "totals": {
    "jobsFetched": 143,
    "jobsIngested": 138,
    "jobErrors": 5,
    "scholarshipsIngested": 18,
    "scholarshipErrors": 0
  }
}
```

### Alternative: cron-job.org (if not on Vercel)

1. Go to **https://cron-job.org** → Create account → New Cron Job
2. URL: `https://your-project.vercel.app/api/cron/fetch-opportunities`
3. Schedule: **Every day at 2:00 AM**
4. Add header: `Authorization: Bearer <your-CRON_SECRET>`

---

## 7. Post-Launch Smoke Tests

Run these after every production deployment to verify all systems work.

### Test 1 — CV Upload + AI Parse

```bash
curl -X POST "https://your-project.vercel.app/api/parse-cv" \
  -F "file=@/path/to/sample-cv.pdf"
```

**Expected:** JSON with `success: true`, `profile`, `jobs[]`, `scholarships[]`, `skillGaps[]`

### Test 2 — Cover Letter Generator

```bash
curl -X POST "https://your-project.vercel.app/api/generate-cover-letter" \
  -H "Content-Type: application/json" \
  -d '{
    "profile": {
      "primaryDomain": "Software Engineering",
      "skills": ["React", "TypeScript", "Node.js"],
      "experienceYears": 3,
      "educationLevel": "Bachelor in Computer Science",
      "bio": "Full stack developer with 3 years experience."
    },
    "job": {
      "title": "Senior Frontend Engineer",
      "company": "Tech Corp",
      "location": "Remote",
      "description": "Build scalable React applications.",
      "requiredSkills": ["React", "TypeScript", "GraphQL"]
    }
  }'
```

**Expected:** JSON with `success: true`, `coverLetter: "Dear Hiring Manager..."`

### Test 3 — Cron Job (manual trigger)

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://your-project.vercel.app/api/cron/fetch-opportunities"
```

**Expected:** JSON with `success: true`, `totals.jobsIngested > 0`

### Test 4 — DB Recommendations Endpoint

```bash
# First create a test user profile via POST:
curl -X POST "https://your-project.vercel.app/api/recommendations" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "email": "test@example.com",
    "profile": {
      "primaryDomain": "Medicine",
      "skills": ["MBBS", "Clinical Diagnosis", "Patient Care"],
      "experienceYears": 2,
      "educationLevel": "MBBS",
      "bio": "Junior medical officer with 2 years clinical experience."
    }
  }'
```

**Expected:** `success: true`, `jobs` sorted by `matchPercentage` desc (medical jobs first)

### Test 5 — Frontend flow (browser)

| Step | Expected result |
|---|---|
| Visit `/upload-cv` | Page loads with cream/espresso design, no console errors |
| Upload a PDF CV | Spinner appears → Analytics Dashboard shows after ~5s |
| Check Scorecard | AI Profile Score ring animates, LinkedIn share button works |
| Check Demand Radar | 3 bars animate (Pakistan, EU, Middle East) |
| Check Skill Gaps | 3 cards with skills + salary ranges |
| Click "View Recommendations" | Redirects to `/recommendations` |
| Jobs tab | Shows field-relevant jobs, match % circles |
| Click "🔗 LinkedIn" | Opens LinkedIn job search in new tab |
| Click "✍️ Generate Cover Letter" | Modal appears, letter generated, Copy works |
| Scholarships tab | Shows relevant scholarships, "✅ Apply Now" works |

---

## 8. Troubleshooting

### Database Issues

```bash
# Error: "Can't reach database server"
# → Check DATABASE_URL has correct host and password
# → Neon free tier hibernates — first connection may take 2–3s (normal)

# Error: "PrismaClientInitializationError"  
# → Run: npx prisma generate
# → Confirm DATABASE_URL is set in the environment

# Error: "The table does not exist"
# → Run: npx prisma db push
```

### Groq API Issues

```bash
# Error: "Rate limit reached"
# → Switch GROQ_MODEL to "llama-3.1-8b-instant" (131,072 TPM limit)
# → Or "gemma2-9b-it" (very high limits)

# Error: "Groq API key missing"
# → Add GROQ_API_KEY to Vercel env vars → Redeploy

# Error: "Empty response from Groq"
# → Re-upload CV — transient model issue, retry usually works
```

### PDF Upload Issues

```bash
# Error: "fetch failed" on upload
# → Server was restarting (Next.js hot reload) — wait 5s and retry

# Error: "Could not read file"  
# → Ensure PDF has selectable text (not a scanned image)
# → Try saving as .docx or .txt instead

# Error: "File too large"
# → Compress PDF below 10MB
```

### Build / Deployment Issues

```bash
# Error: "Module 'prisma/config' not found"
# → Run: npm install prisma --save-dev

# Error: "Type error in recommendations/page.tsx"
# → Run: npx prisma generate  (regenerates type-safe client)

# Error: "Cron not running on Vercel"
# → Verify vercel.json is committed to git
# → Check Vercel Dashboard → Cron Jobs tab
# → Confirm CRON_SECRET matches in both .env and Vercel settings
```

---

## Quick Reference Card

```bash
# ─── First-time setup ───────────────────────────────
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed

# ─── Before every deployment ────────────────────────
npx prisma generate
npm run build           # must show 0 errors

# ─── After deployment ───────────────────────────────
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/cron/fetch-opportunities

# ─── Useful Prisma commands ─────────────────────────
npx prisma studio       # visual database browser (localhost:5555)
npx prisma db pull      # pull remote schema to local
npx prisma db push      # push local schema to remote
npx prisma generate     # regenerate TypeScript client
```

---

*Last updated: July 2026 · Stack: Next.js 16 · Prisma 7 · Groq (llama-3.1-8b-instant) · Neon PostgreSQL · Vercel*
