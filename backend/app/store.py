import json
import os
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, Row

from .embeddings import cosine_similarity, embed_text

load_dotenv()

SQLITE_PATH = Path(__file__).resolve().parent.parent / "noble_savage.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+pysqlite:///{SQLITE_PATH}")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

DEFAULT_WORKSTREAMS = [
    {
        "id": "ws_income",
        "name": "Income",
        "tier": "Tier 1",
        "owner": "Noble",
        "objective": "Stabilize and grow cash flow",
        "why": "Funds every other priority",
        "color": "#0f766e",
    },
    {
        "id": "ws_bba",
        "name": "BBA Pipeline",
        "tier": "Tier 1",
        "owner": "Noble",
        "objective": "Close paid clients",
        "why": "Primary business traction",
        "color": "#f59e0b",
    },
    {
        "id": "ws_legal",
        "name": "Trust and Legal",
        "tier": "Tier 1",
        "owner": "Noble",
        "objective": "Execute trust dependencies",
        "why": "Unblocks critical initiatives",
        "color": "#dc2626",
    },
    {
        "id": "ws_operations",
        "name": "Operations",
        "tier": "Tier 2",
        "owner": "Noble",
        "objective": "Keep systems reliable and repeatable",
        "why": "Sustains shipping velocity",
        "color": "#0369a1",
    },
    {
        "id": "ws_heritage",
        "name": "Heritage and Research",
        "tier": "Tier 2",
        "owner": "Noble",
        "objective": "Advance archive and petition artifacts",
        "why": "Long-horizon strategic value",
        "color": "#7c3aed",
    },
    {
        "id": "ws_family",
        "name": "Family and Life",
        "tier": "Tier 3",
        "owner": "Noble",
        "objective": "Protect health and household rhythm",
        "why": "Prevents burnout and drift",
        "color": "#047857",
    },
]


def _scope_ws_id(user_id: str, ws_id: str) -> str:
    prefix = f"u_{user_id[:8]}__"
    if ws_id.startswith(prefix):
        return ws_id
    return f"{prefix}{ws_id}"


def _make_engine() -> Engine:
    connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
    return create_engine(DATABASE_URL, future=True, pool_pre_ping=True, connect_args=connect_args)


engine = _make_engine()


def _table_has_column(table_name: str, column_name: str) -> bool:
    with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            rows = conn.execute(text(f"pragma table_info({table_name})")).all()
            return any(r._mapping["name"] == column_name for r in rows)

        rows = conn.execute(
            text(
                """
                select column_name
                from information_schema.columns
                where table_name = :table_name
                """
            ),
            {"table_name": table_name},
        ).all()
        return any(r._mapping["column_name"] == column_name for r in rows)


def _ensure_column(table_name: str, column_name: str, column_ddl: str) -> None:
    if _table_has_column(table_name, column_name):
        return
    with engine.begin() as conn:
        conn.execute(text(f"alter table {table_name} add column {column_name} {column_ddl}"))


def _to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace(" ", "T"))
    return datetime.utcnow()


def _to_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    return None


def _row_to_task(row: Row[Any]) -> dict[str, Any]:
    m = row._mapping
    return {
        "id": m["id"],
        "ws": m["ws"],
        "task": m["task"],
        "prio": m["prio"],
        "status": m["status"],
        "owner": m.get("owner"),
        "notes": m.get("notes"),
        "deleg": m.get("deleg"),
        "bot": m.get("bot"),
        "due": _to_date(m.get("due")),
        "created_at": _to_datetime(m["created_at"]),
        "updated_at": _to_datetime(m["updated_at"]),
    }


