import {
  useEffect,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  Children,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { Link, type LinkProps } from "react-router-dom";
import {
  X,
  LoaderCircle,
  PackageOpen,
  TriangleAlert,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
export function Button({
  children,
  className = "",
  variant = "primary",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "light" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`btn btn-${variant} ${className}`}
    >
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function ButtonLink({
  to,
  children,
  variant = "primary",
  className = "",
  ...props
}: LinkProps & {
  variant?: string;
}) {
  return (
    <Link {...props} className={`btn btn-${variant} ${className}`} to={to}>
      {children}
    </Link>
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Status({ value }: { value: string }) {
  const tone = [
    "completed",
    "paid",
    "active",
    "approved",
    "success",
    "processed",
    "published",
    "clean",
  ].includes(value)
    ? "green"
    : ["failed", "rejected", "cancelled", "suspended"].includes(value)
      ? "red"
      : [
            "pending",
            "requested",
            "unpaid",
            "past_due",
            "quarantined",
            "refund_required",
            "demo_sample",
          ].includes(value)
        ? "amber"
        : "neutral";
  return (
    <Badge tone={tone}>
      {value === "demo_sample" ? "Review required" : value.replaceAll("_", " ")}
    </Badge>
  );
}
export function Field({
  label,
  children,
  hint,
  error,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  className?: string;
}) {
  const generated = useId();
  let controlId = generated;
  let assigned = false;
  const attach = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (!isValidElement(child)) return child;
      const e = child as ReactElement<any>;
      if (
        !assigned &&
        (["input", "select", "textarea"].includes(String(e.type)) ||
          e.type === Select)
      ) {
        assigned = true;
        controlId = e.props.id || generated;
        return cloneElement(e, {
          id: controlId,
          "aria-describedby":
            [
              hint ? `${generated}-hint` : null,
              error ? `${generated}-error` : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined,
          "aria-invalid": !!error || undefined,
        });
      }
      return e.props.children
        ? cloneElement(e, { children: attach(e.props.children) })
        : e;
    });
  const controls = attach(children);
  return (
    <div className={`field ${className}`}>
      <label className="field-label" htmlFor={controlId}>
        {label}
      </label>
      {controls}
      {hint && (
        <span id={`${generated}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${generated}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select {...props}>{children}</select>
      <ChevronDown size={16} />
    </span>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>Freshening things up…</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="empty-state">
      <TriangleAlert size={32} />
      <h3>Let’s try that again.</h3>
      <p>
        {error instanceof Error
          ? error.message
          : "We could not load this page."}
      </p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Empty({
  title = "A fresh start.",
  text,
  action,
}: {
  title?: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <PackageOpen size={36} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Success({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="success-panel">
      <CheckCircle2 size={32} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function Pagination({
  page,
  pages,
  total,
  onPage,
  busy = false,
  label = "records",
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  busy?: boolean;
  label?: string;
}) {
  if (!total) return null;
  return (
    <nav className="payment-pagination" aria-label={`${label} pagination`}>
      <span>
        {total.toLocaleString()} {label} · Page {page} of {pages}
      </span>
      <div className="button-row">
        <Button
          variant="secondary"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={busy || page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}
export function Panel({
  title,
  description,
  children,
  action,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
