const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function normalizeNearAccount(input: string): string | null {
  const id = input.trim().toLowerCase();
  return id.length >= 2 && id.length <= 64 && NEAR_ACCOUNT.test(id) ? id : null;
}

export function normalizeEvmAddress(input: string): string | null {
  const address = input.trim();
  return EVM_ADDRESS.test(address) ? address.toLowerCase() : null;
}

// An x402 seller is identified by its web origin, e.g. "https://api.example.com".
export function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.origin.toLowerCase() : null;
  } catch {
    return null;
  }
}
