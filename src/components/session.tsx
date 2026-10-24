"use client";
import { createContext, useContext } from "react";
import type { Network } from "@/protocol/networks";

type Value = { accountId: string; network: Network };
const SessionContext = createContext<Value | null>(null);

export const SessionProvider = SessionContext.Provider;

export function useSession(): Value {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside the signed-in app.");
  return value;
}
