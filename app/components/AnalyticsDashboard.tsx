"use client";

import { useEffect, useRef, useState } from "react";

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

interface Props {
  profile: ParsedCV;
  skillGaps: SkillGap[];
  onViewRecommendations: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcProfileScore(p: ParsedCV): number {
  let s = 0;
  s += Math.min(p.skills.length * 3.5, 35);
  const exp = p.experienceYears;
  if (exp >= 10) s += 30;
  else if (exp >= 5) s += 24;
  else if (exp >= 3) s += 18;
  else if (exp >= 1) s += 12;
  else s += 5;
  const edu = p.educationLevel.toLowerCase();
  if (edu.includes("phd") || edu.includes("doctor")) s += 25;
  else if (edu.includes("master") || edu.includes("mba") || edu.includes("msc") || edu.includes("ms ")) s += 20;
  else if (edu.includes("bachelor") || edu.includes("mbbs") || edu.includes("bsc") || edu.includes("beng") || edu.includes("be ")) s += 16;
  else if (edu.includes("diploma") || edu.includes("associate")) s += 12;
  else if (edu.length > 4) s += 8;
  if (p.bio) s += 10;
  return Math.min(100, Math.round(s));
}

function getRegionalDemand(domain: string) {
  const d = domain.toLowerCase();
  if (d.includes("software") || d.includes("tech") || d.includes("it") || d.includes("data") || d.includes("ai") || d.includes("program")) {
    return { pakistan: 82, eu: 94, middleEast: 88 };
  }
  if (d.includes("medic") || d.includes("health") || d.includes("doctor") || d.includes("clinical") || d.includes("pharma") || d.includes("nurs") || d.includes("mbbs")) {
    return { pakistan: 88, eu: 76, middleEast: 96 };
  }
  if (d.includes("engineer") || d.includes("mechanic") || d.includes("civil") || d.includes("electr") || d.includes("chemical")) {
    return { pakistan: 78, eu: 87, middleEast: 93 };
  }
  if (d.includes("financ") || d.includes("account") || d.includes("banking") || d.includes("econom")) {
    return { pakistan: 74, eu: 86, middleEast: 90 };
  }
  if (d.includes("market") || d.includes("brand") || d.includes("advertis") || d.includes("digital")) {
    return { pakistan: 70, eu: 83, middleEast: 79 };
  }
  if (d.includes("educat") || d.includes("teach") || d.includes("academ") || d.includes("lectur")) {
    return { pakistan: 73, eu: 75, middleEast: 82 };
  }
  if (d.includes("law") || d.includes("legal") || d.includes("advocate")) {
    return { pakistan: 66, eu: 79, middleEast: 73 };
  }
  if (d.includes("psychol") || d.includes("counsel")) {
    return { pakistan: 58, eu: 84, middleEast: 68 };
  }
  if (d.includes("human resource") || d.includes(" hr") || d.includes("recruit")) {
    return { pakistan: 72, eu: 81, middleEast: 86 };
  }
  if (d.includes("design") || d.includes("ux") || d.includes("graphic") || d.includes("architect")) {
    return { pakistan: 68, eu: 89, middleEast: 77 };
  }
  return { pakistan: 67, eu: 78, middleEast: 74 };
}

// ── Animated counter ──────────────────────────────────────────────────────────
function useAnimatedValue(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(id); }
      else setValue(Math.round(start));
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return value;
}

