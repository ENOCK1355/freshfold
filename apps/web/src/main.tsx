import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import React, {
  Component,
  lazy,
  Suspense,
  ViewTransition,
  useEffect,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Toaster } from "sonner";
import { DashboardLayout, Protected, PublicLayout } from "./components/layout";
import { NavigationScroll, ScrollExperience } from "./components/transitions";
import { ButtonLink, Loading } from "./components/ui";
import { AppProvider, dashboard, useApp } from "./lib";
import { canRecoverQuery, shouldRetryQuery } from "./api-client";
import { reportRecoverableError } from "./recoverable-errors";
import "./styles.css";
import "./premium.css";
const publicPage = (
  name: string,
): React.LazyExoticComponent<React.ComponentType<any>> =>
  lazy(() =>
    import("./pages/public").then((m) => ({ default: (m as any)[name] })),
  );
const Home = publicPage("Home"),
  FindLaundry = publicPage("FindLaundry"),
  CompanyProfile = publicPage("CompanyProfile"),
  Compare = publicPage("Compare"),
  HowItWorks = publicPage("HowItWorks"),
  StudentPlus = publicPage("StudentPlus"),
  ForBusinesses = publicPage("ForBusinesses"),
  BusinessPricing = publicPage("BusinessPricing"),
  FixedContent = publicPage("FixedContent"),
  ContentPage = publicPage("ContentPage"),
  Help = publicPage("Help"),
  Contact = publicPage("Contact"),
  Coverage = publicPage("Coverage");
const AuthPage = lazy(() =>
  import("./pages/auth").then((m) => ({ default: m.AuthPage })),
);
const PasswordRecovery = lazy(() =>
  import("./components/account-security").then((m) => ({
    default: m.PasswordRecovery,
  })),
);
const Booking = lazy(() =>
    import("./pages/booking").then((m) => ({ default: m.Booking })),
  ),
  Checkout = lazy(() =>
    import("./pages/booking").then((m) => ({ default: m.Checkout })),
  ),
  PaymentReturn = lazy(() =>
    import("./pages/booking").then((m) => ({ default: m.PaymentReturn })),
  );
