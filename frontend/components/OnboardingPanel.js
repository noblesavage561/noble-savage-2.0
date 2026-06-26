"use client";

import { useEffect, useState } from "react";

import { readErrorMessage } from "../lib/apiError";

export default function OnboardingPanel({ token, apiBase, onAuthExpired }) {
  const [turn, setTurn] = useState(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function sendTurn(nextAnswer = null) {
    if (!token) return;
    if (!apiBase) {
      setError("Backend URL is missing. Set NEXT_PUBLIC_API_URL.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/onboarding/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ answer: nextAnswer }),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError(await readErrorMessage(res, "Could not continue onboarding."));
        return;
      }
      const data = await res.json();
      setTurn(data);
      setAnswer("");
    } catch {
      setError("Could not continue onboarding.");
    } finally {
      setLoading(false);
    }
  }

  async function resetFlow() {
    if (!token) return;
    if (!apiBase) {
      setError("Backend URL is missing. Set NEXT_PUBLIC_API_URL.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/onboarding/reset`, {
        method: "POST",
        headers: { ...authHeaders },
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError(await readErrorMessage(res, "Could not reset onboarding."));
        return;
      }
      await sendTurn(null);
    } catch {
      setError("Could not reset onboarding.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    sendTurn(null);
  }, [token]);

  function onSubmit(e) {
    e.preventDefault();
    sendTurn(answer.trim() || null);
  }

  return (
    <section className="panel">
      <div className="onboarding-head">
        <h2>Onboarding Bot</h2>
        <button onClick={resetFlow} disabled={loading}>
          Reset
        </button>
      </div>

      <p className="notice">I will guide this step by step. Review and confirm proposals before saving.</p>
      {error ? <p style={{ color: "#dc2626" }}>{error}</p> : null}

      {turn ? (
        <>
          <p style={{ fontWeight: 600 }}>{turn.question}</p>
          {turn.note ? <p className="notice">{turn.note}</p> : null}

          {turn.proposals?.length ? (
            <div className="proposal-list">
              {turn.proposals.map((item, idx) => (
                <article key={`${item.type}-${idx}`} className="proposal-item">
                  <strong>{item.type === "workstream" ? item.name : item.task}</strong>
                  <div className="badges">
                    {item.tier ? <span className="badge">{item.tier}</span> : null}
                    {item.prio ? <span className="badge">{item.prio}</span> : null}
                    {item.ws ? <span className="badge">{item.ws}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {turn.summary?.length ? (
            <div className="notice">
              {turn.summary.map((line, idx) => (
                <div key={`${line}-${idx}`}>- {line}</div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="notice">Loading your onboarding state...</p>
      )}

      <form onSubmit={onSubmit} className="controls" style={{ marginTop: 10 }}>
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          style={{ flex: 1, minWidth: 220 }}
          disabled={loading}
        />
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </form>

      <div className="controls" style={{ marginTop: 8 }}>
        <button onClick={() => sendTurn("yes")} disabled={loading}>
          Looks good
        </button>
        <button onClick={() => sendTurn("revise")} disabled={loading}>
          Let me edit
        </button>
      </div>
    </section>
  );
}
