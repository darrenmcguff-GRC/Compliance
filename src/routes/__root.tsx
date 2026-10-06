import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Compass } from "lucide-react";

import "@fontsource/instrument-serif/400.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { CookieConsent } from "@/components/cookie-consent";

function BrandHeader() {
  return (
    <header className="border-b border-border bg-background/85 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
        <Link to="/" className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-ember" strokeWidth={1.5} />
          <span className="font-display text-xl">CISO Compass</span>
        </Link>
      </div>
    </header>
  );
}

function NotFoundComponent() {
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <div className="mx-auto flex max-w-md flex-col items-center px-6 pt-24 pb-24 text-center">
        <h1 className="font-display text-7xl text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The link may be broken, or the assessment may have been deleted.
        </p>
        <div className="mt-6 flex gap-2">
          <Link
            to="/"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <div className="mx-auto flex max-w-md flex-col items-center px-6 pt-24 pb-24 text-center">
        <h1 className="font-display text-3xl text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try refreshing or head back home.
        </p>
        <div className="mt-6 flex gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CISO Compass — Cyber Maturity Assessments for vCISOs" },
      { name: "description", content: "Run a single cyber maturity assessment and map results to ISO 27001, Cyber Essentials, IASME Cyber Assurance, NCSC CAF and NIST CSF 2.0. Built for vCISOs." },
      { property: "og:title", content: "CISO Compass — Cyber Maturity Assessments for vCISOs" },
      { property: "og:description", content: "Run a single cyber maturity assessment and map results to ISO 27001, Cyber Essentials, IASME Cyber Assurance, NCSC CAF and NIST CSF 2.0. Built for vCISOs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CISO Compass — Cyber Maturity Assessments for vCISOs" },
      { name: "twitter:description", content: "Run a single cyber maturity assessment and map results to ISO 27001, Cyber Essentials, IASME Cyber Assurance, NCSC CAF and NIST CSF 2.0. Built for vCISOs." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bbc08dd5-2dfd-43b2-9c1b-a270c8d92c98/id-preview-d1adc728--ce99ebc9-efa4-4d40-89ab-b3c6ecf439d7.lovable.app-1783199348583.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bbc08dd5-2dfd-43b2-9c1b-a270c8d92c98/id-preview-d1adc728--ce99ebc9-efa4-4d40-89ab-b3c6ecf439d7.lovable.app-1783199348583.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
      <CookieConsent />
    </QueryClientProvider>
  );
}
