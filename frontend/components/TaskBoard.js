"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_FORM = {
  ws: "",
  task: "",
  prio: "P2",
  status: "Backlog",
};

export default function TaskBoard({ token, apiBase, onAuthExpired }) {
  const [tasks, setTasks] = useState([]);
  const [workstreams, setWorkstreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [form, setForm] = useState(DEFAULT_FORM);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const counters = useMemo(() => {
    const done = tasks.filter((t) => t.status === "Done").length;
    const inProgress = tasks.filter((t) => t.status === "In Progress").length;
    const thisWeek = tasks.filter((t) => t.status === "This Week").length;
    const openP1 = tasks.filter((t) => t.prio === "P1" && t.status !== "Done").length;
    return { done, inProgress, thisWeek, openP1 };
  }, [tasks]);

  async function loadTasks() {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/api/tasks`, {
        cache: "no-store",
        headers: { ...authHeaders },
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError("Could not load tasks.");
        setLoading(false);
        return;
      }
      setTasks(await res.json());
    } catch {
      setError("Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkstreams() {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/api/workstreams`, {
        cache: "no-store",
        headers: { ...authHeaders },
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError("Could not load workstreams.");
        return;
      }
      const data = await res.json();
      setWorkstreams(data);
      if (data[0]) {
        setForm((v) => ({ ...v, ws: data[0].id }));
      }
    } catch {
      setError("Could not load workstreams.");
    }
  }

  useEffect(() => {
    if (!token) return;
    loadWorkstreams();
    loadTasks();

    const wsTarget = new URL("/ws/board", apiBase);
    wsTarget.protocol = wsTarget.protocol === "https:" ? "wss:" : "ws:";
    wsTarget.searchParams.set("token", token);
    let socket;
    let reconnectTimer;
    let closedByClient = false;

    function connect() {
      setConnectionStatus("connecting");
      socket = new WebSocket(wsTarget.toString());
      socket.onopen = () => {
        setConnectionStatus("connected");
        socket.send("subscribe");
      };
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (!payload.task) return;

        setTasks((current) => {
          const found = current.findIndex((item) => item.id === payload.task.id);
          if (found === -1) {
            return [payload.task, ...current];
          }
          const next = [...current];
          next[found] = payload.task;
          return next;
        });
      };
      socket.onerror = () => {
        setConnectionStatus("error");
      };
      socket.onclose = () => {
        if (closedByClient) return;
        setConnectionStatus("disconnected");
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      closedByClient = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [token, apiBase]);

  async function submitTask(e) {
    e.preventDefault();
    if (!form.task.trim() || !form.ws) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`${apiBase}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(form),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Could not create task.");
        return;
      }

      setForm((v) => ({ ...v, task: "", prio: "P2", status: "Backlog" }));
    } catch {
      setError("Could not create task.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(taskId, status) {
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        onAuthExpired?.();
        return;
      }
      if (!res.ok) {
        setError("Could not update task status.");
      }
    } catch {
      setError("Could not update task status.");
    }
  }

  if (!token) {
    return null;
  }

  return (
    <div className="shell">
      <section className="hero">
        <h1>Noble Savage Command Center</h1>
        <p>
          A living personal chief-of-staff. Add tasks, move status, and keep a
          shared operating picture in motion.
        </p>
      </section>

      <div className="grid">
        <section className="panel">
          <h2>Task Board</h2>
          <p className="notice">
              API: {apiBase} | Sync: {connectionStatus}
          </p>
            {error ? <p style={{ color: "#dc2626", marginTop: 8 }}>{error}</p> : null}

          <form onSubmit={submitTask} className="controls" style={{ margin: "12px 0" }}>
            <input
              value={form.task}
              onChange={(e) => setForm((v) => ({ ...v, task: e.target.value }))}
              placeholder="What needs to happen next?"
              style={{ minWidth: 240, flex: 1 }}
              disabled={saving}
            />
            <select
              value={form.ws}
              onChange={(e) => setForm((v) => ({ ...v, ws: e.target.value }))}
              disabled={saving}
            >
              {workstreams.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <select
              value={form.prio}
              onChange={(e) => setForm((v) => ({ ...v, prio: e.target.value }))}
              disabled={saving}
            >
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add task"}
            </button>
          </form>

          {loading ? <p>Loading tasks...</p> : null}
          {tasks.map((task) => (
            <article key={task.id} className="task-row">
              <strong>{task.task}</strong>
              <div className="badges">
                <span className="badge">{task.prio}</span>
                <span className="badge">{task.status}</span>
                <span className="badge">{task.ws}</span>
              </div>
              <div className="controls">
                <select
                  value={task.status}
                  onChange={(e) => updateStatus(task.id, e.target.value)}
                >
                  <option>Backlog</option>
                  <option>This Week</option>
                  <option>In Progress</option>
                  <option>Blocked</option>
                  <option>Done</option>
                </select>
              </div>
            </article>
          ))}
        </section>

        <aside className="panel">
          <h2>Live Counters</h2>
          <div className="metrics" style={{ marginTop: 10 }}>
            <div className="metric">
              <small>This Week</small>
              <strong>{counters.thisWeek}</strong>
            </div>
            <div className="metric">
              <small>In Progress</small>
              <strong>{counters.inProgress}</strong>
            </div>
            <div className="metric">
              <small>Open P1</small>
              <strong>{counters.openP1}</strong>
            </div>
            <div className="metric">
              <small>Done</small>
              <strong>{counters.done}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
