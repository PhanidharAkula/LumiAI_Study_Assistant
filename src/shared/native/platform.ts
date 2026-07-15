/**
 * Native platform detection - dependency-free on purpose so importing it costs
 * the web bundle nothing (no @capacitor/core pulled into the site).
 *
 * The Capacitor bridge injects `window.Capacitor` before any app script runs,
 * so these answers are reliable from module-evaluation time onward (they're
 * used by module-level constants like the API base URL).
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capacitorGlobal(): CapacitorGlobal | undefined {
  return typeof window !== "undefined"
    ? (window as { Capacitor?: CapacitorGlobal }).Capacitor
    : undefined;
}

/** True when running inside the packaged iOS/Android app (never the website). */
export function isNativeApp(): boolean {
  return capacitorGlobal()?.isNativePlatform?.() === true;
}

/** "ios" | "android" on native; "web" on the website. */
export function nativePlatform(): string {
  return capacitorGlobal()?.getPlatform?.() ?? "web";
}
