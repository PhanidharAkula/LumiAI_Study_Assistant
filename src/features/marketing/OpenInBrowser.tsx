import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { getPlatform, getInAppBrowserName } from "@shared/lib/inAppBrowser";

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

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 100, damping: 12 },
    },
  };

  // Shared button styling (the Android "Open in Chrome" variant only swaps the
  // background). Built as a base + per-variant bg so two conflicting Tailwind
  // background utilities never land on the same element.
  const btnBase =
    "mt-1 px-11 py-[14px] rounded-full border-2 border-solid border-ink text-ink text-[15px] font-bold tracking-[0.5px] shadow-[0px_2px_0_#000]";

  return (
    <motion.div
      className="flex min-h-[100dvh] w-full items-center justify-center px-6 py-10"
      initial="hidden"
      animate="visible"
      transition={{ staggerChildren: 0.12, delayChildren: 0.1 }}
    >
      <motion.div
        className="flex w-full max-w-[440px] flex-col items-center gap-4 rounded-3xl border-[1.5px] border-solid border-black/[0.08] bg-white px-8 py-10 text-center max-[480px]:px-[22px] max-[480px]:py-8"
        variants={itemVariants}
      >
        <motion.p
          className="text-[28px] font-extrabold tracking-[-1px] text-ink"
          variants={itemVariants}
        >
          Lumi AI
        </motion.p>

        <motion.h1
          className="text-[24px] font-bold text-ink max-[480px]:text-[21px]"
          variants={itemVariants}
        >
          Open in your browser
        </motion.h1>

        <motion.p
          className="text-[15px] leading-[1.6] text-muted max-[480px]:text-[14px]"
          variants={itemVariants}
        >
          {appName
            ? `It looks like you opened Lumi AI inside ${appName}. `
            : "It looks like you opened Lumi AI inside an in-app browser. "}
          Google sign-in doesn't work here for security reasons — please open
          Lumi AI in your browser to continue.
        </motion.p>

        <motion.div
          className="w-full rounded-[14px] bg-cream px-[18px] py-[14px] text-[14px] font-semibold leading-[1.5] text-ink"
          variants={itemVariants}
        >
          {instruction}
        </motion.div>

        {platform === "android" && (
          <motion.div
            variants={itemVariants}
            whileHover={{
              scale: 1.03,
              y: -6,
              transition: { type: "spring", stiffness: 300, damping: 5 },
            }}
            whileTap={{ scale: 0.98 }}
          >
            <button className={`${btnBase} bg-sage`} onClick={handleOpenChrome}>
              Open in Chrome
            </button>
          </motion.div>
        )}

        <motion.div
          variants={itemVariants}
          whileHover={{
            scale: 1.03,
            y: -6,
            transition: { type: "spring", stiffness: 300, damping: 5 },
          }}
          whileTap={{ scale: 0.98 }}
        >
          <button className={`${btnBase} bg-white`} onClick={handleCopy}>
            {copied ? "Link copied!" : "Copy link"}
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default OpenInBrowser;
