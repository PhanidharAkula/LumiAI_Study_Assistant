import { useEffect } from "react";

const ORIGIN = "https://www.studywithlumi.com";

interface PageMeta {
  /** Document title for this route (browser tab + search snippet). */
  title: string;
  /** Optional meta description override for this route. */
  description?: string;
  /** Path for the canonical URL, e.g. "/login". Omit for non-canonical routes. */
  path?: string;
}

/**
 * Per-route <head> for the SPA: sets document.title, and optionally the meta
 * description and canonical link, restoring the previous values on unmount.
 * The base index.html already carries the homepage title/description/canonical;
 * this lets each public page (login, legal, ...) declare its own so Google and
 * browser tabs see distinct, accurate metadata instead of one shared title.
 */
export function usePageMeta({ title, description, path }: PageMeta): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const descEl = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    const prevDesc = descEl?.getAttribute("content") ?? null;
    if (descEl && description) descEl.setAttribute("content", description);

    const canonEl = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );
    const prevCanon = canonEl?.getAttribute("href") ?? null;
    if (canonEl && path) canonEl.setAttribute("href", `${ORIGIN}${path}`);

    return () => {
      document.title = prevTitle;
      if (descEl && prevDesc !== null) descEl.setAttribute("content", prevDesc);
      if (canonEl && prevCanon !== null)
        canonEl.setAttribute("href", prevCanon);
    };
  }, [title, description, path]);
}
