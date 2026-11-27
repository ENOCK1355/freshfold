import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Shirt,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  ErrorState,
  Field,
  Loading,
  PageHead,
  Panel,
  Select,
  Status,
  Success,
} from "../components/ui";
import {
  api,
  dateLabel,
  idempotency,
  money,
  send,
  useAction,
  useApp,
  useData,
} from "../lib";

export function Booking() {
  const { slug } = useParams();
  const [bookingParams] = useSearchParams();
  const { user, config } = useApp();
  const company = useData(`book-company-${slug}`, `companies/${slug}`);
  const profile = useData("profile");
  const [step, setStep] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [slotId, setSlot] = useState("");
  const [method, setMethod] = useState("pickup");
  const [areaId, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [care, setCare] = useState("");
  const careInitialized = useRef(false);
  const [key] = useState(idempotency);
  const { run, busy } = useAction();
  const navigate = useNavigate();
  const c = company.data;
  useEffect(() => {
    if (c && !slotId) {
      const preferredDay = bookingParams.get("day");
      const first =
        c.slots.find(
          (s: any) =>
            s.available > 0 &&
            (!preferredDay ||
              new Date(s.startsAt).getUTCDay() === Number(preferredDay)),
        ) || c.slots.find((s: any) => s.available > 0);
      if (first) setSlot(first.id);
      setArea(c.areas[0]?.id || "");
      setMethod(c.pickup ? "pickup" : "dropoff");
      setQuantities({ [c.services[0]?.id]: 1 });
    }
  }, [c]);
  useEffect(() => {
    if (profile.data && !careInitialized.current) {
      careInitialized.current = true;
      if (!care && profile.data.preferences?.detergent)
        setCare(`Detergent preference: ${profile.data.preferences.detergent}`);
    }
    const a = profile.data?.addresses[0];
    if (a && !address) {
      setAddress(a.detail);
      if (c?.areas.some((x: any) => x.id === a.areaId)) setArea(a.areaId);
    }
  }, [profile.data, c]);
  const input = {
    companyId: c?.id,
    items: Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([serviceId, quantity]) => ({ serviceId, quantity })),
    slotId,
    method,
    address: { areaId, detail: address },
    careNotes: care,
    idempotencyKey: key,
  };
  const quote = useQuery({
    queryKey: ["quote", input],
    queryFn: () => send("bookings/quote", input),
    enabled: !!c && step === 2 && address.length >= 5 && !!slotId && !!user,
    retry: false,
  });
  if (company.isLoading) return <Loading />;
  if (company.isError)
    return (
      <div className="container section">
        <ErrorState error={company.error} />
      </div>
    );
  const subtotal = c.services.reduce(
    (n: number, s: any) => n + s.price * (quantities[s.id] || 0),
    0,
  );
  const create = () =>
    void run(async () => {
      const order = await send("bookings", input);
      if (!c.instantBooking) {
        navigate(`/account/orders/${order.id}`);
        return;
      }
      const payment = await send("payments/checkout", {
        kind: "order",
        orderId: order.id,
        idempotencyKey: `${key}-payment`,
      });
      navigate(`/checkout/${payment.id}`);
    });
  return (
    <div className="container section booking-page">
      <div className="breadcrumbs">
        <Link to={`/laundry/${slug}`}>{c.name}</Link>
        <span>/</span>
        <span>Your booking</span>
      </div>
      <PageHead
        eyebrow="A LITTLE LESS LAUNDRY. STARTS HERE."
        title="Let’s sort your laundry."
        description={`Care provided by ${c.name}.`}
      />
      <div className="booking-progress">
        {["Your laundry", "The details", "Review & book"].map((label, i) => (
          <button
            key={label}
            disabled={i > step}
            className={i === step ? "active" : i < step ? "complete" : ""}
            onClick={() => setStep(i)}
          >
            <span>{i < step ? <Check size={16} /> : i + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="booking-layout">
        <div>
          {step === 0 ? (
            <Panel
              title="What’s in your basket?"
              description="Add the services you need. Prices are per displayed unit."
            >
              {c.services.map((s: any) => (
                <div className="booking-service" key={s.id}>
                  <span className="service-row-icon">
                    <Shirt size={24} />
                  </span>
                  <div>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <strong>
                      {money(s.price)}{" "}
                      <small>
                        / {s.unit}
                        {s.estimated ? " · estimated" : ""}
                      </small>
                    </strong>
                  </div>
                  <div className="quantity-control">
                    <button
                      onClick={() =>
                        setQuantities((current) => ({
                          ...current,
                          [s.id]: Math.max(0, (current[s.id] || 0) - 1),
                        }))
                      }
                      aria-label={`Remove one ${s.name}`}
                      disabled={!quantities[s.id]}
                    >
                      <Minus size={15} />
                    </button>
                    <span aria-live="polite">{quantities[s.id] || 0}</span>
                    <button
                      onClick={() =>
                        setQuantities((current) => ({
                          ...current,
                          [s.id]: Math.min(100, (current[s.id] || 0) + 1),
                        }))
                      }
                      aria-label={`Add one ${s.name}`}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="notice compact">
                <Wallet size={18} />
                <p>Minimum laundry order: {money(c.minimum)}.</p>
              </div>
              <Button
                disabled={subtotal < c.minimum}
                className="full-width"
                onClick={() => setStep(1)}
              >
                Choose your collection details
              </Button>
            </Panel>
          ) : step === 1 ? (
            <Panel
              title="A window that works for you."
              description="Collection and return times are shown in Africa/Accra."
            >
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  setStep(2);
                }}
              >
                <Field label="How should your laundry reach the company?">
                  <Select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {c.pickup && (
                      <option value="pickup">
                        Collect & return my laundry
                      </option>
                    )}
                    <option value="dropoff">I’ll drop off & collect</option>
                  </Select>
                </Field>
                <div className="form-row">
                  <Field label="Service area">
                    <Select
                      required
                      value={areaId}
                      onChange={(e) => setArea(e.target.value)}
                    >
                      {c.areas.map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {profile.data?.addresses.length > 0 && (
                    <Field label="Use a saved address">
                      <Select
                        value=""
                        onChange={(e) => {
                          const a = profile.data.addresses.find(
                            (a: any) => a.id === e.target.value,
                          );
                          if (a) {
                            setAddress(a.detail);
                            if (c.areas.some((x: any) => x.id === a.areaId))
                              setArea(a.areaId);
                          }
                        }}
                      >
                        <option value="">Choose saved address</option>
                        {profile.data.addresses.map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
                <Field
                  label={
                    method === "pickup"
                      ? "Collection address"
                      : "Your contact address"
                  }
                >
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Hall or hostel, room, and a helpful landmark"
                    rows={3}
                  />
                </Field>
                <fieldset className="slot-fieldset">
                  <legend>Choose a collection or drop-off window</legend>
                  <div className="slot-grid">
                    {c.slots
                      .filter((s: any) => s.available > 0)
                      .slice(0, 15)
                      .map((s: any) => (
                        <label
                          key={s.id}
                          className={slotId === s.id ? "slot selected" : "slot"}
                        >
                          <input
                            type="radio"
                            name="slot"
                            value={s.id}
                            checked={slotId === s.id}
                            onChange={() => setSlot(s.id)}
                            required
                          />
                          <CalendarDays size={17} />
                          <strong>
                            {dateLabel(s.startsAt, { weekday: "short" })}
                          </strong>
                          <span>
                            {dateLabel(s.startsAt, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                              .split(", ")
                              .pop()}{" "}
                            –{" "}
                            {new Date(s.endsAt).toLocaleTimeString("en-GB", {
                              timeZone: "Africa/Accra",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <small>{s.available} spaces left</small>
                        </label>
                      ))}
                  </div>
                </fieldset>
                <Field
                  label="Anything we should know?"
                  hint="Care labels, detergent preferences, or collection instructions."
                >
                  <textarea
                    value={care}
                    onChange={(e) => setCare(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="A little care goes a long way…"
                  />
                </Field>
                <div className="button-row">
                  <Button variant="secondary" onClick={() => setStep(0)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={!slotId}>
                    Review your booking
                  </Button>
                </div>
              </form>
            </Panel>
          ) : (
            <Panel
              title="A fresh start, all checked."
              description="Review every detail and charge before booking."
            >
              {quote.isLoading ? (
                <Loading />
              ) : quote.isError ? (
                <ErrorState
                  error={quote.error}
                  retry={() => void quote.refetch()}
                />
              ) : (
                quote.data && (
                  <>
                    <div className="booking-review">
                      <div>
                        <MapPin size={20} />
                        <div>
                          <strong>
                            {method === "pickup"
                              ? "Collect & return"
                              : "Customer drop-off"}
                          </strong>
                          <p>{address}</p>
                        </div>
                      </div>
                      <div>
                        <CalendarDays size={20} />
                        <div>
                          <strong>
                            {dateLabel(
                              c.slots.find((s: any) => s.id === slotId)
                                ?.startsAt,
                              {
                                weekday: "long",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </strong>
                          <p>
                            Expected return:{" "}
                            {dateLabel(quote.data.returnAt, {
                              weekday: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      {care && (
                        <div>
                          <Shirt size={20} />
                          <div>
                            <strong>Your care notes</strong>
                            <p>{care}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="receipt-lines">
                      {quote.data.items.map((i: any) => (
                        <div key={i.serviceId}>
                          <span>
                            {i.name} × {i.quantity}
                          </span>
                          <strong>{money(i.lineTotal)}</strong>
                        </div>
                      ))}
                      <div>
                        <span>
                          Convenience fee{" "}
                          {quote.data.premium && <Badge>Plus benefit</Badge>}
                        </span>
                        <strong>{money(quote.data.convenienceFee)}</strong>
                      </div>
                      <div>
                        <span>Collection & return</span>
                        <strong>{money(quote.data.deliveryFee)}</strong>
                      </div>
                      <div className="receipt-total">
                        <span>Total</span>
                        <strong>{money(quote.data.total)}</strong>
                      </div>
                    </div>
                    {quote.data.estimated && (
                      <div className="notice">
                        <ShieldCheck size={20} />
                        <p>
                          Weight-based prices are estimates. The company will
                          request your approval for confirmed-weight
                          adjustments.
                        </p>
                      </div>
                    )}
                    <p className="muted small">
                      {c.instantBooking
                        ? "Capacity is held for 15 minutes while you complete payment."
                        : "This company will review and accept your request before payment."}{" "}
                      By booking, you accept the{" "}
                      <Link to="/refund-policy">cancellation terms</Link> and{" "}
                      <Link to="/care-policy">care policy</Link>.
                    </p>
                    <div className="button-row">
                      <Button variant="secondary" onClick={() => setStep(1)}>
                        Edit details
                      </Button>
                      <Button busy={busy} onClick={create}>
                        {c.instantBooking
                          ? "Reserve & continue to payment"
                          : "Send booking request"}
                      </Button>
                    </div>
                  </>
                )
              )}
            </Panel>
          )}
        </div>
        <aside>
          <div className="booking-summary">
            <img
              src={c.photo}
              alt={"Laundry prepared for garment care"}
              width="600"
              height="280"
            />
            <div>
              <h2>{c.name}</h2>
              <p>
                <MapPin size={14} />
                {c.location}
              </p>
              <div className="summary-meta">
                <span>
                  <Clock3 size={16} />
                  {c.turnaroundHours}h turnaround
                </span>
                <span>
                  <ShieldCheck size={16} />
                  Application reviewed
                </span>
              </div>
              <div className="summary-price">
                <span>Laundry subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>
              {user?.premium ? (
                <div className="notice compact">
                  <SparklesInline />
                  <p>Your standard convenience fee is waived with Plus.</p>
                </div>
              ) : (
                <p className="muted small">
                  The standard {money(config?.rules.convenienceFee || 300)}{" "}
                  convenience fee is shown in your final review.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
function SparklesInline() {
  return <CheckCircle2 size={18} />;
}
export function Checkout() {
  const navigate = useNavigate();
  const { paymentId } = useParams();
  const data = useData(`payment-${paymentId}`, `payments/${paymentId}`);
  const { run, busy } = useAction();
  const p = data.data;
  useEffect(() => {
    if (p?.status !== "pending") return;
    const t = setInterval(() => void data.refetch(), 5000);
    return () => clearInterval(t);
  }, [p?.status]);
  if (data.isLoading) return <Loading />;
  if (data.isError)
    return (
      <div className="container section">
        <ErrorState error={data.error} />
      </div>
    );
  return (
    <div className="container section checkout-page">
      <div className="checkout-main">
        <p className="eyebrow">ONE STEP CLOSER TO FRESH</p>
        <h1>
          {p.status === "success"
            ? "Fresh start, confirmed."
            : "A clear, simple checkout."}
        </h1>
        <p>
          {p.kind === "order"
            ? "Your selected company is ready to care for your laundry."
            : p.kind === "student"
              ? "A few thoughtful extras are waiting."
              : p.kind === "hosting"
                ? "A new home for your laundry business."
                : "Help students discover your business."}
        </p>
        <Panel>
          {p.status === "success" ? (
            <Success title="Payment confirmed.">
              <p>
                {p.orderId
                  ? "Follow your laundry’s progress from your account."
                  : ["student", "hosting"].includes(p.kind) &&
                      p.mode !== "simulator"
                    ? "Your payment has been received. Check your billing page for subscription approval."
                    : "Your purchase is ready in your account."}
              </p>
              <ButtonLink
                to={
                  p.orderId
                    ? `/account/orders/${p.orderId}`
                    : p.kind === "student"
                      ? "/account/billing"
                      : p.kind === "sponsored"
                        ? "/business/promotions"
                        : "/business/onboarding"
                }
              >
                {p.orderId ? "Track your laundry" : "Continue to your account"}
              </ButtonLink>
            </Success>
          ) : p.mode === "simulator" ? (
            <p>
              Online checkout is unavailable for this payment. Please contact
              support.
            </p>
          ) : (
            <>
              <h2>Pay securely with Paystack</h2>
              {p.status === "failed" && (
                <div className="form-alert" role="alert">
                  Your payment was not completed. You can try again with another
                  card or payment method.
                </div>
              )}
              <p>
                Payment details are entered only on Paystack’s hosted checkout.
                We never collect card details or mobile money PINs.
              </p>
              <div className="payment-methods">
                <span>
                  <CreditCard size={20} /> Card
                </span>
                <span>
                  <Smartphone size={20} /> Ghana mobile money
                </span>
              </div>
              {p.checkoutUrl ? (
                <a className="btn btn-primary full-width" href={p.checkoutUrl}>
                  Open Paystack checkout
                </a>
              ) : (
                <div className="notice">
                  <ShieldCheck />
                  <p>
                    Checkout could not be opened. Try again in a moment or
                    contact support with your order reference.
                  </p>
                </div>
              )}
              <Button
                className="full-width"
                variant="secondary"
                busy={busy}
                onClick={() =>
                  void run(
                    () => send("payments/verify", { reference: p.reference }),
                    "Payment status checked with Paystack.",
                  )
                }
              >
                Verify payment with Paystack
              </Button>
              {p.status === "failed" && (
                <Button
                  className="full-width"
                  variant="secondary"
                  busy={busy}
                  onClick={() =>
                    void run(async () => {
                      const next = await send(`payments/${p.id}/retry`);
                      navigate(`/checkout/${next.id}`);
                    })
                  }
                >
                  Start a new checkout
                </Button>
              )}
            </>
          )}
        </Panel>
      </div>
      <aside>
        <Panel title="Your checkout">
          <div className="receipt-lines">
            <div>
              <span>Purchase</span>
              <strong>
                {p.kind === "student"
                  ? "Student Plus"
                  : p.kind === "hosting"
                    ? "Company hosting"
                    : p.kind === "sponsored"
                      ? "Sponsored placement"
                      : "Laundry booking"}
              </strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>GHS</strong>
            </div>
            <div>
              <span>Status</span>
              <Status value={p.status} />
            </div>
            <div className="receipt-total">
              <span>Total</span>
              <strong>{money(p.amount)}</strong>
            </div>
          </div>
          {p.orderId && (
            <Link to={`/account/orders/${p.orderId}`}>
              View order & full breakdown
            </Link>
          )}
        </Panel>
      </aside>
    </div>
  );
}
export function PaymentReturn() {
  const [params] = useSearchParams();
  const { run, busy } = useAction();
  const reference = params.get("reference") || params.get("trxref");
  const verification = useQuery({
    queryKey: ["payment-return", reference],
    enabled: !!reference,
    queryFn: async () => {
      const current = await api(`payments/${encodeURIComponent(reference!)}`);
      return current.mode === "simulator" || current.status === "success"
        ? current
        : send("payments/verify", { reference });
    },
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 4000 : false,
  });
  const payment = verification.data;
  return (
    <div className="container section narrow">
      <PageHead
        title="Let’s check your payment."
        description="View your payment status and continue to your account."
      />
      <Panel>
        {reference && verification.isPending ? (
          <Loading />
        ) : verification.isError ? (
          <ErrorState
            error={verification.error}
            retry={() => void verification.refetch()}
          />
        ) : payment ? (
          <Success
            title={
              payment.status === "success"
                ? "Payment confirmed."
                : "Payment status checked."
            }
          >
            <Status value={payment.status} />
            {payment.status === "success" &&
              ["student", "hosting"].includes(payment.kind) && (
                <p>
                  Your payment has been received. Your billing page shows the
                  subscription approval status.
                </p>
              )}
            <ButtonLink
              to={
                payment.orderId
                  ? `/account/orders/${payment.orderId}`
                  : payment.kind === "student"
                    ? "/account/billing"
                    : "/business/subscription"
              }
            >
              Continue
            </ButtonLink>
          </Success>
        ) : (
          <Button
            busy={busy}
            onClick={() =>
              void run(async () => {
                if (!reference)
                  throw new Error(
                    "Open the payment link from your account to check its status.",
                  );
                await verification.refetch();
              })
            }
          >
            Check payment status
          </Button>
        )}
      </Panel>
    </div>
  );
}
