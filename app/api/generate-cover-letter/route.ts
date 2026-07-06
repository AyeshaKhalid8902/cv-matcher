import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Model fallback chain — auto-skips deprecated/unavailable models
const GROQ_MODELS = [
  (process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct").replace(/﻿/g, "").trim(),
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
];

type Profile = {
  primaryDomain:   string;
  skills:          string[];
  experienceYears: number;
  educationLevel:  string;
  bio?:            string;
};

type Job = {
  title:           string;
  company:         string;
  location:        string;
  description:     string;
  requiredSkills?: string[];
  salary?:         string;
};

function buildPrompt(profile: Profile, job: Job): string {
  return `You are an elite career coach. Write a professional, tailored cover letter for this candidate.

CANDIDATE:
- Field: ${profile.primaryDomain}
- Education: ${profile.educationLevel}
- Experience: ${profile.experienceYears} years
- Skills: ${profile.skills.slice(0, 12).join(", ")}
${profile.bio ? `- Summary: ${profile.bio}` : ""}

JOB:
- Title: ${job.title} at ${job.company}
- Location: ${job.location}
- Description: ${job.description.slice(0, 300)}
- Required: ${(job.requiredSkills ?? []).join(", ") || "see description"}

Write a 310–360 word cover letter:
1. Start: "Dear Hiring Manager," then a strong opening sentence naming the exact role and company
2. Para 1 (3-4 sentences): who you are, your field, experience — connected to this role
3. Para 2 (3-4 sentences): 3-4 specific matching skills — be concrete not generic
4. Para 3 (2-3 sentences): why this company and role excites you
5. End: "Sincerely," then "[Your Name]"
Tone: confident, warm, professional. First person. Output ONLY the letter.`;
}

async function groqWithFallback(payload: Record<string, unknown>, apiKey: string): Promise<string> {
  let lastErr = "";
  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ ...payload, model }),
      });

      if (res.status === 429) {
        const after = res.headers.get("retry-after");
        await new Promise(r => setTimeout(r, after ? Math.ceil(+after * 1000) + 200 : 1500));
        // retry same model once
        const res2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ ...payload, model }),
        });
        if (res2.ok) {
          const d = await res2.json() as { choices: { message: { content: string } }[] };
          return d?.choices?.[0]?.message?.content ?? "";
        }
      }

      if (res.ok) {
        const d = await res.json() as { choices: { message: { content: string } }[] };
        return d?.choices?.[0]?.message?.content ?? "";
      }

      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      const msg = err?.error?.message ?? `HTTP ${res.status}`;
      if (
        res.status === 404 ||
        msg.toLowerCase().includes("decommissioned") ||
        msg.toLowerCase().includes("does not exist") ||
        msg.toLowerCase().includes("no longer supported")
      ) { lastErr = msg; continue; }

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
  throw new Error(`AI service unavailable: ${lastErr}`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { profile?: Profile; job?: Job };

    if (!body?.profile || !body?.job)
      return Response.json({ error: "Both 'profile' and 'job' are required." }, { status: 400 });

    const { profile, job } = body;

    if (!profile.primaryDomain || !profile.skills?.length)
      return Response.json({ error: "profile.primaryDomain and profile.skills are required." }, { status: 422 });
    if (!job.title || !job.company)
      return Response.json({ error: "job.title and job.company are required." }, { status: 422 });

    const apiKey = (process.env.GROQ_API_KEY ?? "").replace(/﻿/g, "").trim();
    if (!apiKey || apiKey.includes("your-groq-key"))
      return Response.json({ error: "Groq API key not configured." }, { status: 500 });

    const letter = await groqWithFallback({
      messages: [
        { role: "system", content: "You are an expert career coach who writes elite, personalized cover letters in first person. Never use placeholder text like [Name]." },
        { role: "user",   content: buildPrompt(profile, job) },
      ],
      max_tokens:  700,
      temperature: 0.65,
    }, apiKey);

    if (!letter) throw new Error("Empty response from AI. Please try again.");

    return Response.json({ success: true, coverLetter: letter.trim() });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong.";
    console.error("[generate-cover-letter]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
