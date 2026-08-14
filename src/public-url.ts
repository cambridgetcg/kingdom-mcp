function ipv4Bytes(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const bytes = parts.map(Number);
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null;
}

function isPublicIpv4(bytes: number[]): boolean {
  const [a, b] = bytes;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 88 && bytes[2] === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && bytes[2] === 100))) return false;
  if (a === 203 && b === 0 && bytes[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function ipv6Words(host: string): number[] | null {
  if (!host.includes(":")) return null;
  const pieces = host.split("::");
  if (pieces.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const words: number[] = [];
    for (const part of side.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
      words.push(Number.parseInt(part, 16));
    }
    return words;
  };
  const left = parseSide(pieces[0] ?? "");
  const right = parseSide(pieces[1] ?? "");
  if (!left || !right) return null;
  if (pieces.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function isPublicIpv6(words: number[]): boolean {
  // IPv4-mapped addresses inherit the IPv4 decision.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isPublicIpv4([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]);
  }
  // 6to4 embeds an IPv4 destination in the next 32 bits. Treat the whole
  // deprecated transition range as non-canonical for public source receipts;
  // in particular, it must not tunnel a special-use IPv4 literal past checks.
  if (words[0] === 0x2002) return false;
  // Canonical public source URLs should use global unicast, not unspecified,
  // loopback, unique-local, link-local, multicast, translation, or other
  // special-purpose space.
  if ((words[0] & 0xe000) !== 0x2000 || words[0] === 0x3ffe) return false;
  if (words[0] === 0x2001 && (words[1] <= 0x01ff || words[1] === 0x0db8)) return false;
  if (words[0] === 0x3fff && words[1] <= 0x0fff) return false;
  return true;
}

export function isPublicHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
    if (host === "localhost" || host.endsWith(".localhost") || host === "local" || host.endsWith(".local")) return false;
    const v4 = ipv4Bytes(host);
    if (v4 && !isPublicIpv4(v4)) return false;
    const v6 = ipv6Words(host);
    if (v6 && !isPublicIpv6(v6)) return false;
    return true;
  } catch {
    return false;
  }
}
