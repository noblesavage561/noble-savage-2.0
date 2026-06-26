import asyncio
import os
import time
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    validate_auth_config,
    verify_password,
)
from .assistant_service import query_openrouter
from .knowledge_ingest import build_knowledge_payloads, parse_document
from .onboarding import handle_turn
from .schemas import (
    AssistantFeedbackIn,
    AssistantQueryIn,
    AssistantQueryOut,
    AssistantTemplateMetricsOut,
    AssistantWeeklySummaryOut,
    AuthLoginIn,
    AuthRegisterIn,
    AuthTokenOut,
    KnowledgeIn,
    KnowledgeOut,
    KnowledgeUploadOut,
    MessageOut,
    OnboardingState,
    OnboardingTurnIn,
    OnboardingTurnOut,
    SignalCreate,
    TaskCreate,
    TaskOut,
    TaskPatch,
    UserOut,
    WorkstreamOut,
)
from .store import (
    create_knowledge,
    create_assistant_log,
    create_user,
    create_signal,
    create_task,
    get_user_by_email,
    get_user_by_id,
    get_onboarding,
    init_db,
    list_tasks,
    get_assistant_template_metrics,
    get_assistant_weekly_summary,
    update_assistant_feedback,
    list_knowledge,
    list_workstreams,
    patch_task,
    save_onboarding,
    search_knowledge,
    update_knowledge_embedding,
)


