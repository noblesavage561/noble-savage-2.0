"use client";

import { useEffect, useState } from "react";

import AssistantPanel from "../components/AssistantPanel";
import OnboardingPanel from "../components/OnboardingPanel";
import TaskBoard from "../components/TaskBoard";
import { resolveApiBase, resolveApiConfigWarning } from "../lib/apiBase";

export default function Home() {
  const [apiBase, setApiBase] = useState("");
  const [configWarning, setConfigWarning] = useState("");
  const [token, setToken] = useState("");
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = window.localStorage.getItem("ns_access_token") || "";
    setToken(existing);

    setApiBase(resolveApiBase());
    setConfigWarning(resolveApiConfigWarning(window.location.hostname));
  }, []);

  async function submitAuth(e) {
    e.preventDefault();
    setError("");
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload = mode === "register" ? { email, password, name } : { email, password };

    const res = await fetch(`${apiBase}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || "Authentication failed");
      return;
    }

    const data = await res.json();
    window.localStorage.setItem("ns_access_token", data.access_token);
    setToken(data.access_token);
    setPassword("");
  }

  function logout() {
    window.localStorage.removeItem("ns_access_token");
    setToken("");
  }

  if (!token) {
    return (
      <main>
        <section className="panel" style={{ maxWidth: 560, margin: "24px auto" }}>
          <h1>Noble Savage OS</h1>
          <p className="notice">Sign in to access your private command center.</p>
          {configWarning ? <p style={{ color: "#dc2626" }}>{configWarning}</p> : null}
          <form onSubmit={submitAuth} className="shell" style={{ marginTop: 12 }}>
            <div className="controls">
              <button type="button" onClick={() => setMode("login")}>
                Login
              </button>
              <button type="button" onClick={() => setMode("register")}>
                Register
              </button>
            </div>
            {mode === "register" ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
              />
            ) : null}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              minLength={8}
              required
            />
            {error ? <p style={{ color: "#dc2626", margin: 0 }}>{error}</p> : null}
            <button className="primary" type="submit">
              {mode === "register" ? "Create account" : "Login"}
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
      <AssistantPanel token={token} apiBase={apiBase} />
      <OnboardingPanel token={token} apiBase={apiBase} />
      <TaskBoard token={token} apiBase={apiBase} />
    </main>
  );
}
