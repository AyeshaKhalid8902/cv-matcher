import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TIMEOUT = 8000;

export interface GovtJob {
  id: string;
  title: string;
  organization: string;
  location: string;
  deadline: string;
  applyUrl: string;
  source: string;
  jobType: "job" | "internship";
}

// ── Curated fallback (always shown + used when scraping fails) ─────────────────

const CURATED_JOBS: GovtJob[] = [
  // FPSC Federal
  { id: "fpsc-ad",    title: "Assistant Director (BS-17)",           organization: "Federal Ministries via FPSC",       location: "Islamabad",        deadline: "Check fpsc.gov.pk", applyUrl: "https://fpsc.gov.pk/",                                                               source: "FPSC", jobType: "job" },
  { id: "fpsc-irs",   title: "Inspector Inland Revenue (BS-16)",     organization: "FBR via FPSC",                      location: "Pakistan",         deadline: "Check fpsc.gov.pk", applyUrl: "https://fpsc.gov.pk/",                                                               source: "FPSC", jobType: "job" },
  { id: "fpsc-lo",    title: "Labour Officer (BS-16)",               organization: "Ministry of Overseas Pakistanis",   location: "Islamabad",        deadline: "Check fpsc.gov.pk", applyUrl: "https://fpsc.gov.pk/",                                                               source: "FPSC", jobType: "job" },
  { id: "fpsc-css",   title: "Central Superior Services (CSS) 2026", organization: "Government of Pakistan",            location: "Pakistan",         deadline: "Nov 2026",          applyUrl: "https://fpsc.gov.pk/",                                                               source: "FPSC", jobType: "job" },
  // PPSC Punjab
  { id: "ppsc-seo",   title: "Senior Elementary School Teacher",     organization: "School Education Dept Punjab",      location: "Punjab, Pakistan", deadline: "Check ppsc.gop.pk", applyUrl: "https://www.ppsc.gop.pk/",                                                           source: "PPSC", jobType: "job" },
  { id: "ppsc-je",    title: "Junior Engineer (Civil/Electrical)",   organization: "WASA / Punjab Irrigation Dept",     location: "Punjab, Pakistan", deadline: "Check ppsc.gop.pk", applyUrl: "https://www.ppsc.gop.pk/",                                                           source: "PPSC", jobType: "job" },
  { id: "ppsc-acct",  title: "Accountant / Finance Officer (BS-17)", organization: "Punjab Finance Department",         location: "Lahore, Pakistan", deadline: "Check ppsc.gop.pk", applyUrl: "https://www.ppsc.gop.pk/",                                                           source: "PPSC", jobType: "job" },
  { id: "ppsc-mo",    title: "Medical Officer (MBBS – BS-17)",       organization: "Punjab Health Department",          location: "Punjab, Pakistan", deadline: "Check ppsc.gop.pk", applyUrl: "https://www.ppsc.gop.pk/",                                                           source: "PPSC", jobType: "job" },
  // SPSC Sindh
  { id: "spsc-ad",    title: "Assistant Director (BS-17)",           organization: "Sindh Govt Departments via SPSC",   location: "Sindh, Pakistan",  deadline: "Check spsc.gos.pk", applyUrl: "http://www.spsc.gos.pk/",                                                            source: "SPSC", jobType: "job" },
  { id: "spsc-mo",    title: "Medical Officer / Women Medical Off.", organization: "Sindh Health Department",           location: "Sindh, Pakistan",  deadline: "Check spsc.gos.pk", applyUrl: "http://www.spsc.gos.pk/",                                                            source: "SPSC", jobType: "job" },
  { id: "spsc-eng",   title: "Junior Engineer (Civil)",              organization: "Sindh Irrigation / Works Dept",    location: "Karachi / Sindh",  deadline: "Check spsc.gos.pk", applyUrl: "http://www.spsc.gos.pk/",                                                            source: "SPSC", jobType: "job" },
  // NTS
  { id: "nts-gat",    title: "GAT / NAT Test Registration Open",     organization: "NTS Pakistan",                      location: "Pakistan",         deadline: "Rolling",           applyUrl: "https://www.nts.org.pk/",                                                            source: "NTS",  jobType: "job" },
  { id: "nts-bank",   title: "Bank Officer / Clerk (via NTS)",       organization: "Various Banks via NTS",             location: "Pakistan",         deadline: "Check nts.org.pk",  applyUrl: "https://www.nts.org.pk/",                                                            source: "NTS",  jobType: "job" },
  { id: "nts-fed",    title: "Federal Govt Jobs (via NTS)",          organization: "Federal Ministries via NTS",        location: "Pakistan",         deadline: "Check nts.org.pk",  applyUrl: "https://www.nts.org.pk/",                                                            source: "NTS",  jobType: "job" },
  // Internships
  { id: "pitb-int2",  title: "IT/CS Internship (Paid – 6 months)",  organization: "PITB – Punjab IT Board",            location: "Lahore, Pakistan", deadline: "Rolling / Quarterly", applyUrl: "https://pitb.gov.pk/internships",                                                  source: "PITB", jobType: "internship" },
  { id: "navttc-int", title: "IT & Technical Skills Internship",     organization: "NAVTTC Pakistan",                   location: "Pakistan",         deadline: "Rolling",           applyUrl: "https://navttc.gov.pk/",                                                             source: "NAVTTC", jobType: "internship" },
  { id: "nadra-int",  title: "Graduate Internship Programme",        organization: "NADRA Pakistan",                    location: "Islamabad",        deadline: "Check nadra.gov.pk", applyUrl: "https://www.nadra.gov.pk/careers/",                                                  source: "NADRA", jobType: "internship" },
  { id: "ignite-int", title: "Startup & Tech Innovation Grants",     organization: "Ignite (HEC/Ministry of IT)",       location: "Pakistan",         deadline: "Rolling",           applyUrl: "https://ignite.org.pk/",                                                             source: "Ignite", jobType: "internship" },
  { id: "stza-int",   title: "Tech Zone Internship (Tax-Free Zone)",organization: "Special Tech Zones Authority",       location: "Islamabad",        deadline: "Check stza.gov.pk", applyUrl: "https://stza.gov.pk/jobs",                                                           source: "STZA", jobType: "internship" },
  { id: "sbp-int",    title: "SBP Graduate Internship Programme",    organization: "State Bank of Pakistan",            location: "Karachi / Lahore", deadline: "Jun–Aug annually",  applyUrl: "https://www.sbp.org.pk/careers.asp",                                                source: "SBP",  jobType: "internship" },
  { id: "pia-int",    title: "Summer Internship Programme",          organization: "PIA (Pakistan International Airlines)", location: "Karachi",      deadline: "May–Jun annually",  applyUrl: "https://www.piac.com.pk/",                                                           source: "PIA",  jobType: "internship" },
  { id: "hec-res2",   title: "HEC Research Internship (NRPU)",       organization: "Higher Education Commission",       location: "Pakistan",         deadline: "Rolling",           applyUrl: "https://www.hec.gov.pk/english/services/faculty/NRPU/Pages/NRPU-Home.aspx",        source: "HEC",  jobType: "internship" },
];

