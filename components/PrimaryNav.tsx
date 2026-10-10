"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHandovers } from "@/components/HandoversProvider";

/**
 * DESIGN.md pattern 3.1. Three sections, so the bar always fits: PP Editorial,
 * upper case, justified (first flush left, last flush right). At 840px and
 * above too: Maintenance keeps its tab at every width.
 */
export function PrimaryNav() {
  const pathname = usePathname();
  const { items, loaded } = useHandovers();
  const open = items.filter((i) => i.status !== "done").length;
  const cur = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="ho-primary" aria-label="Sections">
      <Link href="/" aria-current={cur("/") ? "page" : undefined}>Tonight</Link>
      <Link href="/log" aria-current={cur("/log") ? "page" : undefined}>Log</Link>
      <Link href="/maintenance" aria-current={cur("/maintenance") ? "page" : undefined}>
        Maintenance
        {loaded && open > 0 && <span className="ho-n ho-num">{open}</span>}
      </Link>
    </nav>
  );
}
