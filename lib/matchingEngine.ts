import type {
  JobOpportunity,
  ScholarshipOpportunity,
  UserProfile,
} from "@prisma/client";

// ── Domain synonym groups ────────────────────────────────────────────────────
// Fields in the same group are treated as "related" (partial credit)
const DOMAIN_GROUPS: readonly string[][] = [
  ["software", "programming", "web", "developer", "coding", "computer science", "it", "information technology"],
  ["data", "analytics", "machine learning", "artificial intelligence", "ai", "statistics", "data science"],
  ["business", "management", "administration", "mba", "operations", "strategy", "consulting"],
  ["finance", "financial", "banking", "investment", "economics", "accounting", "audit", "tax"],
  ["marketing", "advertising", "brand", "digital marketing", "seo", "social media"],
  ["design", "ui", "ux", "graphic", "creative", "visual", "product design"],
  ["engineering", "mechanical", "civil", "electrical", "chemical", "industrial", "structural"],
  ["content", "writing", "journalism", "media", "communication", "copywriting"],
  ["medicine", "medical", "doctor", "mbbs", "clinical", "healthcare", "physician"],
  ["nursing", "nurse", "midwifery", "patient care"],
  ["pharmacy", "pharmacist", "pharmacology"],
  ["education", "teaching", "teacher", "lecturer", "academic", "pedagogy", "training"],
  ["law", "legal", "llb", "llm", "attorney", "advocate", "litigation"],
  ["psychology", "counseling", "therapy", "mental health", "behavioral"],
  ["human resources", "hr", "recruitment", "talent", "people management"],
  ["architecture", "architect", "building design", "urban planning"],
  ["biology", "chemistry", "physics", "science", "research", "laboratory"],
] as const;

// ── Weighted scoring constants ────────────────────────────────────────────────
const W_SKILLS     = 50; // Skills overlap         — 50 pts
const W_DOMAIN     = 25; // Domain/field alignment  — 25 pts
const W_EXPERIENCE = 25; // Experience level        — 25 pts

// ── Education level hierarchy ────────────────────────────────────────────────
const EDU_LEVELS: [string, number][] = [
  ["phd",       5], ["doctorate", 5],
  ["master",    4], ["mba",       4], ["msc",  4], ["ms ",  4],
  ["bachelor",  3], ["mbbs",      3], ["bsc",  3], ["beng", 3], ["be ",  3],
  ["diploma",   2], ["associate", 2],
  ["high school", 1], ["secondary", 1],
];

// ── Exported scored types ────────────────────────────────────────────────────
export type ScoredJob = JobOpportunity & {
  matchPercentage: number;
  matchReason:     string;
  matchedSkills:   string[];
};