def init_db() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                create table if not exists users (
                    id text primary key,
                    email text unique not null,
                    password_hash text not null,
                    name text,
                    created_at timestamp default CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                create table if not exists workstreams (
                    id text,
                    user_id text,
                    name text,
                    tier text,
                    owner text,
                    objective text,
                    why text,
                    color text,
                    primary key (id, user_id)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                create table if not exists tasks (
                    id text primary key,
                    user_id text,
                    ws text,
                    task text not null,
                    prio text check (prio in ('P1','P2','P3')),
                    status text check (status in ('Backlog','This Week','In Progress','Blocked','Done')),
                    owner text,
                    notes text,
                    deleg text,
                    bot text,
                    due date,
                    created_at timestamp default CURRENT_TIMESTAMP,
                    updated_at timestamp default CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                create table if not exists decisions (
                    id text primary key,
                    user_id text,
                    ts timestamp default CURRENT_TIMESTAMP,
                    prompt text,
                    recommendation text,
                    actual_action text,
                    status text check (status in ('DONE','IN MOTION','STILL BLUEPRINT')),
                    week_of date
                )
                """
            )
        )
        conn.execute(
            text(
                """
                create table if not exists signals (
                    id text primary key,
                    user_id text,
                    ts timestamp default CURRENT_TIMESTAMP,
                    kind text check (kind in ('accept','edit','dismiss','correct','gap')),
                    target text,
                    before text,
                    after text,
                    agent text,
                    notes text
                )
                """
            )
        )
        conn.execute(
            text(
                """
                create table if not exists onboarding (
                    id text primary key,
                    user_id text,
                    step text,
                    complete boolean default false,
                    collected text,
                    updated_at timestamp default CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                create table if not exists knowledge (
                    id text primary key,
                    user_id text,
                    title text not null,
                    content text not null,
                    source text,
                    tags text,
                    embedding text,
                    embedding_model text,
                    created_at timestamp default CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                create table if not exists assistant_logs (
                    id text primary key,
                    user_id text,
                    ts timestamp default CURRENT_TIMESTAMP,
                    template_id text,
                    raw_question text,
                    question text not null,
                    citation_count integer default 0,
                    answer_chars integer default 0,
                    status text check (status in ('success','error')),
                    error text,
                    latency_ms integer,
                    feedback_score integer,
                    feedback_note text,
                    feedback_ts timestamp
                )
                """
            )
        )

    # Ensure tenant columns exist when upgrading older local databases.
    _ensure_column("workstreams", "user_id", "text")
    _ensure_column("tasks", "user_id", "text")
    _ensure_column("decisions", "user_id", "text")
    _ensure_column("signals", "user_id", "text")
    _ensure_column("onboarding", "user_id", "text")
    _ensure_column("knowledge", "user_id", "text")
    _ensure_column("knowledge", "embedding", "text")
    _ensure_column("knowledge", "embedding_model", "text")
    _ensure_column("assistant_logs", "user_id", "text")
    _ensure_column("assistant_logs", "template_id", "text")
    _ensure_column("assistant_logs", "raw_question", "text")
    _ensure_column("assistant_logs", "question", "text")
    _ensure_column("assistant_logs", "citation_count", "integer")
    _ensure_column("assistant_logs", "answer_chars", "integer")
    _ensure_column("assistant_logs", "status", "text")
    _ensure_column("assistant_logs", "error", "text")
    _ensure_column("assistant_logs", "latency_ms", "integer")
    _ensure_column("assistant_logs", "feedback_score", "integer")
    _ensure_column("assistant_logs", "feedback_note", "text")
    _ensure_column("assistant_logs", "feedback_ts", "timestamp")


def create_user(email: str, password_hash: str, name: str | None) -> dict[str, Any]:
    normalized_email = email.lower().strip()
    user_id = str(uuid.uuid4())
    with engine.begin() as conn:
        existing = conn.execute(
            text("select id from users where email = :email"),
            {"email": normalized_email},
        ).first()
        if existing:
            raise ValueError("Email already registered")

        conn.execute(
            text(
                """
                insert into users (id, email, password_hash, name)
                values (:id, :email, :password_hash, :name)
                """
            ),
            {
                "id": user_id,
                "email": normalized_email,
                "password_hash": password_hash,
                "name": name,
            },
        )
    seed_default_workstreams(user_id)
    return get_user_by_id(user_id)


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with engine.connect() as conn:
        row = conn.execute(
            text("select id, email, name, password_hash from users where email = :email"),
            {"email": email.lower().strip()},
        ).first()
    if not row:
        return None
    return dict(row._mapping)


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    with engine.connect() as conn:
        row = conn.execute(
            text("select id, email, name from users where id = :id"),
            {"id": user_id},
        ).first()
    return dict(row._mapping) if row else None


def seed_default_workstreams(user_id: str) -> int:
    inserted = 0
    with engine.begin() as conn:
        for ws in DEFAULT_WORKSTREAMS:
            scoped_id = _scope_ws_id(user_id, ws["id"])
            exists = conn.execute(
                text("select id from workstreams where id = :id and user_id = :user_id"),
                {"id": scoped_id, "user_id": user_id},
            ).first()
            if exists:
                continue
            payload = {**ws, "id": scoped_id, "user_id": user_id}
            conn.execute(
                text(
                    """
                    insert into workstreams (id, user_id, name, tier, owner, objective, why, color)
                    values (:id, :user_id, :name, :tier, :owner, :objective, :why, :color)
                    """
                ),
                payload,
            )
            inserted += 1
    return inserted


def list_workstreams(user_id: str) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                select id, name, tier, owner, objective, why, color
                from workstreams
                where user_id = :user_id
                order by name asc
                """
            ),
            {"user_id": user_id},
        ).all()
    return [dict(r._mapping) for r in rows]


def upsert_workstream(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scoped_id = _scope_ws_id(user_id, payload["id"])
    with engine.begin() as conn:
        row = conn.execute(
            text("select id from workstreams where id = :id and user_id = :user_id"),
            {"id": scoped_id, "user_id": user_id},
        ).first()

        full_payload = {**payload, "id": scoped_id, "user_id": user_id}
        if row:
            conn.execute(
                text(
                    """
                    update workstreams
                    set name = :name, tier = :tier, owner = :owner,
                        objective = :objective, why = :why, color = :color
                    where id = :id and user_id = :user_id
                    """
                ),
                full_payload,
            )
        else:
            conn.execute(
                text(
                    """
                    insert into workstreams (id, user_id, name, tier, owner, objective, why, color)
                    values (:id, :user_id, :name, :tier, :owner, :objective, :why, :color)
                    """
                ),
                full_payload,
            )

        fresh = conn.execute(
            text(
                """
                select id, name, tier, owner, objective, why, color
                from workstreams
                where id = :id and user_id = :user_id
                """
            ),
            {"id": scoped_id, "user_id": user_id},
        ).one()
    return dict(fresh._mapping)


def list_tasks(user_id: str, status_filter: str | None = None) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        if status_filter:
            rows = conn.execute(
                text(
                    """
                    select * from tasks
                    where user_id = :user_id and status = :status
                    order by updated_at desc
                    """
                ),
                {"user_id": user_id, "status": status_filter},
            ).all()
        else:
            rows = conn.execute(
                text("select * from tasks where user_id = :user_id order by updated_at desc"),
                {"user_id": user_id},
            ).all()
    return [_row_to_task(r) for r in rows]


def create_task(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    now = datetime.utcnow()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into tasks (id, user_id, ws, task, prio, status, owner, notes, deleg, bot, due, created_at, updated_at)
                values (:id, :user_id, :ws, :task, :prio, :status, :owner, :notes, :deleg, :bot, :due, :created_at, :updated_at)
                """
            ),
            {
                "id": task_id,
                "user_id": user_id,
                "ws": payload["ws"],
                "task": payload["task"],
                "prio": payload["prio"],
                "status": payload["status"],
                "owner": payload.get("owner"),
                "notes": payload.get("notes"),
                "deleg": payload.get("deleg"),
                "bot": payload.get("bot"),
                "due": payload.get("due"),
                "created_at": now,
                "updated_at": now,
            },
        )
        row = conn.execute(
            text("select * from tasks where id = :id and user_id = :user_id"),
            {"id": task_id, "user_id": user_id},
        ).one()
    return _row_to_task(row)


def patch_task(user_id: str, task_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with engine.begin() as conn:
        row = conn.execute(
            text("select * from tasks where id = :id and user_id = :user_id"),
            {"id": task_id, "user_id": user_id},
        ).first()
        if not row:
            return None

        merged = dict(row._mapping)
        merged.update({k: v for k, v in patch.items() if v is not None})
        merged["updated_at"] = datetime.utcnow()

        conn.execute(
            text(
                """
                update tasks
                set ws = :ws, task = :task, prio = :prio, status = :status,
                    owner = :owner, notes = :notes, deleg = :deleg,
                    bot = :bot, due = :due, updated_at = :updated_at
                where id = :id and user_id = :user_id
                """
            ),
            {
                "id": task_id,
                "user_id": user_id,
                "ws": merged["ws"],
                "task": merged["task"],
                "prio": merged["prio"],
                "status": merged["status"],
                "owner": merged.get("owner"),
                "notes": merged.get("notes"),
                "deleg": merged.get("deleg"),
                "bot": merged.get("bot"),
                "due": merged.get("due"),
                "updated_at": merged["updated_at"],
            },
        )
        fresh = conn.execute(
            text("select * from tasks where id = :id and user_id = :user_id"),
            {"id": task_id, "user_id": user_id},
        ).one()
    return _row_to_task(fresh)


def create_signal(user_id: str, payload: dict[str, Any]) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into signals (id, user_id, kind, target, before, after, agent, notes)
                values (:id, :user_id, :kind, :target, :before, :after, :agent, :notes)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "kind": payload["kind"],
                "target": payload.get("target"),
                "before": payload.get("before"),
                "after": payload.get("after"),
                "agent": payload.get("agent"),
                "notes": payload.get("notes"),
            },
        )


def get_onboarding(user_id: str) -> dict[str, Any]:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                select * from onboarding
                where user_id = :user_id
                order by updated_at desc
                limit 1
                """
            ),
            {"user_id": user_id},
        ).first()
    if not row:
        return {
            "step": "orient",
            "complete": False,
            "collected": {},
        }

    m = row._mapping
    return {
        "step": m["step"],
        "complete": bool(m["complete"]),
        "collected": json.loads(m["collected"] or "{}"),
    }


def save_onboarding(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                select id from onboarding
                where user_id = :user_id
                order by updated_at desc
                limit 1
                """
            ),
            {"user_id": user_id},
        ).first()
        now = datetime.utcnow()
        data = json.dumps(payload.get("collected", {}))
        if row:
            conn.execute(
                text(
                    """
                    update onboarding
                    set step = :step, complete = :complete, collected = :collected, updated_at = :updated_at
                    where id = :id
                    """
                ),
                {
                    "id": row._mapping["id"],
                    "step": payload["step"],
                    "complete": payload.get("complete", False),
                    "collected": data,
                    "updated_at": now,
                },
            )
        else:
            conn.execute(
                text(
                    """
                    insert into onboarding (id, user_id, step, complete, collected, updated_at)
                    values (:id, :user_id, :step, :complete, :collected, :updated_at)
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "step": payload["step"],
                    "complete": payload.get("complete", False),
                    "collected": data,
                    "updated_at": now,
                },
            )
    return get_onboarding(user_id)


def create_knowledge(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    record_id = str(uuid.uuid4())
    now = datetime.utcnow()
    embedding = payload.get("embedding")
    if embedding is None:
        try:
            embedding = embed_text(f"{payload['title']}\n{payload['content']}")
        except Exception:
            # Keep knowledge ingestion available even when embedding providers are down.
            embedding = []
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into knowledge (id, user_id, title, content, source, tags, embedding, embedding_model, created_at)
                values (:id, :user_id, :title, :content, :source, :tags, :embedding, :embedding_model, :created_at)
                """
            ),
            {
                "id": record_id,
                "user_id": user_id,
                "title": payload["title"],
                "content": payload["content"],
                "source": payload.get("source"),
                "tags": json.dumps(payload.get("tags") or []),
                "embedding": json.dumps(embedding),
                "embedding_model": payload.get("embedding_model") or os.getenv("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small"),
                "created_at": now,
            },
        )
        row = conn.execute(
            text("select * from knowledge where id = :id and user_id = :user_id"),
            {"id": record_id, "user_id": user_id},
        ).one()
    m = row._mapping
    return {
        "id": m["id"],
        "title": m["title"],
        "content": m["content"],
        "source": m["source"],
        "tags": json.loads(m["tags"] or "[]"),
        "embedding": json.loads(m["embedding"] or "[]"),
        "embedding_model": m["embedding_model"],
        "created_at": _to_datetime(m["created_at"]),
    }


def list_knowledge(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                select * from knowledge
                where user_id = :user_id
                order by created_at desc
                limit :limit
                """
            ),
            {"user_id": user_id, "limit": limit},
        ).all()
    output: list[dict[str, Any]] = []
    for row in rows:
        m = row._mapping
        output.append(
            {
                "id": m["id"],
                "title": m["title"],
                "content": m["content"],
                "source": m["source"],
                "tags": json.loads(m["tags"] or "[]"),
                "embedding": json.loads(m["embedding"] or "[]"),
                "embedding_model": m["embedding_model"],
                "created_at": _to_datetime(m["created_at"]),
            }
        )
    return output


def search_knowledge(user_id: str, query: str, limit: int = 5) -> list[dict[str, Any]]:
    pool = list_knowledge(user_id, limit=200)
    if not pool:
        return []

    try:
        query_embedding = embed_text(query)
    except Exception:
        query_embedding = []

    scored: list[tuple[float, dict[str, Any]]] = []
    if query_embedding:
        for item in pool:
            score = cosine_similarity(query_embedding, item.get("embedding") or [])
            if score > 0:
                scored.append((score, item))

    if not scored:
        terms = [term.strip().lower() for term in query.split() if len(term.strip()) > 2]
        for item in pool:
            haystack = f"{item['title']}\n{item['content']}\n{' '.join(item['tags'])}".lower()
            score = sum(1 for term in terms if term in haystack)
            if score > 0:
                scored.append((float(score), item))

    scored.sort(key=lambda t: t[0], reverse=True)
    return [item for _, item in scored[:limit]] if scored else pool[: min(limit, len(pool))]


def update_knowledge_embedding(user_id: str, knowledge_id: str) -> dict[str, Any] | None:
    with engine.begin() as conn:
        row = conn.execute(
            text("select * from knowledge where id = :id and user_id = :user_id"),
            {"id": knowledge_id, "user_id": user_id},
        ).first()
        if not row:
            return None

        m = row._mapping
        embedding = embed_text(f"{m['title']}\n{m['content']}")
        conn.execute(
            text(
                """
                update knowledge
                set embedding = :embedding, embedding_model = :embedding_model
                where id = :id and user_id = :user_id
                """
            ),
            {
                "id": knowledge_id,
                "user_id": user_id,
                "embedding": json.dumps(embedding),
                "embedding_model": os.getenv("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small"),
            },
        )
        updated = conn.execute(
            text("select * from knowledge where id = :id and user_id = :user_id"),
            {"id": knowledge_id, "user_id": user_id},
        ).one()

    um = updated._mapping
    return {
        "id": um["id"],
        "title": um["title"],
        "content": um["content"],
        "source": um["source"],
        "tags": json.loads(um["tags"] or "[]"),
        "embedding": json.loads(um["embedding"] or "[]"),
        "embedding_model": um["embedding_model"],
        "created_at": _to_datetime(um["created_at"]),
    }


def create_assistant_log(user_id: str, payload: dict[str, Any]) -> str:
    log_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into assistant_logs (
                    id,
                    user_id,
                    template_id,
                    raw_question,
                    question,
                    citation_count,
                    answer_chars,
                    status,
                    error,
                    latency_ms
                )
                values (
                    :id,
                    :user_id,
                    :template_id,
                    :raw_question,
                    :question,
                    :citation_count,
                    :answer_chars,
                    :status,
                    :error,
                    :latency_ms
                )
                """
            ),
            {
                "id": log_id,
                "user_id": user_id,
                "template_id": payload.get("template_id"),
                "raw_question": payload.get("raw_question"),
                "question": payload["question"],
                "citation_count": int(payload.get("citation_count") or 0),
                "answer_chars": int(payload.get("answer_chars") or 0),
                "status": payload.get("status") or "success",
                "error": payload.get("error"),
                "latency_ms": int(payload.get("latency_ms") or 0),
            },
        )
    return log_id


def update_assistant_feedback(
    user_id: str,
    log_id: str,
    score: int,
    note: str | None = None,
) -> bool:
    with engine.begin() as conn:
        row = conn.execute(
            text("select id from assistant_logs where id = :id and user_id = :user_id"),
            {"id": log_id, "user_id": user_id},
        ).first()
        if not row:
            return False

        conn.execute(
            text(
                """
                update assistant_logs
                set feedback_score = :feedback_score,
                    feedback_note = :feedback_note,
                    feedback_ts = :feedback_ts
                where id = :id and user_id = :user_id
                """
            ),
            {
                "id": log_id,
                "user_id": user_id,
                "feedback_score": score,
                "feedback_note": note,
                "feedback_ts": datetime.utcnow(),
            },
        )
    return True


def get_assistant_template_metrics(user_id: str, limit: int = 10) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                select
                    coalesce(template_id, 'unlabeled') as template_id,
                    count(*) as queries,
                    avg(citation_count) as avg_citations,
                    avg(answer_chars) as avg_answer_chars,
                    100.0 * avg(case when status = 'success' then 1.0 else 0.0 end) as success_rate,
                    sum(case when feedback_score is not null then 1 else 0 end) as feedback_count,
                    avg(feedback_score) as avg_feedback_score,
                    max(ts) as last_used
                from assistant_logs
                where user_id = :user_id
                group by coalesce(template_id, 'unlabeled')
                order by queries desc, last_used desc
                limit :limit
                """
            ),
            {"user_id": user_id, "limit": limit},
        ).all()

    output: list[dict[str, Any]] = []
    for row in rows:
        m = row._mapping
        output.append(
            {
                "template_id": m["template_id"],
                "queries": int(m["queries"] or 0),
                "avg_citations": float(m["avg_citations"] or 0),
                "avg_answer_chars": float(m["avg_answer_chars"] or 0),
                "success_rate": float(m["success_rate"] or 0),
                "feedback_count": int(m["feedback_count"] or 0),
                "avg_feedback_score": float(m["avg_feedback_score"] or 0),
                "last_used": _to_datetime(m["last_used"]),
            }
        )

    return output


