"use client";

import { useState } from "react";

const C = {
  bg:      "#F0F1FF",
  card:    "#FFFFFF",
  primary: "#1E1B4B",
  accent:  "#5B50F0",
  muted:   "#64748B",
  border:  "#E2E1F5",
  green:   "#059669",
  greenBg: "#ECFDF5",
  red:     "#DC2626",
  redBg:   "#FEF2F2",
};

export default function AdminPage() {
  const [key, setKey]         = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  const [count, setCount]     = useState(1);
  const [pins, setPins]       = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [copied, setCopied]   = useState<string | null>(null);

  const handleLogin = () => {
    if (!key.trim()) { setLoginErr("Key daalo."); return; }
    setLoggedIn(true);
    setLoginErr("");
  };

  const generatePins = async () => {
    setLoading(true);
    setError("");
    setPins([]);
    try {
      const res  = await fetch("/api/admin/generate-pin", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({ count }),
      });
      const data = (await res.json()) as { success?: boolean; pins?: string[]; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Error. APP_CRON_KEY galat ho sakti hai.");
        return;
      }
      setPins(data.pins ?? []);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyPin = (pin: string) => {
    navigator.clipboard.writeText(pin);
    setCopied(pin);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = () => {
    navigator.clipboard.writeText(pins.join(", "));
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Login screen ──
  if (!loggedIn) {
    return (
      <div style={{
        minHeight: "100vh", backgroundColor: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
        <div style={{
          width: "100%", maxWidth: 400,
          backgroundColor: C.card, borderRadius: 24,
          border: `1px solid ${C.border}`, padding: "40px 36px",
          boxShadow: "0 20px 60px rgba(30,27,75,0.10)",
        }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 800, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Admin Panel
          </p>
          <h1 style={{ margin: "0 0 24px", fontSize: 24, fontWeight: 800, color: C.primary }}>
            CV Matcher Admin
          </h1>

          <label style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>APP_CRON_KEY</label>
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setLoginErr(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Secret key daalo..."
            style={{
              width: "100%", marginTop: 6, padding: "12px 14px",
              border: `1.5px solid ${loginErr ? C.red : C.border}`, borderRadius: 12,
              fontSize: 15, color: C.primary, backgroundColor: "#F8F8FF",
              outline: "none", boxSizing: "border-box",
            }}
          />
          {loginErr && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.red }}>{loginErr}</p>}

          <button
            onClick={handleLogin}
            style={{
              width: "100%", marginTop: 16, padding: "13px",
              background: "linear-gradient(135deg, #5B50F0, #7C3AED)",
              color: "#fff", border: "none", borderRadius: 12,
              fontSize: 15, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 8px 24px rgba(91,80,240,0.35)",
            }}
          >
            Login
          </button>
          <p style={{ margin: "14px 0 0", fontSize: 12, color: C.muted, textAlign: "center" }}>
            Key Vercel Environment Variables mein hai (APP_CRON_KEY)
          </p>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.bg, padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 800, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Admin Panel
          </p>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: C.primary }}>
            PIN Generator
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: C.muted }}>
            Customer pay kare, WhatsApp kare — tum yahan PIN generate karo aur bhej do.
          </p>
        </div>

        {/* Generator card */}
        <div style={{
          backgroundColor: C.card, borderRadius: 20,
          border: `1px solid ${C.border}`, padding: "32px 28px",
          boxShadow: "0 4px 24px rgba(30,27,75,0.07)",
        }}>
          {/* How many PINs */}
          <label style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>
            Kitne PIN chahiye?
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 10, marginBottom: 20 }}>
            {[1, 2, 5, 10].map(n => (
              <button
                key={n}
                onClick={() => setCount(n)}
                style={{
                  flex: 1, padding: "10px 0",
                  background: count === n ? "linear-gradient(135deg, #5B50F0, #7C3AED)" : "transparent",
                  color: count === n ? "#fff" : C.muted,
                  border: `1.5px solid ${count === n ? "#5B50F0" : C.border}`,
                  borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            onClick={generatePins}
            disabled={loading}
            style={{
              width: "100%", padding: "14px",
              background: loading ? "#C7C4E8" : "linear-gradient(135deg, #5B50F0, #7C3AED)",
              color: "#fff", border: "none", borderRadius: 12,
              fontSize: 16, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 8px 24px rgba(91,80,240,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.2s",
            }}
          >
            {loading ? (
              <>
                <div style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                Generate ho raha hai...
              </>
            ) : `✦ ${count} PIN Generate Karo`}
          </button>

          {/* Error */}
          {error && (
            <div style={{ marginTop: 16, padding: "14px 16px", backgroundColor: C.redBg, borderRadius: 12, border: `1px solid #FECACA` }}>
              <p style={{ margin: 0, fontSize: 13, color: C.red, fontWeight: 600 }}>⚠️ {error}</p>
            </div>
          )}

          {/* Generated PINs */}
          {pins.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.primary }}>
                  ✅ {pins.length} PIN generate ho gaye
                </p>
                {pins.length > 1 && (
                  <button
                    onClick={copyAll}
                    style={{
                      padding: "5px 14px", fontSize: 12, fontWeight: 600,
                      background: copied === "all" ? C.green : "transparent",
                      color: copied === "all" ? "#fff" : C.accent,
                      border: `1px solid ${copied === "all" ? C.green : C.accent}`,
                      borderRadius: 8, cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    {copied === "all" ? "✓ Copied" : "Sab Copy Karo"}
                  </button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pins.map((pin, i) => (
                  <div key={pin} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", backgroundColor: C.greenBg,
                    borderRadius: 12, border: `1px solid #A7F3D0`,
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: C.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        PIN #{i + 1}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 28, fontWeight: 900, color: C.primary, letterSpacing: "0.25em", lineHeight: 1 }}>
                        {pin}
                      </p>
                    </div>
                    <button
                      onClick={() => copyPin(pin)}
                      style={{
                        padding: "8px 18px", fontSize: 13, fontWeight: 700,
                        background: copied === pin ? C.green : "linear-gradient(135deg, #5B50F0, #7C3AED)",
                        color: "#fff", border: "none", borderRadius: 10,
                        cursor: "pointer", transition: "all 0.2s",
                        boxShadow: "0 4px 12px rgba(91,80,240,0.3)",
                      }}
                    >
                      {copied === pin ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>

              {/* WhatsApp message template */}
              <div style={{ marginTop: 20, padding: "16px", backgroundColor: "#F0F9FF", borderRadius: 12, border: "1px solid #BAE6FD" }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#0369A1" }}>
                  📱 WhatsApp Message Template:
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#0C4A6E", lineHeight: 1.7, fontStyle: "italic" }}>
                  "Aapka CV Matcher premium PIN hai: <strong>{pins[0]}</strong>. Website pe enter karo aur lifetime access unlock karo. 🎉"
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div style={{ marginTop: 20, padding: "20px 24px", backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}` }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: C.primary }}>📋 Flow:</p>
          {[
            "Customer payment kare (280 PKR)",
            "WhatsApp kare: +92 325 9874601",
            "Yahan se PIN generate karo",
            "PIN customer ko WhatsApp pe bhej do",
            "Customer site pe enter kare — unlock ho jaye ga",
          ].map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-start" }}>
              <span style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                background: "linear-gradient(135deg, #5B50F0, #7C3AED)",
                color: "#fff", fontSize: 11, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{i + 1}</span>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{step}</p>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: C.muted }}>
          Ye page sirf tum dekh sako ge — URL public hai lekin key required hai
        </p>
      </div>
    </div>
  );
}
