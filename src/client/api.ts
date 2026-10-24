"use client";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(init.body !== undefined || init.method ? { "content-type": "application/json" } : {}),
      ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? (init.method && init.method !== "GET" ? "{}" : undefined) : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (payload as { error?: { code: string; message: string } }).error;
    throw new ApiError(response.status, error?.code ?? "error", error?.message ?? "Request failed.");
  }
  return payload as T;
}
