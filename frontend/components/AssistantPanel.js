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
  {
    id: "weekly-brief",
    label: "Weekly Brief",
    text:
      "Generate my weekly operating brief.\nWorkstreams: [list]\nCurrent chokepoint: [task]\nHard deadlines: [list]\nOutput format: top 3 priorities, sequencing, and one non-negotiable ship action for today.",
  },
  {
    id: "risk-radar",
    label: "Risk Radar",
    text:
      "Run a risk scan on this plan.\nPlan: [paste]\nConstraints: [time, legal, cash]\nOutput format: red/yellow/green risks, leading indicators, and mitigation actions.",
  },
  {
    id: "delegation-draft",
    label: "Delegation Draft",
    text:
      "Draft a delegation brief.\nTask: [what to delegate]\nOwner: [person]\nDefinition of done: [outcome]\nOutput format: assignment message, checklist, and follow-up cadence.",
  },
  {
    id: "meeting-prep",
    label: "Meeting Prep",
    text:
      "Prepare me for a high-stakes meeting.\nMeeting goal: [goal]\nStakeholders: [names]\nKnown tensions: [list]\nOutput format: talking points, likely objections, and exact closing ask.",
  },
  {
    id: "outreach-draft",
    label: "Outreach Draft",
    text:
      "Write a concise outreach draft in my voice.\nAudience: [who]\nOffer: [what]\nProof: [results]\nOutput format: subject line + 120-word message + follow-up message.",
  },
  {
    id: "pre-mortem",
    label: "Pre-Mortem",
    text:
      "Run a pre-mortem on this initiative.\nInitiative: [name]\nAssumptions: [list]\nOutput format: top 5 failure modes, early warning signs, and prevention moves.",
  },
  {
    id: "evidence-map",
    label: "Evidence Map",
    text:
      "Build an evidence map from this source material.\nMaterial: [paste]\nClaim to test: [claim]\nOutput format: supported claims, unsupported claims, and gaps requiring verification.",
  },
  {
    id: "cashflow-sprint",
    label: "Cashflow Sprint",
    text:
      "Design a 7-day cashflow sprint.\nCurrent offers: [list]\nPipeline status: [state]\nConstraints: [time, capacity]\nOutput format: daily actions, outreach targets, and expected revenue range.",
  },
  {
    id: "priority-reset",
    label: "Priority Reset",
    text:
      "Reset priorities for execution focus.\nCurrent tasks: [paste]\nObjective this week: [goal]\nOutput format: stop/continue/start table and ranked top 5 with rationale.",
  },
  {
    id: "ingestion-qa",
    label: "Ingestion QA",
    text:
      "Audit imported knowledge quality.\nScope: [uploaded files]\nOutput format: extraction errors, duplicate sections, missing metadata, and exact fixes to improve retrieval quality.",
  },
  {
    id: "code-context-map",
    label: "Code Context Map",
    text:
      "Map this code corpus into retrieval-ready context.\nCode set: [uploaded files]\nOutput format: architecture map, key modules, critical dependencies, and fastest debug entry points.",
  },
  {
    id: "retrieval-optimizer",
    label: "Retrieval Optimizer",
    text:
      "Optimize this knowledge base for answer quality.\nObjective: [what answers should improve]\nOutput format: chunking strategy, tag taxonomy, ranking rules, and top 5 immediate tuning actions.",
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

function getPromptCoach(raw) {
  const input = raw.trim();
  if (!input) {
    return {
      needed: true,
      reason: "Start with a clear objective and constraints to get higher-quality answers.",
      recommended: ["decision-brief", "execution-plan"],
    };
  }

  const lowered = input.toLowerCase();
  const shortQuery = input.length < 40;
  const vagueLead = /^(help|thoughts|ideas|what should i do|advice|fix this)/.test(lowered);
  const missingStructure = !/(goal|objective|context|constraints|output|deadline|owner)/.test(lowered);

  let recommended = ["decision-brief", "execution-plan"];
  if (/(pdf|docx|document|ingest|knowledge|upload)/.test(lowered)) {
    recommended = ["ingestion-qa", "retrieval-optimizer"];
  } else if (/(code|bug|trace|module|repo|function|stack)/.test(lowered)) {
    recommended = ["code-context-map", "pre-mortem"];
  } else if (/(meeting|stakeholder|pitch|client|outreach|email)/.test(lowered)) {
    recommended = ["meeting-prep", "outreach-draft"];
  }

  if (shortQuery || vagueLead || missingStructure) {
    return {
      needed: true,
      reason: "This prompt looks under-specified. Add goal, context, constraints, and desired output format.",
      recommended,
    };
  }

  return { needed: false, reason: "", recommended: [] };
}

export default function AssistantPanel({ token, apiBase, onAuthExpired }) {
  const [knowledge, setKnowledge] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadResult, setUploadResult] = useState("");
  const [uploadReport, setUploadReport] = useState(null);
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
  const promptCoach = getPromptCoach(question);

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
    const seededPrompt = window.localStorage.getItem("ns_assistant_seed") || "";
    if (seededPrompt) {
      setQuestion(seededPrompt);
      window.localStorage.removeItem("ns_assistant_seed");
    }

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

  async function uploadDocuments(e) {
    e.preventDefault();
    if (!apiBase) {
      setError("Backend URL is missing. Set NEXT_PUBLIC_API_URL.");
      return;
    }
    if (!uploadFiles.length) {
      setError("Choose at least one file to upload.");
      return;
    }

    setUploadingDocs(true);
    setError("");
    setUploadResult("");
    setUploadReport(null);

    try {
      const form = new FormData();
      for (const file of uploadFiles) {
        form.append("files", file);
      }

      const res = await fetch(`${apiBase}/api/knowledge/upload`, {
        method: "POST",
        headers: { ...authHeaders },
        body: form,
      });

      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError(await readErrorMessage(res, "Could not import documents."));
        return;
      }

      const body = await res.json().catch(() => []);
      const importedCount = Number(body?.total_entries_created || 0);
      const successFiles = Number(body?.successful_files || 0);
      const totalFiles = Number(body?.total_files_received || uploadFiles.length);
      setUploadResult(`Imported ${importedCount} knowledge entries from ${successFiles}/${totalFiles} file(s).`);
      setUploadReport(body && typeof body === "object" ? body : null);
      setUploadFiles([]);
      loadKnowledge();
    } catch {
      setError("Could not import documents.");
    } finally {
      setUploadingDocs(false);
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
      <div id="assistant-panel" style={{ position: "relative", top: -80 }} />
      <h2>Knowledge-Driven Assistant</h2>
      <p className="notice">Capture context, ask one sharp question, and get execution-ready output grounded in your knowledge.</p>

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

      <form onSubmit={uploadDocuments} className="shell" style={{ marginTop: 10 }}>
        <div className="notice">Import files directly: PDF, DOCX, and source code files.</div>
        <input
          type="file"
          multiple
          onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
          accept=".pdf,.docx,.txt,.md,.csv,.json,.yaml,.yml,.xml,.py,.js,.ts,.tsx,.jsx,.java,.go,.rs,.rb,.php,.cs,.cpp,.c,.h,.hpp,.swift,.kt,.sql,.sh,.html,.css,.scss"
          disabled={uploadingDocs}
        />
        <button className="primary" type="submit" disabled={uploadingDocs || !uploadFiles.length}>
          {uploadingDocs ? "Importing..." : "Import documents and code"}
        </button>
        {uploadResult ? <div className="notice">{uploadResult}</div> : null}
      </form>

      {uploadReport?.files?.length ? (
        <article className="task-row" style={{ marginTop: 10 }}>
          <strong>Ingestion report</strong>
          {uploadReport.files.map((item, idx) => (
            <div key={`${item.file_name}-${idx}`} className="notice" style={{ marginTop: 4 }}>
              {item.status === "success" ? "SUCCESS" : "FAILED"} | {item.file_name} | entries {item.entries_created} | chunks {item.chunks_created} | chars {item.extracted_chars} | OCR {item.ocr_used ? "yes" : "no"}
              {item.warning ? ` | warning: ${item.warning}` : ""}
              {item.error ? ` | error: ${item.error}` : ""}
            </div>
          ))}
        </article>
      ) : null}

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

      {promptCoach.needed ? (
        <article className="task-row" style={{ marginTop: 8 }}>
          <strong>Prompt coach</strong>
          <div className="notice">{promptCoach.reason}</div>
          <div className="controls" style={{ marginTop: 6 }}>
            {promptCoach.recommended.map((id) => {
              const template = PROMPT_TEMPLATES.find((t) => t.id === id);
              if (!template) return null;
              return (
                <button
                  key={`coach-${template.id}`}
                  type="button"
                  onClick={() => {
                    setQuestion(template.text);
                    setSelectedTemplateId(template.id);
                  }}
                  disabled={loading}
                >
                  Use {template.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setQuestion(refineQuestionText(question || ""))}
              disabled={loading}
            >
              Auto-improve now
            </button>
          </div>
        </article>
      ) : null}

      {loading ? <p className="notice">Thinking<span className="loading-dots" aria-hidden="true" /></p> : null}

      <div className="controls prompt-strip" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
        {PROMPT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              setQuestion(template.text);
              setSelectedTemplateId(template.id);
            }}
            disabled={loading}
            className="chip"
            style={{
              borderColor: selectedTemplateId === template.id ? "var(--brand)" : undefined,
            }}
          >
            {template.label}
          </button>
        ))}
      </div>

      <p className="notice" style={{ marginTop: 6 }}>Prompt library: high-leverage templates for decisions, execution, ingestion quality, retrieval optimization, and weekly control.</p>

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
