import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout for /auth and its children.
 * Renders an Outlet so children (sign-in form, mfa-enrol, mfa-verify, recover)
 * all show inside the same shell. Pathless so it doesn't add a segment
 * beyond /auth.
 */
export const Route = createFileRoute("/auth")({
  component: () => <Outlet />,
});
