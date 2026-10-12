"use client";

import { MaintenancePanel } from "@/components/MaintenancePanel";

// Maintenance as its own page. Tonight also carries the same panel below the
// handover form.
export default function MaintenancePage() {
  return (
    <section>
      <h1>Maintenance</h1>
      <p className="ho-lede">Reported once, held until someone marks it done.</p>
      <div style={{ marginTop: 32 }}>
        <MaintenancePanel />
      </div>
    </section>
  );
}
