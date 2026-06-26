from datetime import datetime, date
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


TaskPriority = Literal["P1", "P2", "P3"]
TaskStatus = Literal["Backlog", "This Week", "In Progress", "Blocked", "Done"]
SignalKind = Literal["accept", "edit", "dismiss", "correct", "gap"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class TaskCreate(BaseModel):
    ws: str = Field(min_length=1, max_length=120)
    task: str = Field(min_length=1, max_length=300)
    prio: TaskPriority = "P2"
    status: TaskStatus = "Backlog"
    owner: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    deleg: str | None = Field(default=None, max_length=300)
    bot: str | None = Field(default=None, max_length=120)
    due: date | None = None


class TaskPatch(BaseModel):
    task: str | None = Field(default=None, min_length=1, max_length=300)
    prio: TaskPriority | None = None
    status: TaskStatus | None = None
    owner: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    deleg: str | None = Field(default=None, max_length=300)
    bot: str | None = Field(default=None, max_length=120)
    due: date | None = None


class TaskOut(BaseModel):
    id: str
    ws: str
    task: str
    prio: TaskPriority
    status: TaskStatus
    owner: str | None
    notes: str | None
    deleg: str | None
    bot: str | None
    due: date | None
    created_at: datetime
    updated_at: datetime


class SignalCreate(BaseModel):
    kind: SignalKind
    target: str | None = Field(default=None, max_length=120)
    before: str | None = Field(default=None, max_length=4000)
    after: str | None = Field(default=None, max_length=4000)
    agent: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class OnboardingState(BaseModel):
    step: str
    complete: bool = False
    collected: dict = Field(default_factory=dict)


class OnboardingTurnIn(BaseModel):
    answer: str | None = Field(default=None, max_length=2000)


class OnboardingTurnOut(BaseModel):
    step: str
    question: str
    note: str | None = None
    proposals: list[dict[str, Any]] = Field(default_factory=list)
    summary: list[str] = Field(default_factory=list)
    complete: bool = False


class AuthRegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=256)
    name: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL_RE.match(email):
            raise ValueError("Invalid email")
        return email


class AuthLoginIn(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL_RE.match(email):
            raise ValueError("Invalid email")
        return email


class AuthTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    name: str | None = None


class WorkstreamOut(BaseModel):
    id: str
    name: str
    tier: str | None = None
    owner: str | None = None
    objective: str | None = None
    why: str | None = None
    color: str | None = None


class MessageOut(BaseModel):
    message: str


class KnowledgeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=10000)
    source: str | None = Field(default=None, max_length=300)
    tags: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for raw in values:
            tag = raw.strip().lower()
            if not tag:
                continue
            cleaned.append(tag[:40])
        return cleaned


class KnowledgeOut(BaseModel):
    id: str
    title: str
    content: str
    source: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime


class KnowledgeUploadFileOut(BaseModel):
    file_name: str
    status: Literal["success", "error"]
    entries_created: int = 0
    chunks_created: int = 0
    extracted_chars: int = 0
    ocr_used: bool = False
    warning: str | None = None
    error: str | None = None


class KnowledgeUploadOut(BaseModel):
    files: list[KnowledgeUploadFileOut] = Field(default_factory=list)
    total_files_received: int
    successful_files: int
    failed_files: int
    total_entries_created: int


class AssistantQueryIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    raw_question: str | None = Field(default=None, max_length=2000)
    template_id: str | None = Field(default=None, max_length=120)


class AssistantQueryOut(BaseModel):
    query_id: str | None = None
    answer: str
    citations: list[KnowledgeOut] = Field(default_factory=list)


class AssistantFeedbackIn(BaseModel):
    query_id: str = Field(min_length=1, max_length=80)
    score: Literal[-1, 1]
    note: str | None = Field(default=None, max_length=300)


class AssistantTemplateMetricsOut(BaseModel):
    template_id: str
    queries: int
    avg_citations: float
    avg_answer_chars: float
    success_rate: float
    feedback_count: int
    avg_feedback_score: float
    last_used: datetime


class AssistantTemplateInsightOut(BaseModel):
    template_id: str
    queries: int
    success_rate: float
    avg_citations: float
    feedback_count: int
    avg_feedback_score: float
    quality_score: float


class AssistantWeeklySummaryOut(BaseModel):
    window_days: int
    total_queries: int
    top_template: AssistantTemplateInsightOut | None = None
    bottom_template: AssistantTemplateInsightOut | None = None
    summary: str
