import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

// Shared chrome for the public /privacy and /terms pages: the centered content
// column, the framer back button, and the prose typography (reproduced from the
// old LegalPage.css via descendant arbitrary-variants so every h1/h2/p/ul/li/a
// is styled from one place instead of repeating classes on each element).
const PROSE = [
  "[&_h1]:text-[2rem] [&_h1]:font-bold [&_h1]:mb-1.5 [&_h1]:cursor-default",
  "[&_h2]:text-[1.2rem] [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2.5 [&_h2]:cursor-default",
  "[&_p]:leading-[1.7] [&_p]:mb-3.5 [&_p]:text-ink [&_p]:cursor-default",
  "[&_ul]:mt-1.5 [&_ul]:mb-4 [&_ul]:ml-[22px] [&_ul]:leading-[1.7]",
  "[&_li]:mb-2",
  "[&_a]:text-ink [&_a]:no-underline [&_a]:cursor-pointer",
  "[&_strong]:font-semibold",
].join(" ");

const LegalLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[100dvh] w-full justify-center px-5 pt-12 pb-24">
      <div className={`w-full max-w-[800px] cursor-default ${PROSE}`}>
        <motion.button
          className="back-button mb-7"
          onClick={() => navigate("/")}
          whileHover={{
            x: -5,
            transition: { type: "spring", stiffness: 300, damping: 5 },
          }}
          whileTap={{ scale: 0.98 }}
          aria-label="Back to home"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </motion.button>

        {children}
      </div>
    </div>
  );
};

export default LegalLayout;
