import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, ArrowLeft, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients_/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const client = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const assessments = useQuery({
    queryKey: ["assessments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const startAssessment = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("assessments")
        .insert({ client_id: id, owner_id: userRes.user.id, title: `Assessment ${new Date().toLocaleDateString()}` })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (aid) => {
      qc.invalidateQueries({ queryKey: ["assessments", id] });
      navigate({ to: "/assessments/$id", params: { id: aid } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All clients
      </Link>

      {client.data && (
        <>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <h1 className="font-display text-4xl">{client.data.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {[client.data.sector, client.data.size, client.data.contact_email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button onClick={() => startAssessment.mutate()} disabled={startAssessment.isPending}>
              <Plus className="mr-2 h-4 w-4" /> New assessment
            </Button>
          </div>

          {client.data.notes && (
            <Card className="mt-6">
              <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">{client.data.notes}</CardContent>
            </Card>
          )}

          {(() => {
            const list = assessments.data ?? [];
            const inProgress = list.filter((a) => a.status === "in_progress");
            const completed = list.filter((a) => a.status === "completed");
            const other = list.filter((a) => a.status !== "in_progress" && a.status !== "completed");

            const Row = ({ a }: { a: (typeof list)[number] }) => (
              <li key={a.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.status.replace("_", " ")}
                    {a.overall_score != null && ` · ${Math.round(Number(a.overall_score) * 100)}%`}
                    {" · Updated "}{new Date(a.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/assessments/$id" params={{ id: a.id }}>
                    <Button variant="ghost" size="sm">{a.status === "completed" ? "View" : "Continue"}</Button>
                  </Link>
                  <Link to="/assessments/$id/report" params={{ id: a.id }}>
                    <Button variant="outline" size="sm"><FileText className="mr-1 h-4 w-4" /> Report</Button>
                  </Link>
                </div>
              </li>
            );

            const Section = ({ title, items }: { title: string; items: typeof list }) => (
              <div>
                <div className="flex items-center justify-between px-6 py-3">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                {items.length > 0 ? (
                  <ul className="divide-y divide-border border-t border-border">
                    {items.map((a) => <Row key={a.id} a={a} />)}
                  </ul>
                ) : (
                  <div className="border-t border-border px-6 py-6 text-xs text-muted-foreground">None</div>
                )}
              </div>
            );

            return (
              <>
                <h2 className="mt-10 font-display text-2xl">Assessments</h2>
                {list.length === 0 ? (
                  <Card className="mt-4">
                    <CardContent className="p-12 text-center text-sm text-muted-foreground">
                      No assessments yet. Start one to begin capturing answers.
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="mt-4">
                    <CardContent className="divide-y divide-border p-0">
                      <Section title="In progress" items={inProgress} />
                      <Section title="Completed" items={completed} />
                      {other.length > 0 && <Section title="Other" items={other} />}
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </>
      )}
    </AppShell>
  );
}
