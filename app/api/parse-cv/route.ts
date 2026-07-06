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

// ── Pakistan curated jobs ─────────────────────────────────────────────────────

const PK_JOBS: (Omit<Job, "matchScore"> & { domains: string[] })[] = [
  // IT / Software
  { id: "pitb-dev",   title: "Software Developer",            company: "PITB (Punjab IT Board)",           location: "Lahore, Pakistan",    salary: "PKR 80,000–150,000/mo", description: "Punjab IT Board regularly hires software developers for e-governance projects. Apply through their careers portal.", requiredSkills: ["software development", "web", "programming"], applyUrl: "https://pitb.gov.pk/careers", domains: ["software","tech","it","developer","programming","web","computer"] },
  { id: "pitb-intern", title: "IT Internship (Paid)",          company: "PITB",                             location: "Lahore, Pakistan",    salary: "PKR 25,000–35,000/mo", description: "6-month paid internship program at Punjab IT Board for fresh graduates in software, AI and data fields.", requiredSkills: ["programming", "software", "it"], applyUrl: "https://pitb.gov.pk/internships", domains: ["software","tech","it","developer","data","ai","computer"] },
  { id: "nadra-it",   title: "IT Officer / Software Engineer", company: "NADRA",                            location: "Islamabad, Pakistan", salary: "PKR 90,000–180,000/mo", description: "NADRA hires IT officers for national digital identity systems. Competitive pay with government benefits.", requiredSkills: ["software", "database", "networking"], applyUrl: "https://www.nadra.gov.pk/careers/", domains: ["software","tech","it","developer","database","computer","network"] },
  { id: "ntc-dev",    title: "Junior Software Engineer",       company: "NTC (National Telecom Corp)",      location: "Islamabad, Pakistan", salary: "PKR 70,000–120,000/mo", description: "NTC recruits software engineers for telecom infrastructure and government communication systems.", requiredSkills: ["software engineering", "networking"], applyUrl: "https://www.ntc.net.pk/jobs/", domains: ["software","tech","it","telecom","network","engineer"] },
  { id: "stza-dev",   title: "Software Engineer – Tech Zone",  company: "STZA (Special Tech Zones Authority)", location: "Islamabad, Pakistan", salary: "PKR 100,000–200,000/mo", description: "Work in Pakistan's Special Technology Zones — tax-exempt tech companies hiring software engineers.", requiredSkills: ["software", "web", "mobile"], applyUrl: "https://stza.gov.pk/jobs", domains: ["software","tech","developer","web","mobile","ai","computer"] },

  // Finance / Accounting
  { id: "fbr-acc",    title: "Inland Revenue Officer",         company: "FBR (Federal Board of Revenue)",   location: "Pakistan",           salary: "BPS-17 Government Scale", description: "FBR recruits via FPSC for Inland Revenue / Customs officers. Prestigious government career with pension.", requiredSkills: ["finance", "taxation", "accounting"], applyUrl: "https://fpsc.gov.pk/", domains: ["finance","accounting","economics","tax","banking","business"] },
  { id: "sbp-off",    title: "Officer Grade II / III",         company: "State Bank of Pakistan",           location: "Karachi / Lahore",   salary: "PKR 120,000–200,000/mo", description: "SBP hires economics and finance graduates for banking regulation, monetary policy and research roles.", requiredSkills: ["economics", "finance", "banking", "research"], applyUrl: "https://www.sbp.org.pk/careers.asp", domains: ["finance","economics","banking","business","accounting","research"] },

  // Engineering
  { id: "wapda-eng",  title: "Junior Engineer",                company: "WAPDA",                            location: "Pakistan",           salary: "BPS-17 Government Scale", description: "WAPDA recruits civil, electrical and mechanical engineers for power infrastructure across Pakistan.", requiredSkills: ["electrical engineering", "civil engineering", "mechanical"], applyUrl: "https://www.wapda.gov.pk/index.php/careers", domains: ["engineering","electrical","civil","mechanical","energy","power"] },
  { id: "nespak-eng", title: "Civil / Structural Engineer",    company: "NESPAK",                           location: "Lahore, Pakistan",   salary: "PKR 100,000–180,000/mo", description: "National Engineering Services Pakistan — largest consulting firm. Hiring civil, structural and environmental engineers.", requiredSkills: ["civil engineering", "structural", "design"], applyUrl: "https://www.nespak.com.pk/careers", domains: ["engineering","civil","structural","mechanical","construction"] },
  { id: "pnsc-eng",   title: "Marine / Mechanical Engineer",   company: "PNSC",                             location: "Karachi, Pakistan",  salary: "PKR 80,000–150,000/mo", description: "Pakistan National Shipping Corporation hires marine, mechanical and electrical engineers.", requiredSkills: ["mechanical engineering", "marine", "electrical"], applyUrl: "https://www.pnsc.com.pk/careers/", domains: ["engineering","mechanical","marine","electrical","naval"] },

  // Health / Medical
  { id: "pmdc-doc",   title: "Medical Officer (Govt Hospital)", company: "Punjab Health Department",         location: "Punjab, Pakistan",   salary: "BPS-17 Government Scale", description: "Punjab health department recruits MBBS doctors as Medical Officers across district hospitals.", requiredSkills: ["mbbs", "clinical", "medicine"], applyUrl: "https://phd.punjab.gov.pk/careers", domains: ["medicine","health","medical","mbbs","doctor","clinical","pharmacy"] },
  { id: "nih-res",    title: "Research Officer / Lab Officer",  company: "NIH (National Inst. of Health)",   location: "Islamabad, Pakistan", salary: "BPS-17 Government Scale", description: "NIH Islamabad recruits medical researchers, lab officers and public health professionals.", requiredSkills: ["research", "microbiology", "public health"], applyUrl: "https://www.nih.org.pk/careers/", domains: ["medicine","health","biology","research","pharmacy","microbiology","public health"] },

  // Education
  { id: "hec-res",    title: "Research Associate / Lecturer",   company: "HEC-Funded Universities",          location: "Pakistan",           salary: "PKR 60,000–120,000/mo", description: "HEC-funded universities regularly advertise lecturer and research associate positions nationwide.", requiredSkills: ["teaching", "research", "academia"], applyUrl: "https://www.hec.gov.pk/english/facdev/Pages/Opportunities.aspx", domains: ["education","teaching","academia","research","lecturer"] },

  // Business / Management
  { id: "pbs-off",    title: "Statistical Officer",             company: "PBS (Pakistan Bureau of Statistics)", location: "Islamabad",       salary: "BPS-17 Government Scale", description: "PBS recruits statistics and economics graduates for national data collection and analysis.", requiredSkills: ["statistics", "economics", "data analysis"], applyUrl: "https://fpsc.gov.pk/", domains: ["business","management","economics","statistics","data","finance","research"] },

  // Law
  { id: "fpsc-law",   title: "Law Officer / Legal Advisor",     company: "Federal Government (via FPSC)",    location: "Pakistan",           salary: "BPS-17 Government Scale", description: "Federal ministries recruit law officers through FPSC for legal, compliance and advisory roles.", requiredSkills: ["law", "legal", "compliance"], applyUrl: "https://fpsc.gov.pk/", domains: ["law","legal","advocate","lawyer","compliance","llb"] },

  // General Government
  { id: "css-off",    title: "CSS Officer (All Departments)",    company: "Federal Government",               location: "Pakistan",           salary: "BPS-17–22 Government Scale", description: "Central Superior Services — elite government positions across all sectors. Apply via FPSC every year.", requiredSkills: ["general knowledge", "administration", "management"], applyUrl: "https://fpsc.gov.pk/", domains: ["all"] },
  { id: "ppsc-off",   title: "Government Officer (Punjab)",      company: "PPSC",                             location: "Punjab, Pakistan",   salary: "BPS-17 Government Scale", description: "Punjab Public Service Commission recruits officers across education, health, finance and admin departments.", requiredSkills: ["general", "administration"], applyUrl: "https://www.ppsc.gop.pk/", domains: ["all"] },
];

