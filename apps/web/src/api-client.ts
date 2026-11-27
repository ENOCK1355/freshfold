export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class ConnectionError extends ApiError {
  constructor(method: string) {
    super(
      0,
      method === "GET"
        ? "Your connection was interrupted. Check your connection and try again."
        : "Your connection was interrupted. Check whether your changes were saved before trying again.",
    );
    this.name = "ConnectionError";
  }
}

function retryDelay(milliseconds: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(
        signal?.reason ?? new DOMException("Request cancelled", "AbortError"),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function requestJson<T = any>(
  url: string,
  options: RequestInit = {},
) {
  const method = (options.method || "GET").toUpperCase();
  const delays = method === "GET" ? [300, 900, 1800] : [];
  for (let attempt = 0; ; attempt++) {
    try {
      options.signal?.throwIfAborted();
      const response = await fetch(url, options);
      let data: T;
      try {
        data = await response.json();
      } catch (error) {
        if (
          options.signal?.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          throw error;
        // A broken or truncated successful response must never become valid data.
        if (response.ok) throw error;
        data = {
          message: "Fresh Fold is briefly unavailable. Please try again.",
        } as T;
      }
      return { response, data };
    } catch (error) {
      if (
        options.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      if (attempt >= delays.length) throw new ConnectionError(method);
      await retryDelay(delays[attempt], options.signal);
    }
  }
}

export function shouldRetryQuery(failureCount: number, error: Error) {
  // Transport failures have already received bounded retries above.
  if (error instanceof ConnectionError) return false;
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

export function canRecoverQuery(error: unknown) {
  return (
    error instanceof ConnectionError ||
    (error instanceof ApiError && error.status >= 500)
  );
}
