/**
 * Controls catalog + per-assessment tracking helpers.
 * Client-safe.
 */
import type { FrameworkKey, QuestionRow, AnswerRow } from "@/lib/assessment";
import { RATING_SCORE } from "@/lib/assessment";

export const CONTROL_STATUSES = ["not_started", "in_progress", "implemented", "not_required"] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

export const CONTROL_STATUS_LABEL: Record<ControlStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  implemented: "Implemented",
  not_required: "Not required",
};

export const CONTROL_STATUS_TONE: Record<ControlStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-gold/20 text-foreground",
  implemented: "bg-sage/15 text-sage",
  not_required: "bg-accent text-muted-foreground",
};

export interface ControlRow {
  id: string;
  key: string;
  framework: string; // 'iso27002' | 'nist_800_53'
  ref: string;
  title: string;
  category: string | null;
  description: string | null;
  mappings: Partial<Record<FrameworkKey | "iso27001" | "nist_csf" | "eu_nis2", string[]>>;
}

export interface AssessmentControlRow {
  id: string;
  assessment_id: string;
  control_id: string;
  status: ControlStatus;
  implemented_at: string | null;
  target_date: string | null;
  owner: string | null;
  reason: string | null;
  updated_at: string;
}

/**
 * Resolve which catalog controls address a given question, based on the
 * question's `mappings.iso27001` (ISO Annex A refs) and `mappings.nist_800_53`.
 */
export function controlsForQuestion(q: QuestionRow, catalog: ControlRow[]): ControlRow[] {
  const isoRefs = new Set((q.mappings.iso27001 ?? []).map((r) => r.replace(/^A\./, "")));
  const nistRefs = new Set(q.mappings.nist_800_53 ?? []);
  return catalog.filter((c) => {
    if (c.framework === "iso27002" && isoRefs.has(c.ref)) return true;
    if (c.framework === "nist_800_53" && nistRefs.has(c.ref)) return true;
    return false;
  });
}

/**
 * For the top-N priority-gap questions, count how many gaps each control
 * would help close. Returns descending by count.
 */
export interface RecommendedControl {
  control: ControlRow;
  gapCount: number;
  gapQuestionIds: string[];
  weight: number;
  status: ControlStatus | null;
}

export function recommendedControls(
  gapQuestions: QuestionRow[],
  catalog: ControlRow[],
  statusMap: Map<string, AssessmentControlRow>,
): RecommendedControl[] {
  const scoreMap = new Map<string, RecommendedControl>();
  for (const q of gapQuestions) {
    const cs = controlsForQuestion(q, catalog);
    for (const c of cs) {
      const prev = scoreMap.get(c.id);
      if (prev) {
        prev.gapCount += 1;
        prev.gapQuestionIds.push(q.id);
        prev.weight += q.weight;
      } else {
        const status = statusMap.get(c.id)?.status ?? null;
        scoreMap.set(c.id, {
          control: c,
          gapCount: 1,
          gapQuestionIds: [q.id],
          weight: q.weight,
          status,
        });
      }
    }
  }
  return Array.from(scoreMap.values())
    .filter((r) => r.status !== "implemented" && r.status !== "not_required")
    .sort((a, b) => b.gapCount - a.gapCount || b.weight - a.weight);
}

/**
 * Given all questions/answers, return the questions that are gaps (answered
 * < fully, not N/A). Sorted by gap weight desc.
 */
export function gapQuestions(questions: QuestionRow[], answers: AnswerRow[], limit = 15): QuestionRow[] {
  const answerMap = new Map(answers.map((a) => [a.question_id, a]));
  return questions
    .map((q) => {
      const a = answerMap.get(q.id);
      const s = a && a.rating !== "na" ? RATING_SCORE[a.rating] : null;
      const gap = s === null ? q.weight : (1 - s) * q.weight;
      return { q, gap };
    })
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
    .map((r) => r.q);
}

export function controlStatusSummary(rows: AssessmentControlRow[], totalCatalog: number) {
  const counts: Record<ControlStatus, number> = {
    not_started: 0,
    in_progress: 0,
    implemented: 0,
    not_required: 0,
  };
  for (const r of rows) counts[r.status] += 1;
  const tracked = rows.length;
  const untracked = Math.max(0, totalCatalog - tracked);
  const effectiveTotal = totalCatalog - counts.not_required;
  const pctImplemented = effectiveTotal > 0 ? counts.implemented / effectiveTotal : 0;
  return { counts, tracked, untracked, pctImplemented };
}
