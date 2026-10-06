import { useMemo } from "react";
import { cn } from "@/lib/utils";

type Strength = "too-weak" | "weak" | "fair" | "strong" | "excellent";

function scorePassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: Strength; pct: number } {
  if (!pw) return { score: 0, label: "too-weak", pct: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;

  // Penalise common patterns
  if (/^(password|qwerty|12345|11111|abc)/i.test(pw)) score = Math.max(0, score - 1);

  const labels: Strength[] = ["too-weak", "weak", "fair", "strong", "excellent"];
  return {
    score: Math.min(4, score) as 0 | 1 | 2 | 3 | 4,
    label: labels[Math.min(4, score)],
    pct: (Math.min(4, score) / 4) * 100,
  };
}

const LABEL_TEXT: Record<Strength, string> = {
  "too-weak": "Too weak",
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
  excellent: "Excellent",
};

const BAR_COLOR: Record<Strength, string> = {
  "too-weak": "bg-destructive",
  weak: "bg-destructive/70",
  fair: "bg-amber-500",
  strong: "bg-emerald-500",
  excellent: "bg-emerald-600",
};

export function PasswordStrength({ password }: { password: string }) {
  const { score, label, pct } = useMemo(() => scorePassword(password), [password]);

  if (!password) return null;

  return (
    <div className="mt-1 space-y-1">
      <div className="flex h-1.5 w-full gap-0.5 rounded-full bg-muted overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-full flex-1 transition-colors",
              i < score ? BAR_COLOR[label] : "bg-transparent",
            )}
          />
        ))}
      </div>
      <p
        className={cn(
          "text-xs",
          label === "too-weak" || label === "weak"
            ? "text-destructive"
            : label === "fair"
            ? "text-amber-600"
            : "text-emerald-600",
        )}
        aria-live="polite"
      >
        {LABEL_TEXT[label]} · {pct.toFixed(0)}%
      </p>
    </div>
  );
}
