import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-ember" strokeWidth={1.5} />
          <span className="font-display text-xl">CISO Compass</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {children}
        </nav>
      </div>
    </header>
  );
}
