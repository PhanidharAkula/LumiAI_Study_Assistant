import { useState } from "react";
import { motion } from "framer-motion";
import { getPlatform, getInAppBrowserName } from "@shared/lib/inAppBrowser";
import { CornerTicks, LumiStar, UI } from "@shared/components/atlas";
import { Button } from "@shared/components/controls";
import { fadeRise, stagger } from "@shared/motion";

// Shown instead of the sign-in screens when the app is opened inside an
// embedded in-app browser (LinkedIn, Instagram, etc.), where Google OAuth is
// blocked. Guides the user out to their real browser, where sign-in works.
const OpenInBrowser = () => {
  const [copied, setCopied] = useState(false);
  const platform = getPlatform();
  const appName = getInAppBrowserName();
  const url = window.location.href;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // On Android we can force-open the link in Chrome via an intent URL.
  const handleOpenChrome = () => {
    const { host, pathname, search, hash } = window.location;
    window.location.href = `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  const instruction =
    platform === "ios"
      ? "Tap the ••• or share icon at the top, then choose Open in Safari."
      : platform === "android"
        ? "Tap the ⋮ menu, then choose Open in Chrome."
        : "Open this link in your browser to continue.";

  return (
    <motion.div
      className="flex min-h-dvh w-full items-center justify-center px-6 py-10"
      initial="hidden"
      animate="visible"
      variants={stagger(0.1, 0.1)}
    >
      <motion.div
        className={`${UI.plate} flex w-full max-w-110 flex-col items-center gap-4 px-9 py-10 text-center max-[480px]:px-6 max-[480px]:py-8`}
        variants={fadeRise}
      >
        <CornerTicks />

        <motion.div variants={fadeRise} className="text-ink/40">
          <LumiStar size={52} orbit />
        </motion.div>

        <motion.p className={UI.overline} variants={fadeRise}>
          Lumi AI
        </motion.p>

        <motion.h1
          className="font-display text-[26px] font-semibold leading-tight text-ink max-[480px]:text-[22px]"
          variants={fadeRise}
        >
          Open in your browser
        </motion.h1>

        <motion.p
          className="text-[14.5px] leading-[1.65] text-muted"
          variants={fadeRise}
        >
          {appName
            ? `It looks like you opened Lumi AI inside ${appName}. `
            : "It looks like you opened Lumi AI inside an in-app browser. "}
          Google sign-in doesn&rsquo;t work here for security reasons - please
          open Lumi AI in your browser to continue.
        </motion.p>

        <motion.div
          className="w-full rounded-lg border border-solid border-line bg-cream/80 px-4.5 py-3.5 text-[14px] font-medium leading-[1.55] text-ink"
          variants={fadeRise}
        >
          {instruction}
        </motion.div>

        {platform === "android" && (
          <Button variants={fadeRise} onClick={handleOpenChrome}>
            Open in Chrome
          </Button>
        )}

        <Button variant="ghost" variants={fadeRise} onClick={handleCopy}>
          {copied ? "Link copied ✦" : "Copy link"}
        </Button>
      </motion.div>
    </motion.div>
  );
};

export default OpenInBrowser;
