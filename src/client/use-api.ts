"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

// Loads a GET endpoint, with optional polling, and lets the screen refresh it.
export function useApi<T>(path: string | null, options: { every?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(path));
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const next = await api<T>(path);
      if (alive.current) { setData(next); setError(""); }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Could not load this.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    load();
    const timer = options.every ? setInterval(load, options.every) : undefined;
    return () => { alive.current = false; clearInterval(timer); };
  }, [load, options.every]);

  return { data, error, loading, reload: load };
}
