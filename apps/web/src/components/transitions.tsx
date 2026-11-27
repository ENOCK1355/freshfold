import { ChevronUp } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  ViewTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigationType,
  useOutlet,
  type Location,
  type NavigationType,
} from "react-router-dom";
import { NavigationDataContext } from "./navigation-state";

const positions = new Map<string, number>();
let visiblePage: Pick<Location, "pathname" | "key" | "hash"> | null = null;

function rememberScroll() {
  if (!visiblePage) return;
  positions.set(visiblePage.key, window.scrollY);
  if (positions.size > 120) positions.delete(positions.keys().next().value!);
}

function anchorTarget(hash: string) {
  try {
    return hash
      ? document.getElementById(decodeURIComponent(hash.slice(1)))
      : null;
  } catch {
    return null;
  }
}

export function NavigationScroll() {
  useLayoutEffect(() => {
    const original = history.scrollRestoration;
    history.scrollRestoration = "manual";
    window.addEventListener("scroll", rememberScroll, { passive: true });
    document.addEventListener("click", rememberScroll, true);
    return () => {
      history.scrollRestoration = original;
      window.removeEventListener("scroll", rememberScroll);
      document.removeEventListener("click", rememberScroll, true);
    };
  }, []);
  return null;
}

function restorePage(
  location: Location,
  navigation: NavigationType,
  element: HTMLElement,
  reducedMotion: boolean | null,
) {
  const previous = visiblePage;
  if (previous?.key === location.key && previous.hash === location.hash) return;
  const samePage = previous?.pathname === location.pathname;
  const savedPosition = positions.get(location.key);
  if (samePage && previous) positions.set(previous.key, window.scrollY);
  const anchor =
    navigation === "POP" && savedPosition !== undefined
      ? null
      : anchorTarget(location.hash);
  visiblePage = {
    key: location.key,
    pathname: location.pathname,
    hash: location.hash,
  };
  if (anchor)
    anchor.scrollIntoView({
      behavior:
        samePage && navigation !== "POP" && !reducedMotion
          ? "smooth"
          : "instant",
    });
  else if (!samePage || navigation === "POP")
    window.scrollTo({
      top: navigation === "POP" ? savedPosition || 0 : 0,
      behavior: "instant",
    });
  if (previous && !samePage) {
    const main = document.getElementById("main");
    main?.setAttribute("tabindex", "-1");
    main?.focus({ preventScroll: true });
    // Back/forward and older browsers still receive a calm entrance animation.
    if (
      (!document.startViewTransition || navigation === "POP") &&
      !reducedMotion
    )
      element.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" },
      );
  }
}

function RevealContent({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef({ committed: false });
  const location = useLocation();
  const navigation = useNavigationType();
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    frame.current.committed = true;
    if (root.current)
      restorePage(location, navigation, root.current, reducedMotion);
  }, [location.key, location.hash, navigation, reducedMotion]);
  useEffect(() => {
    if (reducedMotion || !root.current || !("IntersectionObserver" in window))
      return;
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.06, rootMargin: "0px 0px -24px 0px" },
    );
    const discover = () => {
      root.current
        ?.querySelectorAll(
          "[data-reveal], .service-category, .company-card, .how-step, .faq-grid, .plus-section, .business-section, .closing-cta, .help-card",
        )
        .forEach((element) => {
          if (seen.has(element)) return;
          seen.add(element);
          element.classList.add("scroll-reveal");
          observer.observe(element);
        });
    };
    discover();
    const mutations = new MutationObserver(discover);
    mutations.observe(root.current, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [reducedMotion]);
  return (
    <NavigationDataContext.Provider value={frame.current}>
      <div ref={root} className="page-content">
        {children}
      </div>
    </NavigationDataContext.Provider>
  );
}

export function AnimatedOutlet() {
  const outlet = useOutlet();
  const location = useLocation();
  return (
    <ViewTransition
      key={location.pathname}
      default="none"
      enter="page-crossfade"
      exit="page-crossfade"
    >
      <div className="page-transition">
        <RevealContent>{outlet}</RevealContent>
      </div>
    </ViewTransition>
  );
}

export function ScrollExperience() {
  const { scrollYProgress, scrollY } = useScroll({ trackContentSize: true });
  const reducedMotion = useReducedMotion();
  const progress = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 32,
    restDelta: 0.001,
  });
  const progressWidth = useTransform(
    reducedMotion ? scrollYProgress : progress,
    (value) => `${value * 100}%`,
  );
  const [visible, setVisible] = useState(false);
  useMotionValueEvent(scrollY, "change", (value) => setVisible(value > 700));
  return (
    <>
      <motion.div
        className="reading-progress"
        style={{ width: progressWidth }}
        aria-hidden="true"
      />
      <AnimatePresence>
        {visible && (
          <motion.button
            className="back-to-top"
            aria-label="Back to top"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: reducedMotion ? "instant" : "smooth",
              })
            }
          >
            <ChevronUp size={21} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
