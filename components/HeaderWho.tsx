"use client";

import { useHandovers } from "@/components/HandoversProvider";
import { SignOutButton } from "@/components/SignOutButton";

/** The account controls at the right of the green strip, where the Library puts its EN/FR toggle. */
export function HeaderWho() {
  const { status } = useHandovers();
  return (
    <div className="ho-who">
      <span className="ho-st" aria-live="polite">{status}</span>
      <SignOutButton className="ho-ctl" />
    </div>
  );
}
