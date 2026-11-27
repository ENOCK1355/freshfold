import { describe, expect, it } from "vitest";
import { isInterruptedViewTransition } from "../apps/web/src/recoverable-errors.js";

describe("browser transition interruptions", () => {
  it("allows resizing and switching tabs without concealing rendering or duplicate-name failures", () => {
    for (const reason of ["Viewport size changed", "Document hidden"])
      expect(
        isInterruptedViewTransition(
          new DOMException(
            `Transition was aborted because of invalid state. ${reason}`,
            "InvalidStateError",
          ),
        ),
      ).toBe(true);
    for (const error of [
      new DOMException(
        "Transition was aborted because of invalid state. Snapshot capture failed",
        "InvalidStateError",
      ),
      new DOMException(
        "Transition was aborted because of invalid state. Animation start failed",
        "InvalidStateError",
      ),
      new Error("Unexpected rendering failure"),
      null,
    ])
      expect(isInterruptedViewTransition(error)).toBe(false);
  });
});
