"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { signOutWallet } from "@/client/wallet";
import type { Network } from "@/protocol/networks";

type Value = { accountId: string; network: Network; otherNetworks: Network[] };
const SessionContext = createContext<Value | null>(null);

export const SessionProvider = SessionContext.Provider;

// Leaves this network (signing out and disconnecting the wallet) and opens sign-in on the other one.
// Never gets stuck: if the sign-out call fails because the session already ended, we still move on.
export function useSwitchNetwork() {
  const { network } = useSession();
  const router = useRouter();
  return async (next?: Network) => {
    try {
      await signOutWallet(network);
    } catch {
      // Already signed out.
    }
    router.push(next ? `/app?network=${next}` : "/app");
    router.refresh();
  };
}

export function useSession(): Value {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside the signed-in app.");
  return value;
}
