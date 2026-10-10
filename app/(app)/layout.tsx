import { redirect } from "next/navigation";
import { getHandoversUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { PrimaryNav } from "@/components/PrimaryNav";
import { EstateNav } from "@/components/EstateNav";
import { HeaderWho } from "@/components/HeaderWho";
import { HandoversProvider } from "@/components/HandoversProvider";
import { MaintenancePanel } from "@/components/MaintenancePanel";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getHandoversUser();
  if (!user) redirect("/login");

  // Handovers is open to anyone with a row in public.profiles.
  if (!user.hasAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl text-ink">No access to Handovers</h1>
          <p className="mt-2 text-sm text-ink-soft">
            You are signed in as {user.email}, but this account has no profile yet. Ask an admin to add you.
          </p>
          <div className="mt-6">
            <SignOutButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* DESIGN.md 3.7: identical estate strip at the top of every app */}
      <EstateNav current="handovers" />
      <div className="ho-app">
        <HandoversProvider displayName={user.displayName}>
          <header className="ho-hdr">
            <div className="ho-in">
              <PrimaryNav />
              <HeaderWho />
            </div>
          </header>
          <div className="ho-wrap">
            <main>{children}</main>
            <aside className="ho-rail" aria-label="Maintenance">
              <div className="ho-sticky">
                <h2 className="ho-rail-title">Maintenance</h2>
                <div style={{ marginTop: 16 }}>
                  <MaintenancePanel />
                </div>
              </div>
            </aside>
          </div>
        </HandoversProvider>
      </div>
    </>
  );
}
