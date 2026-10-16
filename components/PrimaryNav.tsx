"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHandovers } from "@/components/HandoversProvider";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * DESIGN.md pattern 3.1. Ported from the Liquid Library's TopNav: the full bar
 * is justified between the wordmark and the account controls and is measured,
 * not a breakpoint. When it does not fit, it becomes one Menu button that drops
 * the whole navigation down. Two-tier: the green bar carries the top-level
 * sections (today only Service); each section's pages (Tonight, Log,
 * Maintenance) sit in the cream secondary bar (SubNav).
 */
const NAV_FULL_GAP = 28; // .ho-top-in column gap in full mode

export type HoItem = { href: string; label: string };
export type HoGroup = { key: string; label: string; items: HoItem[] };

export const GROUPS: HoGroup[] = [
  { key: "service", label: "Service", items: [
    { href: "/", label: "Tonight" },
    { href: "/log", label: "Log" },
    { href: "/maintenance", label: "Maintenance" },
  ] },
];
export const ALL_PAGES: HoItem[] = GROUPS.flatMap((g) => g.items);

export const isActiveHref = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
export const findActiveGroup = (pathname: string): HoGroup =>
  GROUPS.find((g) => g.items.some((it) => isActiveHref(pathname, it.href))) || GROUPS[0];

export function PrimaryNav() {
  const pathname = usePathname();
  const { status } = useHandovers();
  const isActive = (href: string) => isActiveHref(pathname, href);
  const isGroupActive = (g: HoGroup) => g.items.some((it) => isActive(it.href));
  const measureRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIso(() => {
    const measure = measureRef.current;
    const host = measure?.parentElement?.parentElement as HTMLElement | null | undefined;
    if (!measure || !host) return;
    const check = () => {
      const st = getComputedStyle(host);
      const inner = host.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
      const others = Array.from(host.children).filter(
        (c) => !c.classList.contains("ho-navslot") && getComputedStyle(c).position !== "absolute",
      ) as HTMLElement[];
      const room = inner - others.reduce((w, c) => w + c.offsetWidth, 0) - 2 * NAV_FULL_GAP;
      const next = measure.scrollWidth > room;
      setCompact(next);
      host.classList.toggle("is-compact", next);
      if (!next) setMenuOpen(false);
    };
    check();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }
    const ro = new ResizeObserver(check);
    ro.observe(host);
    ro.observe(measure);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); btnRef.current?.focus(); } };
    const onDown = (e: MouseEvent) => {
      const panel = document.getElementById("ho-navpanel");
      const t = e.target as Node;
      if (panel && !panel.contains(t) && btnRef.current && !btnRef.current.contains(t)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [menuOpen]);

  return (
    <>
      {compact ? (
        <>
          <button
            ref={btnRef} type="button" className="ho-navbtn ho-navslot" aria-label={menuOpen ? "Close menu" : "Menu"}
            aria-expanded={menuOpen} aria-controls="ho-navpanel" onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="ho-burger" aria-hidden="true"><i /><i /></span>
          </button>
          {menuOpen && (
            <nav id="ho-navpanel" className="ho-navpanel" aria-label="Handovers sections">
              <div className="ho-navpanel-in">
                {ALL_PAGES.map((s) => (
                  <Link
                    key={s.href} href={s.href} className={"ho-navpanel-item" + (isActive(s.href) ? " on" : "")}
                    aria-current={isActive(s.href) ? "page" : undefined} onClick={() => setMenuOpen(false)}
                  >
                    {s.label}
                  </Link>
                ))}
                <div className="ho-navpanel-acct">
                  <span className="ho-st" aria-live="polite">{status}</span>
                  <SignOutButton className="ho-ctl" />
                </div>
              </div>
            </nav>
          )}
        </>
      ) : (
        <nav className="ho-toptabs ho-navslot" aria-label="Handovers sections">
          {GROUPS.map((g) => (
            <Link key={g.key} href={g.items[0].href} className={"ho-tab" + (isGroupActive(g) ? " on" : "")} aria-current={isGroupActive(g) ? "page" : undefined}>
              {g.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="ho-navmeasure" aria-hidden="true">
        <div ref={measureRef} className="ho-toptabs">
          {GROUPS.map((g) => <span key={g.key} className="ho-tab">{g.label}</span>)}
        </div>
      </div>
    </>
  );
}
