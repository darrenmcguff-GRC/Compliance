import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ChevronDown, ChevronRight, Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FRAMEWORKS, type QuestionRow, type AnswerRow, type FrameworkKey } from "@/lib/assessment";
import {
  CONTROL_STATUSES,
  CONTROL_STATUS_LABEL,
  CONTROL_STATUS_TONE,
  controlStatusSummary,
  controlsForQuestion,
  gapQuestions,
  type ControlRow,
  type AssessmentControlRow,
  type ControlStatus,
} from "@/lib/controls";

export const Route = createFileRoute("/_authenticated/assessments/$id_/controls")({
  component: ControlsPage,
});

function ControlsPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [frameworkFilter, setFrameworkFilter] = useState<"all" | "iso27002" | "nist_800_53">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ControlStatus>("all");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const assessment = useQuery({
    queryKey: ["assessment", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments").select("*, clients(name)").eq("id", id).single();
      if (error) throw error;
      return data;
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

  const statusMap = useMemo(
    () => new Map((acRows.data ?? []).map((r) => [r.control_id, r])),
    [acRows.data],
  );

  const gapControlIds = useMemo(() => {
    if (!questions.data || !answers.data || !catalog.data) return new Set<string>();
    const gaps = gapQuestions(questions.data, answers.data, 30);
    const ids = new Set<string>();
    for (const q of gaps) for (const c of controlsForQuestion(q, catalog.data)) ids.add(c.id);
    return ids;
  }, [questions.data, answers.data, catalog.data]);

  const filtered = useMemo(() => {
    if (!catalog.data) return [];
    const s = search.trim().toLowerCase();
    return catalog.data.filter((c) => {
      if (frameworkFilter !== "all" && c.framework !== frameworkFilter) return false;
      const status = statusMap.get(c.id)?.status ?? "not_started";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (gapsOnly && !gapControlIds.has(c.id)) return false;
      if (s) {
        const hay = `${c.ref} ${c.title} ${c.category ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [catalog.data, frameworkFilter, statusFilter, gapsOnly, gapControlIds, search, statusMap]);

  const grouped = useMemo(() => {
    const g = new Map<string, ControlRow[]>();
    for (const c of filtered) {
      const key = `${c.framework}::${c.category ?? "Other"}`;
      const arr = g.get(key) ?? [];
      arr.push(c);
      g.set(key, arr);
    }
    return Array.from(g.entries()).map(([k, items]) => {
      const [fw, cat] = k.split("::");
      return { fw, cat, items };
    });
  }, [filtered]);

  const upsert = useMutation({
    mutationFn: async (patch: Partial<AssessmentControlRow> & { control_id: string }) => {
      const existing = statusMap.get(patch.control_id);
      const row = {
        assessment_id: id,
        control_id: patch.control_id,
        status: patch.status ?? existing?.status ?? "not_started",
        implemented_at: patch.implemented_at ?? existing?.implemented_at ?? null,
        target_date: patch.target_date ?? existing?.target_date ?? null,
        owner: patch.owner ?? existing?.owner ?? null,
        reason: patch.reason ?? existing?.reason ?? null,
      };
      const { error } = await supabase
        .from("assessment_controls")
        .upsert(row, { onConflict: "assessment_id,control_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assessment-controls", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!assessment.data || !catalog.data || !acRows.data) {
    return <AppShell><div className="text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  const clientName = (assessment.data.clients as { name?: string } | null)?.name ?? "";
  const summary = controlStatusSummary(acRows.data, catalog.data.length);

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/assessments/$id"
            params={{ id }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to assessment
          </Link>
          <h1 className="mt-2 font-display text-4xl">Controls</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clientName} · {assessment.data.title}
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Implemented</div>
          <div className="mt-1 font-display text-3xl">{Math.round(summary.pctImplemented * 100)}%</div>
          <div className="text-xs text-muted-foreground">{summary.counts.implemented} of {catalog.data.length - summary.counts.not_required}</div>
        </CardContent></Card>
        {CONTROL_STATUSES.map((s) => (
          <Card key={s}><CardContent className="p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{CONTROL_STATUS_LABEL[s]}</div>
            <div className="mt-1 font-display text-3xl">{summary.counts[s]}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mt-6"><CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search controls…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={frameworkFilter} onValueChange={(v) => setFrameworkFilter(v as typeof frameworkFilter)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Framework" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All frameworks</SelectItem>
              <SelectItem value="iso27002">ISO/IEC 27002:2022</SelectItem>
              <SelectItem value="nist_800_53">NIST SP 800-53</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CONTROL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{CONTROL_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant={gapsOnly ? "default" : "outline"} onClick={() => setGapsOnly((v) => !v)}>
            <Filter className="mr-2 h-4 w-4" /> Gaps only
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Showing {filtered.length} of {catalog.data.length} catalog controls
        </div>
      </CardContent></Card>

      {/* Groups */}
      <div className="mt-6 space-y-6">
        {grouped.map(({ fw, cat, items }) => (
          <div key={`${fw}-${cat}`}>
            <h2 className="mb-2 flex items-center gap-2 font-display text-lg">
              <span>{fw === "iso27002" ? "ISO 27002" : "NIST 800-53"}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{cat}</span>
              <Badge variant="outline" className="ml-1 text-[10px]">{items.length}</Badge>
            </h2>
            <div className="space-y-2">
              {items.map((c) => {
                const ac = statusMap.get(c.id);
                const status = ac?.status ?? "not_started";
                const isOpen = expanded === c.id;
                return (
                  <Card key={c.id}>
                    <CardContent className="p-0">
                      <button
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-accent/40"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wider text-muted-foreground">{c.ref}</span>
                            <span className="font-medium">{c.title}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {Object.entries(c.mappings).flatMap(([fk, refs]) => {
                              const meta = FRAMEWORKS.find((f) => f.key === (fk as FrameworkKey));
                              if (!meta || !refs || refs.length === 0) return [];
                              return [
                                <Badge key={fk} variant="outline" className="text-[10px]">
                                  {meta.short}: {refs.slice(0, 3).join(", ")}{refs.length > 3 ? `+${refs.length - 3}` : ""}
                                </Badge>,
                              ];
                            })}
                            {gapControlIds.has(c.id) && (
                              <Badge className="bg-ember/15 text-ember text-[10px]">Priority gap</Badge>
                            )}
                          </div>
                        </div>
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px]", CONTROL_STATUS_TONE[status])}>
                          {CONTROL_STATUS_LABEL[status]}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-border px-5 py-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="text-xs uppercase tracking-wider text-muted-foreground">Status</label>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {CONTROL_STATUSES.map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => upsert.mutate({ control_id: c.id, status: s, implemented_at: s === "implemented" ? (ac?.implemented_at ?? new Date().toISOString().slice(0, 10)) : ac?.implemented_at ?? null })}
                                    className={cn(
                                      "rounded-md border px-3 py-1.5 text-xs transition",
                                      status === s ? "border-ember bg-ember/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                                    )}
                                  >
                                    {CONTROL_STATUS_LABEL[s]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs uppercase tracking-wider text-muted-foreground">Owner</label>
                              <Input
                                className="mt-2"
                                placeholder="e.g. Head of IT"
                                defaultValue={ac?.owner ?? ""}
                                onBlur={(e) => {
                                  if ((ac?.owner ?? "") !== e.target.value) {
                                    upsert.mutate({ control_id: c.id, owner: e.target.value || null });
                                  }
                                }}
                              />
                            </div>
                            {status === "implemented" && (
                              <div>
                                <label className="text-xs uppercase tracking-wider text-muted-foreground">Implementation date</label>
                                <Input
                                  type="date"
                                  className="mt-2"
                                  defaultValue={ac?.implemented_at ?? ""}
                                  onBlur={(e) => {
                                    if ((ac?.implemented_at ?? "") !== e.target.value) {
                                      upsert.mutate({ control_id: c.id, implemented_at: e.target.value || null });
                                    }
                                  }}
                                />
                              </div>
                            )}
                            {(status === "not_started" || status === "in_progress") && (
                              <div>
                                <label className="text-xs uppercase tracking-wider text-muted-foreground">Target implementation date</label>
                                <Input
                                  type="date"
                                  className="mt-2"
                                  defaultValue={ac?.target_date ?? ""}
                                  onBlur={(e) => {
                                    if ((ac?.target_date ?? "") !== e.target.value) {
                                      upsert.mutate({ control_id: c.id, target_date: e.target.value || null });
                                    }
                                  }}
                                />
                              </div>
                            )}
                            <div className="md:col-span-2">
                              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                                {status === "not_required" ? "Reason (why is this not required?)" : "Notes"}
                              </label>
                              <Textarea
                                className="mt-2"
                                placeholder={status === "not_required" ? "Justify why this control is out of scope…" : "Notes, evidence links, decisions…"}
                                defaultValue={ac?.reason ?? ""}
                                onBlur={(e) => {
                                  if ((ac?.reason ?? "") !== e.target.value) {
                                    upsert.mutate({ control_id: c.id, reason: e.target.value || null });
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">No controls match the current filter.</div>
        )}
      </div>
    </AppShell>
  );
}
