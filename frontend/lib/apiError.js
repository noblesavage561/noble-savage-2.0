function formatValidationDetail(item) {
  if (!item || typeof item !== "object") {
    return "Validation failed.";
  }

  const loc = Array.isArray(item.loc) ? item.loc.join(".") : "field";
  const msg = typeof item.msg === "string" ? item.msg : "Invalid value.";
  return `${loc}: ${msg}`;
}

export function toErrorMessage(detail, fallback = "Something went wrong.") {
  if (!detail) return fallback;

  if (typeof detail === "string") {
    const cleaned = detail.trim();
    return cleaned || fallback;
  }

  if (Array.isArray(detail)) {
    if (!detail.length) return fallback;
    const first = detail[0];
    if (typeof first === "string") return first;
    return formatValidationDetail(first);
  }

  if (typeof detail === "object") {
    if (typeof detail.message === "string" && detail.message.trim()) {
      return detail.message;
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export async function readErrorMessage(res, fallback = "Something went wrong.") {
  const body = await res.json().catch(() => ({}));
  return toErrorMessage(body?.detail, fallback);
}
