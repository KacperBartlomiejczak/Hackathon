import { describe, expect, it } from "vitest";
import { ApiError, apiErrorMessage } from "./apiError";

const FALLBACK = "fallback";

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
});
