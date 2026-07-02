"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnalyticsDashboard from "../components/AnalyticsDashboard";

function useIsMobile(bp = 600) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    fn();
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return m;
}

type ParsedCV = {
  primaryDomain: string;
  skills: string[];
  experienceYears: number;
  educationLevel: string;
  bio: string;
};

type SkillGap = {
  skill: string;
  avgSalary: string;
  reason: string;
};

// ── Shared design tokens (matches recommendations page) ───────────────────────
const C = {
  espresso: "#2C221E",  /* 14:1+ on cream/white — AAA */
  cream:    "#FFFFFF",  /* pure white page bg */
  white:    "#F9F7F4",  /* warm-tinted card surfaces */
  gold:     "#7A6350",  /* was #B99D82 (2.6:1) → now ~5.5:1 — AA ✓ */
  goldDeep: "#6B5040",
  border:   "#E6DFD5",  /* consistent with recommendations page */
  muted:    "#6B5A50",  /* was #8C7A6B (3.7:1) → now ~6.9:1 — AAA ✓ */
  warm:     "#EDE8E3",
  accent:   "#7A6350",  /* same as gold for single accent token */
};

const S = {
  /* Layout */
  page: {
    minHeight: "100vh",
    backgroundColor: C.cream,
    display: "flex",
    flexDirection: "column" as const,
    /* Subtle radial glow in top-right for depth */
    backgroundImage:
      "radial-gradient(ellipse 80% 40% at 70% -10%, rgba(201,180,155,0.13) 0%, transparent 70%)",
  },
  main: { flex: 1, maxWidth: 680, margin: "0 auto", width: "100%", padding: "0 20px 72px" },

  /* Hero */
  hero: { textAlign: "center" as const, marginBottom: 28 },
  h1: {
    fontSize: 44, fontWeight: 800, color: C.espresso, margin: 0, lineHeight: 1.05,
    letterSpacing: "-0.03em",
  },
  subtitle: { fontSize: 16, color: C.muted, marginTop: 14, lineHeight: 1.8, margin: "16px 0 0" },

  /* Card — solid white for maximum contrast against #FAF9F6 page bg */
  card: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: "36px 32px",
    border: `1px solid ${C.border}`,
  },

  /* Drop zone — light white-tint bg, luxury border */
  dropZone: (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? C.espresso : C.border}`,
    borderRadius: 16,
    padding: "52px 32px 44px",
    textAlign: "center",
    cursor: "pointer",
    backgroundColor: active ? "rgba(44,34,30,0.03)" : C.cream,
    boxShadow: active ? "none" : "inset 0 1px 4px rgba(44,34,30,0.05)",
    transition: "border-color 0.25s ease-out, background-color 0.25s ease-out",
    userSelect: "none",
  }),

  /* File name bar */
  fileBar: {
    marginTop: 16,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    backgroundColor: C.warm,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
  },
  fileBarText: { fontSize: 15, fontWeight: 600, color: C.espresso, margin: 0 },

  /* Status panels */
  panelBase: (bg: string, border: string): React.CSSProperties => ({
    marginTop: 22,
    padding: "18px 20px",
    backgroundColor: bg,
    borderRadius: 14,
    border: `2px solid ${border}`,
  }),
  panelRow: { display: "flex", alignItems: "flex-start", gap: 14 },
  panelIcon: { fontSize: 26, flexShrink: 0, lineHeight: 1 },
  panelTitle: (color: string): React.CSSProperties => ({
    margin: 0, fontSize: 17, fontWeight: 700, color,
  }),
  panelMsg: (color: string): React.CSSProperties => ({
    margin: "5px 0 0", fontSize: 15, color, lineHeight: 1.5,
  }),

  /* Profile grid */
  profileGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 },
  profileCell: {
    backgroundColor: C.white,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "14px 16px",
  },
  cellLabel: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    color: C.gold,
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
  },
  cellValue: { margin: "6px 0 0", fontSize: 16, fontWeight: 700, color: C.espresso },

  /* Skills */
  skillsWrap: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 10 },
  skill: {
    padding: "6px 14px",
    backgroundColor: C.warm,
    color: C.espresso,
    borderRadius: 20,
    fontSize: 14,
    fontWeight: 600,
    border: `1px solid ${C.border}`,
  },

  /* Privacy note */
  privacyNote: {
    marginTop: 20,
    padding: "13px 18px",
    backgroundColor: C.cream,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    textAlign: "center" as const,
  },
  privacyText: { margin: 0, fontSize: 13, color: C.muted },

  /* Footer — ultra-minimal */
  footer: {
    textAlign: "center" as const,
    padding: "20px 24px 28px",
    fontSize: 11,
    color: C.gold,
    letterSpacing: "0.06em",
  },
};

export default function UploadPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ParsedCV | null>(null);
  const [skillGaps, setSkillGaps] = useState<SkillGap[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setProfile(null);
      if (!file) return;

      const name = file.name.toLowerCase();
      const mime = file.type;
      const isPDF  = mime === "application/pdf"  || name.endsWith(".pdf");
      const isDOCX = mime.includes("wordprocessingml") || name.endsWith(".docx");
      const isTXT  = mime === "text/plain" || name.endsWith(".txt");
      const isDOC  = mime === "application/msword" || name.endsWith(".doc");

      if (isDOC) {
        setError("Old .doc format is not supported. Please save your CV as PDF, .docx, or .txt and re-upload.");
        return;
      }
      if (!isPDF && !isDOCX && !isTXT) {
        setError("Please upload a PDF, Word (.docx), or text (.txt) file.");
        return;
      }

      setFileName(file.name);
      setLoading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("/api/parse-cv", { method: "POST", body: fd });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `Upload failed (${res.status})`);
        }

        const json = (await res.json()) as {
          success?: boolean;
          profile?: ParsedCV;
          jobs?: unknown[];
          scholarships?: unknown[];
          skillGaps?: SkillGap[];
        };
        if (json?.profile) {
          setProfile(json.profile);
          setSkillGaps(json.skillGaps ?? []);
          // Save to sessionStorage for recommendations page
          sessionStorage.setItem("cv_data", JSON.stringify({
            profile: json.profile,
            jobs: json.jobs ?? [],
            scholarships: json.scholarships ?? [],
          }));
        } else {
          throw new Error("Invalid response from server.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  const handleDrop: React.DragEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave: React.DragEventHandler<HTMLDivElement> = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const onChooseFile = useCallback(() => inputRef.current?.click(), []);

  const handleFileInput: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onChooseFile();
      }
    },
    [onChooseFile]
  );

  return (
    <div style={S.page}>

      {/* ── Wordmark ── */}
      <div style={{ textAlign: "center", paddingTop: 32 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, color: C.accent,
          letterSpacing: "0.2em", textTransform: "uppercase", userSelect: "none",
        }}>
          CV&nbsp;Matcher
        </span>
      </div>

      <main style={{ ...S.main, padding: isMobile ? "0 14px 60px" : "0 20px 72px" }}>

        {/* ── Hero ── */}
        <div style={{ ...S.hero, marginTop: isMobile ? 16 : 28 }}>
          <h1 style={{ ...S.h1, fontSize: isMobile ? 26 : 44 }}>Upload Your CV</h1>
          <p style={{ ...S.subtitle, margin: "12px 0 0" }}>
            Our AI reads your resume and finds the best jobs &amp; scholarships for you.
            Simple, fast, and completely free.
          </p>
          <div style={{ display: "inline-flex", marginTop: 14, padding: "5px 18px", borderRadius: 99, border: `1px solid ${C.border}`, fontSize: 11, color: C.muted, letterSpacing: "0.1em", gap: 6 }}>
            PDF &nbsp;&middot;&nbsp; DOCX &nbsp;&middot;&nbsp; TXT
          </div>

          {/* Social proof counter */}
          <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 20 : 32, marginTop: 24, flexWrap: "wrap" }}>
            {[
              { n: "12,000+", label: "CVs Analyzed" },
              { n: "4,800+",  label: "Matches Found" },
              { n: "98%",     label: "Satisfaction" },
            ].map(({ n, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.espresso, letterSpacing: "-0.02em" }}>{n}</p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Upload card — solid white over cream page bg ── */}
        <div style={{ ...S.card, padding: isMobile ? "24px 18px" : "36px 32px" }} className="fade-in">

          <div
            style={{ ...S.dropZone(dragActive), padding: isMobile ? "36px 20px 28px" : "52px 32px 44px" }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={onChooseFile}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Click or drag to upload your CV (PDF, Word, or Text file)"
          >
            <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 16 }}>
              {dragActive ? "📂" : "📤"}
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.espresso, margin: 0, letterSpacing: "-0.02em" }}>
              {dragActive ? "Drop your CV here" : "Drag & drop your CV"}
            </h2>
            <p style={{ fontSize: 14, color: C.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
              or click to browse files
            </p>
            <div style={{ display: "inline-flex", marginTop: 18, padding: "5px 16px", borderRadius: 99, border: `1px solid ${C.border}`, fontSize: 11, color: C.muted, letterSpacing: "0.08em", gap: 6 }}>
              PDF &nbsp;&middot;&nbsp; DOCX &nbsp;&middot;&nbsp; TXT
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={handleFileInput}
              style={{ display: "none" }}
              aria-hidden="true"
            />
          </div>

          {/* File selected */}
          {fileName && (
            <div style={S.fileBar} className="fade-in">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p style={S.fileBarText}>{fileName}</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={S.panelBase("#F0FDF4", "#86EFAC")} className="fade-in" role="status" aria-live="polite">
              <div style={S.panelRow}>
                <span className="spinner" style={{ marginTop: 3 }} />
                <div>
                  <p style={S.panelTitle("#065F46")}>Analyzing your CV…</p>
                  <p style={S.panelMsg("#047857")}>
                    Extracting skills, experience, and education. This takes a few seconds.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div style={S.panelBase("#FEF2F2", "#FCA5A5")} className="fade-in" role="alert" aria-live="assertive">
              <div style={S.panelRow}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <div>
                  <p style={S.panelTitle("#991B1B")}>Something went wrong</p>
                  <p style={S.panelMsg("#DC2626")}>{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success */}
          {profile && !loading && (
            <div style={S.panelBase("#F0FDF4", "#86EFAC")} className="fade-in" role="status" aria-live="polite">
              <div style={S.panelRow}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div style={{ flex: 1 }}>
                  <p style={S.panelTitle("#065F46")}>CV Analyzed — {profile.primaryDomain}</p>
                  <p style={S.panelMsg("#047857")}>
                    {profile.skills.length} skills detected · {profile.experienceYears} yrs experience · {profile.educationLevel}
                  </p>
                  <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", backgroundColor: "#DCFCE7", borderRadius: 99, border: "1px solid #86EFAC" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#15803D" }}>
                      CV Score: {Math.min(100, Math.round(
                        Math.min(30, profile.experienceYears * 3) +
                        Math.min(40, profile.skills.length * 4) +
                        (profile.educationLevel?.toLowerCase().includes("master") || profile.educationLevel?.toLowerCase().includes("phd") ? 20 :
                         profile.educationLevel?.toLowerCase().includes("bachelor") ? 15 : 10) +
                        (profile.bio ? 10 : 0)
                      ))}/100
                    </span>
                    <span style={{ fontSize: 11, color: "#16A34A" }}>✦ AI Rating</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Privacy note */}
          {!loading && !profile && (
            <div style={S.privacyNote}>
              <p style={S.privacyText}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6, color: C.muted }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Your CV is processed securely. We do not store your personal data.
              </p>
            </div>
          )}
        </div>

        {/* Analytics Dashboard — shown after CV is parsed */}
        {profile && !loading && (
          <AnalyticsDashboard
            profile={profile}
            skillGaps={skillGaps}
            onViewRecommendations={() => router.push("/recommendations")}
          />
        )}

        {/* Steps + Testimonials — hidden after upload */}
        {!profile && (
          <>
            <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
              {[
                { step: "1", emoji: "📤", title: "Upload CV",    desc: "Upload your PDF, Word, or text file" },
                { step: "2", emoji: "🤖", title: "AI Analysis",  desc: "We extract your skills & experience" },
                { step: "3", emoji: "🎯", title: "Get Matches",  desc: "See jobs & scholarships for you" },
              ].map(({ step, emoji, title, desc }) => (
                <div
                  key={step}
                  style={{
                    backgroundColor: C.white,
                    borderRadius: 20,
                    padding: "22px 16px 20px",
                    border: `1px solid ${C.border}`,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 32, lineHeight: 1 }}>{emoji}</div>
                  <div style={{
                    backgroundColor: C.espresso, color: C.cream,
                    borderRadius: "50%", width: 22, height: 22,
                    fontSize: 12, fontWeight: 700, lineHeight: "22px",
                  }}>
                    {step}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.espresso }}>{title}</p>
                  <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{desc}</p>
                </div>
              ))}
            </div>

            {/* Testimonials */}
            <div style={{ marginTop: 36 }}>
              <p style={{ margin: "0 0 16px", fontSize: 10, fontWeight: 700, color: C.gold, textAlign: "center", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                What people say
              </p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { name: "Sara K.",   role: "Software Engineer", text: "Got shortlisted at 3 companies within a week!" },
                  { name: "Ahmed R.",  role: "MBA Graduate",      text: "Found a fully-funded scholarship I never knew about." },
                  { name: "Zainab M.", role: "Data Analyst",      text: "The AI cover letter saved me hours of work." },
                ].map(({ name, role, text }) => (
                  <div key={name} style={{
                    backgroundColor: C.white, borderRadius: 16,
                    padding: "18px 16px", border: `1px solid ${C.border}`,
                  }}>
                    <p style={{ margin: "0 0 10px", fontSize: 13, color: C.espresso, lineHeight: 1.6, fontStyle: "italic" }}>"{text}"</p>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.espresso }}>{name}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: C.muted }}>{role}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </main>

      {/* Footer — ultra-minimal */}
      <footer style={S.footer}>
        &copy; {new Date().getFullYear()} CV Matcher &nbsp;&middot;&nbsp; Privacy &nbsp;&middot;&nbsp; Automated Globally
      </footer>
    </div>
  );
}
