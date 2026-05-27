import { lazy, Suspense } from "react";
import type { LottieComponentProps } from "lottie-react";

// lottie-web is large (~250 KB). Defer it so pages paint immediately and the
// animation streams in after, with a same-size placeholder to avoid layout
// shift. Drop-in replacement for lottie-react's <Lottie />.
const Lottie = lazy(() => import("lottie-react"));

export default function LazyLottie(props: Omit<LottieComponentProps, "ref">) {
  return (
    <Suspense fallback={<div style={props.style} aria-hidden="true" />}>
      <Lottie {...props} />
    </Suspense>
  );
}