function getPakistaniJobs(domain: string, skills: string[]): Job[] {
  const d = domain.toLowerCase();
  const s = skills.map(x => x.toLowerCase()).join(" ");
  const combined = d + " " + s;

  const matched = PK_JOBS.filter(j =>
    j.domains[0] === "all" ||
    j.domains.some(dom => combined.includes(dom) || dom.includes(d.split(" ")[0]))
  );

  const pool = matched.length >= 2 ? matched : [
    ...matched,
    ...PK_JOBS.filter(j => j.domains[0] === "all"),
  ];

  const userSkills = skills.map(x => x.toLowerCase());
  return pool
    .slice(0, 8)
    .map((j): Job => {
      const skillMatches = j.requiredSkills.filter(rs =>
        userSkills.some(us => us.includes(rs.toLowerCase()) || rs.toLowerCase().includes(us))
      ).length;
      const score = Math.min(93, 62 + skillMatches * 8 + (j.domains[0] !== "all" ? 10 : 0));
      return { ...j, matchScore: score };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 4);
}

// Tries 3 sources in sequence; merges Pakistani jobs in
async function fetchRealJobs(domain: string, skills: string[]): Promise<Job[]> {
  const { tag, keyword } = domainToKeywords(domain, skills);
  const pkJobs = getPakistaniJobs(domain, skills);

  const [remoteOK, arbeitnow, remotive] = await Promise.allSettled([
    fetchRemoteOK(tag, skills),
    fetchArbeitnow(keyword, skills),
    fetchRemotive(keyword, skills),
  ]);

  const international =
    (remoteOK.status === "fulfilled" && remoteOK.value.length >= 2 ? remoteOK.value :
    arbeitnow.status === "fulfilled" && arbeitnow.value.length >= 2 ? arbeitnow.value :
    remotive.status  === "fulfilled" ? remotive.value : []).slice(0, 6);

  // Mix: Pakistani jobs first, then international
  const combined = [...pkJobs, ...international];
  const seen = new Set<string>();
  return combined.filter(j => {
    if (seen.has(j.title + j.company)) return false;
    seen.add(j.title + j.company);
    return true;
  }).slice(0, 10);
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

  // ── Pakistani Scholarships & Internships ──────────────────────────────────────
  { id: "hec-nb",   title: "HEC Need-Based Scholarship",               university: "Pakistani Universities",  country: "Pakistan",        amount: "PKR 50,000–120,000/yr", description: "HEC Need-Based Scholarships for deserving undergraduate students at universities across Pakistan. Apply through your university.", applyUrl: "https://www.hec.gov.pk/english/scholarshipsHP/Pages/NBS.aspx", domains: ["all"] },
  { id: "peef",     title: "PEEF Scholarship (Punjab)",                 university: "Punjab Universities",     country: "Pakistan",        amount: "PKR 60,000–100,000/yr", description: "Punjab Education Endowment Fund provides merit-cum-need scholarships for undergraduate students from low-income families in Punjab.", applyUrl: "https://peef.org.pk/scholarships/", domains: ["all"] },
  { id: "ehsaas",   title: "Ehsaas Undergraduate Scholarship",          university: "Pakistani Universities",  country: "Pakistan",        amount: "PKR 64,000/yr + boarding", description: "Government of Pakistan's flagship scholarship for talented students from low-income families — covers tuition and boarding.", applyUrl: "https://ehsaas.punjab.gov.pk/", domains: ["all"] },
  { id: "pm-youth", title: "Prime Minister's Youth Laptop Scheme",      university: "Pakistani Universities",  country: "Pakistan",        amount: "Free Laptop", description: "PM Youth Programme distributes laptops to top-performing university students to support digital education.", applyUrl: "https://pmyp.gov.pk/", domains: ["software","tech","it","computer","engineering","science","data"] },
  { id: "pitb-int", title: "PITB Governor's Initiative Internship",     university: "PITB / Govt of Punjab",   country: "Pakistan",        amount: "PKR 30,000/mo stipend", description: "Paid 6-month internship for IT and CS graduates under the Governor's Initiative — work on e-governance projects.", applyUrl: "https://pitb.gov.pk/internships", domains: ["software","tech","it","computer","developer","data","ai","engineering"] },
  { id: "navttc",   title: "NAVTTC Free IT & Technical Courses",        university: "NAVTTC Pakistan",         country: "Pakistan",        amount: "Free Training + Stipend", description: "National Vocational and Technical Training Commission offers free short courses with monthly stipends in IT, trades and business.", applyUrl: "https://navttc.gov.pk/", domains: ["software","tech","it","engineering","vocational","technical","business"] },
  { id: "ignite",   title: "Ignite Startup/Research Grants",            university: "HEC / Ignite",            country: "Pakistan",        amount: "Up to PKR 10M", description: "Ignite (formerly NRPU) funds tech startups, research projects and digital innovation for Pakistani graduates and researchers.", applyUrl: "https://ignite.org.pk/", domains: ["software","tech","it","research","data","ai","engineering","startup","innovation"] },
  { id: "km-sch",   title: "Khyber Medical University Scholarship",     university: "KMU Peshawar",            country: "Pakistan",        amount: "Tuition waiver", description: "KMU offers merit and need-based scholarships for medical and allied health sciences students in KPK.", applyUrl: "https://www.kmu.edu.pk/", domains: ["medicine","health","medical","mbbs","pharmacy","dentistry","nursing"] },
  { id: "aku-sch",  title: "Aga Khan University Financial Aid",         university: "Aga Khan University",    country: "Pakistan",        amount: "Up to 100% tuition", description: "AKU offers extensive financial aid and scholarships for undergraduate and postgraduate students in health and education.", applyUrl: "https://www.aku.edu/admissions/financial-assistance/Pages/home.aspx", domains: ["medicine","health","medical","education","nursing","pharmacy","biology"] },
  { id: "lums-fa",  title: "LUMS National Outreach Programme",          university: "LUMS",                    country: "Pakistan",        amount: "Fully Funded", description: "LUMS National Outreach Programme — fully funded undergraduate scholarships for exceptional students from all over Pakistan.", applyUrl: "https://nop.lums.edu.pk/", domains: ["all"] },
  { id: "iiui-sch", title: "IIUI Merit Scholarship",                    university: "International Islamic University Islamabad", country: "Pakistan", amount: "50–100% fee waiver", description: "IIUI offers merit scholarships for top students across engineering, law, social sciences and Islamic studies.", applyUrl: "https://www.iiu.edu.pk/index.php/scholarships", domains: ["all"] },
];

const PK_SCHOLARSHIP_IDS = new Set(["hec-nb","peef","ehsaas","pm-youth","pitb-int","navttc","ignite","km-sch","aku-sch","lums-fa","iiui-sch"]);

function getScholarships(domain: string, educationLevel: string): Scholarship[] {
  const d   = domain.toLowerCase();
  const edu = educationLevel.toLowerCase();
  const eduBonus = /master|msc|mba|phd|doctorate/.test(edu) ? 8 : /bachelor|bsc/.test(edu) ? 5 : 0;

  const scored = SCHOLARSHIPS.map((s): Scholarship => ({
    id: s.id, title: s.title, university: s.university,
    country: s.country, amount: s.amount, description: s.description,
    applyUrl: s.applyUrl,
    matchScore: Math.min(95,
      (s.domains[0] === "all" ? 68 : 85) +
      eduBonus +
      (s.domains.some(sd => d.includes(sd) || sd.includes(d.split(" ")[0])) ? 8 : 0) +
      Math.floor(Math.random() * 5)
    ),
  }));

  // Always include 3 Pakistani + 3 international
  const pk   = scored.filter(s => PK_SCHOLARSHIP_IDS.has(s.id)).sort((a, b) => b.matchScore - a.matchScore).slice(0, 4);
  const intl = scored.filter(s => !PK_SCHOLARSHIP_IDS.has(s.id)).sort((a, b) => b.matchScore - a.matchScore).slice(0, 4);

  return [...pk, ...intl].slice(0, 8);
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