def get_assistant_weekly_summary(user_id: str, window_days: int = 7) -> dict[str, Any]:
    since = datetime.utcnow() - timedelta(days=window_days)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                select
                    coalesce(template_id, 'unlabeled') as template_id,
                    count(*) as queries,
                    avg(citation_count) as avg_citations,
                    100.0 * avg(case when status = 'success' then 1.0 else 0.0 end) as success_rate,
                    sum(case when feedback_score is not null then 1 else 0 end) as feedback_count,
                    avg(feedback_score) as avg_feedback_score
                from assistant_logs
                where user_id = :user_id and ts >= :since
                group by coalesce(template_id, 'unlabeled')
                having count(*) > 0
                """
            ),
            {"user_id": user_id, "since": since},
        ).all()

    scored: list[dict[str, Any]] = []
    total_queries = 0
    for row in rows:
        m = row._mapping
        queries = int(m["queries"] or 0)
        success_rate = float(m["success_rate"] or 0)
        avg_citations = float(m["avg_citations"] or 0)
        avg_feedback_score = float(m["avg_feedback_score"] or 0)
        feedback_count = int(m["feedback_count"] or 0)

        total_queries += queries

        # Weighted for practical quality: user feedback > reliability > grounding depth.
        quality_score = (avg_feedback_score * 60.0) + (success_rate * 0.35) + (avg_citations * 3.0)

        scored.append(
            {
                "template_id": m["template_id"],
                "queries": queries,
                "success_rate": success_rate,
                "avg_citations": avg_citations,
                "feedback_count": feedback_count,
                "avg_feedback_score": avg_feedback_score,
                "quality_score": round(quality_score, 2),
            }
        )

    if not scored:
        return {
            "window_days": window_days,
            "total_queries": 0,
            "top_template": None,
            "bottom_template": None,
            "summary": "No assistant queries recorded in this window.",
        }

    scored.sort(key=lambda item: item["quality_score"], reverse=True)
    top = scored[0]
    bottom = scored[-1]

    summary = (
        f"Top template is {top['template_id']} (score {top['quality_score']}). "
        f"Lowest is {bottom['template_id']} (score {bottom['quality_score']})."
    )

    return {
        "window_days": window_days,
        "total_queries": total_queries,
        "top_template": top,
        "bottom_template": bottom,
        "summary": summary,
    }
