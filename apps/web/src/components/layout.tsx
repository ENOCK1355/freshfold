import {
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  Crown,
  Heart,
  Layers3,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  MapPinned,
  Menu,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { dashboard, send, useAction, useApp } from "../lib";
import { AnimatedOutlet } from "./transitions";
import { ButtonLink, ErrorState, Loading } from "./ui";
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      className={`logo ${light ? "logo-light" : ""}`}
      to="/"
      aria-label="Fresh Fold home"
    >
      <svg viewBox="0 0 58 58" aria-hidden="true">
        <path
          d="M8 8h34L31 19H8zM8 24h25L22 35H8zM8 40h10v10H8z"
          fill="currentColor"
        />
        <path d="M32 24h18L39 35H21z" fill="currentColor" opacity=".45" />
      </svg>
      <span>
        fresh fold<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function PublicLayout() {
  const { user, config } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="nav-container">
          <Logo />
          <nav
            className={open ? "public-nav open" : "public-nav"}
            aria-label="Main navigation"
          >
            <NavLink to="/find-laundry">Find laundry</NavLink>
            <NavLink to="/how-it-works">How it works</NavLink>
            <NavLink to="/student-plus">
              Student Plus <span className="small-plus">+</span>
            </NavLink>
            <NavLink to="/for-businesses">For businesses</NavLink>
          </nav>
          <div className="nav-actions">
            {user ? (
              <ButtonLink
                to={dashboard(user.role)}
                variant="secondary"
                aria-label="My account"
              >
                <span className="avatar avatar-xs">{user.name[0]}</span>
                <span className="nav-account-label">My account</span>
              </ButtonLink>
            ) : (
              <>
                <Link className="sign-in-link" to="/sign-in">
                  Sign in
                </Link>
                <ButtonLink to="/register">Get started</ButtonLink>
              </>
            )}
            <button
              className="icon-btn menu-btn"
              type="button"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <AnimatedOutlet />
      </main>
      <Footer />
      {config?.whatsapp && (
        <a
          className="whatsapp-float"
          href={`https://wa.me/${config.whatsapp}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with Fresh Fold on WhatsApp"
        >
          <MessageCircle size={23} />
          <span>Let’s talk</span>
        </a>
      )}
      <CompareTray />
    </>
  );
}
export function Footer() {
  const { config } = useApp();
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand">
          <Logo light />
          <p>
            A little less laundry.
            <br />A little more life.
          </p>
          <span className="footer-location">
            <MapPin size={15} /> Made for campus life in Cape Coast.
          </span>
        </div>
        <div>
          <h3>For your fresh start</h3>
          <Link to="/find-laundry">Find laundry</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/student-plus">Student Plus</Link>
          <Link to="/coverage">Service areas</Link>
        </div>
        <div>
          <h3>For your business</h3>
          <Link to="/for-businesses">List your business</Link>
          <Link to="/pricing">Business plans</Link>
          <Link to="/register?type=company">Become a partner</Link>
          <Link to="/help/business">Business help</Link>
        </div>
        <div>
          <h3>Here to help</h3>
          <Link to="/about">About Fresh Fold</Link>
          <Link to="/help">Help centre</Link>
          <Link to="/contact">Contact us</Link>
          <a
            href={`https://wa.me/${config?.whatsapp || "233551234987"}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={15} /> WhatsApp support
          </a>
          {config?.companyEmail && !config.companyEmail.endsWith(".test") && (
            <a href={`mailto:${config.companyEmail}`}>
              <Mail size={15} /> {config.companyEmail}
            </a>
          )}
        </div>
      </div>
      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} Fresh Fold. Thoughtfully cared for.</p>
        <div>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/refund-policy">Refunds</Link>
          <Link to="/care-policy">Care & claims</Link>
        </div>
      </div>
    </footer>
  );
}
export function CompareTray() {
  const { compare, clearCompare } = useApp();
  const loc = useLocation();
  if (!compare.length || loc.pathname === "/compare") return null;
  return (
    <div className="compare-tray">
      <div>
        <Layers3 size={20} />
        <span>{compare.length} of 3 laundries selected</span>
      </div>
      <ButtonLink to="/compare" variant="light">
        Compare companies
      </ButtonLink>
      <button
        className="icon-btn"
        onClick={clearCompare}
        aria-label="Clear comparison"
      >
        <X size={19} />
      </button>
    </div>
  );
}
export function Protected({ roles }: { roles?: string[] }) {
  const { user, authLoading, authError, refresh } = useApp();
  const loc = useLocation();
  if (authLoading) return <Loading />;
  if (!user && authError)
    return <ErrorState error={authError} retry={() => void refresh()} />;
  if (!user)
    return (
      <Navigate
        to={`/sign-in?redirect=${encodeURIComponent(loc.pathname + loc.search)}`}
        replace
      />
    );
  if (roles && !roles.includes(user.role))
    return <Navigate to={dashboard(user.role)} replace />;
  return <Outlet />;
}
const studentNav = [
  ["", "Overview", LayoutDashboard],
  ["orders", "My orders", Package],
  ["favorites", "Saved laundries", Heart],
  ["schedules", "Recurring laundry", CalendarDays],
  ["messages", "Messages", MessageSquare],
  ["addresses", "My addresses", MapPinned],
  ["billing", "Membership & billing", Crown],
  ["receipts", "Receipts", ReceiptText],
  ["support", "Help & support", LifeBuoy],
  ["settings", "Settings", Settings],
] as const;
const businessNav = [
  ["", "Overview", LayoutDashboard],
  ["orders", "Order queue", Package],
  ["calendar", "Booking calendar", CalendarDays],
  ["catalogue", "Services & pricing", Shirt],
  ["customers", "Customers", Users],
  ["messages", "Messages", MessageSquare],
  ["reviews", "Reviews", ShieldCheck],
  ["earnings", "Earnings", Wallet],
  ["settlements", "Transactions & settlements", ReceiptText],
  ["subscription", "Hosting & invoices", Crown],
  ["promotions", "Promotions", ChartNoAxesCombined],
  ["staff", "Staff & permissions", Users],
  ["profile", "Business profile", Building2],
  ["coverage", "Coverage & hours", MapPinned],
  ["branches", "Branches", Layers3],
  ["onboarding", "Verification", ClipboardCheck],
  ["support", "Help & support", LifeBuoy],
  ["settings", "Settings", Settings],
] as const;
const adminNav = [
  ["", "Overview", LayoutDashboard],
  ["companies", "Companies", Building2],
  ["users", "People", Users],
  ["orders", "Orders", Package],
  ["revenue", "Revenue & ledger", ChartNoAxesCombined],
  ["payments", "Payments & commission", Wallet],
  ["subscriptions", "Subscription approvals", Crown],
  ["notifications", "Notifications", Bell],
  ["refunds", "Refunds", ReceiptText],
  ["support", "Support & disputes", LifeBuoy],
  ["plans", "Plans & commissions", SlidersHorizontal],
  ["coverage", "Service coverage", MapPinned],
  ["content", "Content", BookOpen],
  ["audit", "Audit trail", ShieldCheck],
  ["settings", "Launch & integrations", Settings],
] as const;
export function DashboardLayout({
  kind,
}: {
  kind: "account" | "business" | "admin";
}) {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const { run, busy } = useAction();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  let items: ReadonlyArray<readonly [string, string, typeof LayoutDashboard]> =
    kind === "admin"
      ? adminNav
      : kind === "business"
        ? businessNav
        : studentNav;
  if (user?.role === "staff")
    items = businessNav.filter((x) =>
      ["", "orders", "calendar", "customers", "messages", "support"].includes(
        x[0],
      ),
    );
  if (user?.role === "support")
    items = adminNav.filter((x) => ["", "orders", "support"].includes(x[0]));
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-logo">
          <Logo />
          <button
            className="icon-btn mobile-only"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace-label">
          {kind === "admin"
            ? "PLATFORM WORKSPACE"
            : kind === "business"
              ? "BUSINESS WORKSPACE"
              : "YOUR FRESH FOLD"}
        </div>
        <nav aria-label="Account navigation">
          {items.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={`/${kind}${path ? "/" + path : ""}`}
              end={!path}
            >
              <Icon size={19} strokeWidth={1.6} />
              {label}
              {path === "schedules" && <span className="nav-plus">PLUS</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/find-laundry">
            <MapPin size={17} /> Explore laundries
          </Link>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await send("auth/logout");
                window.location.assign("/");
              })
            }
          >
            <LogOut size={17} /> Sign out
          </button>
          <div className="sidebar-person">
            <span className="avatar">{user?.name[0]}</span>
            <div>
              <strong>{user?.name.split(" · ")[0]}</strong>
              <span>
                {user?.premium
                  ? "Student Plus"
                  : user?.role === "student"
                    ? "Free account"
                    : user?.role}
              </span>
            </div>
          </div>
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Close account navigation"
        />
      )}
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <button
              className="icon-btn mobile-only"
              onClick={() => setOpen(true)}
              aria-label="Open account navigation"
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              {kind === "account"
                ? "My space"
                : kind === "business"
                  ? "Business portal"
                  : "Fresh Fold administration"}
            </span>
          </div>
          <div>
            <Link
              className="icon-btn"
              to={
                kind === "account"
                  ? "/account/notifications"
                  : kind === "business"
                    ? "/business/notifications"
                    : "/admin/notifications"
              }
              aria-label="Notifications"
            >
              <Bell size={19} />
            </Link>
            <span className="avatar avatar-sm">{user?.name[0]}</span>
          </div>
        </header>
        <main id="main" className="dashboard-content">
          <AnimatedOutlet />
        </main>
      </div>
    </div>
  );
}
