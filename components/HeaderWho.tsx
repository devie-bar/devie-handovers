"use client";

import { useHandovers } from "@/components/HandoversProvider";
import { SignOutButton } from "@/components/SignOutButton";

export function HeaderWho() {
  const { author, setAuthor, people, status } = useHandovers();
  return (
    <div className="ho-who">
      <label className="ho-caption" htmlFor="author">Closing manager</label>
      <select id="author" aria-label="Who is closing" value={author} onChange={(e) => setAuthor(e.target.value)}>
        {people.map((p) => <option key={p}>{p}</option>)}
      </select>
      <span className="ho-st" aria-live="polite">{status}</span>
      <SignOutButton />
    </div>
  );
}
