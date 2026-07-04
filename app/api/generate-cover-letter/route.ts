import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

type Profile = {
  primaryDomain:   string;
  skills:          string[];
  experienceYears: number;
  educationLevel:  string;
  bio?:            string;
};

type Job = {
  title:          string;
  company:        string;
  location:       string;
  description:    string;
  requiredSkills?: string[];
  salary?:        string;
};

function buildPrompt(profile: Profile, job: Job): string {
  const skillsList    = profile.skills.slice(0, 14).join(", ");
  const reqSkills     = (job.requiredSkills ?? []).join(", ") || "not specified";
  const bioSection    = profile.bio
    ? `Professional Summary: ${profile.bio}`
    : "";

  return `You are an elite career coach and cover letter specialist. Write a professional, tailored, and compelling cover letter for this candidate.

CANDIDATE PROFILE:
- Professional Field: ${profile.primaryDomain}
- Education: ${profile.educationLevel}
- Years of Experience: ${profile.experienceYears}
- Core Skills: ${skillsList}
${bioSection}

TARGET POSITION:
- Job Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Job Description: ${job.description}
- Required Skills: ${reqSkills}

COVER LETTER INSTRUCTIONS:
1. Open with "Dear Hiring Manager," then a powerful first sentence that names the exact role and company
2. Paragraph 1 (3-4 sentences): Who you are professionally, your field, and years of experience — connect it directly to this role
3. Paragraph 2 (3-4 sentences): Highlight 3-4 specific skills from the requirements that you possess — be concrete, not generic
4. Paragraph 3 (2-3 sentences): Why THIS company and role excites you; forward-looking and confident
5. Close with "Sincerely," followed by a single line: "[Your Name]"
6. Length: 310–370 words total
7. Tone: Confident, warm, and professional — NOT robotic, NOT overly formal
8. Write entirely in first person ("I am…", "My experience…")

Output ONLY the cover letter text. No preamble, no metadata, no commentary.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { profile?: Profile; job?: Job };

    if (!body?.profile || !body?.job) {
      return Response.json(
        { error: "Both 'profile' and 'job' fields are required." },
        { status: 400 },
      );
    }

    const { profile, job } = body;

    // Basic validation
    if (!profile.primaryDomain || !profile.skills?.length) {
      return Response.json(
        { error: "profile.primaryDomain and profile.skills are required." },
        { status: 422 },
      );
    }
    if (!job.title || !job.company) {
      return Response.json(
        { error: "job.title and job.company are required." },
        { status: 422 },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.includes("your-groq-key")) {
      return Response.json(
        { error: "Groq API key not configured. Add GROQ_API_KEY to .env.local" },
        { status: 500 },
      );
    }

    const fetchWithRetry = async (retries = 3): Promise<Response> => {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model:       GROQ_MODEL,
          max_tokens:  700,
          temperature: 0.65,
          messages: [
            { role: "system", content: "You are an expert career coach who writes elite, personalized cover letters. You write in first person, never use placeholder text like [Name], and produce immediately usable letters." },
            { role: "user",   content: buildPrompt(profile, job) },
          ],
        }),
      });
      if (r.status === 429 && retries > 0) {
        const retryAfter = r.headers.get("retry-after");
        const waitMs = retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000) + 200 : 1500;
        await new Promise(res => setTimeout(res, waitMs));
        return fetchWithRetry(retries - 1);
      }
      return r;
    };

    const res = await fetchWithRetry();

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err?.error?.message ?? `Groq API error (${res.status})`);
    }

    const data  = (await res.json()) as { choices: { message: { content: string } }[] };
    const letter = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!letter) throw new Error("Empty response from AI. Please try again.");

    return Response.json({ success: true, coverLetter: letter });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong.";
    console.error("[generate-cover-letter]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
