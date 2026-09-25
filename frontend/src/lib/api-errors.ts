import type { TFunction } from "i18next";

import { ApiError } from "./types";

/**
 * Maps an ApiError's stable `code` to a translated message via the
 * `errors.apiCodes.*` namespace. Falls back to the server-provided message
 * (untranslated) for unrecognized codes, and to a generic message otherwise.
 */
export function translateApiError(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const key = `errors.apiCodes.${error.code}`;
    if (t(key, { defaultValue: "" })) return t(key);
    return error.message || t("common.genericError");
  }
  return t("common.genericError");
}
