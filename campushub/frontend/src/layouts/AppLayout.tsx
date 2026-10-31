import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChatWidget } from "../components/ChatWindow";
import { Icon } from "../components/Icon";
import { NotificationBell } from "../components/NotificationBell";
import { Avatar } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const STUDENT_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/opportunities", label: "Opportunities", icon: "briefcase" },
  { to: "/applications", label: "My Applications", icon: "clipboard" },
  { to: "/teams", label: "Group Up", icon: "users" },
  { to: "/career", label: "Career Tracker", icon: "chart" },
  { to: "/assistant", label: "AI Assistant", icon: "sparkles" },
  { to: "/profile", label: "Profile", icon: "user" },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Overview", icon: "dashboard", end: true },
  { to: "/admin/opportunities", label: "Opportunities", icon: "briefcase" },
  { to: "/admin/applications", label: "Applications", icon: "clipboard" },
  { to: "/admin/students", label: "Students", icon: "users" },
  { to: "/admin/teams", label: "Teams", icon: "target" },
  { to: "/admin/activity", label: "Activity Log", icon: "activity" },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const nav = isAdmin ? ADMIN_NAV : STUDENT_NAV;
  const current = nav.find((n) => location.pathname === n.to || (!("end" in n) && location.pathname.startsWith(`${n.to}/`)));

  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  if (!user) return null;

  const doLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          <Link to={isAdmin ? "/admin" : "/dashboard"} aria-label="CampusHub home">
            <span className="logo-text">CampusHub</span>
          </Link>
        </div>
        <div className="nav-section-label">{isAdmin ? "Administration" : "Student"}</div>
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={"end" in item} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
        <div className="sidebar-footer">
          {isAdmin ? "Signed in as administrator" : "Desktop-first · works on tablets and phones"}
        </div>
      </aside>
      <div className={`sidebar-backdrop ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <div className="app-main-wrap">
        <header className="app-header">
          <button type="button" className="icon-btn menu-btn" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="page-title">{current?.label ?? (isAdmin ? "Administration" : "CampusHub")}</span>
          <div className="user-controls">
            <NotificationBell />
            <div className="user-menu" ref={menuRef}>
              <button type="button" className="user-menu-btn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                <Avatar name={user.fullName} url={user.avatarUrl} size="sm" />
                <span className="name">{user.fullName}</span>
              </button>
              {menuOpen && (
                <div className="dropdown" role="menu">
                  <div className="dropdown-head">
                    <strong>{user.fullName}</strong>
                    <div className="faint small">{user.email}</div>
                  </div>
                  {!isAdmin && (
                    <button type="button" role="menuitem" className="dropdown-item" onClick={() => navigate("/profile")}>
                      <Icon name="user" /> My profile
                    </button>
                  )}
                  <button type="button" role="menuitem" className="dropdown-item" onClick={doLogout}>
                    <Icon name="logout" /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="app-main" id="main">
          <Outlet />
        </main>
      </div>
      {!isAdmin && location.pathname !== "/assistant" && <ChatWidget />}
    </div>
  );
}
