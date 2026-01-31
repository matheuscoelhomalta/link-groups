export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0) {
      const last = pathSegments[pathSegments.length - 1];
      return decodeURIComponent(last).replace(/[-_]/g, " ").slice(0, 50);
    }
    return parsed.hostname;
  } catch {
    return url.slice(0, 50);
  }
}

export function parseUrls(text: string): string[] {
  return text
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseUrlsWithValidation(text: string): {
  valid: string[];
  invalid: string[];
} {
  const lines = parseUrls(text);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    const normalized = normalizeUrl(line);
    if (normalized) {
      valid.push(normalized);
    } else {
      invalid.push(line);
    }
  }

  return { valid, invalid };
}
