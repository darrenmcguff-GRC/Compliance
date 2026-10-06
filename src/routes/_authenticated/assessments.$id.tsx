import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Check, FileText, ListChecks } from "lucide-react";
import { RATINGS, RATING_LABEL, computeScores, type Rating, type QuestionRow, type AnswerRow, FRAMEWORKS } from "@/lib/assessment";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assessments/$id")({
  component: AssessmentRunner,
});

function AssessmentRunner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [domainIndex, setDomainIndex] = useState(0);

  const assessment = useQuery({
    queryKey: ["assessment", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments").select("*, clients(name)").eq("id", id).single();
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

  const domains = useMemo(() => {
    if (!questions.data) return [];
    const seen: string[] = [];
    for (const q of questions.data) if (!seen.includes(q.domain)) seen.push(q.domain);
    return seen;
  }, [questions.data]);

  const activeDomain = domains[domainIndex];
  const domainQuestions = useMemo(
    () => questions.data?.filter((q) => q.domain === activeDomain) ?? [],
    [questions.data, activeDomain],
  );

  const answerMap = useMemo(() => new Map((answers.data ?? []).map((a) => [a.question_id, a])), [answers.data]);

  const upsertAnswer = useMutation({
    mutationFn: async ({ question_id, rating, evidence }: { question_id: string; rating: Rating; evidence?: string | null }) => {
      const { error } = await supabase.from("answers").upsert(
        { assessment_id: id, question_id, rating, evidence: evidence ?? null },
        { onConflict: "assessment_id,question_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["answers", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async () => {
      if (!questions.data || !answers.data) return;
      const { overall } = computeScores(questions.data, answers.data);
      const { error } = await supabase
        .from("assessments")
        .update({ status: "completed", overall_score: overall, completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessment", id] });
      toast.success("Assessment marked complete");
      navigate({ to: "/assessments/$id/report", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!assessment.data || !questions.data || !answers.data) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const scores = computeScores(questions.data, answers.data);
  const totalAnswered = scores.answered;
  const totalCount = scores.total;
  const percent = Math.round((totalAnswered / totalCount) * 100);
  const clientName = (assessment.data.clients as { name?: string } | null)?.name ?? "";

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/clients/$id" params={{ id: assessment.data.client_id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {clientName}
          </Link>
          <h1 className="mt-2 font-display text-4xl">{assessment.data.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalAnswered} of {totalCount} answered · {scores.domainScores.length} domains
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/assessments/$id/controls" params={{ id }}>
            <Button variant="outline"><ListChecks className="mr-2 h-4 w-4" /> Controls</Button>
          </Link>
          <Link to="/assessments/$id/report" params={{ id }}>
            <Button variant="outline"><FileText className="mr-2 h-4 w-4" /> View report</Button>
          </Link>
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Complete
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Overall progress</span>
          <span className="tabular-nums">{totalAnswered}/{totalCount} · {percent}%</span>
        </div>
        <Progress value={percent} aria-label={`Overall assessment progress: ${percent}%`} />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {domains.map((d, i) => {
            const domainQs = questions.data.filter((q) => q.domain === d);
            const answeredInD = domainQs.filter((q) => answerMap.has(q.id)).length;
            const isComplete = answeredInD === domainQs.length;
            const pct = domainQs.length ? Math.round((answeredInD / domainQs.length) * 100) : 0;
            return (
              <button
                key={d}
                onClick={() => setDomainIndex(i)}
                aria-current={i === domainIndex ? "true" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm",
                  i === domainIndex ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {isComplete && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                      aria-label="Complete"
                    />
                  )}
                  <span className="truncate">{d}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums">
                  {answeredInD}/{domainQs.length}
                  {isComplete ? "" : ` · ${pct}%`}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-4">
          <h2 className="font-display text-2xl">{activeDomain}</h2>
          {domainQuestions.map((q) => {
            const a = answerMap.get(q.id);
            return (
              <Card key={q.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">{q.code}</div>
                      <h3 className="mt-1 text-base font-medium">{q.text}</h3>
                      {q.guidance && <p className="mt-1 text-xs text-muted-foreground">{q.guidance}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {FRAMEWORKS.filter((f) => (q.mappings[f.key]?.length ?? 0) > 0).map((f) => (
                        <Badge key={f.key} variant="outline" className="text-[10px]">{f.short}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {RATINGS.map((r) => (
                      <button
                        key={r}
                        onClick={() => upsertAnswer.mutate({ question_id: q.id, rating: r, evidence: a?.evidence })}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-xs transition",
                          a?.rating === r
                            ? "border-ember bg-ember/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {RATING_LABEL[r]}
                      </button>
                    ))}
                  </div>

                  {a?.rating && a.rating !== "na" && (
                    <Textarea
                      className="mt-3 text-sm"
                      placeholder="Evidence / notes (optional)"
                      defaultValue={a?.evidence ?? ""}
                      onBlur={(e) => {
                        if ((a?.evidence ?? "") !== e.target.value) {
                          upsertAnswer.mutate({ question_id: q.id, rating: a.rating, evidence: e.target.value });
                        }
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}

          <div className="flex justify-between pt-4">
            <Button variant="outline" disabled={domainIndex === 0} onClick={() => setDomainIndex((i) => i - 1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous domain
            </Button>
            <Button variant="outline" disabled={domainIndex === domains.length - 1} onClick={() => setDomainIndex((i) => i + 1)}>
              Next domain <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
