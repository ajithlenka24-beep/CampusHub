import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { Notification } from "../types";
import { timeAgo } from "../utils/format";
import { Icon } from "./Icon";

/** Bell with unread badge and a panel; notifications are stored in the database. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ notifications: Notification[]; unreadCount: number }>("/notifications?limit=30");
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      /* ignore: the header should never break the page */
    }
  }, []);

  // refresh on navigation and every minute (new status changes, invitations, deadlines)
  useEffect(() => {
    void load();
  }, [load, location.pathname]);
  useEffect(() => {
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = async (n: Notification) => {
    if (!n.read) {
      const res = await api.post<{ unreadCount: number }>(`/notifications/${n.id}/read`).catch(() => null);
      if (res) setUnread(res.unreadCount);
      setItems((all) => all.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const markAll = async () => {
    await api.post("/notifications/read-all");
    setItems((all) => all.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notification-btn"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
      >
        <Icon name="bell" className="gold" />
        {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <button type="button" className="link small" disabled={!unread} onClick={markAll}>
              Mark all as read
            </button>
          </div>
          <div className="notif-list">
            {items.length === 0 && <p className="faint small" style={{ padding: 24, textAlign: "center" }}>You're all caught up.</p>}
            {items.map((n) => (
              <button key={n.id} type="button" className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}>
                <span className="t">{n.title}</span>
                <span className="m">{n.message}</span>
                <span className="time">
                  {timeAgo(n.createdAt)}
                  {!n.read && " · New"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
