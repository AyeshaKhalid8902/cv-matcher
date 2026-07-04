/**
 * GET /api/cron/fetch-opportunities
 *
 * Automated job & scholarship ingestion pipeline.
 * Triggered once every 24 hours by Vercel Cron or cron-job.org.
 *
 * Security: requires Authorization: Bearer <APP_CRON_KEY> header
 *           OR ?secret=<APP_CRON_KEY> query param.
 *
 * Sources
 *   Jobs        → RemoteOK API · Arbeitnow API · Remotive API  (all free, no auth)
 *   Scholarships → Curated list of 18 real international programmes
 */

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.APP_CRON_KEY;
  if (!secret) return true; // Dev mode: allow when secret not configured

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === secret;
}

// ── Shared types ──────────────────────────────────────────────────────────────

type NormalizedJob = {
  externalId:          string;
  sourceUrl:           string;
  title:               string;
  company:             string;
  location:            string;
  country:             string;
  description:         string;
  requirements:        string[];
  tags:                string[];
  salaryRange:         string | null;
  isRemote:            boolean;
  applicationDeadline: Date | null;
};

type NormalizedScholarship = {
  externalId:          string;
  sourceUrl:           string;
  title:               string;
  university:          string;
  country:             string;
  degreeLevel:         string;
  coverage:            string;
  benefits:            string;
  requirements:        string[];
  tags:                string[];
  applicationDeadline: Date | null;
};

type IngestSummary = {
  source:   string;
  ingested: number;
  errors:   number;
  skipped:  number;
  note?:    string;
};

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Fetch JSON with a hard timeout, returns null on any failure */
async function safeFetch<T>(url: string, label: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14_000); // 14 s timeout
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CVMatcher-Cron/1.0",
        Accept: "application/json",
      },
      next: { revalidate: 0 }, // always bypass Next.js cache
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${label}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[cron] ${label}: fetch failed —`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip HTML tags and normalise whitespace; cap at maxLen chars */
function cleanHtml(raw: string, maxLen = 1200): string {
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** Best-effort country from a location string */
function inferCountry(location: string): string {
  if (!location) return "Global";
  const l = location.toLowerCase();
  if (/worldwide|anywhere|remote|global/.test(l)) return "Global";
  const map: [RegExp, string][] = [
    [/united states|usa|\bUS\b/, "USA"],
    [/united kingdom|\buk\b|britain/, "UK"],
    [/canada/, "Canada"],
    [/germany/, "Germany"],
    [/australia/, "Australia"],
    [/europe/, "Europe"],
    [/india/, "India"],
    [/singapore/, "Singapore"],
    [/netherlands/, "Netherlands"],
    [/france/, "France"],
    [/spain/, "Spain"],
    [/sweden/, "Sweden"],
    [/switzerland/, "Switzerland"],
    [/brazil/, "Brazil"],
  ];
  for (const [re, country] of map) if (re.test(l)) return country;
  // fallback: take last comma-segment
  const parts = location.split(",");
  return parts[parts.length - 1].trim() || "Global";
}

/** Extract requirement phrases from description + tags */
function extractRequirements(description: string, tags: string[]): string[] {
  const req = new Set<string>(tags.slice(0, 6));
  const patterns: RegExp[] = [
    /\d+\+?\s*years?\s+(?:of\s+)?experience(?:\s+(?:with|in)\s+[\w.\s]+)?/gi,
    /bachelor(?:'?s)?\s*(?:degree)?(?:\s+in\s+[\w\s]+)?/gi,
    /master(?:'?s)?\s*(?:degree)?(?:\s+in\s+[\w\s]+)?/gi,
    /phd(?:\s+in\s+[\w\s]+)?/gi,
    /profici(?:ent|ency)\s+in\s+[\w+#.\s]+/gi,
  ];
  for (const pat of patterns) {
    const matches = description.match(pat) ?? [];
    matches.slice(0, 2).forEach(m => req.add(m.trim().slice(0, 80)));
  }
  return [...req].filter(Boolean).slice(0, 9);
}

// ══════════════════════════════════════════════════════════════════════════════
// JOB SOURCES
// ══════════════════════════════════════════════════════════════════════════════

// ─── RemoteOK ────────────────────────────────────────────────────────────────
type RemoteOKItem = {
  legal?:       string;   // metadata sentinel — skip this item
  id?:          string;
  slug?:        string;
  url?:         string;
  title?:       string;
  company?:     string;
  location?:    string;
  description?: string;
  tags?:        string[];
  salary_min?:  number;
  salary_max?:  number;
};

async function fetchRemoteOK(): Promise<NormalizedJob[]> {
  const data = await safeFetch<RemoteOKItem[]>("https://remoteok.com/api", "RemoteOK");
  if (!data) return [];

  return data
    .filter(j => !j.legal && j.title && j.company)
    .slice(0, 50)
    .map((j): NormalizedJob => {
      const rawTags = (j.tags ?? []).map(t => t.replace(/-/g, " "));
      const desc    = cleanHtml(j.description ?? "");
      const salary  =
        j.salary_min && j.salary_max
          ? `$${Math.round(j.salary_min / 1000)}k – $${Math.round(j.salary_max / 1000)}k/yr`
          : null;
      return {
        externalId:          `remoteok-${j.id ?? j.slug}`,
        sourceUrl:           j.url ?? `https://remoteok.com/l/${j.id ?? j.slug}`,
        title:               j.title!.slice(0, 200),
        company:             j.company!.slice(0, 120),
        location:            j.location ?? "Worldwide",
        country:             inferCountry(j.location ?? ""),
        description:         desc,
        requirements:        extractRequirements(desc, rawTags),
        tags:                rawTags.slice(0, 8),
        salaryRange:         salary,
        isRemote:            true,
        applicationDeadline: null,
      };
    });
}

