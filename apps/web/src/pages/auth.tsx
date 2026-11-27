import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button, Field, Select } from "../components/ui";
import { dashboard, send, useAction, useApp } from "../lib";
const schema = z.object({
  name: z.string().optional(),
  email: z.email("Enter a valid email address."),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
  companyName: z.string().optional(),
  areaId: z.string().optional(),
});
const accountPhotos = {
  student: {
    src: "/images/signup-laundry.webp",
    srcSet:
      "/images/signup-laundry-small.webp 640w, /images/signup-laundry.webp 1440w",
    alt: "A young adult loading clothes into a washing machine at a laundromat",
  },
  company: {
    src: "/images/auth-laundry-professional.webp",
    srcSet:
      "/images/auth-laundry-professional-small.webp 640w, /images/auth-laundry-professional.webp 1440w",
    alt: "A laundry worker carrying freshly cleaned linens beside commercial washing machines",
  },
};
const photoSizes = "(min-width: 1400px) 570px, (min-width: 768px) 45vw, 100vw";
type AccountType = keyof typeof accountPhotos;
export function AuthPage({ register = false }: { register?: boolean }) {
  const { refresh, config } = useApp();
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const [type, setType] = useState<AccountType>(
    params.get("type") === "company" ? "company" : "student",
  );
  const [visiblePhoto, setVisiblePhoto] = useState<AccountType>(
    register ? type : "student",
  );
  const photoElements = useRef<Partial<Record<AccountType, HTMLImageElement>>>(
    {},
  );
  useEffect(() => {
    const next = register ? type : "student";
    let cancelled = false;
    // Both layers stay mounted. Decode before fading so a slow image never
    // replaces the current photo with an empty frame.
    void photoElements.current[next]
      ?.decode()
      .then(() => {
        if (!cancelled) setVisiblePhoto(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [register, type]);
  const reducedMotion = useReducedMotion();
  const contentAnimation = useAnimationControls();
  const switchSequence = useRef(0);
  useEffect(
    () => () => {
      switchSequence.current++;
      contentAnimation.stop();
    },
    [contentAnimation],
  );
  const changeType = async (next: AccountType) => {
    const sequence = ++switchSequence.current;
    contentAnimation.stop();
    if (reducedMotion || next === type) {
      setType(next);
      contentAnimation.set({ opacity: 1, y: 0 });
      return;
    }
    await contentAnimation.start({
      opacity: 0,
      transition: { duration: 0.18, ease: "easeInOut" },
    });
    if (sequence !== switchSequence.current) return;
    // Keep the form mounted so shared details survive an account-type switch.
    flushSync(() => setType(next));
    contentAnimation.set({ opacity: 0, y: 0 });
    void contentAnimation.start({
      opacity: 1,
      y: 0,
      transition: { delay: 0.08, duration: 0.35, ease: "easeInOut" },
    });
  };
  const { run, busy } = useAction();
  const navigate = useNavigate();
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), shouldUnregister: true });
  const submit = handleSubmit(
    (values) =>
      void run(async () => {
        if (register) {
          const account = await send("auth/register", {
            name: values.name,
            email: values.email,
            password: values.password,
            type,
            ...(type === "company"
              ? { companyName: values.companyName, areaId: values.areaId }
              : {}),
          });
          await refresh();
          const next = params.get("redirect");
          navigate(
            next && next.startsWith("/") && !next.startsWith("//")
              ? next
              : dashboard(account.role),
            { replace: true },
          );
        } else {
          await send("auth/login", values);
          await refresh();
          const next = params.get("redirect");
          const auth = await (await import("../lib")).api("auth/me");
          navigate(
            next && next.startsWith("/") && !next.startsWith("//")
              ? next
              : dashboard(auth.user?.role),
          );
        }
      }),
  );
  return (
    <section className="auth-layout container">
      <motion.div
        className="auth-content"
        animate={contentAnimation}
        initial={false}
      >
        <p className="eyebrow">
          {register ? "A LIGHTER LOAD STARTS HERE" : "YOUR FRESH START AWAITS"}
        </p>
        <h1 aria-live={register ? "polite" : undefined}>
          {register && type === "company" ? (
            <>
              Your laundry.
              <br />A wider reach.
            </>
          ) : register ? (
            <>
              Make room
              <br />
              for your day.
            </>
          ) : (
            <>
              Welcome back.
              <br />
              Let’s get fresh.
            </>
          )}
        </h1>
        <p className={register ? "auth-intro" : undefined}>
          {register
            ? type === "company"
              ? "Meet students around UCC and manage your laundry business in one place."
              : "Create your account. We’ll help take laundry off your list."
            : "Sign in to find your laundry day, just as you left it."}
        </p>
        {register && (
          <div className="segmented-control" aria-label="Account type">
            <button
              className={type === "student" ? "active" : ""}
              aria-pressed={type === "student"}
              onClick={() => void changeType("student")}
            >
              I’m a student
            </button>
            <button
              className={type === "company" ? "active" : ""}
              aria-pressed={type === "company"}
              onClick={() => void changeType("company")}
            >
              I run a laundry
            </button>
          </div>
        )}
        <form className="form-stack" onSubmit={submit} noValidate>
          {register && (
            <Field label="Your full name" error={errors.name?.message}>
              <input
                {...field("name")}
                required
                placeholder="Your name"
                autoComplete="name"
              />
            </Field>
          )}
          {register && type === "company" && (
            <>
              <Field label="Laundry business name">
                <input
                  {...field("companyName")}
                  required
                  minLength={3}
                  placeholder="Your laundry’s name"
                />
              </Field>
              <Field label="Business area">
                <Select {...field("areaId")} required>
                  <option value="">Choose your area</option>
                  {config?.areas.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Email address" error={errors.email?.message}>
            <input
              {...field("email")}
              type="email"
              autoComplete="email"
              placeholder="Your email address"
            />
          </Field>
          <Field
            label="Password"
            error={errors.password?.message}
            hint={
              register
                ? "At least 12 characters. A passphrase works well."
                : undefined
            }
          >
            <div className="password-input">
              <input
                {...field("password")}
                type={show ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          {!register && (
            <Link to="/forgot-password" className="forgot-link">
              Need help signing in?
            </Link>
          )}
          {register && (
            <p className="muted small">
              By creating an account, you agree to the{" "}
              <Link to="/terms">terms of service</Link> and acknowledge the{" "}
              <Link to="/privacy">privacy policy</Link>.
            </p>
          )}
          <Button type="submit" busy={busy} className="full-width">
            {register ? "Create your account" : "Sign in"}
          </Button>
        </form>
        <p className="auth-switch">
          {register ? "Already part of the fold?" : "New around here?"}{" "}
          <Link to={register ? "/sign-in" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </motion.div>
      <div className="auth-visual" data-photo={visiblePhoto}>
        {(["student", "company"] as const).map((kind) => {
          const photo = accountPhotos[kind];
          return (
            <motion.img
              key={kind}
              ref={(element) => {
                if (element) photoElements.current[kind] = element;
                else delete photoElements.current[kind];
              }}
              data-photo={kind}
              data-active={visiblePhoto === kind}
              aria-hidden={visiblePhoto !== kind}
              initial={false}
              // The student photo is an opaque base under the company layer.
              // Reversing the selection simply reverses the same fade.
              animate={{
                opacity:
                  kind === "student" || visiblePhoto === "company" ? 1 : 0,
              }}
              transition={{
                delay: reducedMotion ? 0 : 0.14,
                duration: reducedMotion ? 0 : 0.72,
                ease: [0.4, 0, 0.2, 1],
              }}
              style={{ zIndex: kind === "company" ? 1 : 0 }}
              src={photo.src}
              srcSet={photo.srcSet}
              sizes={photoSizes}
              alt={photo.alt}
              width="1440"
              height="2160"
              decoding="async"
            />
          );
        })}
      </div>
    </section>
  );
}
