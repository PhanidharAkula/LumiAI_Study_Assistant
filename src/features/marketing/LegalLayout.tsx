import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { UI } from "@shared/components/atlas";
import { BackButton } from "@shared/components/controls";

// Shared chrome for the public /privacy and /terms pages: the centered content
// column, the kit back button, and the prose typography (styled from one
// place via descendant arbitrary-variants so every h1/h2/p/ul/li/a matches the
// Luminarium's editorial register).
const PROSE = [
  "[&_h1]:font-display [&_h1]:text-[36px] [&_h1]:font-semibold [&_h1]:tracking-[-0.01em] [&_h1]:mb-2 [&_h1]:cursor-default",
  "[&_h2]:font-display [&_h2]:text-[21px] [&_h2]:font-semibold [&_h2]:mt-9 [&_h2]:mb-2.5 [&_h2]:cursor-default",
  "[&_p]:leading-[1.75] [&_p]:mb-3.5 [&_p]:text-ink/90 [&_p]:text-[15px] [&_p]:cursor-default",
  "[&_ul]:mt-1.5 [&_ul]:mb-4 [&_ul]:ml-[22px] [&_ul]:leading-[1.75] [&_ul]:text-[15px]",
  "[&_li]:mb-2",
  "[&_a]:text-gold-deep [&_a]:underline [&_a]:decoration-gold/40 [&_a]:underline-offset-2 [&_a]:cursor-pointer hover:[&_a]:decoration-gold-deep",
  "[&_strong]:font-semibold",
].join(" ");

const LegalLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[100dvh] w-full justify-center px-5 pb-24 pt-12">
      <div className="w-full max-w-[760px] cursor-default">
        <BackButton
          className="mb-8"
          onClick={() => navigate("/")}
          label="Back to home"
        />

        <p className={`${UI.overline} mb-3`}>Lumi AI · Records</p>
        <div className={`${UI.rule} mb-8`} />

        <div className={PROSE}>{children}</div>
      </div>
    </div>
  );
};

export default LegalLayout;
