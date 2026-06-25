export function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  return configured.replace(/\/+$/, "");
}