// ── Demand bar ────────────────────────────────────────────────────────────────
function DemandBar({ label, flag, score, delay }: { label: string; flag: string; score: number; delay: number }) {
  const [width, setWidth] = useState(0);
  const animated = useAnimatedValue(score, 1000);

  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);

  const color = score >= 85 ? "#059669" : score >= 70 ? "#5B50F0" : "#64748B";

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1E1B4B", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{flag}</span> {label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>
          {animated}<span style={{ fontSize: 11, color: "#64748B" }}>/100</span>
        </span>
      </div>
      <div style={{ height: 10, backgroundColor: "#E2E1F5", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${width}%`,
          borderRadius: 99,
          background: `linear-gradient(90deg, #A5B4FC, #5B50F0)`,
          transition: "width 1.1s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }} />
      </div>
    </div>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const animated = useAnimatedValue(score, 1400);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(circ);

  useEffect(() => {
    const t = setTimeout(() => setDash(circ - (circ * score) / 100), 200);
    return () => clearTimeout(t);
  }, [score, circ]);

  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E2E1F5" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke="#5B50F0" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dash}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
      }}>
        <span style={{ fontSize: 30, fontWeight: 900, color: "#1E1B4B", lineHeight: 1 }}>{animated}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>Score</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalyticsDashboard({ profile, skillGaps, onViewRecommendations }: Props) {
  const score = calcProfileScore(profile);
  const demand = getRegionalDemand(profile.primaryDomain);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleShare = () => {
    const text = `🚀 Just analyzed my CV with AI!\n\n📊 AI Profile Score: ${score}/100\n✅ Verified for Remote & Global Roles\n🌍 Field: ${profile.primaryDomain}\n💼 ${profile.experienceYears} years experience | ${profile.skills.length} skills\n\n#OpenToWork #RemoteWork #CVMatcher #AI`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank");
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const glass: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(226,225,245,0.90)",
    borderRadius: 24,
    boxShadow: "0 20px 60px -20px rgba(30,27,75,0.12)",
  };

  const label: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.22em",
    color: "#64748B",
  };

  return (
    <div ref={cardRef} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 3, height: 32, background: "linear-gradient(180deg, #5B50F0, #7C3AED)", borderRadius: 2 }} />
        <div>
          <p style={{ margin: 0, ...label }}>Premium Analytics</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1E1B4B" }}>Global Demand & Skill Intelligence</p>
        </div>
      </div>

      {/* ── Row 1: Scorecard + Demand Radar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Scorecard */}
        <div style={{ ...glass, padding: "28px 24px" }}>
          <p style={{ ...label, marginBottom: 16 }}>AI Resume Scorecard</p>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <ScoreRing score={score} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#1E1B4B", lineHeight: 1.2 }}>
                AI Profile Score<br />
                <span style={{ fontSize: 32, color: "#5B50F0" }}>{score}%</span>
              </p>
              <div style={{
                marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6,
                backgroundColor: "#EEEEFF", borderRadius: 99, padding: "5px 12px",
                border: "1px solid #C7D2FE",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4ADE80", display: "inline-block" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1E1B4B" }}>Verified for Remote / Global Roles</span>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                Based on skills, experience & education depth
              </p>
            </div>
          </div>

          {/* Share button */}
          <button
            onClick={handleShare}
            style={{
              marginTop: 20, width: "100%", padding: "12px 20px",
              background: copied ? "#16A34A" : "linear-gradient(135deg, #0A66C2, #0077B5)",
              color: "#FFFFFF", border: "none", borderRadius: 12,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s", boxShadow: "0 6px 20px -6px rgba(10,102,194,0.5)",
            }}
          >
            {copied ? (
              <><span>✅</span> Copied! Paste on LinkedIn</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                Share to LinkedIn
              </>
            )}
          </button>
        </div>

        {/* Demand Radar */}
        <div style={{ ...glass, padding: "28px 24px" }}>
          <p style={{ ...label, marginBottom: 4 }}>Global Demand Radar</p>
          <p style={{ margin: "0 0 20px", fontSize: 12, color: "#64748B" }}>
            Market demand for <strong style={{ color: "#1E1B4B" }}>{profile.primaryDomain}</strong> professionals
          </p>
          <DemandBar label="Pakistan" flag="🇵🇰" score={demand.pakistan} delay={100} />
          <DemandBar label="European Union" flag="🇪🇺" score={demand.eu} delay={300} />
          <DemandBar label="Middle East" flag="🏙️" score={demand.middleEast} delay={500} />
          <div style={{ marginTop: 16, padding: "10px 14px", backgroundColor: "#F0F1FF", borderRadius: 10, border: "1px solid #E2E1F5" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>
              {demand.middleEast >= 85
                ? "🔥 Middle East has highest demand — strong opportunities in GCC countries."
                : demand.eu >= 85
                ? "🌍 European Union shows premium demand — ideal for remote international roles."
                : "📈 Your skills are in demand across all three regions globally."}
            </p>
          </div>
        </div>
      </div>

      {/* ── Row 2: Skill Gap Analysis ── */}
      <div style={{ ...glass, padding: "28px 24px" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ ...label, marginBottom: 4 }}>Skill Gap Analysis</p>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1E1B4B" }}>
            Bridge These Gaps for International Remote Work
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
            AI identified 3 high-paying skills not on your CV but highly demanded globally in your field.
          </p>
        </div>

        {skillGaps.length === 0 ? (
          <p style={{ fontSize: 14, color: "#64748B", fontStyle: "italic" }}>Skill gap data not available. Re-upload your CV for analysis.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {skillGaps.slice(0, 3).map((gap, i) => (
              <div key={i} style={{
                backgroundColor: "#F0F1FF", borderRadius: 16,
                border: "1px solid #E2E1F5", padding: "20px 18px",
                position: "relative", overflow: "hidden",
              }}>
                {/* Rank badge */}
                <div style={{
                  position: "absolute", top: 14, right: 14,
                  width: 26, height: 26, borderRadius: "50%",
                  background: "linear-gradient(135deg, #5B50F0, #7C3AED)", color: "#FFFFFF",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800
                }}>
                  {i + 1}
                </div>

                {/* Plus icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  backgroundColor: "#EEEEFF", border: "1px solid #C7D2FE",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, marginBottom: 14
                }}>
                  ✦
                </div>

                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800, color: "#1E1B4B", lineHeight: 1.3 }}>
                  {gap.skill}
                </p>
                <div style={{
                  display: "inline-block", marginBottom: 10,
                  padding: "3px 10px", background: "linear-gradient(135deg, #5B50F0, #7C3AED)",
                  borderRadius: 99,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{gap.avgSalary}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>{gap.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CTA ── */}
      <button
        onClick={onViewRecommendations}
        style={{
          width: "100%", padding: "16px 24px",
          background: "linear-gradient(135deg, #5B50F0, #7C3AED)", color: "#FFFFFF",
          border: "none", borderRadius: 16,
          fontSize: 16, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          boxShadow: "0 16px 40px -16px rgba(91,80,240,0.55)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 20px 50px -16px rgba(91,80,240,0.65)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 16px 40px -16px rgba(91,80,240,0.55)";
        }}
      >
        View My Personalized Jobs & Scholarships
        <span style={{ fontSize: 18 }}>→</span>
      </button>
    </div>
  );
}
