export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GROQ_MODEL = (process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct").replace(/﻿/g, "").trim();

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedCV = {
  primaryDomain: string;
  skills: string[];
  experienceYears: number;
  educationLevel: string;
  bio: string;
};

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  requiredSkills: string[];
  matchScore: number;
  applyUrl?: string;
};

type Scholarship = {
  id: string;
  title: string;
  university: string;
  country: string;
  amount: string;
  description: string;
  matchScore: number;
  applyUrl?: string;
};

type SkillGap = {
  skill: string;
  avgSalary: string;
  reason: string;
};

// ── Groq fetch with auto-retry on rate limit ─────────────────────────────────

async function groqFetch(body: object, apiKey: string, retries = 3): Promise<Response> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (res.status === 429 && retries > 0) {
    const retryAfter = res.headers.get("retry-after");
    const waitMs = retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000) + 200 : 1500;
    await new Promise(r => setTimeout(r, waitMs));
    return groqFetch(body, apiKey, retries - 1);
  }
  return res;
}

// ── Step 1: Extract profile + skill gaps from CV using Groq ──────────────────

async function extractProfile(cvText: string): Promise<{ profile: ParsedCV; skillGaps: SkillGap[] }> {
  const apiKey = (process.env.GROQ_API_KEY ?? "").replace(/﻿/g, "").trim();
  if (!apiKey || apiKey.includes("your-groq-key")) {
    throw new Error("Groq API key missing.");
  }

  const prompt = `Extract info from this CV. Return ONLY valid JSON, no markdown.

{"profile":{"primaryDomain":"main field e.g. Software Engineering","skills":["skill1","skill2"],"experienceYears":2,"educationLevel":"Bachelor's in CS","bio":"2 sentence professional summary"},"skillGaps":[{"skill":"skill they lack for remote work","avgSalary":"$70,000/yr","reason":"why globally demanded"}]}

Rules:
- primaryDomain: specific field like "Software Engineering", "Data Science", "Marketing", "Finance", "Medicine"
- skills: all skills found in CV (max 15)
- skillGaps: exactly 3 skills NOT in their CV that are in high demand for their field
- Output JSON only, no explanation

CV:
${cvText.slice(0, 2500)}`;

  const res = await groqFetch({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
    temperature: 0.1,
  }, apiKey);

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Groq API error (${res.status})`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = data?.choices?.[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse AI response. Please try again.");

  const parsed = JSON.parse(match[0]) as { profile: ParsedCV; skillGaps: SkillGap[] };
  if (!parsed.profile) throw new Error("Incomplete AI response. Please try again.");
  if (!parsed.skillGaps) parsed.skillGaps = [];
  return parsed;
}

// ── Step 2: Fetch real live jobs from free APIs ───────────────────────────────

function domainToTags(domain: string, skills: string[]): string[] {
  const d = domain.toLowerCase();
  const s = skills.map(x => x.toLowerCase());

  const tagMap: [RegExp, string[]][] = [
    [/software|developer|web|frontend|backend|fullstack|full.?stack/, ["javascript", "react", "node", "python"]],
    [/data science|machine learning|ai|artificial intelligence/, ["python", "machine-learning", "data"]],
    [/data analyst|analytics/, ["python", "data", "sql"]],
    [/devops|cloud|infrastructure|platform/, ["devops", "aws", "kubernetes"]],
    [/design|ui|ux|graphic/, ["design", "ui"]],
    [/marketing|growth|seo|content/, ["marketing"]],
    [/finance|accounting|fintech/, ["finance"]],
    [/product manager|product management/, ["product"]],
    [/mobile|ios|android|flutter|react native/, ["ios", "android", "react-native"]],
    [/blockchain|crypto|web3/, ["blockchain", "crypto"]],
    [/hr|human resources|recruitment/, ["hr"]],
    [/sales|business development/, ["sales"]],
    [/cyber|security|infosec/, ["cybersecurity"]],
    [/java\b/, ["java"]],
    [/php/, ["php"]],
    [/ruby/, ["ruby"]],
    [/golang|go\b/, ["golang"]],
    [/rust/, ["rust"]],
  ];

  for (const [re, tags] of tagMap) {
    if (re.test(d) || s.some(sk => re.test(sk))) return tags;
  }

  // Generic fallback using first skill that has a common tag
  const commonTags = ["python", "javascript", "react", "java", "node", "sql", "aws"];
  for (const tag of commonTags) {
    if (s.some(sk => sk.includes(tag))) return [tag];
  }

  return ["remote"];
}

type RemoteOKItem = {
  legal?: string;
  id?: string;
  slug?: string;
  url?: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
};

async function fetchRealJobs(domain: string, skills: string[]): Promise<Job[]> {
  const tags = domainToTags(domain, skills);
  const tag = tags[0];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://remoteok.com/api?tag=${encodeURIComponent(tag)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CVMatcher/1.0", Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = (await res.json()) as RemoteOKItem[];

    const jobs: Job[] = data
      .filter(j => !j.legal && j.title && j.company)
      .slice(0, 20)
      .map((j, i): Job => {
        const jobTags = (j.tags ?? []).slice(0, 5);
        const salary = j.salary_min && j.salary_max
          ? `$${Math.round(j.salary_min / 1000)}k – $${Math.round(j.salary_max / 1000)}k/yr`
          : "Competitive salary";
        const desc = (j.description ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim()
          .slice(0, 200);

        // Simple match score based on skills overlap
        const userSkillsLower = skills.map(s => s.toLowerCase());
        const matched = jobTags.filter(t => userSkillsLower.some(s => s.includes(t) || t.includes(s)));
        const score = Math.min(95, 60 + matched.length * 8 + Math.floor(Math.random() * 5));

        return {
          id: `rok-${i}`,
          title: j.title!,
          company: j.company!,
          location: j.location || "Remote / Worldwide",
          salary,
          description: desc || `${j.title} position at ${j.company}`,
          requiredSkills: jobTags,
          matchScore: score,
          applyUrl: j.url ?? `https://remoteok.com/l/${j.id ?? j.slug}`,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    return jobs;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

// ── Step 3: Real curated scholarships matched by domain ───────────────────────

const REAL_SCHOLARSHIPS: (Omit<Scholarship, "matchScore"> & { domains: string[] })[] = [
  {
    id: "chev", title: "Chevening Scholarship", university: "UK Universities",
    country: "United Kingdom", amount: "Fully Funded",
    description: "UK government's global scholarship programme — covers tuition, living costs & flights for a 1-year Master's.",
    applyUrl: "https://www.chevening.org/scholarships/",
    domains: ["all"],
  },
  {
    id: "fulb", title: "Fulbright Foreign Student Program", university: "US Universities",
    country: "USA", amount: "Fully Funded",
    description: "US government scholarship for graduate study, research, or teaching in the United States.",
    applyUrl: "https://foreign.fulbrightonline.org/",
    domains: ["all"],
  },
  {
    id: "daad", title: "DAAD Scholarship", university: "German Universities",
    country: "Germany", amount: "Fully Funded",
    description: "German Academic Exchange Service — postgraduate scholarships at top German universities across all fields.",
    applyUrl: "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
    domains: ["all"],
  },
  {
    id: "gates", title: "Gates Cambridge Scholarship", university: "University of Cambridge",
    country: "United Kingdom", amount: "Fully Funded",
    description: "Full-cost scholarships for outstanding applicants from outside the UK for a postgraduate degree at Cambridge.",
    applyUrl: "https://www.gatescambridge.org/",
    domains: ["all"],
  },
  {
    id: "com", title: "Commonwealth Scholarship", university: "UK Universities",
    country: "United Kingdom", amount: "Fully Funded",
    description: "For citizens of Commonwealth countries — covers Master's and PhD programmes at UK universities.",
    applyUrl: "https://cscuk.fcdo.gov.uk/scholarships/",
    domains: ["all"],
  },
  {
    id: "aga", title: "Aga Khan Foundation International Scholarship", university: "Partner Universities",
    country: "Multiple Countries", amount: "Fully Funded",
    description: "Postgraduate scholarships for students from developing countries demonstrating academic excellence and leadership.",
    applyUrl: "https://www.akdn.org/our-agencies/aga-khan-foundation/international-scholarship-programme",
    domains: ["all"],
  },
  {
    id: "era", title: "Erasmus+ Scholarship", university: "European Universities",
    country: "Europe", amount: "Partial – Full",
    description: "EU's programme for education and training — study in multiple European countries with monthly stipend.",
    applyUrl: "https://erasmus-plus.ec.europa.eu/",
    domains: ["all"],
  },
  {
    id: "si", title: "Swedish Institute Scholarship", university: "Swedish Universities",
    country: "Sweden", amount: "Fully Funded",
    description: "Covers tuition, living allowance, travel and insurance for Master's studies in Sweden.",
    applyUrl: "https://si.se/en/apply/scholarships/swedish-institute-scholarships-for-global-professionals/",
    domains: ["all"],
  },
  {
    id: "hec", title: "HEC Overseas Scholarship (Phase III)", university: "International Universities",
    country: "Global", amount: "Fully Funded",
    description: "Pakistan's Higher Education Commission scholarship for PhD and postdoctoral studies at top global universities.",
    applyUrl: "https://www.hec.gov.pk/english/scholarshipsHP/Pages/Overseas-Scholarship.aspx",
    domains: ["all"],
  },
  {
    id: "google", title: "Google PhD Fellowship", university: "Partner Universities",
    country: "Global", amount: "Fully Funded",
    description: "Supports outstanding PhD students in Computer Science, Engineering, and related fields worldwide.",
    applyUrl: "https://research.google/programs-and-events/phd-fellowship/",
    domains: ["software", "data", "computer", "engineering", "ai", "machine learning"],
  },
  {
    id: "wb", title: "World Bank Robert S. McNamara Fellowship", university: "Partner Universities",
    country: "Global", amount: "Fully Funded",
    description: "Supports PhD students from developing countries conducting research on development economics and related fields.",
    applyUrl: "https://www.worldbank.org/en/programs/scholarships",
    domains: ["finance", "economics", "business", "development", "policy"],
  },
  {
    id: "who", title: "WHO Special Programme Fellowships", university: "Global Institutions",
    country: "Global", amount: "Fully Funded",
    description: "WHO fellowships for public health training, research, and capacity building in health sciences.",
    applyUrl: "https://www.who.int/about/education/fellowships",
    domains: ["medicine", "health", "nursing", "pharmacy", "public health", "biology"],
  },
];

function getMatchedScholarships(domain: string, educationLevel: string): Scholarship[] {
  const d = domain.toLowerCase();
  const edu = educationLevel.toLowerCase();

  const hasBachelor = /bachelor|bsc|beng|bs |b\.s/.test(edu);
  const hasMaster   = /master|msc|mba|ms /.test(edu);
  const hasPhD      = /phd|doctorate|doctoral/.test(edu);

  return REAL_SCHOLARSHIPS
    .filter(s => {
      if (s.domains[0] === "all") return true;
      return s.domains.some(sd => d.includes(sd) || sd.includes(d.split(" ")[0]));
    })
    .map((s): Scholarship => {
      // Score based on domain match and education level
      const domainMatch = s.domains[0] === "all" ? 70 : 88;
      const eduBonus = hasMaster || hasPhD ? 8 : hasBachelor ? 5 : 0;
      return {
        id: s.id,
        title: s.title,
        university: s.university,
        country: s.country,
        amount: s.amount,
        description: s.description,
        matchScore: Math.min(95, domainMatch + eduBonus + Math.floor(Math.random() * 5)),
        applyUrl: s.applyUrl,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 4);
}

// ── PDF extraction — tries pdf-parse first, falls back to pdf2json ────────────

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
      buf: Buffer
    ) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    if (result.text && result.text.trim().length > 20) return result.text;
  } catch {
    // fall through to pdf2json
  }

  const { default: PDFParser } = await import("pdf2json");

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PDF parsing timed out")), 25000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new (PDFParser as any)(null, 1);

    parser.on("pdfParser_dataReady", (data: Record<string, unknown>) => {
      clearTimeout(timer);
      try {
        type Page = { Texts?: Array<{ R?: Array<{ T?: string }> }> };
        const pages = (data.Pages ?? []) as Page[];
        const text = pages
          .map(p =>
            (p.Texts ?? [])
              .map(t => (t.R ?? []).map(r => decodeURIComponent(r.T ?? "")).join(""))
              .join(" ")
          )
          .join("\n\n");
        resolve(text);
      } catch {
        resolve("");
      }
    });

    parser.on("pdfParser_dataError", (err: { parserError?: string }) => {
      clearTimeout(timer);
      reject(new Error(err?.parserError ?? "Could not read PDF"));
    });

    try {
      parser.parseBuffer(buffer);
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error("PDF parse failed"));
    }
  });
}

