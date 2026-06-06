import { useState } from "react";
import { motion } from "framer-motion";
import { getPlatform, getInAppBrowserName } from "../lib/inAppBrowser";
import "./OpenInBrowser.css";

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

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 100, damping: 12 },
    },
  };

  return (
    <motion.div
      className="oib-container"
      initial="hidden"
      animate="visible"
      transition={{ staggerChildren: 0.12, delayChildren: 0.1 }}
    >
      <motion.div className="oib-card" variants={itemVariants}>
        <motion.p className="oib-logo" variants={itemVariants}>
          Lumi AI
        </motion.p>

        <motion.h1 className="oib-title" variants={itemVariants}>
          Open in your browser
        </motion.h1>

        <motion.p className="oib-text" variants={itemVariants}>
          {appName
            ? `It looks like you opened Lumi AI inside ${appName}. `
            : "It looks like you opened Lumi AI inside an in-app browser. "}
          Google sign-in doesn't work here for security reasons — please open
          Lumi AI in your browser to continue.
        </motion.p>

        <motion.div className="oib-steps" variants={itemVariants}>
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
            <button className="oib-btn oib-btn-primary" onClick={handleOpenChrome}>
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
          <button className="oib-btn" onClick={handleCopy}>
            {copied ? "Link copied!" : "Copy link"}
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default OpenInBrowser;
