export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
export const longDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
export const weekday = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" });
export const daysSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86400000));
export const lines = (s: string) =>
  String(s || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
export const eur = (c: number) =>
  (c / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "€";
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
