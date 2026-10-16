"use client";

import { useHandovers } from "@/components/HandoversProvider";
import { AccountMenu } from "@/components/AccountMenu";

/** The account controls at the right of the green strip, where the Library puts its EN/FR toggle. */
export function HeaderWho({ name, email }: { name: string; email?: string | null }) {
  const { status } = useHandovers();
  return (
    <div className="ho-who">
      <span className="ho-st" aria-live="polite">{status}</span>
      <AccountMenu name={name} email={email} />
    </div>
  );
}
