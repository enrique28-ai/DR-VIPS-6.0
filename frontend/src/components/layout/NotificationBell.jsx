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
    [t]
  );

  const onClickNotif = (n) => {
    if (!n.isRead) markOne.mutate(n._id);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-gray-600 hover:text-blue-600 transition-colors"
        aria-label={label.title}
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-[9999]">
          <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">{label.title}</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs text-blue-600 hover:underline"
              >
                {label.markAll}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {label.empty}
              </div>
            ) : (
              items.map((n) => {
                const title = n?.title?.[pick] || n?.title?.en || "";
                const msg = n?.message?.[pick] || n?.message?.en || "";
                return (
                  <div
                    key={n._id}
                    onClick={() => onClickNotif(n)}
                    className={`p-3 border-b cursor-pointer transition-colors ${
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
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
