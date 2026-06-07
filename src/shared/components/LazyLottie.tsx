import { lazy, Suspense, useEffect, useState } from "react";
import type { LottieComponentProps } from "lottie-react";

// lottie-web is large (~250 KB). Defer it so pages paint immediately and the
// animation streams in after, with a same-size placeholder to avoid layout
// shift. Drop-in replacement for lottie-react's <Lottie />.
const Lottie = lazy(() => import("lottie-react"));

type AnimationData = LottieComponentProps["animationData"];

type LazyLottieProps = Omit<LottieComponentProps, "ref" | "animationData"> & {
  animationData?: AnimationData;
  // Lazily load heavy animation JSON (e.g. () => import("../assets/x.json"))
  // so it isn't inlined into the page's initial chunk. The JSON downloads as
  // its own async chunk when the component mounts.
  getAnimationData?: () => Promise<unknown>;
};

export default function LazyLottie({
  getAnimationData,
  animationData,
  ...props
}: LazyLottieProps) {
  const [data, setData] = useState<AnimationData | undefined>(animationData);

  useEffect(() => {
    if (!getAnimationData) return;
    let active = true;
    void getAnimationData().then((mod) => {
      if (!active) return;
      const resolved =
        mod && typeof mod === "object" && "default" in mod
          ? (mod as { default: AnimationData }).default
          : (mod as AnimationData);
      setData(resolved);
    });
    return () => {
      active = false;
    };
  }, [getAnimationData]);

  const placeholder = <div style={props.style} aria-hidden="true" />;
  if (!data) return placeholder;

  return (
    <Suspense fallback={placeholder}>
      <Lottie {...props} animationData={data} />
    </Suspense>
  );
}
