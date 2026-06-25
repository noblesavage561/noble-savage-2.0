import os
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

DEFAULT_JWT_SECRET = "dev-only-change-me"
JWT_ALG = "HS256"
DEFAULT_TOKEN_TTL_MINUTES = 720
PWD_ITERATIONS = 390000


def _token_ttl_minutes() -> int:
    raw = os.getenv("TOKEN_TTL_MINUTES", str(DEFAULT_TOKEN_TTL_MINUTES)).strip()
    try:
        ttl = int(raw)
    except ValueError as exc:
        raise RuntimeError("TOKEN_TTL_MINUTES must be an integer") from exc
    if ttl <= 0:
        raise RuntimeError("TOKEN_TTL_MINUTES must be greater than 0")
    return ttl


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)


def validate_auth_config() -> None:
    env = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()
    secret = _jwt_secret()

    if env in {"production", "prod"}:
        if secret == DEFAULT_JWT_SECRET:
            raise RuntimeError("JWT_SECRET must be set in production")
        if len(secret) < 32:
            raise RuntimeError("JWT_SECRET must be at least 32 characters in production")

    _token_ttl_minutes()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PWD_ITERATIONS)
    return f"pbkdf2_sha256${PWD_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        algo, iterations, salt, stored_hex = hashed_password.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations),
        ).hex()
        return hmac.compare_digest(digest, stored_hex)
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_token_ttl_minutes())
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALG)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
