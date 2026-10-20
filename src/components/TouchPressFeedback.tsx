import { useEffect } from "react";

const pressableSelector = [
  "button:not(:disabled):not([aria-disabled='true'])",
  "a[href]:not([aria-disabled='true'])",
  "[role='button']:not([aria-disabled='true'])",
  "[role='tab']:not([aria-disabled='true'])",
  "[role='menuitem']:not([aria-disabled='true'])",
  "[role='option']:not([aria-disabled='true'])",
  "[role='switch']:not([aria-disabled='true'])",
  "summary",
  "[data-press-feedback]",
].join(",");

const releaseDelay = 140;

export function TouchPressFeedback() {
  useEffect(() => {
    const activePointers = new Map<number, HTMLElement>();
    const pointerCounts = new Map<HTMLElement, number>();
    const releaseTimers = new Map<HTMLElement, number>();

    const clearReleaseTimer = (element: HTMLElement) => {
      const timer = releaseTimers.get(element);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        releaseTimers.delete(element);
      }
    };

    const releasePointer = (pointerId: number, immediately = false) => {
      const element = activePointers.get(pointerId);
      if (!element) return;

      activePointers.delete(pointerId);
      const count = (pointerCounts.get(element) ?? 1) - 1;
      if (count > 0) {
        pointerCounts.set(element, count);
        return;
      }

      pointerCounts.delete(element);
      clearReleaseTimer(element);
      if (immediately) {
        element.classList.remove("touch-pressed");
        return;
      }

      const timer = window.setTimeout(() => {
        element.classList.remove("touch-pressed");
        releaseTimers.delete(element);
      }, releaseDelay);
      releaseTimers.set(element, timer);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        (event.pointerType !== "touch" && event.pointerType !== "pen") ||
        !(event.target instanceof Element)
      )
        return;

      const element = event.target.closest<HTMLElement>(pressableSelector);
      if (!element) return;

      clearReleaseTimer(element);
      pointerCounts.set(element, (pointerCounts.get(element) ?? 0) + 1);
      activePointers.set(event.pointerId, element);
      element.classList.add("touch-pressed");
    };

    const onPointerUp = (event: PointerEvent) =>
      releasePointer(event.pointerId);
    const onPointerCancel = (event: PointerEvent) =>
      releasePointer(event.pointerId, true);
    const onWindowBlur = () => {
      for (const pointerId of activePointers.keys())
        releasePointer(pointerId, true);
    };

    document.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", onWindowBlur);
      for (const timer of releaseTimers.values()) window.clearTimeout(timer);
      for (const element of [...pointerCounts.keys(), ...releaseTimers.keys()])
        element.classList.remove("touch-pressed");
    };
  }, []);

  return null;
}
