export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Model fallback chain — if one is deprecated/down, next is tried automatically
const GROQ_MODELS = [
  (process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct").replace(/﻿/g, "").trim(),
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
];

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedCV = {
  primaryDomain:  string;
  skills:         string[];
  experienceYears: number;
  educationLevel: string;
  bio:            string;
};

type Job = {
  id:             string;
  title:          string;
  company:        string;
  location:       string;
  salary:         string;
  description:    string;
  requiredSkills: string[];
  matchScore:     number;
  applyUrl?:      string;
};

type Scholarship = {
  id:          string;
  title:       string;
  university:  string;
  country:     string;
  amount:      string;
  description: string;
  matchScore:  number;
  applyUrl?:   string;
};

type SkillGap = {
  skill:     string;
  avgSalary: string;
  reason:    string;
};

// ── Groq with model-fallback + rate-limit retry ───────────────────────────────

async function groqCall(
  body: Record<string, unknown>,
  apiKey: string,
  retries = 2,
): Promise<Response> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (res.status === 429 && retries > 0) {
    const after = res.headers.get("retry-after");
    await new Promise(r => setTimeout(r, after ? Math.ceil(+after * 1000) + 200 : 1500));
    return groqCall(body, apiKey, retries - 1);
  }
  return res;
}

async function groqWithFallback(
  payload: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  let lastErr = "";
  for (const model of GROQ_MODELS) {
    try {
      const res = await groqCall({ ...payload, model }, apiKey);
      if (res.ok) {
        const data = await res.json() as { choices: { message: { content: string } }[] };
        return data?.choices?.[0]?.message?.content ?? "";
      }
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      const msg = err?.error?.message ?? `HTTP ${res.status}`;
      // Skip to next model if this one is gone
      if (
        res.status === 404 ||
        msg.toLowerCase().includes("decommissioned") ||
        msg.toLowerCase().includes("does not exist") ||
        msg.toLowerCase().includes("no longer supported")
      ) {
        lastErr = msg;
        continue;
      }
      throw new Error(msg);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (
        lastErr.toLowerCase().includes("decommissioned") ||
        lastErr.toLowerCase().includes("does not exist") ||
        lastErr.toLowerCase().includes("no longer supported")
      ) continue;
      throw e;
    }
  }
  throw new Error(`All AI models unavailable: ${lastErr}`);
}

// ── Step 1: Extract profile + skill gaps from CV ──────────────────────────────

async function extractProfile(
  cvText: string,
): Promise<{ profile: ParsedCV; skillGaps: SkillGap[] }> {
  const apiKey = (process.env.GROQ_API_KEY ?? "").replace(/﻿/g, "").trim();
  if (!apiKey || apiKey.includes("your-groq-key"))
    throw new Error("Groq API key missing.");

  const prompt = `Extract from this CV and return ONLY valid JSON, no markdown, no explanation.

{"profile":{"primaryDomain":"specific field e.g. Software Engineering","skills":["skill1","skill2"],"experienceYears":2,"educationLevel":"Bachelor in CS","bio":"2 sentence professional summary"},"skillGaps":[{"skill":"missing skill","avgSalary":"$70,000/yr","reason":"why in demand"}]}

Rules: skills = all from CV (max 15), skillGaps = exactly 3 skills NOT in CV but demanded in their field. JSON only.

CV:
${cvText.slice(0, 2500)}`;

  const text = await groqWithFallback({
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
    temperature: 0.1,
  }, apiKey);

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse AI response. Please try again.");
  const parsed = JSON.parse(match[0]) as { profile: ParsedCV; skillGaps: SkillGap[] };
  if (!parsed.profile) throw new Error("Incomplete AI response. Please try again.");
  if (!parsed.skillGaps) parsed.skillGaps = [];
  return parsed;
}

// ── Step 2: Real job fetching with multiple source fallbacks ──────────────────

