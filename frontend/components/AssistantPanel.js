"use client";

import { useEffect, useState } from "react";

import { readErrorMessage, toErrorMessage } from "../lib/apiError";

const PROMPT_TEMPLATES = [
  {
    id: "decision-brief",
    label: "Decision Brief",
    text:
      "Goal: [state the decision]\nContext: [key facts from your workstream]\nConstraints: [time, budget, legal, dependencies]\nOptions: [A, B, C]\nOutput format: recommendation, tradeoffs, risk level, and one next action.",
  },
  {
    id: "knowledge-intake",
    label: "Knowledge Intake",
    text:
      "Ingest this into structured notes.\nSource summary: [paste source]\nExtract: key entities, dates, obligations, blockers, and follow-ups.\nOutput format: concise bullets + open questions + action checklist.",
  },
  {
    id: "execution-plan",
    label: "Execution Plan",
    text:
      "Objective: [what must ship]\nCurrent state: [where this is blocked]\nDependencies: [what must happen first]\nOutput format: 72-hour execution sequence, owner per step, and success criteria.",
  },
];

function refineQuestionText(raw) {
  const input = raw.trim();
  if (!input) return "";

  return [
    "Use only available knowledge context when answering.",
    "If context is incomplete, explicitly list the minimum missing facts.",
    "Response format:",
    "1) Direct answer in 3-6 bullets",
    "2) Missing inputs (max 3)",
    "3) One concrete next action",
    `User query: ${input}`,
  ].join("\n");
}