class ConnectionManager:
    def __init__(self) -> None:
        self._clients_by_user: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        if user_id not in self._clients_by_user:
            self._clients_by_user[user_id] = set()
        self._clients_by_user[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        clients = self._clients_by_user.get(user_id)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self._clients_by_user.pop(user_id, None)

    async def broadcast(self, payload: dict[str, Any], user_id: str) -> None:
        clients = self._clients_by_user.get(user_id, set())
        dead: list[WebSocket] = []
        for client in clients:
            try:
                await client.send_json(payload)
            except Exception:
                dead.append(client)
        for client in dead:
            self.disconnect(client, user_id)


manager = ConnectionManager()
app = FastAPI(title="Noble Savage API", version="0.1.0")
security = HTTPBearer()


def _parse_origins() -> list[str]:
    raw = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    origins: list[str] = []
    for origin in raw.split(","):
        value = origin.strip().rstrip("/")
        if not value:
            continue
        if value.startswith(("http://", "https://")):
            origins.append(value)
            continue
        # Allow plain domains in env input and normalize to https for hosted deployments.
        origins.append(f"https://{value}")
    return sorted(set(origins))


cors_allow_origins = _parse_origins()
cors_allow_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX") or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_origin_regex=cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    validate_auth_config()
    init_db()


def current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict[str, Any]:
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@app.get("/health", response_model=MessageOut)
async def health() -> MessageOut:
    return MessageOut(message="ok")


@app.post("/api/auth/register", response_model=AuthTokenOut)
async def auth_register(payload: AuthRegisterIn) -> AuthTokenOut:
    try:
        user = create_user(
            email=payload.email,
            password_hash=hash_password(payload.password),
            name=payload.name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = create_access_token(user["id"], user["email"])
    return AuthTokenOut(access_token=token)


@app.post("/api/auth/login", response_model=AuthTokenOut)
async def auth_login(payload: AuthLoginIn) -> AuthTokenOut:
    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user["id"], user["email"])
    return AuthTokenOut(access_token=token)


@app.get("/api/auth/me", response_model=UserOut)
async def auth_me(user: dict[str, Any] = Depends(current_user)) -> UserOut:
    return UserOut(id=user["id"], email=user["email"], name=user.get("name"))


@app.get("/api/workstreams", response_model=list[WorkstreamOut])
async def get_workstreams(user: dict[str, Any] = Depends(current_user)) -> list[WorkstreamOut]:
    return [WorkstreamOut(**ws) for ws in list_workstreams(user["id"])]


@app.get("/api/knowledge", response_model=list[KnowledgeOut])
async def get_knowledge(user: dict[str, Any] = Depends(current_user)) -> list[KnowledgeOut]:
    return [KnowledgeOut(**k) for k in list_knowledge(user["id"]) ]


@app.post("/api/knowledge", response_model=KnowledgeOut)
async def add_knowledge(payload: KnowledgeIn, user: dict[str, Any] = Depends(current_user)) -> KnowledgeOut:
    try:
        record = create_knowledge(user["id"], payload.model_dump(mode="json"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save knowledge entry: {exc}") from exc
    return KnowledgeOut(**record)


@app.post("/api/knowledge/upload", response_model=KnowledgeUploadOut)
async def upload_knowledge(
    files: list[UploadFile] = File(...),
    user: dict[str, Any] = Depends(current_user),
) -> KnowledgeUploadOut:
    if not files:
        raise HTTPException(status_code=400, detail="No files received.")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Upload up to 20 files at a time.")

    reports: list[dict[str, Any]] = []
    total_entries_created = 0
    failed_files = 0

    for upload in files:
        try:
            raw = await upload.read()
            parsed = parse_document(upload.filename or "uploaded-file", upload.content_type, raw)
            payloads = build_knowledge_payloads(parsed)
            for payload in payloads:
                record = create_knowledge(user["id"], payload)
                _ = KnowledgeOut(**record)
                total_entries_created += 1

            reports.append(
                {
                    "file_name": upload.filename or "uploaded-file",
                    "status": "success",
                    "entries_created": len(payloads),
                    "chunks_created": len(payloads),
                    "extracted_chars": len(parsed.content),
                    "ocr_used": parsed.ocr_used,
                    "warning": "; ".join(parsed.warnings)[:500] if parsed.warnings else None,
                    "error": None,
                }
            )
        except Exception as exc:
            failed_files += 1
            reports.append(
                {
                    "file_name": upload.filename or "uploaded-file",
                    "status": "error",
                    "entries_created": 0,
                    "chunks_created": 0,
                    "extracted_chars": 0,
                    "ocr_used": False,
                    "warning": None,
                    "error": str(exc)[:500],
                }
            )

    successful_files = len(files) - failed_files
    return KnowledgeUploadOut(
        files=reports,
        total_files_received=len(files),
        successful_files=successful_files,
        failed_files=failed_files,
        total_entries_created=total_entries_created,
    )


@app.post("/api/knowledge/{knowledge_id}/reembed", response_model=KnowledgeOut)
async def reembed_knowledge(
    knowledge_id: str, user: dict[str, Any] = Depends(current_user)
) -> KnowledgeOut:
    try:
        record = update_knowledge_embedding(user["id"], knowledge_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not generate embedding: {exc}") from exc
    if not record:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")
    return KnowledgeOut(**record)


@app.post("/api/assistant/query", response_model=AssistantQueryOut)
async def assistant_query(
    payload: AssistantQueryIn, user: dict[str, Any] = Depends(current_user)
) -> AssistantQueryOut:
    started = time.perf_counter()
    citations: list[dict[str, Any]] = []
    query_id: str | None = None
    try:
        citations = search_knowledge(user["id"], payload.question, limit=5)
        answer = await query_openrouter(payload.question, citations)
        latency_ms = int((time.perf_counter() - started) * 1000)
        query_id = create_assistant_log(
            user["id"],
            {
                "template_id": payload.template_id,
                "raw_question": payload.raw_question,
                "question": payload.question,
                "citation_count": len(citations),
                "answer_chars": len(answer),
                "status": "success",
                "latency_ms": latency_ms,
            },
        )
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        try:
            create_assistant_log(
                user["id"],
                {
                    "template_id": payload.template_id,
                    "raw_question": payload.raw_question,
                    "question": payload.question,
                    "citation_count": len(citations),
                    "answer_chars": 0,
                    "status": "error",
                    "error": str(exc)[:1000],
                    "latency_ms": latency_ms,
                },
            )
        except Exception:
            pass
        raise HTTPException(status_code=503, detail=f"Assistant provider unavailable: {exc}") from exc
    return AssistantQueryOut(
        query_id=query_id,
        answer=answer,
        citations=[KnowledgeOut(**c) for c in citations],
    )


@app.get("/api/assistant/metrics", response_model=list[AssistantTemplateMetricsOut])
async def assistant_metrics(user: dict[str, Any] = Depends(current_user)) -> list[AssistantTemplateMetricsOut]:
    rows = get_assistant_template_metrics(user["id"], limit=12)
    return [AssistantTemplateMetricsOut(**row) for row in rows]


@app.get("/api/assistant/metrics/weekly-summary", response_model=AssistantWeeklySummaryOut)
async def assistant_weekly_summary(user: dict[str, Any] = Depends(current_user)) -> AssistantWeeklySummaryOut:
    summary = get_assistant_weekly_summary(user["id"], window_days=7)
    return AssistantWeeklySummaryOut(**summary)


@app.post("/api/assistant/feedback", response_model=MessageOut)
async def assistant_feedback(
    payload: AssistantFeedbackIn,
    user: dict[str, Any] = Depends(current_user),
) -> MessageOut:
    updated = update_assistant_feedback(
        user_id=user["id"],
        log_id=payload.query_id,
        score=payload.score,
        note=payload.note,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Assistant query not found")
    return MessageOut(message="feedback recorded")


@app.get("/api/tasks", response_model=list[TaskOut])
async def get_tasks(
    filter: str | None = Query(default=None), user: dict[str, Any] = Depends(current_user)
) -> list[TaskOut]:
    return [TaskOut(**t) for t in list_tasks(user["id"], filter)]


@app.post("/api/tasks", response_model=TaskOut)
async def add_task(payload: TaskCreate, user: dict[str, Any] = Depends(current_user)) -> TaskOut:
    task = create_task(user["id"], payload.model_dump(mode="json"))
    asyncio.create_task(manager.broadcast({"type": "task.created", "task": task}, user["id"]))
    return TaskOut(**task)


@app.patch("/api/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: str, payload: TaskPatch, user: dict[str, Any] = Depends(current_user)
) -> TaskOut:
    task = patch_task(user["id"], task_id, payload.model_dump(mode="json"))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    asyncio.create_task(manager.broadcast({"type": "task.updated", "task": task}, user["id"]))
    return TaskOut(**task)


@app.post("/api/signals", response_model=MessageOut)
async def add_signal(payload: SignalCreate, user: dict[str, Any] = Depends(current_user)) -> MessageOut:
    create_signal(user["id"], payload.model_dump(mode="json"))
    return MessageOut(message="signal recorded")


@app.get("/api/onboarding", response_model=OnboardingState)
async def onboarding_get(user: dict[str, Any] = Depends(current_user)) -> OnboardingState:
    return OnboardingState(**get_onboarding(user["id"]))


@app.post("/api/onboarding", response_model=OnboardingState)
async def onboarding_post(
    payload: OnboardingState, user: dict[str, Any] = Depends(current_user)
) -> OnboardingState:
    saved = save_onboarding(user["id"], payload.model_dump(mode="json"))
    return OnboardingState(**saved)


@app.post("/api/onboarding/turn", response_model=OnboardingTurnOut)
async def onboarding_turn(
    payload: OnboardingTurnIn, user: dict[str, Any] = Depends(current_user)
) -> OnboardingTurnOut:
    current = get_onboarding(user["id"])
    response = handle_turn(user["id"], current, payload.answer)

    # Keep board in sync when onboarding confirms chokepoint and creates a task.
    if response.get("step") == "rhythm":
        tasks = list_tasks(user["id"], "This Week")
        if tasks:
            newest = tasks[0]
            asyncio.create_task(
                manager.broadcast({"type": "task.created", "task": newest}, user["id"])
            )

    return OnboardingTurnOut(**response)


@app.post("/api/onboarding/reset", response_model=OnboardingState)
async def onboarding_reset(user: dict[str, Any] = Depends(current_user)) -> OnboardingState:
    saved = save_onboarding(user["id"], {"step": "orient", "complete": False, "collected": {}})
    return OnboardingState(**saved)


@app.websocket("/ws/board")
async def board_ws(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Missing subject")
    except Exception:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
