/**
 * Shared assessment scoring + framework mapping helpers.
 * Client-safe (no server imports).
 */

export const RATINGS = ["not_implemented", "partial", "largely", "fully", "na"] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABEL: Record<Rating, string> = {
  not_implemented: "Not implemented",
  partial: "Partial",
  largely: "Largely",
  fully: "Fully",
  na: "Not applicable",
};

export const RATING_SCORE: Record<Rating, number | null> = {
  not_implemented: 0,
  partial: 0.33,
  largely: 0.67,
  fully: 1,
  na: null,
};

export const FRAMEWORKS = [
  { key: "iso27001", label: "ISO/IEC 27001:2022", short: "ISO 27001" },
  { key: "ce", label: "Cyber Essentials v3.3", short: "Cyber Essentials" },
  { key: "iasme", label: "IASME Cyber Assurance v13", short: "IASME" },
  { key: "caf", label: "NCSC CAF v4.0", short: "CAF" },
  { key: "nist_csf", label: "NIST CSF 2.0", short: "NIST CSF" },
  { key: "nist_800_53", label: "NIST SP 800-53 Rev 5", short: "NIST 800-53" },
  { key: "nist_ai_rmf", label: "NIST AI RMF 1.0", short: "AI RMF" },
  { key: "iso42001", label: "ISO/IEC 42001:2023", short: "ISO 42001" },
  { key: "nist_800_37", label: "NIST SP 800-37 Rev 2 (RMF)", short: "NIST 800-37" },
  { key: "eu_nis2", label: "EU NIS2 Directive (2022/2555)", short: "NIS2" },
  { key: "eu_ai_act", label: "EU AI Act (2024/1689)", short: "EU AI Act" },
] as const;
export type FrameworkKey = (typeof FRAMEWORKS)[number]["key"];

export interface QuestionRow {
  id: string;
  code: string;
  domain: string;
  ordinal: number;
  text: string;
  guidance: string | null;
  weight: number;
  mappings: Partial<Record<FrameworkKey, string[]>>;
}

export interface AnswerRow {
  question_id: string;
  rating: Rating;
  evidence: string | null;
}

export interface DomainScore {
  domain: string;
  score: number;      // 0..1
  answered: number;
  total: number;
  weightSum: number;
}

export function computeScores(questions: QuestionRow[], answers: AnswerRow[]) {
  const answerMap = new Map(answers.map((a) => [a.question_id, a]));
  const domains = new Map<string, DomainScore>();
  let totalWeight = 0;
  let totalScore = 0;
  let answered = 0;

  for (const q of questions) {
    const a = answerMap.get(q.id);
    const d = domains.get(q.domain) ?? { domain: q.domain, score: 0, answered: 0, total: 0, weightSum: 0 };
    d.total += 1;
    if (a && a.rating !== "na") {
      const s = RATING_SCORE[a.rating];
      if (s !== null) {
        d.score += s * q.weight;
        d.weightSum += q.weight;
        d.answered += 1;
        totalScore += s * q.weight;
        totalWeight += q.weight;
        answered += 1;
      }
    } else if (a && a.rating === "na") {
      d.answered += 1;
      answered += 1;
    }
    domains.set(q.domain, d);
  }

  const domainScores = Array.from(domains.values()).map((d) => ({
    ...d,
    score: d.weightSum > 0 ? d.score / d.weightSum : 0,
  }));

  return {
    overall: totalWeight > 0 ? totalScore / totalWeight : 0,
    answered,
    total: questions.length,
    domainScores,
  };
}

/** Coverage per framework: percentage of that framework's mapped controls covered by "fully"/"largely" answers. */
export function frameworkCoverage(questions: QuestionRow[], answers: AnswerRow[]) {
  const answerMap = new Map(answers.map((a) => [a.question_id, a]));
  return FRAMEWORKS.map((f) => {
    const controls = new Map<string, { covered: number; weight: number }>();
    for (const q of questions) {
      const ids = q.mappings[f.key] ?? [];
      const a = answerMap.get(q.id);
      const s = a && a.rating !== "na" ? RATING_SCORE[a.rating] : null;
      for (const c of ids) {
        const prev = controls.get(c) ?? { covered: 0, weight: 0 };
        if (s !== null) {
          prev.covered = Math.max(prev.covered, s);
          prev.weight = 1;
        } else if (prev.weight === 0) {
          prev.weight = 0;
        }
        controls.set(c, prev);
      }
    }
    const all = Array.from(controls.values());
    const answered = all.filter((c) => c.weight > 0);
    const covered = answered.reduce((sum, c) => sum + c.covered, 0);
    return {
      key: f.key,
      label: f.label,
      totalControls: all.length,
      answeredControls: answered.length,
      coverage: answered.length > 0 ? covered / answered.length : 0,
    };
  });
}

export function gapList(questions: QuestionRow[], answers: AnswerRow[]) {
  const answerMap = new Map(answers.map((a) => [a.question_id, a]));
  return questions
    .map((q) => {
      const a = answerMap.get(q.id);
      const s = a && a.rating !== "na" ? RATING_SCORE[a.rating] : null;
      return { q, a, gap: s === null ? null : (1 - s) * q.weight };
    })
    .filter((r) => r.gap !== null && r.gap > 0)
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
}

export function scoreLabel(score: number): { label: string; tone: string } {
  if (score >= 0.85) return { label: "Optimised", tone: "sage" };
  if (score >= 0.65) return { label: "Managed", tone: "gold" };
  if (score >= 0.4) return { label: "Developing", tone: "ember" };
  return { label: "Initial", tone: "destructive" };
}