export default function AssistantPanel({ token, apiBase, onAuthExpired }) {
  const [knowledge, setKnowledge] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [latestQueryId, setLatestQueryId] = useState(null);
  const [feedbackSent, setFeedbackSent] = useState(0);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [error, setError] = useState("");
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [loading, setLoading] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function loadKnowledge() {
    if (!token || !apiBase) return;
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
        setError(await readErrorMessage(res, "Could not load knowledge entries."));
        return;
      }
      const body = await res.json().catch(() => []);
      if (!Array.isArray(body)) {
        setError("Knowledge response was not in the expected format.");
        setKnowledge([]);
        return;
      }
      setKnowledge(body);
    } catch {
      setError("Could not load knowledge entries.");
    } finally {
      setLoadingKnowledge(false);
    }
  }

  async function loadAssistantMetrics() {
    if (!token || !apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/assistant/metrics`, {
        headers: { ...authHeaders },
        cache: "no-store",
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        return;
      }
      const body = await res.json().catch(() => []);
      setMetrics(Array.isArray(body) ? body : []);
    } catch {
      setMetrics([]);
    }
  }

  async function loadWeeklySummary() {
    if (!token || !apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/assistant/metrics/weekly-summary`, {
        headers: { ...authHeaders },
        cache: "no-store",
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        return;
      }
      const body = await res.json().catch(() => null);
      setWeeklySummary(body && typeof body === "object" ? body : null);
    } catch {
      setWeeklySummary(null);
    }
  }

  useEffect(() => {
    if (!apiBase) {
      setKnowledge([]);
      return;
    }
    loadKnowledge();
    loadAssistantMetrics();
    loadWeeklySummary();
  }, [token, apiBase]);

  async function addEntry(e) {
    e.preventDefault();
    if (!apiBase) {
      setError("Backend URL is missing. Set NEXT_PUBLIC_API_URL.");
      return;
    }
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
        setError(await readErrorMessage(res, "Could not save knowledge entry."));
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
    if (!apiBase) {
      setError("Backend URL is missing. Set NEXT_PUBLIC_API_URL.");
      return;
    }
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    try {
      const refinedQuestion = refineQuestionText(question);
      const res = await fetch(`${apiBase}/api/assistant/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          question: refinedQuestion,
          raw_question: question.trim(),
          template_id: selectedTemplateId,
        }),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setLatestQueryId(typeof body.query_id === "string" ? body.query_id : null);
        setFeedbackSent(0);
        setAnswer(typeof body.answer === "string" ? body.answer : "");
        setCitations(Array.isArray(body.citations) ? body.citations : []);
        loadAssistantMetrics();
        loadWeeklySummary();
      } else {
        setLatestQueryId(null);
        setFeedbackSent(0);
        setAnswer(toErrorMessage(body?.detail, "Sorry, I could not process that. Try again."));
        setCitations([]);
      }
    } catch {
      setLatestQueryId(null);
      setFeedbackSent(0);
      setAnswer("Sorry, I could not process that. Check your connection and try again.");
      setCitations([]);
    } finally {
      setLoading(false);
    }
  }

  async function sendFeedback(score) {
    if (!apiBase || !latestQueryId || sendingFeedback) return;
    setSendingFeedback(true);
    try {
      const res = await fetch(`${apiBase}/api/assistant/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ query_id: latestQueryId, score }),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError(await readErrorMessage(res, "Could not save feedback."));
        return;
      }
      setFeedbackSent(score);
      loadAssistantMetrics();
      loadWeeklySummary();
    } catch {
      setError("Could not save feedback.");
    } finally {
      setSendingFeedback(false);
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
        <button
          type="button"
          onClick={() => setQuestion(refineQuestionText(question))}
          disabled={loading || !question.trim()}
        >
          Improve wording
        </button>
      </form>

      <div className="controls" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
        {PROMPT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              setQuestion(template.text);
              setSelectedTemplateId(template.id);
            }}
            disabled={loading}
            style={{
              borderColor: selectedTemplateId === template.id ? "var(--brand)" : undefined,
            }}
          >
            {template.label}
          </button>
        ))}
      </div>

      {error ? <p style={{ color: "#dc2626", marginTop: 10 }}>{error}</p> : null}
      {loadingKnowledge ? <p className="notice">Loading knowledge entries...</p> : null}

      {answer ? (
        <article className="task-row" style={{ marginTop: 10 }}>
          <strong>Assistant answer</strong>
          <div>{answer}</div>
          {latestQueryId ? (
            <div className="controls" style={{ marginTop: 8, gap: 8 }}>
              <button
                type="button"
                disabled={sendingFeedback}
                onClick={() => sendFeedback(1)}
                style={{ borderColor: feedbackSent === 1 ? "var(--brand)" : undefined }}
              >
                Helpful
              </button>
              <button
                type="button"
                disabled={sendingFeedback}
                onClick={() => sendFeedback(-1)}
                style={{ borderColor: feedbackSent === -1 ? "#dc2626" : undefined }}
              >
                Not helpful
              </button>
            </div>
          ) : null}
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

      {metrics.length ? (
        <article className="task-row" style={{ marginTop: 10 }}>
          <strong>Template performance</strong>
          {metrics.map((item) => (
            <div key={item.template_id} className="notice">
              {item.template_id}: {item.queries} queries, {Number(item.success_rate || 0).toFixed(0)}% success,
              avg citations {Number(item.avg_citations || 0).toFixed(1)},
              feedback {Number(item.avg_feedback_score || 0).toFixed(2)} ({item.feedback_count} votes)
            </div>
          ))}
        </article>
      ) : null}

      {weeklySummary?.summary ? (
        <article className="task-row" style={{ marginTop: 10 }}>
          <strong>Weekly summary</strong>
          <div className="notice">{weeklySummary.summary}</div>
          <div className="notice">Total queries (7d): {weeklySummary.total_queries || 0}</div>
          {weeklySummary.top_template ? (
            <div className="notice">
              Top: {weeklySummary.top_template.template_id} (score {Number(weeklySummary.top_template.quality_score || 0).toFixed(2)})
            </div>
          ) : null}
          {weeklySummary.bottom_template ? (
            <div className="notice">
              Lowest: {weeklySummary.bottom_template.template_id} (score {Number(weeklySummary.bottom_template.quality_score || 0).toFixed(2)})
            </div>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
