// @vitest-environment jsdom
import { StrictMode } from "react";
import { render, cleanup, act } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { clearActivity, useRouteActivity } from "./activity";
let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T10:00:00"));
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  hidden = false;
  clearActivity();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});
const rows = () =>
  JSON.parse(localStorage.getItem("ninho-route-activity-v1") || "[]") as {
    visits: number;
    activeSeconds: number;
    backgrounds: number;
  }[];
function Surface() {
  useRouteActivity("materials");
  return null;
}
it("conta uma visita em StrictMode, suspende invisibilidade e para após 60 segundos sem interação", () => {
  render(
    <StrictMode>
      <Surface />
    </StrictMode>,
  );
  expect(rows()[0].visits).toBe(1);
  act(() => vi.advanceTimersByTime(30000));
  expect(rows()[0].activeSeconds).toBe(30);
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(120000);
  });
  expect(rows()[0].activeSeconds).toBe(30);
  expect(rows()[0].backgrounds).toBe(1);
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(90000);
  });
  expect(rows()[0].activeSeconds).toBe(90);
});
