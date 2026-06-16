import { Constellation } from "@shared/components/atlas";

/**
 * Shared decorative sky: two faint corner constellations - one bleeding past
 * the top-right, one past the bottom-left - so every page and overlay carries
 * the same star-chart framing instead of each hand-rolling its own (or none).
 *
 * Purely decorative: pointer-events-none + aria-hidden, and its own
 * `overflow-hidden` clips the bleed, so the host only needs to establish a
 * positioning context (relative / fixed).
 *
 * `seed` varies the drawn pattern per surface so no two skies look identical.
 */
export function PageBackdrop({
  seed = "lumi",
  behind = true,
}: {
  seed?: string;
  /** Sit behind content via negative z-index (default on) so the decorative
   *  layer can never cover interactive content. Pass `behind={false}` only if a
   *  specific host's own background would otherwise hide it. */
  behind?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${
        behind ? "-z-10" : ""
      }`}
      aria-hidden="true"
    >
      <Constellation
        name={`${seed} north`}
        size={520}
        twinkle
        className="absolute -right-32 -top-20 text-ink/12 max-md:-right-16 max-md:-top-12 max-md:h-64 max-md:w-64 max-[420px]:h-56 max-[420px]:w-56"
      />
      <Constellation
        name={`${seed} south`}
        size={420}
        twinkle
        className="absolute -bottom-28 -left-24 text-ink/11 max-md:-bottom-12 max-md:-left-14 max-md:h-56 max-md:w-56 max-[420px]:h-48 max-[420px]:w-48"
      />
    </div>
  );
}

export default PageBackdrop;
