import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileAppShell } from "@/components/mobile-app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, ClipboardCheck, Activity, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null);

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const assessments = useQuery({
    queryKey: ["assessments-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id,title,status,overall_score,updated_at,client_id, clients(name)")
        .order("updated_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: aErr } = await supabase.from("answers").delete().eq("assessment_id", id);
      if (aErr) throw aErr;
      const { error } = await supabase.from("assessments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assessment deleted");
      queryClient.invalidateQueries({ queryKey: ["assessments-recent"] });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      setToDelete(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    },
  });

  const inProgress = assessments.data?.filter((a) => a.status === "in_progress").length ?? 0;
  const completed = assessments.data?.filter((a) => a.status === "completed").length ?? 0;

  return (
    <MobileAppShell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Overview of your engagements.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/clients">
            Manage clients <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat icon={Users} label="Clients" value={clients.data?.length ?? 0} />
        <Stat icon={ClipboardCheck} label="In progress" value={inProgress} />
        <Stat icon={Activity} label="Completed" value={completed} />
      </div>

      <h2 className="mt-12 font-display text-2xl">Recent assessments</h2>
      <Card className="mt-4">
        <CardContent className="p-0">
          {assessments.data && assessments.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {assessments.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {(a.clients as { name?: string } | null)?.name} · {a.status.replace("_", " ")}
                      {a.overall_score != null && ` · ${Math.round(Number(a.overall_score) * 100)}%`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to="/assessments/$id" params={{ id: a.id }}>
                      <Button variant="ghost" size="sm">Continue</Button>
                    </Link>
                    <Link to="/assessments/$id/report" params={{ id: a.id }}>
                      <Button variant="outline" size="sm">Report</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setToDelete({ id: a.id, title: a.title })}
                      aria-label={`Delete ${a.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-4 p-12 text-center">
              <p className="text-sm text-muted-foreground">
                No assessments yet. Add a client to get started.
              </p>
              <Button asChild>
                <Link to="/clients">
                  Add your first client <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <span className="font-medium text-foreground">{toDelete?.title}</span> and all of its answers. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMutation.mutate(toDelete.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileAppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-ember" strokeWidth={1.5} />
      </CardHeader>
      <CardContent><div className="font-display text-4xl">{value}</div></CardContent>
    </Card>
  );
}