// ─── Arbeitnow ───────────────────────────────────────────────────────────────
type ArbeitnowResponse = {
  data?: {
    slug:         string;
    company_name: string;
    title:        string;
    description:  string;
    remote:       boolean;
    url:          string;
    tags:         string[];
    location:     string;
    created_at:   number;
  }[];
};

async function fetchArbeitnow(): Promise<NormalizedJob[]> {
  const data = await safeFetch<ArbeitnowResponse>(
    "https://www.arbeitnow.com/api/job-board-api",
    "Arbeitnow",
  );
  if (!data?.data) return [];

  return data.data.slice(0, 50).map((j): NormalizedJob => {
    const rawTags = (j.tags ?? []).slice(0, 8);
    const desc    = cleanHtml(j.description);
    return {
      externalId:          `arbeitnow-${j.slug}`,
      sourceUrl:           j.url,
      title:               j.title.slice(0, 200),
      company:             j.company_name.slice(0, 120),
      location:            j.location ?? "Worldwide",
      country:             inferCountry(j.location ?? ""),
      description:         desc,
      requirements:        extractRequirements(desc, rawTags),
      tags:                rawTags,
      salaryRange:         null,
      isRemote:            j.remote,
      applicationDeadline: null,
    };
  });
}

// ─── Remotive ────────────────────────────────────────────────────────────────
type RemotiveResponse = {
  jobs?: {
    id:                         number;
    url:                        string;
    title:                      string;
    company_name:               string;
    category:                   string;
    tags:                       string[];
    job_type:                   string;
    publication_date:           string;
    candidate_required_location: string;
    description:                string;
    salary?:                    string;
  }[];
};

