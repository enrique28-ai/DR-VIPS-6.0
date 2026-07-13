import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";

import {
  useNotifications,
  useMarkNotifRead,
  useMarkAllNotifsRead,
} from "../../features/notifications/nhooks.js";

export default function NotificationBell() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || "en").toLowerCase();
  const pick = lang.startsWith("es") ? "es" : "en";
  const locale = lang.startsWith("es") ? esLocale : enUS;

  const { data } = useNotifications();
  const items = data?.items || [];
  const unreadCount = data?.unreadCount || 0;

  const markOne = useMarkNotifRead();
  const markAll = useMarkAllNotifsRead();

  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const bellButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      bellButtonRef.current?.focus();
    };

    window.addEventListener("click", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // toast cuando llegan nuevas (no en el primer render)
  const seenIdsRef = useRef(new Set());
  useEffect(() => {
    const currentIds = new Set(items.map((n) => n._id));
    if (seenIdsRef.current.size > 0) {
      const newOnes = items.filter((n) => !seenIdsRef.current.has(n._id));
      if (newOnes.length > 0) {
        const n = newOnes[0];
        const msg = n?.message?.[pick] || n?.message?.en || "";
        toast(msg, { duration: 4500 });
      }
    }
    seenIdsRef.current = currentIds;
  }, [items, pick]);

  const label = useMemo(
    () => ({
      title: t("notifications.title", "Notifications"),
      empty: t("notifications.empty", "No notifications."),
      markAll: t("notifications.markAllRead", "Mark all as read"),
    }),
    [t],
  );

  const onClickNotif = (n) => {
    if (!n.isRead) markOne.mutate(n._id);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={bellButtonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-gray-600 transition-colors hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        aria-label={label.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
      >
        <Bell className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="notification-panel-title"
          className="fixed left-3 right-3 top-16 z-[9999] flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-lg border border-gray-100 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96"
        >
          <div className="flex shrink-0 items-center justify-between border-b bg-gray-50 p-3">
            <h3
              id="notification-panel-title"
              className="text-sm font-semibold text-gray-700"
            >
              {label.title}
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="text-xs text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {label.markAll}
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto sm:max-h-96">
            {items.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {label.empty}
              </div>
            ) : (
              items.map((n) => {
                const title = n?.title?.[pick] || n?.title?.en || "";
                const msg = n?.message?.[pick] || n?.message?.en || "";
                return (
                  <button
                    key={n._id}
                    type="button"
                    onClick={() => onClickNotif(n)}
                    className={`w-full cursor-pointer break-words border-b p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                      n.isRead ? "bg-white" : "bg-blue-50"
                    } hover:bg-gray-50`}
                  >
                    <p className="text-sm font-semibold text-gray-800">{title}</p>
                    <p className="text-xs text-gray-700 mt-1">{msg}</p>
                    <p className="text-[10px] text-gray-400 mt-2 text-right">
                      {formatDistanceToNow(new Date(n.createdAt), {
                        addSuffix: true,
                        locale,
                      })}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
