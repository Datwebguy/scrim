"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/client/api";
import { useToast } from "./ui";
import { useT } from "@/i18n/I18n";

type Status = { available: boolean; linked: boolean };

// Lets an approver get a Telegram message whenever a payment needs them.
export function TelegramAlerts() {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [waiting, setWaiting] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/me/telegram"));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // After opening Telegram, check back until the chat is connected.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const next = await api<Status>("/me/telegram").catch(() => null);
      if (next?.linked) {
        setStatus(next);
        setWaiting(false);
        toast(t("Telegram alerts are on"));
      }
    }, 3000);
    const stop = setTimeout(() => setWaiting(false), 10 * 60 * 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [waiting, toast]);

  if (!status?.available) return null;

  return (
    <div className="tg-bar">
      <span className="tg-icon" aria-hidden="true">✈</span>
      <div>
        <b>{status.linked ? "Telegram alerts are on" : "Get alerts on Telegram"}</b>
        <small>{status.linked ? "You'll get a message when a payment needs your approval." : waiting ? "Tap Start in Telegram to finish." : "Know the moment a payment needs your approval."}</small>
      </div>
      {status.linked ? (
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await api("/me/telegram", { method: "DELETE" });
            load();
          }}
        >
          {t("Turn off")}
        </button>
      ) : (
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            try {
              const { url } = await api<{ url: string }>("/me/telegram", { method: "POST" });
              window.open(url, "_blank", "noopener");
              setWaiting(true);
            } catch (e) {
              toast((e as Error).message, "error");
            }
          }}
        >
          {t("Connect Telegram")}
        </button>
      )}
    </div>
  );
}
