// Chromium 153 changed the benign ViewTransition cancellation messages.
// Match only these interruptions; animation and rendering failures still surface.
// https://github.com/react/react/commit/c5ec5c6d180ad951048668ed113c443211bc2623
export function isInterruptedViewTransition(error: unknown) {
  return (
    error instanceof DOMException &&
    error.name === "InvalidStateError" &&
    (error.message ===
      "Transition was aborted because of invalid state. Viewport size changed" ||
      error.message ===
        "Transition was aborted because of invalid state. Document hidden")
  );
}

export function reportRecoverableError(error: unknown) {
  if (isInterruptedViewTransition(error)) return;
  if (typeof globalThis.reportError === "function")
    globalThis.reportError(error);
  else
    setTimeout(() => {
      throw error;
    }, 0);
}
