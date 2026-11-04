/**
 * FUTURE — /api/auth/resend integration point (deliberately INACTIVE).
 *
 * Product decision (PART 5): no email verification, no verification UI, no
 * resend buttons or cooldowns. The password recovery flow works entirely
 * through `/api/auth/password-reset` + `/api/auth/password-update` and must
 * stay decoupled from this module.
 *
 * Backend contract, kept here for the future integration
 * (backend.md §6 — live-verified controller):
 *
 *   POST /api/auth/resend
 *     body:   { email: string, type?: 'signup' | 'recovery' }   // type defaults to 'signup'
 *     auth:   API key via the trusted proxy (same as every auth endpoint)
 *     200:    { ok: true }                                       // uniform, no enumeration
 *     errors: RATE_LIMIT_ERROR (429) · VALIDATION_ERROR (400) · AUTH_PROVIDER_ERROR (502)
 *
 * TODO(FUTURE-AUTH-RESEND): when the product wants explicit resend entry
 * points (e.g. login blocks on an unconfirmed email), wire the UI to
 * `resendService.request(...)` below — the components never point at the
 * endpoint directly. Until then NOTHING may import and call it.
 */

import type { AuthApiError, AuthOkResponse } from "./types";
import { authRequest } from "./api-client";

/** Payload for the future resend endpoint (backend contract). */
export interface ResendPayload {
  email: string;
  /** 'signup' = confirmation email, 'recovery' = password reset email. */
  type: "signup" | "recovery";
}

/** Future result: uniform `{ ok: true }` or a normalized typed error. */
export type ResendResult =
  | { kind: "sent" }
  | { kind: "error"; error: AuthApiError };

/**
 * Placeholder service interface — the ONLY seam a future UI should depend
 * on, so activation is an isolated change (flip `enabled`, un-mock
 * `request`) and no auth component gets rewritten.
 */
export interface ResendService {
  /** False while the integration is deliberately inactive (product decision). */
  readonly enabled: boolean;
  /** Send the correct one-time email again through the proxy endpoint. */
  request(payload: ResendPayload): Promise<ResendResult>;
}

/**
 * Implementation kept behind the same interface the future UI will call.
 * The endpoint wrapper (`authRequest("resend", …)`) is fully described by
 * the backend contract; it is NOT reachable until `enabled` is flipped and
 * a caller is introduced — this file is the single TODO checkpoint.
 */
export const resendService: ResendService = {
  enabled: false,

  async request(payload: ResendPayload): Promise<ResendResult> {
    if (!this.enabled) {
      // Guard for a future caller wired before the product flips the switch.
      throw new Error(
        "Resend functionality is not activated yet (TODOAUTH-RESEND in src/lib/auth/resend-future.ts).",
      );
    }
    const result = await authRequest("resend", {
      method: "POST",
      body: { email: payload.email, type: payload.type },
    });
    if (result.ok) {
      const body = result.data as Partial<AuthOkResponse> | null;
      return body?.ok === true ? { kind: "sent" } : { kind: "sent" };
    }
    return { kind: "error", error: result.error };
  },
};
