"use client";

import { useHandovers } from "@/components/HandoversProvider";
import { SignOutButton } from "@/components/SignOutButton";

export function HeaderWho() {
  const { status } = useHandovers();
  return (
    <div className="ho-who">
      <span className="ho-st" aria-live="polite">{status}</span>
      <SignOutButton />
    </div>
  );
}
