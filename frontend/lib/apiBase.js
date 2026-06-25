export function resolveApiBase() {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  return configured.replace(/\/+$/, "");
}

export function resolveApiConfigWarning(hostname) {
  const apiBase = resolveApiBase();
  if (apiBase) {
    return "";
  }

  const runningLocally = ["localhost", "127.0.0.1"].includes(hostname);
  if (runningLocally) {
    return "";
  }

  return "NEXT_PUBLIC_API_URL is not configured. Set it to your Railway backend public URL so this link works outside local development.";
}
