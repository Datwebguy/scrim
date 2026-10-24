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

export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