function domainToKeywords(domain: string, skills: string[]): { tag: string; keyword: string } {
  const d = domain.toLowerCase();
  const s = skills.map(x => x.toLowerCase()).join(" ");
  const combined = d + " " + s;

  const MAP: [RegExp, string][] = [
    [/python|data science|machine learning|ai\b|artificial intelligence/, "python"],
    [/javascript|typescript|react|frontend|front.?end|next\.?js|vue/, "javascript"],
    [/node|backend|back.?end|express|nest/, "node"],
    [/java\b/, "java"],
    [/php|laravel|wordpress/, "php"],
    [/ruby|rails/, "ruby"],
    [/golang|go\b/, "golang"],
    [/rust\b/, "rust"],
    [/devops|docker|kubernetes|ci.?cd|aws|cloud|terraform/, "devops"],
    [/mobile|flutter|react.?native|ios|android|swift|kotlin/, "react-native"],
    [/design|ui.?ux|figma|graphic|visual/, "design"],
    [/marketing|seo|content|social.?media|growth/, "marketing"],
    [/finance|accounting|fintech|banking/, "finance"],
    [/product.?manage|product.?owner/, "product"],
    [/blockchain|crypto|web3|solidity/, "blockchain"],
    [/hr|human.?resources|recruiter|talent/, "hr"],
    [/sales|business.?develop/, "sales"],
    [/cyber|security|infosec|penetration/, "cybersecurity"],
    [/sql|database|dba|postgres|mysql/, "sql"],
    [/android/, "android"],
    [/ios|swift/, "ios"],
  ];

  for (const [re, tag] of MAP) {
    if (re.test(combined)) return { tag, keyword: tag };
  }
  return { tag: "remote", keyword: domain.split(" ")[0] || "remote" };
}

type RemoteOKItem = {
  legal?: string;
  id?: string; slug?: string; url?: string;
  title?: string; company?: string; location?: string;
  description?: string; tags?: string[];
  salary_min?: number; salary_max?: number;
};

async function fetchRemoteOK(tag: string, skills: string[]): Promise<Job[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`https://remoteok.com/api?tag=${encodeURIComponent(tag)}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "CVMatcher/2.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as RemoteOKItem[];
    const userSkills = skills.map(s => s.toLowerCase());

    return data
      .filter(j => !j.legal && j.title && j.company)
      .slice(0, 25)
      .map((j, i): Job => {
        const tags = (j.tags ?? []).map(t => t.replace(/-/g, " ")).slice(0, 6);
        const matched = tags.filter(t => userSkills.some(s => s.includes(t) || t.includes(s)));
        const score = Math.min(95, 58 + matched.length * 9 + Math.floor(Math.random() * 4));
        const salary = j.salary_min && j.salary_max
          ? `$${Math.round(j.salary_min / 1000)}k – $${Math.round(j.salary_max / 1000)}k/yr`
          : "Competitive";
        const desc = (j.description ?? "")
          .replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 220);
        return {
          id: `rok-${i}`,
          title: j.title!,
          company: j.company!,
          location: j.location || "Remote / Worldwide",
          salary,
          description: desc || `${j.title} at ${j.company}`,
          requiredSkills: tags,
          matchScore: score,
          applyUrl: j.url ?? `https://remoteok.com/l/${j.id ?? j.slug}`,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  } catch {
    clearTimeout(t);
    return [];
  }
}

type ArbeitnowItem = {
  slug: string; company_name: string; title: string;
  description: string; remote: boolean; url: string;
  tags: string[]; location: string;
};
type ArbeitnowResponse = { data?: ArbeitnowItem[] };

