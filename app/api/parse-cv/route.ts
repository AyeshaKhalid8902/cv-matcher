export const maxDuration = 60;
export const dynamic = "force-dynamic";


const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

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
};

type Scholarship = {
  id: string;
  title: string;
  university: string;
  country: string;
  amount: string;
  description: string;
  matchScore: number;
};

type SkillGap = {
  skill: string;
  avgSalary: string;
  reason: string;
};

type GroqResult = {
  profile: ParsedCV;
  jobs: Job[];
  scholarships: Scholarship[];
  skillGaps: SkillGap[];
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

// ── Single Groq call — returns everything at once ─────────────────────────────
async function analyzeCV(cvText: string): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes("your-groq-key")) {
    throw new Error("Groq API key missing. Add GROQ_API_KEY to .env.local — get it free at https://console.groq.com");
  }

  const prompt = `You are a CV analysis expert. Analyze the CV text below and return ONE valid JSON object only. No markdown, no explanation.

Return this exact structure:
{
  "profile": {
    "primaryDomain": "main professional field",
    "skills": ["skill1", "skill2"],
    "experienceYears": 0,
    "educationLevel": "highest degree",
    "bio": "2-sentence summary"
  },
  "jobs": [
    {
      "id": "j1",
      "title": "job title in their field",
      "company": "company name",
      "location": "City, Country",
      "salary": "salary range",
      "description": "one sentence about the role",
      "requiredSkills": ["skill1", "skill2"],
      "matchScore": 85
    }
  ],
  "scholarships": [
    {
      "id": "s1",
      "title": "scholarship name",
      "university": "university name",
      "country": "country",
      "amount": "amount or Fully Funded",
      "description": "one sentence about it",
      "matchScore": 80
    }
  ],
  "skillGaps": [
    {
      "skill": "skill the person does NOT have but needs for international remote work",
      "avgSalary": "$XX,000/year",
      "reason": "one sentence why this skill is globally demanded in their field"
    }
  ]
}

Rules:
- profile.skills: list all skills found in CV
- jobs: exactly 5 jobs, ALL must be in the same field as the CV
- scholarships: exactly 4 scholarships relevant to their field and education
- skillGaps: exactly 3 high-paying skills NOT present in profile.skills, specific to their domain
- matchScore: realistic 60-95 based on how well it fits
- Output ONLY the JSON object

CV Text:
${cvText.slice(0, 4500)}`;

  const res = await groqFetch({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1500,
    temperature: 0.2,
  }, apiKey);

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Groq API error (${res.status})`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = data?.choices?.[0]?.message?.content ?? "";

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse AI response. Please try again.");

  const result = JSON.parse(match[0]) as GroqResult;
  if (!result.profile || !result.jobs || !result.scholarships) {
    throw new Error("Incomplete AI response. Please try again.");
  }
  if (!result.skillGaps) result.skillGaps = [];

  return result;
}

// ── PDF extraction via pdf2json ───────────────────────────────────────────────
async function extractPdfText(buffer: Buffer): Promise<string> {
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

    const result = await analyzeCV(cvText);

    console.log("[parse-cv] Domain:", result.profile.primaryDomain, "| Pages text length:", cvText.length, "| Jobs:", result.jobs.length, "| Scholarships:", result.scholarships.length);
    return Response.json({ success: true, ...result });

  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : "Something went wrong.";
    const msg = raw.toLowerCase().includes("fetch failed") || raw.toLowerCase().includes("econnrefused")
      ? "Could not reach the AI service. Please check your internet connection and try again."
      : raw;
    console.error("[parse-cv] Error:", raw);
    return Response.json({ error: msg }, { status: 500 });
  }
}
