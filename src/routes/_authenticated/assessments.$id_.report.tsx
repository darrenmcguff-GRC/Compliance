import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileText, FileSpreadsheet, FileType2 } from "lucide-react";
import { computeScores, frameworkCoverage, gapList, scoreLabel, RATING_LABEL, FRAMEWORKS, type QuestionRow, type AnswerRow } from "@/lib/assessment";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { exportAssessment } from "@/lib/exports.functions";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { recommendedControls, gapQuestions as gapQs, CONTROL_STATUS_LABEL, CONTROL_STATUS_TONE, type ControlRow, type AssessmentControlRow } from "@/lib/controls";


export const Route = createFileRoute("/_authenticated/assessments/$id_/report")({
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const exportFn = useServerFn(exportAssessment);
  const [busy, setBusy] = useState<string | null>(null);

  const assessment = useQuery({
    queryKey: ["assessment", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments").select("*, clients(name, sector, size)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const questions = useQuery({
    queryKey: ["questions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("questions").select("*").order("domain").order("ordinal");
      if (error) throw error;
      return data as unknown as QuestionRow[];
    },
  });
  const answers = useQuery({
    queryKey: ["answers", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("answers").select("question_id,rating,evidence").eq("assessment_id", id);
      if (error) throw error;
      return (data ?? []) as AnswerRow[];
    },
  });

  const catalog = useQuery({
    queryKey: ["controls-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("controls").select("*").order("framework").order("ref");
      if (error) throw error;
      return (data ?? []) as unknown as ControlRow[];
    },
    staleTime: 60_000,
  });
  const acRows = useQuery({
    queryKey: ["assessment-controls", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_controls").select("*").eq("assessment_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as AssessmentControlRow[];
    },
  });

  const recommended = useMemo(() => {
    if (!questions.data || !answers.data || !catalog.data) return [];
    const statusMap = new Map((acRows.data ?? []).map((r) => [r.control_id, r]));
    const gapsTop = gapQs(questions.data, answers.data, 15);
    return recommendedControls(gapsTop, catalog.data, statusMap).slice(0, 15);
  }, [questions.data, answers.data, catalog.data, acRows.data]);


  const scores = useMemo(() => {
    if (!questions.data || !answers.data) return null;
    return computeScores(questions.data, answers.data);
  }, [questions.data, answers.data]);

  const coverage = useMemo(() => {
    if (!questions.data || !answers.data) return null;
    return frameworkCoverage(questions.data, answers.data);
  }, [questions.data, answers.data]);

  const gaps = useMemo(() => {
    if (!questions.data || !answers.data) return [];
    return gapList(questions.data, answers.data).slice(0, 10);
  }, [questions.data, answers.data]);

  async function handleExport(format: "pdf" | "docx" | "xlsx") {
    setBusy(format);
    try {
      const result = await exportFn({ data: { assessmentId: id, format } });
      const bin = atob(result.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${result.filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  if (!assessment.data || !scores || !coverage) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const clientName = (assessment.data.clients as { name?: string } | null)?.name ?? "";
  const overallPct = Math.round(scores.overall * 100);
  const overall = scoreLabel(scores.overall);
  const radarData = scores.domainScores.map((d) => ({ domain: d.domain, value: Math.round(d.score * 100) }));

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/assessments/$id" params={{ id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to assessment
          </Link>
          <h1 className="mt-2 font-display text-4xl">{clientName} — Cyber Maturity Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {assessment.data.title} · {new Date(assessment.data.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => handleExport("pdf")}>
            <FileText className="mr-2 h-4 w-4" /> {busy === "pdf" ? "…" : "PDF"}
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={() => handleExport("docx")}>
            <FileType2 className="mr-2 h-4 w-4" /> {busy === "docx" ? "…" : "DOCX"}
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> {busy === "xlsx" ? "…" : "XLSX"}
          </Button>
        </div>
      </div>

      {/* Headline */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardContent className="p-8">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Overall maturity</div>
            <div className="mt-2 flex items-end gap-3">
              <div className="font-display text-6xl">{overallPct}%</div>
              <div className={cn(
                "mb-2 rounded-full px-3 py-1 text-xs font-medium",
                overall.tone === "sage" && "bg-sage/15 text-sage",
                overall.tone === "gold" && "bg-gold/20 text-foreground",
                overall.tone === "ember" && "bg-ember/15 text-ember",
                overall.tone === "destructive" && "bg-destructive/10 text-destructive",
              )}>
                {overall.label}
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {scores.answered} of {scores.total} questions answered.
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm">Maturity by domain</CardTitle></CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="70%" margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="domain" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar dataKey="value" stroke="var(--color-ink)" fill="var(--color-ember)" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Framework coverage */}
      <h2 className="mt-12 font-display text-2xl">Standards coverage</h2>
      <div className="mt-4 grid gap-3">
        {coverage.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.answeredControls} of {c.totalControls} referenced controls covered
                  </div>
                </div>
                <div className="font-display text-2xl">{Math.round(c.coverage * 100)}%</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-ember" style={{ width: `${Math.round(c.coverage * 100)}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Domain breakdown */}
      <h2 className="mt-12 font-display text-2xl">Domain scores</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {scores.domainScores.map((d) => (
          <Card key={d.domain}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="font-medium">{d.domain}</div>
                <div className="font-display text-xl">{Math.round(d.score * 100)}%</div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-ink" style={{ width: `${Math.round(d.score * 100)}%` }} />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {d.answered} of {d.total} answered
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top gaps */}
      <h2 className="mt-12 font-display text-2xl">Priority gaps</h2>
      <Card className="mt-4">
        <CardContent className="p-0">
          {gaps.length > 0 ? (
            <ul className="divide-y divide-border">
              {gaps.map(({ q, a }) => (
                <li key={q.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">{q.domain} · {q.code}</div>
                      <div className="mt-0.5 font-medium">{q.text}</div>
                      {a?.evidence && <p className="mt-1 text-xs text-muted-foreground">Note: {a.evidence}</p>}
                    </div>
                    <div className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs">
                      {a ? RATING_LABEL[a.rating] : "Unanswered"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">No gaps found — nice work.</div>
          )}
        </CardContent>
      </Card>

      {/* Recommended controls to close the priority gaps */}
      <div className="mt-12 flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl">Recommended controls to implement</h2>
        <Link to="/assessments/$id/controls" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground">
          Open controls tracker →
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ranked by how many priority gaps each control would help close. Excludes controls already marked implemented or not required.
      </p>
      {recommended.length > 0 ? (
        <>
          <Card className="mt-4">
            <CardContent className="p-4" style={{ height: Math.max(240, recommended.length * 34 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={recommended.map((r) => ({
                    label: `${r.control.ref} — ${r.control.title.length > 42 ? r.control.title.slice(0, 42) + "…" : r.control.title}`,
                    value: r.gapCount,
                    framework: r.control.framework,
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <YAxis type="category" dataKey="label" width={280} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <RTooltip formatter={(v: number) => [`${v} gap${v === 1 ? "" : "s"} addressed`, "Impact"]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {recommended.map((r, i) => (
                      <Cell key={i} fill={r.control.framework === "iso27002" ? "var(--color-ember)" : "var(--color-ink)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {recommended.map((r) => (
                  <li key={r.control.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          {r.control.framework === "iso27002" ? "ISO 27002" : "NIST 800-53"} · {r.control.ref}
                        </div>
                        <div className="mt-0.5 font-medium">{r.control.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Addresses {r.gapCount} priority gap{r.gapCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px]", CONTROL_STATUS_TONE[r.status ?? "not_started"])}>
                          {CONTROL_STATUS_LABEL[r.status ?? "not_started"]}
                        </span>
                        <Link to="/assessments/$id/controls" params={{ id }} className="text-xs text-muted-foreground hover:text-foreground">
                          Track →
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="mt-4">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {gaps.length === 0
              ? "No priority gaps to remediate."
              : "All controls that would close the current gaps are already marked implemented or not required."}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