async function fetchArbeitnow(keyword: string, skills: string[]): Promise<Job[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const url = `https://www.arbeitnow.com/api/job-board-api?search=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "CVMatcher/2.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as ArbeitnowResponse;
    if (!data?.data?.length) return [];
    const userSkills = skills.map(s => s.toLowerCase());

    return data.data
      .slice(0, 25)
      .map((j, i): Job => {
        const tags = (j.tags ?? []).slice(0, 6);
        const matched = tags.filter(t => userSkills.some(s => s.includes(t) || t.includes(s)));
        const score = Math.min(95, 55 + matched.length * 9 + Math.floor(Math.random() * 5));
        const desc = (j.description ?? "")
          .replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 220);
        return {
          id: `arb-${i}`,
          title: j.title,
          company: j.company_name,
          location: j.location || (j.remote ? "Remote" : "Worldwide"),
          salary: "Competitive",
          description: desc || `${j.title} position`,
          requiredSkills: tags,
          matchScore: score,
          applyUrl: j.url,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  } catch {
    clearTimeout(t);
    return [];
  }
}

type RemotiveItem = {
  id: number; url: string; title: string; company_name: string;
  tags: string[]; candidate_required_location: string;
  description: string; salary?: string;
};
type RemotiveResponse = { jobs?: RemotiveItem[] };

async function fetchRemotive(keyword: string, skills: string[]): Promise<Job[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}&limit=25`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "CVMatcher/2.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as RemotiveResponse;
    if (!data?.jobs?.length) return [];
    const userSkills = skills.map(s => s.toLowerCase());

    return data.jobs
      .slice(0, 25)
      .map((j, i): Job => {
        const tags = (j.tags ?? []).slice(0, 6);
        const matched = tags.filter(t => userSkills.some(s => s.includes(t) || t.includes(s)));
        const score = Math.min(95, 55 + matched.length * 9 + Math.floor(Math.random() * 5));
        const desc = (j.description ?? "")
          .replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 220);
        return {
          id: `rem-${i}`,
          title: j.title,
          company: j.company_name,
          location: j.candidate_required_location || "Worldwide",
          salary: j.salary || "Competitive",
          description: desc || `${j.title} at ${j.company_name}`,
          requiredSkills: tags,
          matchScore: score,
          applyUrl: j.url,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  } catch {
    clearTimeout(t);
    return [];
  }
}

// Tries 3 sources in sequence; returns first non-empty result
async function fetchRealJobs(domain: string, skills: string[]): Promise<Job[]> {
  const { tag, keyword } = domainToKeywords(domain, skills);

  const remoteOK = await fetchRemoteOK(tag, skills);
  if (remoteOK.length >= 3) return remoteOK;

  const arbeitnow = await fetchArbeitnow(keyword, skills);
  if (arbeitnow.length >= 3) return arbeitnow;

  const remotive = await fetchRemotive(keyword, skills);
  return remotive;
}

// ── Step 3: Real curated scholarships ─────────────────────────────────────────

const SCHOLARSHIPS = [
  { id: "chev",  title: "Chevening Scholarship",                   university: "UK Universities",          country: "UK",              amount: "Fully Funded", description: "UK government's prestigious global scholarship — covers tuition, living costs and flights for a 1-year Master's.", applyUrl: "https://www.chevening.org/scholarships/", domains: ["all"] },
  { id: "fulb",  title: "Fulbright Foreign Student Program",        university: "US Universities",          country: "USA",             amount: "Fully Funded", description: "US government scholarship for graduate study, research or teaching across all disciplines.", applyUrl: "https://foreign.fulbrightonline.org/", domains: ["all"] },
  { id: "daad",  title: "DAAD Scholarship",                         university: "German Universities",      country: "Germany",         amount: "Fully Funded", description: "German Academic Exchange Service — postgraduate scholarships across all fields at leading German universities.", applyUrl: "https://www.daad.de/en/study-and-research-in-germany/scholarships/", domains: ["all"] },
  { id: "gates", title: "Gates Cambridge Scholarship",              university: "University of Cambridge",  country: "UK",              amount: "Fully Funded", description: "Full-cost scholarships for outstanding applicants from outside the UK pursuing a postgraduate degree at Cambridge.", applyUrl: "https://www.gatescambridge.org/", domains: ["all"] },
  { id: "com",   title: "Commonwealth Scholarship",                 university: "UK Universities",          country: "UK",              amount: "Fully Funded", description: "For citizens of Commonwealth countries — Master's and PhD programmes fully funded at UK universities.", applyUrl: "https://cscuk.fcdo.gov.uk/scholarships/", domains: ["all"] },
  { id: "aga",   title: "Aga Khan Foundation International Scholarship", university: "Global Institutions", country: "Multiple",        amount: "Fully Funded", description: "Postgraduate scholarships for students from developing countries with academic excellence and leadership potential.", applyUrl: "https://www.akdn.org/our-agencies/aga-khan-foundation/international-scholarship-programme", domains: ["all"] },
  { id: "era",   title: "Erasmus+ Scholarship",                     university: "European Universities",   country: "Europe",          amount: "Partial–Full", description: "EU's flagship education programme — study in multiple European countries with monthly living stipend included.", applyUrl: "https://erasmus-plus.ec.europa.eu/", domains: ["all"] },
  { id: "si",    title: "Swedish Institute Scholarship",            university: "Swedish Universities",    country: "Sweden",          amount: "Fully Funded", description: "Covers tuition, living allowance, travel and health insurance for a Master's degree in Sweden.", applyUrl: "https://si.se/en/apply/scholarships/swedish-institute-scholarships-for-global-professionals/", domains: ["all"] },
  { id: "hec",   title: "HEC Overseas Scholarship (Phase III)",     university: "International Universities", country: "Global",        amount: "Fully Funded", description: "Pakistan HEC scholarship for PhD and postdoctoral research at top-ranked universities worldwide.", applyUrl: "https://www.hec.gov.pk/english/scholarshipsHP/Pages/Overseas-Scholarship.aspx", domains: ["all"] },
  { id: "google",title: "Google PhD Fellowship",                    university: "Partner Universities",    country: "Global",          amount: "Fully Funded", description: "Supports outstanding PhD students in Computer Science, AI, Machine Learning and related engineering fields.", applyUrl: "https://research.google/programs-and-events/phd-fellowship/", domains: ["software", "data", "computer", "engineering", "ai", "machine learning", "developer"] },
  { id: "wb",    title: "World Bank McNamara Fellowship",           university: "Partner Universities",    country: "Global",          amount: "Fully Funded", description: "Supports PhD students from developing countries in development economics, finance and public policy research.", applyUrl: "https://www.worldbank.org/en/programs/scholarships", domains: ["finance", "economics", "business", "development", "policy", "management"] },
  { id: "who",   title: "WHO Special Programme Fellowships",        university: "Global Institutions",     country: "Global",          amount: "Fully Funded", description: "WHO fellowships for public health training and research — strengthening global health capacity.", applyUrl: "https://www.who.int/about/education/fellowships", domains: ["medicine", "health", "nursing", "pharmacy", "biology", "medical"] },
];

function getScholarships(domain: string, educationLevel: string): Scholarship[] {
  const d   = domain.toLowerCase();
  const edu = educationLevel.toLowerCase();
  const eduBonus = /master|msc|mba|phd|doctorate/.test(edu) ? 8 : /bachelor|bsc/.test(edu) ? 5 : 0;

  return SCHOLARSHIPS
    .filter(s => s.domains[0] === "all" || s.domains.some(sd => d.includes(sd) || sd.includes(d.split(" ")[0])))
    .map((s): Scholarship => ({
      id: s.id, title: s.title, university: s.university,
      country: s.country, amount: s.amount, description: s.description,
      applyUrl: s.applyUrl,
      matchScore: Math.min(95, (s.domains[0] === "all" ? 70 : 86) + eduBonus + Math.floor(Math.random() * 5)),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 4);
}

// ── PDF / DOCX / TXT extraction ───────────────────────────────────────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;
    const r = await pdfParse(buffer);
    if (r.text && r.text.trim().length > 20) return r.text;
  } catch { /* fall through */ }

  const { default: PDFParser } = await import("pdf2json");
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PDF parsing timed out")), 25000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new (PDFParser as any)(null, 1);
    parser.on("pdfParser_dataReady", (data: Record<string, unknown>) => {
      clearTimeout(timer);
      try {
        type Page = { Texts?: { R?: { T?: string }[] }[] };
        const pages = (data.Pages ?? []) as Page[];
        const text  = pages.map(p =>
          (p.Texts ?? []).map(t => (t.R ?? []).map(r => decodeURIComponent(r.T ?? "")).join("")).join(" ")
        ).join("\n\n");
        resolve(text);
      } catch { resolve(""); }
    });
    parser.on("pdfParser_dataError", (err: { parserError?: string }) => {
      clearTimeout(timer);
      reject(new Error(err?.parserError ?? "Could not read PDF"));
    });
    try { parser.parseBuffer(buffer); }
    catch (e) { clearTimeout(timer); reject(e instanceof Error ? e : new Error("PDF parse failed")); }
  });
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  return (await mammoth.extractRawText({ buffer })).value;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return Response.json({ error: "No file provided." }, { status: 400 });

    const name = file.name.toLowerCase();
    const mime = file.type;
    const isPDF  = mime === "application/pdf"  || name.endsWith(".pdf");
    const isDOCX = mime.includes("wordprocessingml") || name.endsWith(".docx");
    const isTXT  = mime === "text/plain" || name.endsWith(".txt");
    const isDOC  = mime === "application/msword" || name.endsWith(".doc");

    if (isDOC)  return Response.json({ error: "Old .doc format is not supported. Please save as PDF, .docx, or .txt." }, { status: 400 });
    if (!isPDF && !isDOCX && !isTXT) return Response.json({ error: "Please upload a PDF, Word (.docx), or text (.txt) file." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    let cvText: string;
    try {
      if (isPDF)       cvText = await extractPdfText(buffer);
      else if (isDOCX) cvText = await extractDocxText(buffer);
      else             cvText = buffer.toString("utf-8");
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Could not read the file." }, { status: 400 });
    }

    if (!cvText || cvText.trim().length < 20) {
      return Response.json({ error: "The file appears empty or has no readable text. If it is a scanned PDF, please export a text-based version." }, { status: 400 });
    }

    // Step 1: AI profile extraction
    const { profile, skillGaps } = await extractProfile(cvText);

    // Step 2 & 3: real jobs + scholarships in parallel
    const [jobs, scholarships] = await Promise.all([
      fetchRealJobs(profile.primaryDomain, profile.skills),
      Promise.resolve(getScholarships(profile.primaryDomain, profile.educationLevel)),
    ]);

    console.log(`[parse-cv] ${profile.primaryDomain} | jobs:${jobs.length} | scholarships:${scholarships.length}`);
    return Response.json({ success: true, profile, jobs, scholarships, skillGaps });

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Something went wrong.";
    const msg = raw.toLowerCase().includes("fetch failed") || raw.toLowerCase().includes("econnrefused")
      ? "Could not reach the AI service. Please check your internet connection and try again."
      : raw;
    console.error("[parse-cv]", raw);
    return Response.json({ error: msg }, { status: 500 });
  }
}
