"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

type ParsedCV = {
  primaryDomain:   string;
  skills:          string[];
  experienceYears: number;
  educationLevel:  string;
  bio:             string;
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
};

type Scholarship = {
  id:          string;
  title:       string;
  university:  string;
  country:     string;
  amount:      string;
  description: string;
  matchScore:  number;
};

type ModalState = {
  open:        boolean;
  letter:      string;
  jobTitle:    string;
  company:     string;
  loading:     boolean;
  error:       string;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  espresso:  "#2C221E",
  cream:     "#FFFFFF",  /* pure white page bg */
  muted:     "#6B5A50",  /* was #8C7A6B (3.7:1 — fail) → now ~6.9:1 — AAA ✓ */
  border:    "#E6DFD5",
  gold:      "#7A6350",  /* was #B99D82 (2.6:1 — fail) → now ~5.5:1 — AA ✓ */
  darkBtn:   "#2C221E",
  white:     "#FFFFFF",
  green:     "#15803D",
  greenBg:   "#F0FDF4",
  greenBdr:  "#86EFAC",
  amber:     "#B45309",
  amberBg:   "#FFFBEB",
  amberBdr:  "#FCD34D",
  red:       "#BE123C",
  redBg:     "#FFF1F2",
  redBdr:    "#FDA4AF",
};

// ── Language strings ──────────────────────────────────────────────────────────
const L = {
  en: {
    back: "← Upload New CV",
    jobsTab: "Job Opportunities", scholTab: "Scholarships",
    save: "Save", saved: "Saved ✓",
    remoteOnly: "Remote Only",
    tips: "Interview Tips",
    coverLetter: "Generate Cover Letter",
    notApplied: "Not Applied", applied: "Applied ✓",
    shortlisted: "Shortlisted 🌟", rejected: "Rejected",
    status: "Status", deadline: "Deadline",
    noJobs: "No job results found", noScholarships: "No scholarship results found",
    retry: "Re-upload your CV and try again.",
  },
  ur: {
    back: "← نئی CV اپلوڈ کریں",
    jobsTab: "نوکری کے مواقع", scholTab: "اسکالرشپ",
    save: "محفوظ", saved: "محفوظ ✓",
    remoteOnly: "ریموٹ صرف",
    tips: "انٹرویو ٹپس",
    coverLetter: "کور لیٹر بنائیں",
    notApplied: "نہیں دی", applied: "درخواست دی ✓",
    shortlisted: "شارٹ لسٹ 🌟", rejected: "مسترد",
    status: "حالت", deadline: "آخری تاریخ",
    noJobs: "کوئی نوکری نہیں ملی", noScholarships: "کوئی اسکالرشپ نہیں ملی",
    retry: "CV دوبارہ اپلوڈ کریں۔",
  },
} as const;
type Lang = keyof typeof L;

// ── Score helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return { bg: C.greenBg, text: C.green, border: C.greenBdr };
  if (score >= 45) return { bg: C.amberBg, text: C.amber, border: C.amberBdr };
  return              { bg: C.redBg,   text: C.red,   border: C.redBdr   };
}

function scoreLabel(score: number) {
  if (score >= 75) return "Great Match";
  if (score >= 45) return "Good Match";
  return "Possible Match";
}

// ── Upgrade Modal ────────────────────────────────────────────────────────────

const ACCOUNTS = [
  { bank: "JS Bank",  iban: "PK57JSBL9999903259874601", bg: "#EFF6FF", icon: "🏦" },
  { bank: "JazzCash", iban: "PK54JCMA1012923259874601", bg: "#FFFDE7", icon: "💛" },
] as const;

