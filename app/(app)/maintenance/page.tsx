"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MaintenancePanel } from "@/components/MaintenancePanel";

// Below 840px Maintenance is its own section. At 840px and above it is the
// right rail on every page, so a wide window sent here goes back to Tonight.
export default function MaintenancePage() {
  const router = useRouter();
  useEffect(() => {
    const mq = window.matchMedia("(min-width:840px)");
    const go = () => { if (mq.matches) router.replace("/"); };
    go();
    mq.addEventListener("change", go);
    return () => mq.removeEventListener("change", go);
  }, [router]);

  return (
    <section className="ho-narrow-only">
      <h1>Maintenance</h1>
      <p className="ho-lede">Reported once, held until someone marks it done.</p>
      <div style={{ marginTop: 32 }}>
        <MaintenancePanel />
      </div>
    </section>
  );
}
