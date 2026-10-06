// ── Recovery codes ──────────────────────────────────────────────
// 10 codes × 8 chars, alphanumeric (no I/O/0/1 to avoid ambiguity).
// Generated client-side. Stored server-side as bcrypt hashes via RPC.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryCodes(count = 10, length = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let s = "";
    for (let j = 0; j < length; j++) {
      s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    // Format as XXXX-XXXX for readability
    codes.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return codes;
}

export function formatRecoveryCode(raw: string): string {
  const clean = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return clean;
}
