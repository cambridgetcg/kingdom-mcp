export function isPublicHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "::1" || host === "0.0.0.0" || host.endsWith(".local")) return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    const v4 = host.match(/^172\.(\d{1,3})\./);
    if (v4 && Number(v4[1]) >= 16 && Number(v4[1]) <= 31) return false;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}
