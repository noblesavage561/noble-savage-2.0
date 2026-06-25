"use client";

import { useEffect, useState } from "react";

export default function AssistantPanel({ token, apiBase, onAuthExpired }) {
  const [knowledge, setKnowledge] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState([]);
  const [error, setError] = useState("");
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [loading, setLoading] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function loadKnowledge() {
    if (!token) return;
    setLoadingKnowledge(true);
    try {
      const res = await fetch(`${apiBase}/api/knowledge`, {
        headers: { ...authHeaders },
        cache: "no-store",
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError("Could not load knowledge entries.");
        return;
      }
      setKnowledge(await res.json());
    } catch {
      setError("Could not load knowledge entries.");
    } finally {
      setLoadingKnowledge(false);
    }
  }

  useEffect(() => {
    loadKnowledge();
  }, [token]);

  async function addEntry(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setAddingKnowledge(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ title, content }),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Could not save knowledge entry.");
        return;
      }
      setTitle("");
      setContent("");
      loadKnowledge();
    } catch {
      setError("Could not save knowledge entry.");
    } finally {
      setAddingKnowledge(false);
    }
  }

  async function askAssistant(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/assistant/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ question }),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setAnswer(body.answer || "");
        setCitations(body.citations || []);
      } else {
        setAnswer(body.detail || "Sorry, I could not process that. Try again.");
        setCitations([]);
      }
    } catch {
      setAnswer("Sorry, I could not process that. Check your connection and try again.");
      setCitations([]);
    } finally {
      setLoading(false);
    }
  }

  if (!token) return null;

  return (
    <section className="panel">
      <h2>Knowledge-Driven Assistant</h2>
      <p className="notice">Save reference notes, then ask questions grounded in your knowledge base.</p>

      <form onSubmit={addEntry} className="shell" style={{ marginTop: 8 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Knowledge title"
          disabled={addingKnowledge}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Knowledge content"
          rows={4}
          style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 10 }}
          disabled={addingKnowledge}
        />
        <button className="primary" type="submit" disabled={addingKnowledge}>
          {addingKnowledge ? "Saving..." : "Add knowledge entry"}
        </button>
      </form>

      <form onSubmit={askAssistant} className="controls" style={{ marginTop: 12 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask your assistant"
          style={{ flex: 1, minWidth: 220 }}
          disabled={loading}
        />
        <button className="primary" type="submit" disabled={loading}>Ask</button>
      </form>

      {error ? <p style={{ color: "#dc2626", marginTop: 10 }}>{error}</p> : null}
      {loadingKnowledge ? <p className="notice">Loading knowledge entries...</p> : null}

      {answer ? (
        <article className="task-row" style={{ marginTop: 10 }}>
          <strong>Assistant answer</strong>
          <div>{answer}</div>
        </article>
      ) : null}

      {citations.length ? (
        <article className="task-row" style={{ marginTop: 10 }}>
          <strong>Citations used</strong>
          {citations.map((c) => (
            <div key={c.id} className="notice">- {c.title}</div>
          ))}
        </article>
      ) : null}

      <div className="notice" style={{ marginTop: 10 }}>
        Stored knowledge entries: {knowledge.length}
      </div>
    </section>
  );
}
