"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHandovers } from "@/components/HandoversProvider";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * DESIGN.md pattern 3.1. Ported from the Liquid Library's TopNav
 * (devie-archive/components/Archive.jsx, "Top navigation"): the full bar is
 * justified between the wordmark and the account controls and is measured, not
 * a breakpoint. When it does not fit, it becomes one Menu button (two lines
 * that rotate into a cross) that drops the whole navigation down. The Library
 * also has hover sub-menus and an EN/FR toggle; Handovers has neither, so
 * those parts are not carried over. Keep the markup and the .ho-top styles in
 * app/globals.css in step with the Library's .dv-top styles.
 */
const NAV_FULL_GAP = 28; // .ho-top-in column gap in full mode; compact mode tightens it, so never read it live

const SECTIONS = [
  { key: "tonight", label: "Tonight", href: "/" },
  { key: "log", label: "Log", href: "/log" },
  { key: "maintenance", label: "Maintenance", href: "/maintenance" },
];

export function PrimaryNav() {
  const pathname = usePathname();
  const { status } = useHandovers();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
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
      // The full bar fills the column between the wordmark and the account controls.
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
                {SECTIONS.map((s) => (
                  <Link
                    key={s.key} href={s.href} className={"ho-navpanel-item" + (isActive(s.href) ? " on" : "")}
                    aria-current={isActive(s.href) ? "page" : undefined} onClick={() => setMenuOpen(false)}
                  >
                    {s.label}
                  </Link>
                ))}
                {/* The account controls leave the collapsed header, so they sit at the foot of the panel. */}
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
          {SECTIONS.map((s) => (
            <Link key={s.key} href={s.href} className={"ho-tab" + (isActive(s.href) ? " on" : "")} aria-current={isActive(s.href) ? "page" : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="ho-navmeasure" aria-hidden="true">
        <div ref={measureRef} className="ho-toptabs">
          {SECTIONS.map((s) => <span key={s.key} className="ho-tab">{s.label}</span>)}
        </div>
      </div>
    </>
  );
}
