import { redirect } from "next/navigation";
import { getHandoversUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { AppHeader } from "@/components/AppHeader";
import { HandoversProvider } from "@/components/HandoversProvider";

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
      <div className="ho-app">
        <HandoversProvider displayName={user.displayName}>
          {/* DESIGN.md 3.1, 3.7, 3.8: one sticky green strip carrying wordmark, estate switcher, sections and account */}
          <AppHeader current="handovers" />
          <div className="ho-wrap">
            <main>{children}</main>
          </div>
        </HandoversProvider>
      </div>
    </>
  );
}