async function fetchRemotive(): Promise<NormalizedJob[]> {
  const data = await safeFetch<RemotiveResponse>(
    "https://remotive.com/api/remote-jobs?limit=50",
    "Remotive",
  );
  if (!data?.jobs) return [];

  return data.jobs.slice(0, 50).map((j): NormalizedJob => {
    const rawTags = [
      j.category?.toLowerCase().replace(/\s*&\s*/g, " and "),
      ...(j.tags ?? []),
    ].filter(Boolean) as string[];
    const desc = cleanHtml(j.description);
    return {
      externalId:          `remotive-${j.id}`,
      sourceUrl:           j.url,
      title:               j.title.slice(0, 200),
      company:             j.company_name.slice(0, 120),
      location:            j.candidate_required_location || "Worldwide",
      country:             inferCountry(j.candidate_required_location ?? ""),
      description:         desc,
      requirements:        extractRequirements(desc, rawTags),
      tags:                rawTags.slice(0, 8),
      salaryRange:         j.salary ?? null,
      isRemote:            true,
      applicationDeadline: null,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHOLARSHIP SOURCE — Curated list of real, verifiable international awards
// ══════════════════════════════════════════════════════════════════════════════

function getCuratedScholarships(): NormalizedScholarship[] {
  const y  = new Date().getFullYear();
  const d  = (month: number, day: number) => new Date(y + 1, month - 1, day);

  return [
    {
      externalId:  "scholarship-rhodes-oxford",
      sourceUrl:   "https://www.rhodesscholarship.com",
      title:       "Rhodes Scholarship",
      university:  "University of Oxford",
      country:     "UK",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full tuition + £18,180/year stipend + travel + health insurance",
      requirements: ["Bachelor's with distinction", "Age 19–25", "Leadership & public service record"],
      tags:         ["Postgraduate", "Leadership", "Research", "Oxford", "Fully Funded"],
      applicationDeadline: d(4, 30),
    },
    {
      externalId:  "scholarship-gates-cambridge",
      sourceUrl:   "https://www.gatescambridge.org",
      title:       "Gates Cambridge Scholarship",
      university:  "University of Cambridge",
      country:     "UK",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full tuition + £21,000+/year maintenance + travel + family allowance",
      requirements: ["Non-UK citizen", "Unconditional Cambridge offer", "Intellectual ability", "Leadership"],
      tags:         ["Postgraduate", "Cambridge", "Fully Funded", "Leadership", "Research"],
      applicationDeadline: d(1, 8),
    },
    {
      externalId:  "scholarship-chevening-uk",
      sourceUrl:   "https://www.chevening.org",
      title:       "Chevening Scholarship",
      university:  "UK Universities",
      country:     "UK",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full tuition + £1,300/month living + return flights + visa + travel grant",
      requirements: ["2+ years work experience", "Eligible nationality", "Leadership potential", "IELTS 6.5+"],
      tags:         ["Masters", "UK Government", "Fully Funded", "Leadership", "Networking"],
      applicationDeadline: d(11, 5),
    },
    {
      externalId:  "scholarship-fulbright-us",
      sourceUrl:   "https://foreign.fulbrightonline.org",
      title:       "Fulbright Foreign Student Program",
      university:  "US Universities",
      country:     "USA",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full tuition + living stipend + health insurance + flights + book allowance",
      requirements: ["Non-US citizen", "Bachelor's degree", "English proficiency", "Strong academic record"],
      tags:         ["Masters", "PhD", "US Government", "Fully Funded", "Research", "Cultural Exchange"],
      applicationDeadline: d(4, 30),
    },
    {
      externalId:  "scholarship-daad-germany",
      sourceUrl:   "https://www.daad.de/en",
      title:       "DAAD Research Grants",
      university:  "German Universities",
      country:     "Germany",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "€934/month stipend + travel allowance + language course + health insurance",
      requirements: ["Bachelor's with excellent grades", "German or English proficiency", "Research proposal"],
      tags:         ["Research", "Masters", "PhD", "Germany", "Fully Funded", "STEM"],
      applicationDeadline: d(10, 15),
    },
    {
      externalId:  "scholarship-commonwealth-uk",
      sourceUrl:   "https://cscuk.fcdo.gov.uk",
      title:       "Commonwealth Scholarship",
      university:  "UK Universities",
      country:     "UK",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full tuition + living allowance + return airfare + thesis grant + warm clothing",
      requirements: ["Commonwealth country citizen", "Bachelor's 2:1 or above", "Development-focused research"],
      tags:         ["Masters", "PhD", "Commonwealth", "Fully Funded", "Development"],
      applicationDeadline: d(12, 1),
    },
    {
      externalId:  "scholarship-erasmus-mundus",
      sourceUrl:   "https://erasmus-plus.ec.europa.eu",
      title:       "Erasmus Mundus Joint Master Degree",
      university:  "European Consortium Universities",
      country:     "Europe",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "€1,400/month + travel allowance + installation grant + full tuition waiver",
      requirements: ["Bachelor's degree", "Language proficiency", "Research aptitude", "Non-EU preferred"],
      tags:         ["Masters", "Europe", "EU Funded", "Fully Funded", "Joint Degree", "International"],
      applicationDeadline: d(1, 31),
    },
    {
      externalId:  "scholarship-aga-khan",
      sourceUrl:   "https://www.akdn.org/civil-society/aga-khan-foundation/international-scholarship-programme",
      title:       "Aga Khan Foundation International Scholarship",
      university:  "Partner Universities Worldwide",
      country:     "Global",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "50% grant + 50% interest-free loan (forgiven for community service), covers tuition + living",
      requirements: ["Exceptional academic record", "Demonstrated financial need", "Eligible developing-country national"],
      tags:         ["Masters", "Need-Based", "Developing Countries", "Community Development", "Social Impact"],
      applicationDeadline: d(3, 31),
    },
    {
      externalId:  "scholarship-australia-awards",
      sourceUrl:   "https://www.australiaawards.gov.au",
      title:       "Australia Awards Scholarships",
      university:  "Australian Universities",
      country:     "Australia",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full tuition + living stipend + return airfare + establishment allowance + health cover",
      requirements: ["Eligible developing-country citizen", "Bachelor's degree", "2+ years work experience", "IELTS 6.5+"],
      tags:         ["Masters", "PhD", "Australia", "Fully Funded", "Development", "Government"],
      applicationDeadline: d(4, 30),
    },
    {
      externalId:  "scholarship-turkish-government",
      sourceUrl:   "https://www.turkiyeburslari.gov.tr/en",
      title:       "Türkiye Scholarships",
      university:  "Turkish Universities",
      country:     "Turkey",
      degreeLevel: "Bachelors",
      coverage:    "Full",
      benefits:    "Full tuition + TRY 4,500–7,000/month stipend + accommodation + health + Turkish language",
      requirements: ["Non-Turkish citizen", "Age ≤21 (UG) or ≤30 (Master) or ≤35 (PhD)", "GPA ≥70%"],
      tags:         ["Bachelor", "Masters", "PhD", "Turkey", "Fully Funded", "Government", "All Fields"],
      applicationDeadline: d(2, 20),
    },
    {
      externalId:  "scholarship-chinese-government-csc",
      sourceUrl:   "https://www.campuschina.org",
      title:       "Chinese Government Scholarship (CSC)",
      university:  "Chinese Universities",
      country:     "China",
      degreeLevel: "Bachelors",
      coverage:    "Full",
      benefits:    "Full tuition + CNY 2,500–3,500/month stipend + accommodation + medical insurance",
      requirements: ["Non-Chinese citizen", "Good health", "Age ≤25 (UG) / ≤35 (Master) / ≤40 (PhD)"],
      tags:         ["Bachelor", "Masters", "PhD", "China", "Fully Funded", "Government", "CSC"],
      applicationDeadline: d(4, 30),
    },
    {
      externalId:  "scholarship-korean-gks",
      sourceUrl:   "https://www.studyinkorea.go.kr",
      title:       "Korean Government Scholarship (GKS/KGSP)",
      university:  "Korean Universities",
      country:     "South Korea",
      degreeLevel: "Bachelors",
      coverage:    "Full",
      benefits:    "Full tuition + KRW 900,000–1,000,000/month + language training + travel + medical",
      requirements: ["Non-Korean citizen", "GPA ≥80%", "Age ≤25 (UG) / ≤40 (Graduate)", "Good health"],
      tags:         ["Bachelor", "Masters", "PhD", "Korea", "Fully Funded", "Government", "STEM"],
      applicationDeadline: d(9, 30),
    },
    {
      externalId:  "scholarship-japanese-mext",
      sourceUrl:   "https://www.mext.go.jp/en",
      title:       "Japanese Government (MEXT) Scholarship",
      university:  "Japanese Universities",
      country:     "Japan",
      degreeLevel: "Bachelors",
      coverage:    "Full",
      benefits:    "Full tuition + ¥117,000–145,000/month + travel + Japanese language prep",
      requirements: ["Non-Japanese citizen", "Age ≤24 (UG) / ≤35 (Graduate)", "GPA ≥70%", "Eligible field"],
      tags:         ["Bachelor", "Masters", "PhD", "Japan", "Fully Funded", "Government", "MEXT"],
      applicationDeadline: d(5, 31),
    },
    {
      externalId:  "scholarship-swedish-institute",
      sourceUrl:   "https://si.se/en/apply/scholarships",
      title:       "Swedish Institute Scholarship for Global Professionals",
      university:  "Swedish Universities",
      country:     "Sweden",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "SEK 11,000/month + tuition grant + travel grant + insurance + leadership training",
      requirements: ["3+ years work experience", "Leadership evidence", "Eligible country citizen", "English proficiency"],
      tags:         ["Masters", "Sweden", "Fully Funded", "Leadership", "Sustainability", "Innovation"],
      applicationDeadline: d(2, 10),
    },
    {
      externalId:  "scholarship-hec-pakistan-overseas",
      sourceUrl:   "https://www.hec.gov.pk/english/services/faculty/OSHEC/Pages/default.aspx",
      title:       "HEC Overseas Scholarships (Pakistan)",
      university:  "Top World Universities",
      country:     "Global",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full tuition + living allowance + return airfare + research grant",
      requirements: ["Pakistani citizen", "16/18-year education for MS/PhD", "First-class academic record", "Public sector employed"],
      tags:         ["Masters", "PhD", "Pakistan", "Fully Funded", "HEC", "Government"],
      applicationDeadline: d(6, 30),
    },
    {
      externalId:  "scholarship-eth-zurich-excellence",
      sourceUrl:   "https://ethz.ch/en/studies/financial/scholarships/excellencescholarship.html",
      title:       "ETH Zurich Excellence Scholarship & Opportunity Programme",
      university:  "ETH Zurich",
      country:     "Switzerland",
      degreeLevel: "Masters",
      coverage:    "Full",
      benefits:    "Full study costs + CHF 12,000/semester + supervisor mentorship",
      requirements: ["Top 10% of graduating class", "Unconditional ETH Zurich Master's admission", "Academic excellence"],
      tags:         ["Masters", "Switzerland", "Engineering", "Science", "STEM", "Fully Funded"],
      applicationDeadline: d(12, 15),
    },
    {
      externalId:  "scholarship-mastercard-foundation",
      sourceUrl:   "https://mastercardfdn.org/all/scholars",
      title:       "Mastercard Foundation Scholars Program",
      university:  "Partner Universities (McGill, ASU, USIU-Africa etc.)",
      country:     "Global",
      degreeLevel: "Bachelors",
      coverage:    "Full",
      benefits:    "Full tuition + living stipend + mentorship + leadership development + internships",
      requirements: ["African citizen", "Financial need demonstrated", "Academic talent", "Commitment to serving Africa"],
      tags:         ["Bachelor", "Masters", "Africa", "Fully Funded", "Leadership", "Social Impact"],
      applicationDeadline: d(4, 30),
    },
    {
      externalId:  "scholarship-nus-asean",
      sourceUrl:   "https://www.nus.edu.sg/admissions/undergraduate/scholarship",
      title:       "NUS ASEAN Undergraduate Scholarship",
      university:  "National University of Singapore",
      country:     "Singapore",
      degreeLevel: "Bachelors",
      coverage:    "Full",
      benefits:    "Full tuition + S$5,800/year living allowance + on-campus housing",
      requirements: ["ASEAN country citizen", "Excellent A-Level or IB results", "Strong co-curricular profile"],
      tags:         ["Bachelor", "Singapore", "ASEAN", "Fully Funded", "NUS", "Asia"],
      applicationDeadline: d(3, 15),
    },
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// DATABASE UPSERT HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function upsertJobs(jobs: NormalizedJob[]): Promise<Pick<IngestSummary, "ingested" | "errors" | "skipped">> {
  let ingested = 0, errors = 0;
  const unique = [...new Map(jobs.map(j => [j.externalId, j])).values()];

  for (const job of unique) {
    try {
      await sql`
        INSERT INTO "JobOpportunity"
          ("externalId","sourceUrl","title","company","location","country","description",
           "requirements","tags","salaryRange","isRemote","applicationDeadline","createdAt","updatedAt")
        VALUES (
          ${job.externalId}, ${job.sourceUrl}, ${job.title}, ${job.company},
          ${job.location}, ${job.country}, ${job.description},
          ${job.requirements}, ${job.tags}, ${job.salaryRange},
          ${job.isRemote}, ${job.applicationDeadline}, NOW(), NOW()
        )
        ON CONFLICT ("externalId") DO UPDATE SET
          title=${job.title}, company=${job.company}, location=${job.location},
          country=${job.country}, description=${job.description},
          requirements=${job.requirements}, tags=${job.tags},
          "salaryRange"=${job.salaryRange}, "isRemote"=${job.isRemote},
          "sourceUrl"=${job.sourceUrl}, "updatedAt"=NOW()
      `;
      ingested++;
    } catch (err) {
      console.error(`[cron] upsertJob error (${job.externalId}):`, (err as Error).message);
      errors++;
    }
  }
  return { ingested, errors, skipped: jobs.length - unique.length };
}

async function upsertScholarships(
  scholarships: NormalizedScholarship[],
): Promise<Pick<IngestSummary, "ingested" | "errors" | "skipped">> {
  let ingested = 0, errors = 0;

  for (const s of scholarships) {
    try {
      await sql`
        INSERT INTO "ScholarshipOpportunity"
          ("externalId","sourceUrl","title","university","country","degreeLevel","coverage",
           "benefits","requirements","tags","applicationDeadline","createdAt","updatedAt")
        VALUES (
          ${s.externalId}, ${s.sourceUrl}, ${s.title}, ${s.university},
          ${s.country}, ${s.degreeLevel}, ${s.coverage}, ${s.benefits},
          ${s.requirements}, ${s.tags}, ${s.applicationDeadline}, NOW(), NOW()
        )
        ON CONFLICT ("externalId") DO UPDATE SET
          title=${s.title}, university=${s.university}, country=${s.country},
          "degreeLevel"=${s.degreeLevel}, coverage=${s.coverage},
          benefits=${s.benefits}, requirements=${s.requirements},
          tags=${s.tags}, "applicationDeadline"=${s.applicationDeadline},
          "sourceUrl"=${s.sourceUrl}, "updatedAt"=NOW()
      `;
      ingested++;
    } catch (err) {
      console.error(`[cron] upsertScholarship error (${s.externalId}):`, (err as Error).message);
      errors++;
    }
  }
  return { ingested, errors, skipped: 0 };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════

export const dynamic    = "force-dynamic"; // never statically cached
export const maxDuration = 60;             // Vercel max execution seconds

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!isAuthorized(req)) {
    return Response.json(
      { error: "Unauthorized — provide a valid APP_CRON_KEY." },
      { status: 401 },
    );
  }

  const summaries: IngestSummary[] = [];

  // ── Fetch all job sources concurrently ────────────────────────────────────
  const [remoteOKResult, arbeitnowResult, remotiveResult] = await Promise.allSettled([
    fetchRemoteOK(),
    fetchArbeitnow(),
    fetchRemotive(),
  ]);

  const allJobs: NormalizedJob[] = [];

  for (const [label, result] of [
    ["RemoteOK",  remoteOKResult],
    ["Arbeitnow", arbeitnowResult],
    ["Remotive",  remotiveResult],
  ] as [string, PromiseSettledResult<NormalizedJob[]>][]) {
    if (result.status === "fulfilled") {
      allJobs.push(...result.value);
      console.log(`[cron] ${label}: fetched ${result.value.length} jobs`);
    } else {
      summaries.push({ source: label, ingested: 0, errors: 1, skipped: 0, note: result.reason?.message });
    }
  }

  // ── Upsert jobs ───────────────────────────────────────────────────────────
  const jobStats = await upsertJobs(allJobs);
  summaries.push({ source: "Jobs (all sources)", ...jobStats });

  // ── Upsert curated scholarships ───────────────────────────────────────────
  const scholarships  = getCuratedScholarships();
  const scholarStats  = await upsertScholarships(scholarships);
  summaries.push({ source: "Scholarships (curated)", ...scholarStats });

  const duration = `${((Date.now() - startedAt) / 1000).toFixed(2)}s`;

  const response = {
    success:    true,
    timestamp:  new Date().toISOString(),
    duration,
    summaries,
    totals: {
      jobsFetched:         allJobs.length,
      jobsIngested:        jobStats.ingested,
      jobErrors:           jobStats.errors,
      scholarshipsIngested: scholarStats.ingested,
      scholarshipErrors:   scholarStats.errors,
    },
  };

  console.log("[cron] Completed:", response.totals, "in", duration);
  return Response.json(response);
}
