import { flushSync } from "react-dom";

export function reduceMotion(preference = false): boolean {
  return (
    preference ||
    (typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches))
  );
}

export function scrollBehavior(preference = false): ScrollBehavior {
  return reduceMotion(preference) ? "instant" : "smooth";
}

let active: { transition: ViewTransition; commit: () => void } | undefined;

export function transitionPage(update: () => void, preference = false): void {
  // Skipping still runs the callback: commit once now to prevent stale navigation.
  if (active) {
    const previous = active;
    active = undefined;
    previous.transition.skipTransition();
    previous.commit();
    delete document.documentElement.dataset.pageTransition;
  }
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    flushSync(update);
    if (
      typeof document !== "undefined" &&
      document.documentElement.dataset.pageTransition === "true"
    ) {
      // Finish entry animations to avoid capturing opacity:0. Changing CSS instead
      // can restart the animation when the snapshot disappears.
      for (const animation of document.getAnimations?.() || []) {
        const effect = animation.effect as KeyframeEffect | null;
        if (
          effect?.target instanceof Element &&
          effect.target.closest(".main-content") &&
          Number.isFinite(effect.getTiming().iterations)
        ) {
          try {
            animation.finish();
          } catch {
            // Unsupported timelines must not block navigation.
          }
        }
      }
    }
  };
  if (
    reduceMotion(preference) ||
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function"
  ) {
    commit();
    return;
  }
  let transition: ViewTransition;
  document.documentElement.dataset.pageTransition = "true";
  try {
    transition = document.startViewTransition(commit);
  } catch {
    delete document.documentElement.dataset.pageTransition;
    commit();
    return;
  }
  active = { transition, commit };
  // Hidden windows and rapid navigation can reject ready after a valid navigation.
  void transition.ready.catch(() => undefined);
  const release = () => {
    if (active?.transition === transition) {
      active = undefined;
      delete document.documentElement.dataset.pageTransition;
    }
  };
  void transition.finished.then(release, release);
}
