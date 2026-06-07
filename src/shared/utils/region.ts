/**
 * Best-effort region detection from the browser timezone.
 * e.g. "America/New_York" → "America", "Australia/Sydney" → "Oceania".
 * Returns "Unknown" when it can't be determined.
 */
export function detectRegion(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return "Unknown";
    const prefix = timeZone.split("/")[0] || "Unknown";
    const regionMap: Record<string, string> = {
      America: "America",
      Europe: "Europe",
      Asia: "Asia",
      Africa: "Africa",
      Australia: "Oceania",
      Pacific: "Oceania",
      Atlantic: "Atlantic",
      Indian: "Indian Ocean",
    };
    return regionMap[prefix] || prefix;
  } catch (e) {
    console.log("Could not detect region:", e);
    return "Unknown";
  }
}
