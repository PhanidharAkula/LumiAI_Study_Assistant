// Detects embedded in-app browsers (webviews) - e.g. the ones inside LinkedIn,
// Instagram, Facebook/Messenger, X/Twitter. Google blocks OAuth sign-in inside
// these webviews ("Error 403: disallowed_useragent" / "Use secure browsers"),
// so we can't let users reach the Google button there. Instead we detect the
// webview up front and push them out to their real browser (see OpenInBrowser).

export type MobilePlatform = "ios" | "android" | "other";

export function getPlatform(): MobilePlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  // Explicit in-app browser signatures appended to the user-agent by each app.
  const signatures = [
    "LinkedInApp",
    "FBAN",
    "FBAV",
    "FB_IAB",
    "FBIOS", // Facebook / Messenger
    "Instagram",
    "Line/",
    "Twitter", // X / Twitter
    "Snapchat",
    "Pinterest",
    "WhatsApp",
    "TikTok",
    "musical_ly",
    "BytedanceWebview", // TikTok
    "MicroMessenger", // WeChat
  ];
  if (signatures.some((token) => ua.includes(token))) return true;

  // Generic Android WebView marker. Real Chrome for Android does NOT include
  // "; wv)" in its user-agent - only embedded WebViews do.
  if (/\bwv\b/.test(ua) && /Android/i.test(ua)) return true;

  // Generic iOS webview: Safari's UA contains "Safari"; the WKWebViews used by
  // in-app browsers usually don't (and aren't Chrome/Firefox/Edge for iOS).
  // Guard with navigator.standalone so an installed PWA isn't mistaken for one.
  const isStandalonePwa =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (
    getPlatform() === "ios" &&
    !isStandalonePwa &&
    /AppleWebKit/.test(ua) &&
    !/Safari/.test(ua) &&
    !/CriOS|FxiOS|EdgiOS/.test(ua)
  ) {
    return true;
  }

  return false;
}

// Best-effort name of the host app, for a friendlier message ("opened from
// LinkedIn"). Returns null when we can detect a webview but not which app.
export function getInAppBrowserName(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const map: Array<[RegExp, string]> = [
    [/LinkedInApp/, "LinkedIn"],
    [/Instagram/, "Instagram"],
    [/FBAN|FBAV|FB_IAB|FBIOS/, "Facebook"],
    [/Twitter/, "X"],
    [/Snapchat/, "Snapchat"],
    [/Pinterest/, "Pinterest"],
    [/WhatsApp/, "WhatsApp"],
    [/TikTok|musical_ly|BytedanceWebview/, "TikTok"],
    [/Line\//, "LINE"],
    [/MicroMessenger/, "WeChat"],
  ];
  for (const [re, name] of map) {
    if (re.test(ua)) return name;
  }
  return null;
}