// ── Scrapers ───────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function scrapeFPSC(): Promise<GovtJob[]> {
  const html = await fetchHtml("https://fpsc.gov.pk/");
  if (!html) return [];
  const $ = cheerio.load(html);
  const jobs: GovtJob[] = [];
  let idx = 0;

  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") ?? "";
    if (
      text.length > 10 && text.length < 120 &&
      /officer|assistant|inspector|director|clerk|bs-\d|grade|circular|advertisement|post|job/i.test(text)
    ) {
      const url = href.startsWith("http") ? href : `https://fpsc.gov.pk/${href.replace(/^\//, "")}`;
      jobs.push({
        id: `fpsc-live-${idx++}`,
        title: text,
        organization: "Federal Government via FPSC",
        location: "Pakistan",
        deadline: "Check fpsc.gov.pk",
        applyUrl: url || "https://fpsc.gov.pk/",
        source: "FPSC",
        jobType: "job",
      });
    }
  });
  return jobs.slice(0, 8);
}

async function scrapePPSC(): Promise<GovtJob[]> {
  const html = await fetchHtml("https://www.ppsc.gop.pk/");
  if (!html) return [];
  const $ = cheerio.load(html);
  const jobs: GovtJob[] = [];
  let idx = 0;

  $("a, td, li").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).is("a") ? $(el).attr("href") ?? "" : $(el).find("a").attr("href") ?? "";
    if (
      text.length > 10 && text.length < 150 &&
      /teacher|officer|engineer|clerk|inspector|assistant|supervisor|director|medical|doctor|assistant director/i.test(text)
    ) {
      const url = href.startsWith("http") ? href : `https://www.ppsc.gop.pk/${href.replace(/^\//, "")}`;
      jobs.push({
        id: `ppsc-live-${idx++}`,
        title: text.split("\n")[0].trim(),
        organization: "Punjab Government via PPSC",
        location: "Punjab, Pakistan",
        deadline: "Check ppsc.gop.pk",
        applyUrl: url || "https://www.ppsc.gop.pk/",
        source: "PPSC",
        jobType: "job",
      });
    }
  });
  return jobs.slice(0, 8);
}