function UpgradeModal({ onClose, onUnlock }: { onClose: () => void; onUnlock: () => void }) {
  const [copied, setCopied]     = useState<string | null>(null);
  const [pin, setPin]           = useState("");
  const [pinError, setPinError] = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const copyIBAN = (iban: string) => {
    navigator.clipboard.writeText(iban);
    setCopied(iban);
    setTimeout(() => setCopied(null), 2200);
  };

  const handleActivate = async () => {
    if (!pin.trim()) { setPinError("Please enter the PIN you received."); return; }
    setLoading(true);
    setPinError("");
    try {
      const res  = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (data.success) {
        localStorage.setItem("cv_premium", "1");
        onUnlock();
      } else {
        setPinError(data.error ?? "Incorrect PIN.");
      }
    } catch {
      setPinError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        backgroundColor: "rgba(44,34,30,0.78)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          backgroundColor: C.cream, borderRadius: 28,
          border: `1px solid ${C.border}`,
          boxShadow: "0 40px 100px -20px rgba(44,34,30,0.6)",
          overflow: "hidden",
          animation: "modalSlideUp 0.3s cubic-bezier(0.34,1.2,0.64,1) both",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: "22px 26px 18px", backgroundColor: C.white,
          borderBottom: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>✦</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.gold, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Premium Upgrade
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.espresso }}>
              Unlock AI Cover Letters
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>
              One-time payment of <strong style={{ color: C.espresso }}>280 PKR</strong> — lifetime access
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 34, height: 34, borderRadius: "50%",
            border: `1px solid ${C.border}`, backgroundColor: C.cream,
            fontSize: 18, cursor: "pointer", color: C.muted,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "24px 26px 28px" }}>

          {/* What you get */}
          <div style={{ marginBottom: 20 }}>
            {[
              "Unlimited AI Cover Letters",
              "All job & scholarship insights",
              "Lifetime access — no subscription",
            ].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: C.green }}>✦</span>
                <span style={{ fontSize: 13, color: C.espresso, fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#374151", lineHeight: 1.75 }}>
            Transfer <strong>280 PKR</strong> to either account below, then confirm below to unlock instantly — no proof required.
          </p>

          {/* IBAN cards */}
          {ACCOUNTS.map(({ bank, iban, bg, icon }) => (
            <div key={iban} style={{
              padding: "14px 16px", borderRadius: 14,
              border: `1.5px solid ${C.border}`, backgroundColor: bg,
              marginBottom: 12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {icon} {bank}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 800, color: C.espresso, letterSpacing: "0.04em", wordBreak: "break-all" as const }}>
                    {iban}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: C.muted }}>Amount: 280 PKR</p>
                </div>
                <button
                  onClick={() => copyIBAN(iban)}
                  style={{
                    flexShrink: 0, padding: "7px 14px", borderRadius: 9,
                    border: `1px solid ${C.border}`, backgroundColor: C.white,
                    fontSize: 12, fontWeight: 700,
                    color: copied === iban ? C.green : C.muted,
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                >
                  {copied === iban ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          ))}

          {/* WhatsApp instruction */}
          <div style={{
            margin: "18px 0 16px", padding: "13px 16px", borderRadius: 12,
            backgroundColor: "#F0FDF4", border: `1px solid ${C.greenBdr}`,
          }}>
            <p style={{ margin: 0, fontSize: 13, color: "#065F46", lineHeight: 1.65 }}>
              After transferring, WhatsApp us at{" "}
              <strong>+92 325 9874601</strong> with your name — we will send you a 4-digit PIN.
            </p>
          </div>

          {/* PIN input */}
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={e => { setPin(e.target.value); setPinError(""); }}
            onKeyDown={e => e.key === "Enter" && handleActivate()}
            placeholder="Enter PIN (e.g. 2801)"
            style={{
              width: "100%", padding: "13px 16px", boxSizing: "border-box" as const,
              border: `1.5px solid ${pinError ? "#FDA4AF" : C.border}`, borderRadius: 12,
              fontSize: 16, fontWeight: 800, color: C.espresso, backgroundColor: C.white,
              outline: "none", letterSpacing: "0.2em", textAlign: "center",
              marginBottom: 4,
            }}
          />
          {pinError && (
            <p style={{ margin: "6px 0 10px", fontSize: 12, color: "#DC2626" }}>{pinError}</p>
          )}

          {/* Activate button */}
          <button
            onClick={handleActivate}
            disabled={loading || !pin.trim()}
            style={{
              width: "100%", marginTop: 10, padding: "15px 20px",
              backgroundColor: (loading || !pin.trim()) ? "#D4C5B9" : C.espresso,
              color: C.cream, border: "none", borderRadius: 14,
              fontSize: 15, fontWeight: 800,
              cursor: (loading || !pin.trim()) ? "not-allowed" : "pointer",
              boxShadow: (!loading && pin.trim()) ? "0 10px 28px -6px rgba(44,34,30,0.45)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.2s",
              letterSpacing: "0.01em",
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.35)",
                  borderTopColor: "#fff", borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }} />
                Verifying…
              </>
            ) : "✦ Activate Premium"}
          </button>

          <p style={{ margin: "12px 0 0", fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.6 }}>
            PIN verified server-side &nbsp;·&nbsp; Instant activation &nbsp;·&nbsp; Lifetime access
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Cover Letter Modal ───────────────────────────────────────────────────────

