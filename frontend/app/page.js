"use client";

import { useEffect, useState } from "react";

import AssistantPanel from "../components/AssistantPanel";
import OnboardingPanel from "../components/OnboardingPanel";
import TaskBoard from "../components/TaskBoard";
import { readErrorMessage } from "../lib/apiError";
import { resolveApiBase } from "../lib/apiBase";

export default function Home() {
  const [apiBase, setApiBase] = useState("");
  const [configWarning, setConfigWarning] = useState("");
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = window.localStorage.getItem("ns_access_token") || "";
    setToken(existing);

    const resolvedApiBase = resolveApiBase(window.location.hostname);
    setApiBase(resolvedApiBase);
    const runningLocally = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    setConfigWarning(
      resolvedApiBase || runningLocally
        ? ""
        : "Backend URL is missing. Set NEXT_PUBLIC_API_URL to your Railway backend public URL so login, onboarding, and task sync can work."
    );
  }, []);

  async function submitAuth(e) {
    e.preventDefault();
    setError("");
    setAuthLoading(true);
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload = mode === "register" ? { email, password, name } : { email, password };

    try {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Wrong email or password. Try again."));
        return;
      }

      const data = await res.json();
      window.localStorage.setItem("ns_access_token", data.access_token);
      setToken(data.access_token);
      setPassword("");
    } catch {
      setError("Could not reach the API. Check your connection and try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    window.localStorage.removeItem("ns_access_token");
    setToken("");
  }

  function handleAuthExpired() {
    window.localStorage.removeItem("ns_access_token");
    setToken("");
    setError("Your session expired. Please sign in again.");
  }

  if (!token) {
    return (
      <main>
        <section className="panel" style={{ maxWidth: 560, margin: "24px auto" }}>
          <h1>Noble Savage OS</h1>
          <p className="notice">Sign in to your Noble Savage OS dashboard.</p>
          {configWarning ? <p style={{ color: "#dc2626" }}>{configWarning}</p> : null}
          <form onSubmit={submitAuth} className="shell" style={{ marginTop: 12 }}>
            <div className="controls">
              <button type="button" onClick={() => setMode("login")} disabled={authLoading}>
                Login
              </button>
              <button type="button" onClick={() => setMode("register")} disabled={authLoading}>
                Register
              </button>
            </div>
            {mode === "register" ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                disabled={authLoading}
              />
            ) : null}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              required
              disabled={authLoading}
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              minLength={8}
              required
              disabled={authLoading}
            />
            {error ? <p style={{ color: "#dc2626", margin: 0 }}>{error}</p> : null}
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading ? "Please wait..." : mode === "register" ? "Sign up" : "Login"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main>
      <div className="controls" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={logout}>Logout</button>
      </div>
      {configWarning ? (
        <section className="panel" style={{ marginBottom: 12 }}>
          <p style={{ color: "#dc2626", margin: 0 }}>{configWarning}</p>
        </section>
      ) : null}
      <AssistantPanel token={token} apiBase={apiBase} onAuthExpired={handleAuthExpired} />
      <OnboardingPanel token={token} apiBase={apiBase} onAuthExpired={handleAuthExpired} />
      <TaskBoard token={token} apiBase={apiBase} onAuthExpired={handleAuthExpired} />
    </main>
  );
}