async function scrapeSPSC(): Promise<GovtJob[]> {
  const html = await fetchHtml("http://www.spsc.gos.pk/");
  if (!html) return [];
  const $ = cheerio.load(html);
  const jobs: GovtJob[] = [];
  let idx = 0;

  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") ?? "";
    if (
      text.length > 10 && text.length < 120 &&
      /officer|assistant|inspector|engineer|clerk|medical|doctor|teacher/i.test(text)
    ) {
      const url = href.startsWith("http") ? href : `http://www.spsc.gos.pk/${href.replace(/^\//, "")}`;
      jobs.push({
        id: `spsc-live-${idx++}`,
        title: text,
        organization: "Sindh Government via SPSC",
        location: "Sindh, Pakistan",
        deadline: "Check spsc.gos.pk",
        applyUrl: url || "http://www.spsc.gos.pk/",
        source: "SPSC",
        jobType: "job",
      });
    }
  });
  return jobs.slice(0, 6);
}

async function scrapeNTS(): Promise<GovtJob[]> {
  const html = await fetchHtml("https://www.nts.org.pk/nts/nts.php");
  if (!html) return [];
  const $ = cheerio.load(html);
  const jobs: GovtJob[] = [];
  let idx = 0;

  $("a, td").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).is("a") ? $(el).attr("href") ?? "" : $(el).find("a").attr("href") ?? "";
    if (
      text.length > 10 && text.length < 150 &&
      /test|job|post|vacancy|officer|clerk|recruitment|examination|nts/i.test(text) &&
      !/nts home|about nts|contact|privacy|services/i.test(text)
    ) {
      const url = href.startsWith("http") ? href : `https://www.nts.org.pk/${href.replace(/^\//, "")}`;
      jobs.push({
        id: `nts-live-${idx++}`,
        title: text.split("\n")[0].trim(),
        organization: "Government of Pakistan via NTS",
        location: "Pakistan",
        deadline: "Check nts.org.pk",
        applyUrl: url || "https://www.nts.org.pk/",
        source: "NTS",
        jobType: "job",
      });
    }
  });
  return jobs.slice(0, 8);
}

// ── Cache helpers ──────────────────────────────────────────────────────────────

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS "GovtJobLive" (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      organization TEXT NOT NULL,
      location    TEXT NOT NULL,
      deadline    TEXT NOT NULL,
      apply_url   TEXT NOT NULL,
      source      TEXT NOT NULL,
      job_type    TEXT NOT NULL DEFAULT 'job',
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getCached(): Promise<GovtJob[]> {
  try {
    await ensureTable();
    const rows = await sql`
      SELECT * FROM "GovtJobLive"
      WHERE fetched_at > NOW() - INTERVAL '6 hours'
      ORDER BY source, id
    `;
    return rows.map(r => ({
      id: r.id as string,
      title: r.title as string,
      organization: r.organization as string,
      location: r.location as string,
      deadline: r.deadline as string,
      applyUrl: r.apply_url as string,
      source: r.source as string,
      jobType: (r.job_type as "job" | "internship") ?? "job",
    }));
  } catch {
    return [];
  }
}

async function saveToCache(jobs: GovtJob[]) {
  try {
    await sql`DELETE FROM "GovtJobLive"`;
    for (const j of jobs) {
      await sql`
        INSERT INTO "GovtJobLive" (id, title, organization, location, deadline, apply_url, source, job_type, fetched_at)
        VALUES (${j.id}, ${j.title}, ${j.organization}, ${j.location}, ${j.deadline}, ${j.applyUrl}, ${j.source}, ${j.jobType}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          fetched_at = NOW()
      `;
    }
  } catch { /* cache write failure is non-fatal */ }
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  // 1. Try cache first
  const cached = await getCached();
  if (cached.length > 0) {
    return Response.json({ success: true, jobs: cached, source: "cache" });
  }

  // 2. Scrape all sources in parallel
  const [fpsc, ppsc, spsc, nts] = await Promise.allSettled([
    scrapeFPSC(),
    scrapePPSC(),
    scrapeSPSC(),
    scrapeNTS(),
  ]);

  const scraped = [
    ...(fpsc.status === "fulfilled" ? fpsc.value : []),
    ...(ppsc.status === "fulfilled" ? ppsc.value : []),
    ...(spsc.status === "fulfilled" ? spsc.value : []),
    ...(nts.status === "fulfilled"  ? nts.value  : []),
  ];

  // 3. Merge scraped + curated (deduplicate by title similarity)
  const curatedFiltered = CURATED_JOBS.filter(c =>
    !scraped.some(s => s.source === c.source && s.title.toLowerCase().includes(c.title.toLowerCase().split(" ")[0]))
  );

  const all = [...scraped, ...curatedFiltered];

  // 4. Cache results
  await saveToCache(all);

  return Response.json({ success: true, jobs: all, source: scraped.length > 0 ? "live+curated" : "curated" });
}