const Account = lazy(() =>
    import("./pages/account").then((m) => ({ default: m.Account })),
  ),
  Business = lazy(() =>
    import("./pages/business").then((m) => ({ default: m.Business })),
  ),
  Admin = lazy(() =>
    import("./pages/admin").then((m) => ({ default: m.Admin })),
  ),
  OrderDetail = lazy(() =>
    import("./components/orders").then((m) => ({ default: m.OrderDetail })),
  );
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: (query) =>
        canRecoverQuery(query.state.error) ? "always" : false,
      refetchOnReconnect: (query) =>
        canRecoverQuery(query.state.error) ? "always" : true,
    },
    mutations: { retry: false },
  },
});
focusManager.setEventListener((notify) => {
  const onReturn = () => notify();
  window.addEventListener("focus", onReturn);
  window.addEventListener("visibilitychange", onReturn);
  return () => {
    window.removeEventListener("focus", onReturn);
    window.removeEventListener("visibilitychange", onReturn);
  };
});
function Metadata() {
  const loc = useLocation();
  const { config } = useApp();
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "Your laundry sorted. Your time back.",
      "/find-laundry": "Find your kind of fresh",
      "/student-plus": "Student Plus",
      "/for-businesses": "Grow your laundry business",
      "/pricing": "Business plans",
      "/how-it-works": "How Fresh Fold works",
      "/about": "Our story",
      "/help": "A little help, unfolded",
      "/contact": "Talk to Fresh Fold",
      "/coverage": "Laundry collection around Cape Coast",
      "/terms": "Terms of service",
      "/privacy": "Privacy and your information",
      "/refund-policy": "Cancellations and refunds",
      "/care-policy": "Garment care and claims",
    };
    document.title = `${
      titles[loc.pathname] ||
      loc.pathname
        .split("/")
        .filter(Boolean)
        .map((s) => s.replaceAll("-", " "))
        .join(" · ")
    } | Fresh Fold`;
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = window.location.origin + loc.pathname;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content =
      config?.demo ||
      /^\/(account|business|admin|demo|checkout|book|sign-in|register)/.test(
        loc.pathname,
      )
        ? "noindex,nofollow"
        : "index,follow";
  }, [loc.pathname, config?.demo]);
  return null;
}
function AccountEntry() {
  const { user, authLoading } = useApp();
  if (authLoading) return <Loading />;
  return <Navigate to={user ? dashboard(user.role) : "/sign-in"} replace />;
}
function NotFound() {
  return (
    <section className="container section not-found">
      <p className="eyebrow">LET’S FIND YOUR FRESH START</p>
      <h1>
        This page slipped
        <br />
        out of the basket.
      </h1>
      <p>We couldn’t find that page. Your laundry day is still right here.</p>
      <ButtonLink to="/find-laundry">Find your laundry</ButtonLink>
    </section>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="container section">
        <h1>Let’s freshen that up.</h1>
        <p>The page could not be loaded. Your server records are safe.</p>
        <button
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Reload Fresh Fold
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const location = useLocation();
  const workspace =
    /^\/(account|business|admin)(\/|$)/.exec(location.pathname)?.[1] ||
    "public";
  return (
    <>
      <Metadata />
      <NavigationScroll />
      <ScrollExperience />
      <Suspense
        fallback={
          <div className="route-initial-loading">
            <Loading />
          </div>
        }
      >
        <ViewTransition
          key={workspace}
          default="none"
          enter="page-crossfade"
          exit="page-crossfade"
        >
          <div className="app-shell">
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<Home />} />
                <Route path="find-laundry" element={<FindLaundry />} />
                <Route path="laundry/:slug" element={<CompanyProfile />} />
                <Route path="compare" element={<Compare />} />
                <Route path="how-it-works" element={<HowItWorks />} />
                <Route path="student-plus" element={<StudentPlus />} />
                <Route path="for-businesses" element={<ForBusinesses />} />
                <Route path="pricing" element={<BusinessPricing />} />
                <Route path="about" element={<FixedContent slug="about" />} />
                <Route path="help" element={<Help />} />
                <Route path="help/:article" element={<ContentPage />} />
                <Route path="contact" element={<Contact />} />
                <Route path="coverage" element={<Coverage />} />
                {["terms", "privacy", "refund-policy", "care-policy"].map(
                  (slug) => (
                    <Route
                      key={slug}
                      path={slug}
                      element={<FixedContent slug={slug} />}
                    />
                  ),
                )}
                <Route path="sign-in" element={<AuthPage />} />
                <Route path="register" element={<AuthPage register />} />
                <Route path="forgot-password" element={<PasswordRecovery />} />
                <Route path="reset-password" element={<PasswordRecovery />} />
                <Route path="verify-email" element={<AccountEntry />} />
                <Route element={<Protected />}>
                  <Route path="book/:slug" element={<Booking />} />
                  <Route path="checkout/:paymentId" element={<Checkout />} />
                  <Route path="payment/return" element={<PaymentReturn />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route element={<Protected />}>
                <Route
                  path="account"
                  element={<DashboardLayout kind="account" />}
                >
                  <Route index element={<Account />} />
                  <Route path="orders/:id" element={<OrderDetail />} />
                  <Route path=":tab" element={<Account />} />
                </Route>
              </Route>
              <Route element={<Protected roles={["owner", "staff"]} />}>
                <Route
                  path="business"
                  element={<DashboardLayout kind="business" />}
                >
                  <Route index element={<Business />} />
                  <Route
                    path="orders/:id"
                    element={<OrderDetail base="/business" />}
                  />
                  <Route path=":tab" element={<Business />} />
                </Route>
              </Route>
              <Route element={<Protected roles={["admin", "support"]} />}>
                <Route path="admin" element={<DashboardLayout kind="admin" />}>
                  <Route index element={<Admin />} />
                  <Route
                    path="orders/:id"
                    element={<OrderDetail base="/admin" />}
                  />
                  <Route path=":tab" element={<Admin />} />
                </Route>
              </Route>
            </Routes>
          </div>
        </ViewTransition>
      </Suspense>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: "DM Sans,sans-serif" } }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!, {
  onRecoverableError: reportRecoverableError,
}).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <AppProvider>
            <MotionConfig reducedMotion="user">
              <App />
            </MotionConfig>
          </AppProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