// ── DOCX extraction via mammoth ───────────────────────────────────────────────

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// ── Main route handler ────────────────────────────────────────────────────────

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

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let cvText: string;
    try {
      if (isPDF)       cvText = await extractPdfText(buffer);
      else if (isDOCX) cvText = await extractDocxText(buffer);
      else             cvText = buffer.toString("utf-8");
    } catch (e: unknown) {
      return Response.json({ error: e instanceof Error ? e.message : "Could not read the file." }, { status: 400 });
    }

    if (!cvText || cvText.trim().length < 20) {
      return Response.json({ error: "The file appears empty or contains no readable text. If it is a scanned PDF, please export a text-based version." }, { status: 400 });
    }

    // Step 1: Extract profile with Groq (fast, small prompt)
    const { profile, skillGaps } = await extractProfile(cvText);

    // Step 2 & 3: Fetch real jobs + match scholarships in parallel
    const [jobs, scholarships] = await Promise.all([
      fetchRealJobs(profile.primaryDomain, profile.skills),
      Promise.resolve(getMatchedScholarships(profile.primaryDomain, profile.educationLevel)),
    ]);

    console.log(`[parse-cv] Domain: ${profile.primaryDomain} | Jobs: ${jobs.length} | Scholarships: ${scholarships.length}`);
    return Response.json({ success: true, profile, jobs, scholarships, skillGaps });

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Something went wrong.";
    const msg = raw.toLowerCase().includes("fetch failed") || raw.toLowerCase().includes("econnrefused")
      ? "Could not reach the AI service. Please check your internet connection and try again."
      : raw;
    console.error("[parse-cv] Error:", raw);
    return Response.json({ error: msg }, { status: 500 });
  }
}
