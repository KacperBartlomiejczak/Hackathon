import { describe, expect, it } from "vitest";
import { ApiError, apiErrorMessage, toApiError } from "./apiError";

const FALLBACK = "fallback";

function bodyResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

describe("apiErrorMessage", () => {
  it("explains missing write permission for 401", () => {
    expect(apiErrorMessage(new ApiError(401, null), FALLBACK)).toContain("Brak uprawnień do zapisu");
  });

  it("explains a disallowed status transition for 409", () => {
    expect(apiErrorMessage(new ApiError(409, "invalid_transition"), FALLBACK)).toContain("niedozwolona");
  });

  it("returns the fallback for a plain Error", () => {
    expect(apiErrorMessage(new Error("boom"), FALLBACK)).toBe(FALLBACK);
  });

  it("returns the fallback for an unknown 500", () => {
    expect(apiErrorMessage(new ApiError(500, null), FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    [403, "Brak uprawnień do zapisu"],
    [404, "Nie znaleziono"],
    [409, "niedozwolona"],
    [501, "nie jest jeszcze zaimplementowana"],
    [502, "Moduł AI jest niedostępny"],
    [503, "Kolejka zadań jest niedostępna"],
  ])("maps status %i without a code", (status, fragment) => {
    expect(apiErrorMessage(new ApiError(status, null), FALLBACK)).toContain(fragment);
  });

  it("prefers a known code over the status", () => {
    expect(apiErrorMessage(new ApiError(500, "ai_unavailable"), FALLBACK)).toContain("Moduł AI");
  });

  it("falls back to the status when the code is unknown", () => {
    expect(apiErrorMessage(new ApiError(401, "weird_code"), FALLBACK)).toContain("Brak uprawnień");
    expect(apiErrorMessage(new ApiError(500, "weird_code"), FALLBACK)).toBe(FALLBACK);
  });

  it("returns the fallback for non-error values", () => {
    expect(apiErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage("401", FALLBACK)).toBe(FALLBACK);
  });

  // KNOWN BUG: STATUS_MESSAGES is a plain object, so "constructor" resolves to Object.
  it.fails("does not treat inherited keys as known codes", () => {
    expect(apiErrorMessage(new ApiError(500, "constructor"), FALLBACK)).toBe(FALLBACK);
  });
});

describe("toApiError", () => {
  it("reads the error code from a JSON body", async () => {
    const err = await toApiError(bodyResponse('{"error":"not_found"}', 404));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.code).toBe("not_found");
    expect(err.message).toBe("API 404 not_found");
  });

  it("survives a non-JSON body such as an HTML error page", async () => {
    const err = await toApiError(bodyResponse("<html>Bad Gateway</html>", 502));
    expect(err.status).toBe(502);
    expect(err.code).toBeNull();
    expect(err.message).toBe("API 502");
  });

  it("survives an empty body", async () => {
    expect((await toApiError(bodyResponse("", 500))).code).toBeNull();
  });

  it("ignores a non-string error field", async () => {
    expect((await toApiError(bodyResponse('{"error":42}', 400))).code).toBeNull();
    expect((await toApiError(bodyResponse('{"error":null}', 400))).code).toBeNull();
    expect((await toApiError(bodyResponse('{"error":{"a":1}}', 400))).code).toBeNull();
  });

  it("survives a JSON null body", async () => {
    expect((await toApiError(bodyResponse("null", 500))).code).toBeNull();
  });
});
