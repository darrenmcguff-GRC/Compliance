import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-4xl">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: 21 July 2026</p>

        <section className="mt-10 space-y-4 text-sm leading-7">
          <p>
            CISO Compass is a cyber maturity assessment tool for vCISOs. This
            page explains what data we collect, why, and what we do with it.
          </p>

          <h2 className="font-display text-2xl pt-4">What we store</h2>
          <p>
            When you create an account, we store your email address, display
            name, and a hashed password. When you sign in with a 2-step
            verification code, we store the enrolment record for that
            authenticator and a list of recovery codes (one-time use) so you
            can recover access if you lose your device.
          </p>
          <p>
            When you run an assessment, we store the questions, your answers
            and any evidence notes you write. This data is associated with
            your account and with the client you create.
          </p>

          <h2 className="font-display text-2xl pt-4">Where the data lives</h2>
          <p>
            All data is stored in our self-hosted Supabase database on
            infrastructure we control. We do not use any third-party analytics,
            error tracking, or advertising services. We do not sell or share
            data with any third party.
          </p>

          <h2 className="font-display text-2xl pt-4">Cookies and local storage</h2>
          <p>
            CISO Compass uses only essential cookies and local storage. These
            hold your sign-in session, the work-in-progress answers for the
            assessment you're filling in, and your choice about the cookie
            notice. We do not use third-party trackers, fingerprinting, or
            analytics.
          </p>

          <h2 className="font-display text-2xl pt-4">Your rights</h2>
          <p>
            You can export your data, change your email, change your password,
            disable 2-step verification, and delete your account at any time
            from the settings page. Deletion is permanent and removes your
            account, assessments, and answers.
          </p>

          <h2 className="font-display text-2xl pt-4">Contact</h2>
          <p>
            For privacy enquiries, email{" "}
            <a href="mailto:privacy@cybergrc.co.uk" className="text-foreground underline">
              privacy@cybergrc.co.uk
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
