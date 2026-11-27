import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  ConnectionError,
  canRecoverQuery,
  requestJson,
  shouldRetryQuery,
} from "../apps/web/src/api-client";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("API connection recovery", () => {
  it("recovers reads after interrupted connections with the same credentials and headers", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("net::ERR_NETWORK_CHANGED"))
      .mockResolvedValueOnce(Response.json({ user: { id: "student" } }));
    const options = {
      credentials: "include" as const,
      headers: { "X-CSRF-Token": "unchanged" },
    };
    const result = requestJson("/api/auth/me", options);
    await vi.runAllTimersAsync();
    expect((await result).data).toEqual({ user: { id: "student" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.every(
        ([url, init]) => url === "/api/auth/me" && init === options,
      ),
    ).toBe(true);
  });

  it("bounds retries and exposes a helpful connection error after an outage", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = expect(requestJson("/api/config")).rejects.toMatchObject({
      name: "ConnectionError",
      status: 0,
      message: expect.stringContaining("Check your connection"),
    });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not replay account, booking, payment, or other write requests", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      fetchMock.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(
        requestJson("/api/action", { method, body: "{}" }),
      ).rejects.toMatchObject({
        name: "ConnectionError",
        message: expect.stringContaining(
          "Check whether your changes were saved",
        ),
      });
      await vi.runAllTimersAsync();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("retries an interrupted JSON body instead of accepting an empty configuration", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"areas":', { status: 200 }))
      .mockResolvedValueOnce(Response.json({ areas: [{ id: "amamoma" }] }));
    const result = requestJson("/api/config");
    await vi.runAllTimersAsync();
    expect((await result).data.areas).toEqual([{ id: "amamoma" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending retry when the caller aborts", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const controller = new AbortController();
    const result = expect(
      requestJson("/api/config", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await result;
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps HTTP validation and permission errors separate from transport failures", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: "Access denied" }, { status: 403 }),
    );
    const result = await requestJson("/api/private");
    expect(result.response.status).toBe(403);
    expect(result.data.message).toBe("Access denied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(shouldRetryQuery(0, new ApiError(403, "Access denied"))).toBe(false);
    expect(canRecoverQuery(new ApiError(403, "Access denied"))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(503, "Unavailable"))).toBe(true);
    expect(shouldRetryQuery(2, new ApiError(503, "Unavailable"))).toBe(false);
    expect(shouldRetryQuery(0, new ConnectionError("GET"))).toBe(false);
    expect(canRecoverQuery(new ConnectionError("GET"))).toBe(true);
  });
});