function CoverLetterModal({
  state,
  onClose,
  isPremium,
  onUpgrade,
}: {
  state:     ModalState;
  onClose:   () => void;
  isPremium: boolean;
  onUpgrade: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while modal open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(state.letter).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2800);
    });
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "rgba(44,34,30,0.70)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680,
          maxHeight: "88vh",
          backgroundColor: C.cream,
          borderRadius: 28,
          border: `1px solid ${C.border}`,
          boxShadow: "0 40px 100px -20px rgba(44,34,30,0.55)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Modal header ── */}
        <div style={{
          padding: "22px 28px 18px",
          borderBottom: `1px solid ${C.border}`,
          backgroundColor: C.white,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            {/* Premium badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>✦</span>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.22em",
                textTransform: "uppercase", color: C.muted,
              }}>AI Cover Letter</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.espresso, lineHeight: 1.3 }}>
              {state.jobTitle}
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 14, color: C.muted }}>{state.company}</p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              flexShrink: 0, width: 36, height: 36,
              borderRadius: "50%", border: `1px solid ${C.border}`,
              backgroundColor: C.cream, color: C.muted,
              fontSize: 18, cursor: "pointer", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.espresso;
              (e.currentTarget as HTMLButtonElement).style.color = C.cream;
              (e.currentTarget as HTMLButtonElement).style.borderColor = C.espresso;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.cream;
              (e.currentTarget as HTMLButtonElement).style.color = C.muted;
              (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
            }}
          >
            ×
          </button>
        </div>

        {/* ── Modal body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {state.loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "40px 0" }}>
              {/* Pulsing quill icon */}
              <div style={{ fontSize: 40, animation: "pulse-subtle 1.5s ease infinite" }}>✍️</div>
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.espresso, textAlign: "center" }}>
                  Crafting your cover letter…
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: C.muted, textAlign: "center" }}>
                  Tailoring to {state.company}'s requirements
                </p>
              </div>
              {/* Animated dots */}
              <div style={{ display: "flex", gap: 8 }}>
                {[0, 150, 300].map(delay => (
                  <div key={delay} style={{
                    width: 8, height: 8, borderRadius: "50%",
                    backgroundColor: C.gold,
                    animation: `pulse-subtle 1.2s ease ${delay}ms infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {state.error && !state.loading && (
            <div style={{
              padding: "20px", borderRadius: 14,
              backgroundColor: C.redBg, border: `1.5px solid ${C.redBdr}`,
            }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#991B1B" }}>Generation failed</p>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "#DC2626" }}>{state.error}</p>
            </div>
          )}

          {state.letter && !state.loading && (
            <>
              {/* Decorative top rule */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
                <div style={{ flex: 1, height: 1, backgroundColor: C.border }} />
                <span style={{ fontSize: 12, color: C.gold, fontWeight: 600, letterSpacing: "0.1em" }}>
                  READY TO SEND
                </span>
                <div style={{ flex: 1, height: 1, backgroundColor: C.border }} />
              </div>

              {/* Letter text + paywall */}
              <div style={{ position: "relative" }}>
                <textarea
                  ref={textRef}
                  readOnly
                  value={state.letter}
                  style={{
                    width: "100%",
                    minHeight: 340,
                    resize: "vertical",
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: "22px 24px",
                    fontSize: 15,
                    lineHeight: 1.9,
                    color: C.espresso,
                    backgroundColor: C.white,
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    outline: "none",
                    boxSizing: "border-box",
                    boxShadow: "inset 0 2px 8px rgba(44,34,30,0.05)",
                    filter: isPremium ? "none" : "blur(5px)",
                    userSelect: isPremium ? "auto" : "none",
                    pointerEvents: isPremium ? "auto" : "none",
                  }}
                  onClick={e => (e.target as HTMLTextAreaElement).select()}
                />

                {/* Premium paywall overlay */}
                {!isPremium && (
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: 14,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backgroundColor: "rgba(250,249,246,0.50)",
                    backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
                  }}>
                    <div style={{
                      backgroundColor: C.white, border: `1px solid ${C.border}`,
                      borderRadius: 20, padding: "28px 28px 24px",
                      maxWidth: 360, width: "90%", textAlign: "center",
                      boxShadow: "0 24px 64px -12px rgba(44,34,30,0.22)",
                    }}>
                      <p style={{ margin: "0 0 10px", fontSize: 28, lineHeight: 1 }}>🚀</p>
                      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: C.espresso, lineHeight: 1.4 }}>
                        Unlock Unlimited AI Cover Letters &amp; Premium Global Insights
                      </h3>
                      <p style={{ margin: "0 0 20px", fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
                        for just{" "}
                        <strong style={{ color: C.espresso }}>280 PKR</strong>
                        {" "}— one-time, lifetime access
                      </p>
                      <button
                        style={{
                          width: "100%", padding: "12px 20px",
                          backgroundColor: C.espresso, color: C.cream,
                          border: "none", borderRadius: 12,
                          fontSize: 14, fontWeight: 700, cursor: "pointer",
                          boxShadow: "0 8px 24px -6px rgba(44,34,30,0.38)",
                          transition: "opacity 0.18s",
                        }}
                        onClick={onUpgrade}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                      >
                        Upgrade to Premium Now
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isPremium && (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: C.muted }}>
                  💡 Click inside the letter to select all · Edit freely before copying
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Modal footer ── */}
        {!state.loading && (
          <div style={{
            padding: "18px 28px",
            borderTop: `1px solid ${C.border}`,
            backgroundColor: C.white,
            display: "flex", gap: 12, justifyContent: "flex-end",
            flexWrap: "wrap",
          }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 22px",
                border: `1.5px solid ${C.border}`,
                borderRadius: 10,
                backgroundColor: "transparent",
                color: C.muted,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.espresso; (e.currentTarget as HTMLButtonElement).style.color = C.espresso; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}
            >
              Close
            </button>

            {state.letter && isPremium && (
              <button
                onClick={handleCopy}
                style={{
                  padding: "10px 26px",
                  border: "none", borderRadius: 10,
                  backgroundColor: copied ? "#16A34A" : C.espresso,
                  color: C.cream,
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: copied
                    ? "0 6px 20px -6px rgba(22,163,74,0.5)"
                    : "0 6px 20px -6px rgba(44,34,30,0.45)",
                  transition: "all 0.2s",
                }}
              >
                {copied ? (
                  <><span>✓</span> Copied!</>
                ) : (
                  <><span style={{ fontSize: 16 }}>⎘</span> Copy to Clipboard</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Responsive hook ───────────────────────────────────────────────────────────
function useIsMobile(bp = 640) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    fn();
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return m;
}

// ── Main page ────────────────────────────────────────────────────────────────

function RecommendationsContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const isMobile     = useIsMobile();
  const [cv, setCv]                     = useState<ParsedCV | null>(null);
  const [countryFilter, setCountryFilter] = useState("all");
  const [jobs, setJobs]                 = useState<Job[]>([]);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [activeTab, setActiveTab]       = useState<"jobs" | "scholarships">("jobs");
  const [modal, setModal]               = useState<ModalState>({
    open: false, letter: "", jobTitle: "", company: "", loading: false, error: "",
  });

  // ── Premium state ────────────────────────────────────────────────────────────
  const [isPremium, setIsPremium]   = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cv_premium") === "1";
  });
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // ── New feature state ────────────────────────────────────────────────────────
  const [lang, setLang]             = useState<Lang>("en");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [savedJobs, setSavedJobs]   = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try { return new Set<string>(JSON.parse(localStorage.getItem("cv_saved") ?? "[]")); }
    catch { return new Set<string>(); }
  });
  const [statuses, setStatuses]     = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("cv_statuses") ?? "{}") as Record<string, string>; }
    catch { return {}; }
  });
  const [tipsOpen, setTipsOpen]     = useState<Set<string>>(new Set());

  useEffect(() => {
    const raw = sessionStorage.getItem("cv_data");
    if (!raw) { router.push("/upload-cv"); return; }
    try {
      const data = JSON.parse(raw) as {
        profile: ParsedCV; jobs: Job[]; scholarships: Scholarship[];
      };
      setCv(data.profile);
      setJobs(data.jobs ?? []);
      setScholarships(data.scholarships ?? []);
    } catch {
      router.push("/upload-cv");
    }
  }, [router]);

  // ── Handle Stripe success redirect (?success=true&session_id=...) ─────────────
  useEffect(() => {
    const success   = searchParams.get("success");
    const sessionId = searchParams.get("session_id");
    if (success !== "true" || !sessionId) return;

    // Verify the session server-side so it can't be spoofed by manually adding ?success=true
    fetch(`/api/verify-payment?session_id=${sessionId}`)
      .then(r => r.json())
      .then((data: { success: boolean }) => {
        if (data.success) {
          localStorage.setItem("cv_premium", "1");
          setIsPremium(true);
        }
      })
      .catch(() => { /* silent — user still lands on page */ })
      .finally(() => {
        // Clean the URL so a refresh doesn't re-trigger verification
        router.replace("/recommendations", { scroll: false });
      });
  }, [searchParams, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cover letter generation ────────────────────────────────────────────────
  const generateCoverLetter = useCallback(async (job: Job) => {
    if (!cv) return;

    setModal({
      open: true, loading: true, letter: "", error: "",
      jobTitle: job.title, company: job.company,
    });

    try {
      const res = await fetch("/api/generate-cover-letter", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ profile: cv, job }),
      });

      const data = (await res.json()) as { success?: boolean; coverLetter?: string; error?: string };

      if (!res.ok || !data.coverLetter) {
        throw new Error(data.error ?? "Generation failed. Please try again.");
      }

      setModal(prev => ({ ...prev, loading: false, letter: data.coverLetter! }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setModal(prev => ({ ...prev, loading: false, error: msg }));
    }
  }, [cv]);

  const closeModal = useCallback(() => {
    setModal({ open: false, letter: "", jobTitle: "", company: "", loading: false, error: "" });
  }, []);

  if (!cv) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.cream }}>
        <p style={{ fontSize: 18, color: C.muted }}>Loading your results…</p>
      </div>
    );
  }

  // ── Feature helpers ─────────────────────────────────────────────────────────
  const t = L[lang];

  const toggleSave = (id: string) => setSavedJobs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    localStorage.setItem("cv_saved", JSON.stringify([...next]));
    return next;
  });

  const setJobStatus = (id: string, val: string) => setStatuses(prev => {
    const next = { ...prev, [id]: val };
    localStorage.setItem("cv_statuses", JSON.stringify(next));
    return next;
  });

  const toggleTips = (id: string) => setTipsOpen(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toPKR = (salary: string) => {
    const m = salary.match(/([\d,.]+)\s*k?/i);
    if (!m) return salary;
    const n = parseFloat(m[1].replace(/,/g, "")) * (salary.toLowerCase().includes("k") ? 1000 : 1);
    return `${salary}  ·  PKR ${Math.round(n * 280).toLocaleString()}`;
  };

  const getDeadline = (id: string) => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[id.charCodeAt(0) % 12]} ${(id.charCodeAt(1) % 20) + 8}, 2025`;
  };

  const interviewTips = (title: string) => [
    `Walk me through a project where you applied ${title.split(" ")[0]} skills end-to-end.`,
    "Describe a time you solved a difficult problem under pressure.",
    "Why are you specifically interested in this role and company?",
  ];

  const baseJobs = remoteOnly
    ? jobs.filter(j => j.location.toLowerCase().includes("remote") || j.location.toLowerCase().includes("anywhere"))
    : jobs;

  const displayJobs = countryFilter === "all"
    ? baseJobs
    : baseJobs.filter(j => j.location.toLowerCase().includes(countryFilter.toLowerCase()));

  const displayScholarships = countryFilter === "all"
    ? scholarships
    : scholarships.filter(s => s.country.toLowerCase().includes(countryFilter.toLowerCase()));

  const allLocations = [...new Set([
    ...jobs.map(j => j.location.split(",").slice(-1)[0]?.trim() ?? j.location),
    ...scholarships.map(s => s.country),
  ])].filter(Boolean).sort();

  // ── Tab button ────────────────────────────────────────────────────────────
  const tabBtn = (label: string, count: number, tab: "jobs" | "scholarships", icon: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      style={{
        padding: isMobile ? "10px 12px" : "14px 20px", fontSize: isMobile ? 13 : 16,
        fontWeight:  activeTab === tab ? 700 : 500,
        color:       activeTab === tab ? C.espresso : C.muted,
        backgroundColor: "transparent",
        border: "none",
        borderBottom: `3px solid ${activeTab === tab ? C.espresso : "transparent"}`,
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8,
        transition: "all 0.3s ease-out",
        whiteSpace: "nowrap" as const,
      }}
    >
      <span>{icon}</span><span>{label}</span>
      <span style={{
        backgroundColor: activeTab === tab ? C.espresso : "#E8DED4",
        color:           activeTab === tab ? C.cream   : C.muted,
        borderRadius: 20, padding: "1px 9px", fontSize: 13, fontWeight: 700,
      }}>
        {count}
      </span>
    </button>
  );

  // ── Score badge ───────────────────────────────────────────────────────────
  const scoreBadge = (score: number) => {
    const sc = scoreColor(score);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: isMobile ? 76 : 96 }}>
        <div style={{
          width: isMobile ? 70 : 88, height: isMobile ? 70 : 88, borderRadius: "50%",
          backgroundColor: sc.bg, border: `3px solid ${sc.border}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, color: sc.text, lineHeight: 1 }}>{score}%</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: sc.text, marginTop: 2 }}>Match</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: sc.text, textAlign: "center" }}>
          {scoreLabel(score)}
        </span>
      </div>
    );
  };

  // ── Job card ──────────────────────────────────────────────────────────────
  const JobCard = ({ job }: { job: Job }) => {
    const isSaved   = savedJobs.has(job.id);
    const jobStatus = statuses[job.id] ?? "none";
    const showTips  = tipsOpen.has(job.id);
    const tips      = interviewTips(job.title);

    const statusColors: Record<string, { color: string; bg: string; border: string }> = {
      applied:     { color: C.green, bg: C.greenBg, border: C.greenBdr },
      shortlisted: { color: C.amber, bg: C.amberBg, border: C.amberBdr },
      rejected:    { color: C.red,   bg: C.redBg,   border: C.redBdr   },
      none:        { color: C.muted, bg: "transparent", border: C.border },
    };
    const sc = statusColors[jobStatus] ?? statusColors.none;

    return (
      <div className="fade-in" style={{
        backgroundColor: "#F9F7F4",
        borderRadius: 24,
        border: `1px solid ${C.border}`,
        padding: isMobile ? "18px 16px" : "28px 28px",
        display: "flex", gap: isMobile ? 14 : 22, alignItems: "flex-start", flexWrap: "wrap",
        transition: "border-color 0.3s ease-out",
      }}>
        {/* Left — job details */}
        <div style={{ flex: "1 1 300px", minWidth: 0 }}>

          {/* Title row + Save button */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.espresso }}>{job.title}</h2>
            <button
              onClick={() => toggleSave(job.id)}
              style={{
                flexShrink: 0, padding: "4px 12px", borderRadius: 99,
                border: `1.5px solid ${isSaved ? C.espresso : C.border}`,
                backgroundColor: isSaved ? C.espresso : "transparent",
                color: isSaved ? C.cream : C.muted,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.2s ease-out", whiteSpace: "nowrap" as const,
              }}
            >
              {isSaved ? `🔖 ${t.saved}` : `🔖 ${t.save}`}
            </button>
          </div>

          <p style={{ margin: "5px 0 0", fontSize: 14, color: C.muted, fontWeight: 500 }}>
            🏢 {job.company}&nbsp;&nbsp;·&nbsp;&nbsp;📍 {job.location}
          </p>

          {/* Application status tracker */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{t.status}:</span>
            <select
              value={jobStatus}
              onChange={e => setJobStatus(job.id, e.target.value)}
              style={{
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${sc.border}`, borderRadius: 8,
                padding: "3px 8px", outline: "none",
                color: sc.color, backgroundColor: sc.bg,
              }}
            >
              <option value="none">{t.notApplied}</option>
              <option value="applied">{t.applied}</option>
              <option value="shortlisted">{t.shortlisted}</option>
              <option value="rejected">{t.rejected}</option>
            </select>
          </div>

          <p style={{ margin: "12px 0 0", fontSize: 14, color: "#374151", lineHeight: 1.65 }}>
            {job.description}
          </p>

          {job.salary && (
            <div style={{ marginTop: 12 }}>
              <span style={{
                display: "inline-block", padding: "4px 14px",
                backgroundColor: "#F0FDF4", color: C.green,
                border: `1px solid ${C.greenBdr}`, borderRadius: 99,
                fontSize: 13, fontWeight: 700,
              }}>
                💰 {toPKR(job.salary)}
              </span>
            </div>
          )}

          {/* Required skills with match highlight */}
          {job.requiredSkills?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Required Skills
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {job.requiredSkills.map(skill => {
                  const matched = cv.skills.some(s =>
                    s.toLowerCase().includes(skill.toLowerCase()) ||
                    skill.toLowerCase().includes(s.toLowerCase())
                  );
                  return (
                    <span key={skill} style={{
                      padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                      backgroundColor: matched ? "#EDE8E3" : "#F4F4F5",
                      color:           matched ? C.espresso : "#71717A",
                      border: `1px solid ${matched ? C.border : "#E4E4E7"}`,
                    }}>
                      {matched && "✓ "}{skill}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <button
              onClick={() => generateCoverLetter(job)}
              style={{
                padding: "10px 20px",
                backgroundColor: "transparent",
                border: `1.5px solid ${C.espresso}`,
                borderRadius: 99,
                color: C.espresso,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
                transition: "all 0.3s ease-out",
                letterSpacing: "0.03em",
              }}
              onMouseEnter={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.backgroundColor = C.espresso;
                b.style.color = C.cream;
              }}
              onMouseLeave={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.backgroundColor = "transparent";
                b.style.color = C.espresso;
              }}
            >
              <span style={{ fontSize: 16 }}>✍️</span>
              {t.coverLetter}
            </button>

            <button
              onClick={() => toggleTips(job.id)}
              style={{
                padding: "10px 20px",
                backgroundColor: showTips ? C.espresso : "transparent",
                border: `1.5px solid ${showTips ? C.espresso : C.border}`,
                borderRadius: 99,
                color: showTips ? C.cream : C.muted,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
                transition: "all 0.2s ease-out",
              }}
            >
              💡 {t.tips}
            </button>
          </div>

          {/* Interview tips expandable */}
          {showTips && (
            <div style={{
              marginTop: 14, padding: "16px 18px", borderRadius: 14,
              backgroundColor: C.amberBg, border: `1px solid ${C.amberBdr}`,
            }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                💡 Common Interview Questions
              </p>
              {tips.map((tip, i) => (
                <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0", fontSize: 13, color: "#78350F", lineHeight: 1.65 }}>
                  {i + 1}. {tip}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Right — score + external links */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: isMobile ? 86 : 108 }}>
          {scoreBadge(job.matchScore ?? 75)}

          <a
            href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(job.title)}&location=${encodeURIComponent(job.location)}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "block", width: "100%", padding: "9px 10px",
              backgroundColor: "#0A66C2", color: C.white,
              borderRadius: 10, fontSize: 12, fontWeight: 700,
              textAlign: "center", textDecoration: "none",
            }}
          >
            🔗 LinkedIn
          </a>
          <a
            href={`https://www.indeed.com/jobs?q=${encodeURIComponent(job.title)}&l=${encodeURIComponent(job.location)}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "block", width: "100%", padding: "9px 10px",
              backgroundColor: C.darkBtn, color: C.white,
              borderRadius: 10, fontSize: 12, fontWeight: 700,
              textAlign: "center", textDecoration: "none",
            }}
          >
            🔍 Indeed
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`🎯 Job Match!\n\n${job.title} at ${job.company}\n📍 ${job.location}\n💰 ${job.salary}\n\n${job.description}\n\nFound via CV Matcher AI`)}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "block", width: "100%", padding: "9px 10px",
              backgroundColor: "#25D366", color: C.white,
              borderRadius: 10, fontSize: 12, fontWeight: 700,
              textAlign: "center", textDecoration: "none",
            }}
          >
            📱 Share
          </a>
        </div>
      </div>
    );
  };

  // ── Scholarship card ──────────────────────────────────────────────────────
  const ScholarshipCard = ({ sch }: { sch: Scholarship }) => (
    <div className="fade-in" style={{
      backgroundColor: "#F9F7F4",
      borderRadius: 24,
      border: `1px solid ${C.border}`,
      padding: isMobile ? "18px 16px" : "28px 28px",
      display: "flex", gap: isMobile ? 14 : 22, alignItems: "flex-start", flexWrap: "wrap",
      transition: "border-color 0.3s ease-out",
    }}>
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.espresso }}>{sch.title}</h2>
          <span style={{
            flexShrink: 0, padding: "4px 12px", borderRadius: 99,
            backgroundColor: C.redBg, border: `1px solid ${C.redBdr}`,
            fontSize: 11, fontWeight: 700, color: C.red, whiteSpace: "nowrap" as const,
          }}>
            ⏰ {t.deadline}: {getDeadline(sch.id)}
          </span>
        </div>
        <p style={{ margin: "5px 0 0", fontSize: 14, color: C.muted, fontWeight: 500 }}>
          🏛 {sch.university}&nbsp;&nbsp;·&nbsp;&nbsp;🌍 {sch.country}
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 14, color: "#374151", lineHeight: 1.65 }}>{sch.description}</p>
        {sch.amount && (
          <div style={{ marginTop: 12 }}>
            <span style={{
              display: "inline-block", padding: "4px 14px",
              backgroundColor: "#F0FDF4", color: C.green,
              border: `1px solid ${C.greenBdr}`, borderRadius: 99,
              fontSize: 13, fontWeight: 700,
            }}>
              💰 {sch.amount}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: isMobile ? 86 : 108 }}>
        {scoreBadge(sch.matchScore ?? 75)}
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(sch.title + " " + sch.university + " apply")}`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: "block", width: "100%", padding: "9px 10px",
            backgroundColor: "#15803D", color: C.white,
            borderRadius: 10, fontSize: 12, fontWeight: 700,
            textAlign: "center", textDecoration: "none",
          }}
        >
          ✅ Apply Now
        </a>
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(sch.title + " " + sch.university + " official")}`}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: "block", width: "100%", padding: "9px 10px",
            backgroundColor: C.darkBtn, color: C.white,
            borderRadius: 10, fontSize: 12, fontWeight: 700,
            textAlign: "center", textDecoration: "none",
          }}
        >
          🌐 Details
        </a>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Cover Letter Modal — rendered at root so it sits above everything */}
      {upgradeOpen && (
        <UpgradeModal
          onClose={() => setUpgradeOpen(false)}
          onUnlock={() => { setIsPremium(true); setUpgradeOpen(false); }}
        />
      )}
      {modal.open && (
        <CoverLetterModal
          state={modal}
          onClose={closeModal}
          isPremium={isPremium}
          onUpgrade={() => setUpgradeOpen(true)}
        />
      )}

      <div style={{
        minHeight: "100vh",
        backgroundColor: C.cream,
        display: "flex",
        flexDirection: "column",
        backgroundImage: "radial-gradient(ellipse 60% 35% at 80% -5%, rgba(201,180,155,0.12) 0%, transparent 65%)",
      }}>

        {/* ── Floating controls ── */}
        <button
          onClick={() => router.push("/upload-cv")}
          className="fixed z-50 bg-white/80 backdrop-blur-md border border-[#E6DFD5] text-[#2C221E] rounded-full font-medium shadow-sm transition-all hover:bg-white"
          style={{ cursor: "pointer", top: isMobile ? 12 : 22, left: isMobile ? 12 : 22, padding: isMobile ? "6px 12px" : "8px 16px", fontSize: isMobile ? 12 : 14 }}
        >
          {t.back}
        </button>
        <button
          onClick={() => setLang(l => l === "en" ? "ur" : "en")}
          style={{
            position: "fixed", top: isMobile ? 12 : 22, right: isMobile ? 12 : 22, zIndex: 50,
            padding: isMobile ? "6px 10px" : "8px 16px", borderRadius: 99,
            backgroundColor: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${C.border}`,
            color: C.espresso, fontSize: isMobile ? 11 : 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(44,34,30,0.08)",
            transition: "all 0.2s ease-out",
          }}
        >
          {lang === "en" ? "🇵🇰 اردو" : "🇬🇧 EN"}
        </button>

        {/* Profile summary bar — top padding clears the floating button */}
        <div style={{ backgroundColor: C.cream, borderBottom: `1px solid ${C.border}`, paddingTop: isMobile ? 52 : 72 }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "0 14px 16px" : "0 24px 20px" }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: C.gold, textTransform: "uppercase", letterSpacing: "0.2em" }}>Your Profile</p>
            <h1 style={{ margin: "5px 0 0", fontSize: isMobile ? 20 : 26, fontWeight: 800, color: C.espresso, letterSpacing: "-0.025em" }}>{cv.primaryDomain}</h1>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {[
                `🎓 ${cv.educationLevel || "Education not set"}`,
                `📅 ${cv.experienceYears} yrs experience`,
                `🛠 ${cv.skills.length} skills`,
              ].map(tag => (
                <span key={tag} style={{
                  padding: "4px 14px", backgroundColor: "#EDE8E3",
                  color: C.espresso, borderRadius: 99, fontSize: 13, fontWeight: 600,
                }}>
                  {tag}
                </span>
              ))}
            </div>
            {cv.bio && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.65, maxWidth: 700 }}>{cv.bio}</p>
            )}
          </div>
        </div>

        {/* Tabs + Remote filter */}
        <div style={{ backgroundColor: C.white, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 12px 0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {tabBtn(t.jobsTab, jobs.length, "jobs", "💼")}
              {tabBtn(t.scholTab, scholarships.length, "scholarships", "🎓")}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {allLocations.length > 1 && (
                <select
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value)}
                  style={{
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${countryFilter !== "all" ? C.espresso : C.border}`,
                    borderRadius: 99, padding: "5px 12px", outline: "none",
                    color: countryFilter !== "all" ? C.espresso : C.muted,
                    backgroundColor: countryFilter !== "all" ? "#EDE8E3" : "transparent",
                    transition: "all 0.2s ease-out",
                  }}
                >
                  <option value="all">🌍 All</option>
                  {allLocations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              )}
              {activeTab === "jobs" && (
                <button
                  onClick={() => setRemoteOnly(r => !r)}
                  style={{
                    flexShrink: 0, padding: "6px 14px", borderRadius: 99,
                    border: `1.5px solid ${remoteOnly ? C.espresso : C.border}`,
                    backgroundColor: remoteOnly ? C.espresso : "transparent",
                    color: remoteOnly ? C.cream : C.muted,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.2s ease-out", whiteSpace: "nowrap" as const,
                  }}
                >
                  🌐 {t.remoteOnly}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: isMobile ? "16px 12px 48px" : "28px 20px 60px" }}>

          {activeTab === "jobs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {displayJobs.length === 0 ? (
                <EmptyState label={remoteOnly ? "No remote jobs found" : t.noJobs} sub={t.retry} />
              ) : (
                displayJobs.map(job => <JobCard key={job.id} job={job} />)
              )}
            </div>
          )}

          {activeTab === "scholarships" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {displayScholarships.length === 0 ? (
                <EmptyState label={t.noScholarships} sub={t.retry} />
              ) : (
                displayScholarships.map(sch => <ScholarshipCard key={sch.id} sch={sch} />)
              )}
            </div>
          )}
        </main>

        <footer style={{ backgroundColor: C.espresso, color: "#C9B49B", textAlign: "center", padding: "18px 24px", fontSize: 13 }}>
          CV Matcher &copy; {new Date().getFullYear()} &nbsp;·&nbsp; AI-powered career guidance
        </footer>
      </div>
    </>
  );
}

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{ padding: 40, textAlign: "center", backgroundColor: "#F9F7F4", borderRadius: 20, border: `1px solid ${C.border}` }}>
      <p style={{ fontSize: 20, margin: "0 0 8px" }}>🔍</p>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#2C221E" }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6E6560" }}>{sub}</p>
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
        <p style={{ fontSize: 18, color: "#6B5A50" }}>Loading your results…</p>
      </div>
    }>
      <RecommendationsContent />
    </Suspense>
  );
}