export type ScoredScholarship = ScholarshipOpportunity & {
  matchPercentage: number;
  matchReason:     string;
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function getDomainGroup(domain: string): readonly string[] | null {
  const d = domain.toLowerCase();
  return DOMAIN_GROUPS.find(g => g.some(k => d.includes(k))) ?? null;
}

/** Fuzzy bi-directional token match (handles "Node.js" vs "Node") */
function tokensOverlap(a: string, b: string): boolean {
  const al = a.toLowerCase().replace(/[.\-_]/g, "");
  const bl = b.toLowerCase().replace(/[.\-_]/g, "");
  return al.includes(bl) || bl.includes(al);
}

function skillScore(profileSkills: string[], targetTokens: string[]): {
  points: number;
  matched: string[];
} {
  if (targetTokens.length === 0) {
    return { points: Math.round(W_SKILLS * 0.4), matched: [] }; // no req = base credit
  }
  const matched = targetTokens.filter(t =>
    profileSkills.some(ps => tokensOverlap(ps, t))
  );
  return {
    points: Math.round((matched.length / targetTokens.length) * W_SKILLS),
    matched,
  };
}

function domainScore(profileDomain: string, hints: string[]): number {
  if (hints.length === 0) return 0;
  const profileGroup = getDomainGroup(profileDomain);
  const pd = profileDomain.toLowerCase();

  for (const hint of hints) {
    const hl = hint.toLowerCase();
    if (pd.includes(hl) || hl.includes(pd)) return W_DOMAIN;      // Exact match
    const hintGroup = getDomainGroup(hl);
    if (profileGroup && hintGroup && profileGroup === hintGroup)
      return Math.round(W_DOMAIN * 0.6);                            // Related field
  }
  return 0;
}

function experienceScore(profileYears: number, requirements: string[]): number {
  const expReq = requirements.find(r =>
    /year|experience|exp\b/i.test(r)
  );
  if (!expReq) {
    // No explicit req → reward any experience
    if (profileYears >= 5) return W_EXPERIENCE;
    if (profileYears >= 2) return Math.round(W_EXPERIENCE * 0.8);
    if (profileYears >= 1) return Math.round(W_EXPERIENCE * 0.6);
    return Math.round(W_EXPERIENCE * 0.4);
  }
  const m = expReq.match(/(\d+)\+?\s*year/i);
  const required = m ? parseInt(m[1], 10) : 2;

  if (profileYears >= required)      return W_EXPERIENCE;
  if (profileYears >= required - 1)  return Math.round(W_EXPERIENCE * 0.7);
  if (profileYears >= 1)             return Math.round(W_EXPERIENCE * 0.4);
  return Math.round(W_EXPERIENCE * 0.2);
}

function educationScore(profileEdu: string, requiredDegree: string): number {
  const getLevel = (s: string) =>
    EDU_LEVELS.find(([k]) => s.toLowerCase().includes(k))?.[1] ?? 2;
  const pLevel = getLevel(profileEdu);
  const rLevel = getLevel(requiredDegree);

  if (pLevel >= rLevel)      return W_EXPERIENCE;         // Meets or exceeds
  if (pLevel === rLevel - 1) return Math.round(W_EXPERIENCE * 0.6); // One level below
  return Math.round(W_EXPERIENCE * 0.2);                  // Significantly below
}

function buildReason(
  domPts: number,
  { points: skillPts, matched }: { points: number; matched: string[] },
  expPts: number,
  profileDomain: string,
): string {
  const parts: string[] = [];
  if (domPts >= W_DOMAIN)            parts.push(`✓ Domain match: ${profileDomain}`);
  else if (domPts > 0)               parts.push(`~ Related field to ${profileDomain}`);
  if (matched.length > 0)
    parts.push(`✓ ${matched.length} skill${matched.length > 1 ? "s" : ""} matched (${matched.slice(0, 4).join(", ")})`);
  if (expPts >= W_EXPERIENCE)        parts.push("✓ Experience meets requirement");
  else if (expPts >= W_EXPERIENCE * 0.6) parts.push("~ Partial experience match");
  return parts.join(" · ") || "General profile alignment";
}

// ── Public scoring functions ─────────────────────────────────────────────────

export function scoreJob(
  profile: Pick<UserProfile, "skills" | "primaryDomain" | "experienceYears">,
  job: JobOpportunity,
): ScoredJob {
  const targetTokens = [...job.requirements, ...job.tags];
  const domainHints  = [job.title, ...job.tags];

  const skill  = skillScore(profile.skills, targetTokens);
  const domain = domainScore(profile.primaryDomain, domainHints);
  const exp    = experienceScore(profile.experienceYears, job.requirements);
  const total  = Math.min(100, skill.points + domain + exp);

  return {
    ...job,
    matchPercentage: total,
    matchedSkills:   skill.matched,
    matchReason:     buildReason(domain, skill, exp, profile.primaryDomain),
  };
}

export function scoreScholarship(
  profile: Pick<UserProfile, "skills" | "primaryDomain" | "educationLevel">,
  scholarship: ScholarshipOpportunity,
): ScoredScholarship {
  const targetTokens = [...scholarship.requirements, ...scholarship.tags];
  const domainHints  = [scholarship.degreeLevel, ...scholarship.tags];

  const skill  = skillScore(profile.skills, targetTokens);
  const domain = domainScore(profile.primaryDomain, domainHints);
  const edu    = educationScore(profile.educationLevel, scholarship.degreeLevel);
  const total  = Math.min(100, skill.points + domain + edu);

  return {
    ...scholarship,
    matchPercentage: total,
    matchReason:     buildReason(domain, skill, edu, profile.primaryDomain),
  };
}

/** Sort descending by matchPercentage, ties broken by title alphabetically */
export function rankResults<T extends { matchPercentage: number; title: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      b.matchPercentage - a.matchPercentage ||
      a.title.localeCompare(b.title),
  );
}
