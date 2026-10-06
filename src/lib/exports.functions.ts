import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeScores,
  frameworkCoverage,
  gapList,
  scoreLabel,
  RATING_LABEL,
  FRAMEWORKS,
  type QuestionRow,
  type AnswerRow,
} from "@/lib/assessment";

const inputSchema = z.object({
  assessmentId: z.string().uuid(),
  format: z.enum(["pdf", "docx", "xlsx"]),
});

export const exportAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { assessmentId, format } = data;
    const { supabase } = context;

    const { data: assessment, error: aErr } = await supabase
      .from("assessments")
      .select("*, clients(name, sector, size, contact_name, contact_email)")
      .eq("id", assessmentId)
      .single();
    if (aErr || !assessment) throw new Error(aErr?.message ?? "Assessment not found");

    const { data: questions } = await supabase.from("questions").select("*").order("domain").order("ordinal");
    const { data: answers } = await supabase.from("answers").select("question_id,rating,evidence").eq("assessment_id", assessmentId);

    const qs = (questions ?? []) as unknown as QuestionRow[];
    const as = (answers ?? []) as AnswerRow[];

    const scores = computeScores(qs, as);
    const coverage = frameworkCoverage(qs, as);
    const gaps = gapList(qs, as);
    const overallLabel = scoreLabel(scores.overall);
    const client = (assessment.clients as { name?: string; sector?: string; size?: string } | null) ?? {};

    const meta = {
      assessment,
      client,
      questions: qs,
      answers: as,
      scores,
      coverage,
      gaps,
      overallLabel,
      generatedAt: new Date().toISOString(),
    };

    const safeName = (client.name ?? "assessment").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const { buildXlsx } = await import("./exports.server");
      const bytes = await buildXlsx(meta);
      return respond(bytes, `${safeName}-crosswalk-${stamp}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    if (format === "docx") {
      const { buildDocx } = await import("./exports.server");
      const bytes = await buildDocx(meta);
      return respond(bytes, `${safeName}-report-${stamp}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }
    const { buildPdf } = await import("./exports.server");
    const bytes = await buildPdf(meta);
    return respond(bytes, `${safeName}-report-${stamp}.pdf`, "application/pdf");
  });

function respond(bytes: Uint8Array, filename: string, mimeType: string) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), filename, mimeType };
}
