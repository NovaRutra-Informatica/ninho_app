import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  addActivity,
  normalizeActivity,
  activeSeconds,
  type ActivityDay,
  type ActivityRoute,
} from "../domain/activity";
const key = "ninho-route-activity-v1";
let snapshot: ActivityDay[] | undefined;
let storageOk = true;
const listeners = new Set<() => void>();
function read() {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(key);
    snapshot = normalizeActivity(
      raw && raw.length < 250000 ? JSON.parse(raw) : [],
    );
  } catch {
    snapshot = [];
    storageOk = false;
  }
  return snapshot;
}
function publish() {
  for (const listener of listeners) listener();
}
export function recordActivity(
  route: ActivityRoute,
  patch: Parameters<typeof addActivity>[3],
  at = Date.now(),
) {
  snapshot = addActivity(read(), route, at, patch);
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
    storageOk = true;
  } catch {
    storageOk = false;
  }
  publish();
}
export function clearActivity() {
  snapshot = [];
  window.dispatchEvent(new Event("ninho-activity-cleared"));
  try {
    localStorage.removeItem(key);
    storageOk = true;
  } catch {
    storageOk = false;
  }
  publish();
}
export function activityStored() {
  return storageOk;
}
export function useActivity() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    read,
    read,
  );
}
export function useRouteActivity(route: ActivityRoute | null) {
  const visitState = useRef<{ route: ActivityRoute | null; visited: boolean }>({
    route: null,
    visited: false,
  });
  useEffect(() => {
    if (visitState.current.route !== route)
      visitState.current = { route, visited: false };
    if (!route) return;
    let mark = Date.now(),
      lastInput = mark,
      foreground = !document.hidden && document.hasFocus(),
      visited = visitState.current.visited;
    function visit() {
      if (!visited) {
        recordActivity(route!, { visits: 1 });
        visited = true;
        visitState.current.visited = true;
      }
    }
    if (foreground) visit();
    function flush() {
      const now = Date.now();
      const seconds = activeSeconds(mark, now, lastInput, foreground);
      if (seconds) {
        // Split a sample at local midnight; the day is a local calendar day.
        const boundary = new Date(mark);
        boundary.setHours(24, 0, 0, 0);
        const before = Math.min(
          seconds,
          Math.max(0, Math.floor((boundary.getTime() - mark) / 1000)),
        );
        if (before) recordActivity(route!, { activeSeconds: before }, mark);
        if (seconds > before)
          recordActivity(route!, { activeSeconds: seconds - before }, now);
      }
      mark = now;
    }
    function suspend() {
      if (!foreground) return;
      flush();
      foreground = false;
      recordActivity(route!, { backgrounds: 1 });
    }
    function resume() {
      if (document.hidden || !document.hasFocus()) return;
      foreground = true;
      mark = Date.now();
      lastInput = mark;
      visit();
    }
    function visibility() {
      if (document.hidden) suspend();
      else resume();
    }
    function cleared() {
      mark = Date.now();
      lastInput = mark;
    }
    function input() {
      if (!foreground) return;
      if (Date.now() - lastInput > 60000) flush();
      lastInput = Date.now();
    }
    const interval = setInterval(flush, 30000);
    window.addEventListener("ninho-activity-cleared", cleared);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", suspend);
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", suspend);
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
      window.addEventListener(event, input, { capture: true, passive: true });
    return () => {
      flush();
      clearInterval(interval);
      window.removeEventListener("ninho-activity-cleared", cleared);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", suspend);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pagehide", suspend);
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"])
        window.removeEventListener(event, input, true);
    };
  }, [route]);
}
