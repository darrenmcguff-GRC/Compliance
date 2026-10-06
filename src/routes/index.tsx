import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, LayoutGrid, FileText, Layers } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { FRAMEWORKS } from "@/lib/assessment";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader>
        <Link to="/auth" className="text-muted-foreground hover:text-foreground">Sign in</Link>
        <Link to="/auth" className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
          Start free
        </Link>
      </SiteHeader>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-24 pb-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-ember" />
              Built for virtual CISOs
            </div>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] md:text-7xl">
              One assessment.<br/>
              <span className="text-muted-foreground">Every standard.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Run a single, plain-English cyber maturity assessment with your client — and get their
              posture mapped automatically to ISO 27001, Cyber Essentials, IASME Cyber Assurance,
              NCSC CAF and NIST CSF 2.0.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                Start your first assessment <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-5 py-3 text-sm font-medium hover:bg-accent">
                How it works
              </a>
            </div>
          </div>
        </section>

        {/* Frameworks */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Maps to</p>
            <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
              {FRAMEWORKS.map((f) => (
                <span key={f.key} className="font-display text-2xl text-foreground">{f.label}</span>
              ))}
            </div>
          </div>
        </section>

        {/* How */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="font-display text-4xl">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: LayoutGrid, title: "Add your client", body: "Create a workspace for each engagement. Sector, size, contacts — kept private to you." },
              { icon: ShieldCheck, title: "Run the assessment", body: "Answer ~60 plain-English questions grouped by domain. Save evidence notes as you go." },
              { icon: Layers, title: "See every standard", body: "Instant dashboard shows overall maturity plus coverage against ISO, CE, IASME, CAF and NIST." },
              { icon: FileText, title: "Export the report", body: "Board-ready PDF, editable DOCX, and a full XLSX crosswalk — one click each." },
            ].map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs">{i + 1}</span>
                  <Icon className="h-5 w-5 text-ember" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 font-display text-2xl">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-2xl border border-border bg-primary p-12 text-primary-foreground">
            <h2 className="font-display text-4xl">Ready to compass your clients?</h2>
            <p className="mt-3 max-w-xl text-primary-foreground/70">
              Free while in beta. Sign up and run your first assessment in under an hour.
            </p>
            <Link to="/auth" className="mt-6 inline-flex items-center gap-2 rounded-md bg-ember px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} CISO Compass · A tool for virtual CISOs
        </div>
      </footer>
    </div>
  );
}
