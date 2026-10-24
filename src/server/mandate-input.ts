import type { MandateInput } from "./agents";

export function mandateFromBody(body: Record<string, unknown>): MandateInput {
  return {
    perActionCap: String(body.perActionCap ?? ""),
    rollingCap: String(body.rollingCap ?? ""),
    windowHours: Number(body.windowHours ?? 24),
    counterparties: Array.isArray(body.counterparties)
      ? body.counterparties.map((c) => ({ address: String((c as Record<string, unknown>)?.address ?? ""), label: String((c as Record<string, unknown>)?.label ?? "") }))
      : [],
    expiresAt: body.expiresAt ? String(body.expiresAt) : null,
  };
}
