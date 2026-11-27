import {
  CalendarDays,
  Check,
  Clock3,
  Download,
  MapPin,
  MessageCircle,
  Package,
  ShieldCheck,
  Shirt,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  dateLabel,
  idempotency,
  money,
  send,
  titleCase,
  useAction,
  useApp,
  useData,
} from "../lib";
import {
  Button,
  ButtonLink,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHead,
  Panel,
  Select,
  Status,
} from "./ui";
export function OrderTable({
  orders,
  base = "/account",
  compact = false,
}: {
  orders: any[];
  base?: string;
  compact?: boolean;
}) {
  return orders.length ? (
    <div className="table-wrap">
      <table className="order-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Laundry {base === "/business" ? "& customer" : ""}</th>
            {!compact && <th>Collection</th>}
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link className="table-strong" to={`${base}/orders/${o.id}`}>
                  {o.reference}
                </Link>
                <small>{dateLabel(o.createdAt)}</small>
              </td>
              <td>
                <span className="table-strong">{o.company.name}</span>
                <small>
                  {base === "/business"
                    ? o.user?.name
                    : o.items
                        .map((i: any) => i.name)
                        .slice(0, 2)
                        .join(", ")}
                </small>
              </td>
              {!compact && (
                <td>
                  {o.slot
                    ? dateLabel(o.slot.startsAt, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Historical record"}
                  <small>
                    {o.method === "pickup" ? "Collection & return" : "Drop-off"}
                  </small>
                </td>
              )}
              <td>
                <Status value={o.status} />
                <small className="payment-label">
                  {titleCase(o.paymentStatus)}
                </small>
              </td>
              <td className="table-amount">{money(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="A clean slate."
      text="Your laundry orders will appear here."
      action={
        base === "/account" ? (
          <ButtonLink to="/find-laundry">Find your laundry</ButtonLink>
        ) : undefined
      }
    />
  );
}
export function OrderDetail({ base = "/account" }: { base?: string }) {
  const { id } = useParams();
  const { user, config } = useApp();
  const data = useData(`order-${id}`, `orders/${id}`);
  const { run, busy } = useAction();
  const [status, setStatus] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("Order progress confirmed.");
  const [refund, setRefund] = useState(false);
  const [support, setSupport] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  if (data.isLoading) return <Loading />;
  if (data.isError)
    return <ErrorState error={data.error} retry={() => void data.refetch()} />;
  const o = data.data;
  const isCustomer = o.userId === user?.id;
  const isBusiness = base !== "/account";
  const checkout = () =>
    void run(async () => {
      const p = await send("payments/checkout", {
        kind: "order",
        orderId: o.id,
        idempotencyKey: idempotency(),
      });
      window.location.assign(`/checkout/${p.id}`);
    });
  const message = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const body = new FormData(form).get("body");
    void run(async () => {
      await send(`orders/${o.id}/messages`, { body });
      form.reset();
    }, "Message sent.");
  };
  return (
    <>
      <div className="breadcrumbs">
        <Link to={`${base}/orders`}>Orders</Link>
        <span>/</span>
        <span>{o.reference}</span>
      </div>
      <PageHead
        eyebrow={isCustomer ? "YOUR LAUNDRY, LOOKED AFTER" : "ORDER WORKSPACE"}
        title={o.reference}
        description={`${o.company.name} · Booked ${dateLabel(o.createdAt, { year: "numeric" })}`}
        action={
          <div className="button-row">
            <Status value={o.status} />
            <Button variant="secondary" onClick={() => window.print()}>
              <Download size={16} /> Receipt
            </Button>
          </div>
        }
      />
      <div className="order-detail-layout">
        <div>
          <Panel
            title="A fresh view of your order."
            action={<Status value={o.paymentStatus} />}
          >
            <div className="order-company-summary">
              <img
                src={o.company.photo || "/images/folded-towels.webp"}
                alt={"Fresh laundry and garment care"}
              />
              <div>
                <span className="eyebrow">YOUR LAUNDRY COMPANY</span>
                <h2>{o.company.name}</h2>
                <p>This company fulfils the laundry service.</p>
              </div>
            </div>
            <div className="order-info-grid">
              <div>
                <CalendarDays size={18} />
                <span>Collection window</span>
                <strong>
                  {o.slot
                    ? dateLabel(o.slot.startsAt, {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Seeded historical order"}
                </strong>
              </div>
              <div>
                <TruckIcon />
                <span>Collection method</span>
                <strong>
                  {o.method === "pickup"
                    ? "Collect & return"
                    : "Customer drop-off"}
                </strong>
              </div>
              <div>
                <MapPin size={18} />
                <span>Service address</span>
                <strong>{o.address.detail}</strong>
              </div>
              <div>
                <Shirt size={18} />
                <span>Care notes</span>
                <strong>
                  {o.careNotes || "Follow the garment care labels."}
                </strong>
              </div>
            </div>
            {isCustomer && o.handoverNotice && (
              <div className="notice">
                <ShieldCheck size={22} />
                <p>{o.handoverNotice}</p>
              </div>
            )}
            {isCustomer &&
              ![
                "paid",
                "partially_refunded",
                "refunded",
                "refund_required",
              ].includes(o.paymentStatus) &&
              !["requested", "cancelled"].includes(o.status) && (
                <Button busy={busy} onClick={checkout} className="full-width">
                  Complete your payment
                </Button>
              )}
            {o.paymentStatus === "refund_required" && (
              <div className="notice">
                <Clock3 size={20} />
                <p>
                  Payment arrived after the reservation expired. A full refund
                  is required and is being processed through Paystack.
                </p>
              </div>
            )}
          </Panel>
          <Panel title="Every step, in the fold.">
            <div className="order-timeline">
              {o.events.map((e: any, i: number) => (
                <div
                  key={e.id}
                  className={
                    i === o.events.length - 1
                      ? "timeline-event latest"
                      : "timeline-event"
                  }
                >
                  <span className="timeline-dot">
                    {i === o.events.length - 1 ? (
                      <Package size={15} />
                    ) : (
                      <Check size={13} />
                    )}
                  </span>
                  <div>
                    <strong>{titleCase(e.status)}</strong>
                    <p>{e.reason}</p>
                    <small>
                      {dateLabel(e.createdAt, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            {o.allowedTransitions.length > 0 && (
              <form
                className="status-action-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await send(`orders/${o.id}/status`, {
                      status: status || o.allowedTransitions[0],
                      reason,
                      code,
                    });
                    setStatus("");
                  }, "Order status updated.");
                }}
              >
                <Field
                  label={
                    isCustomer ? "Your next step" : "Update fulfilment status"
                  }
                >
                  <Select
                    value={status || o.allowedTransitions[0]}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {o.allowedTransitions.map((s: string) => (
                      <option key={s} value={s}>
                        {s === "completed" && isCustomer
                          ? "Confirm I received my laundry"
                          : titleCase(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {(status || o.allowedTransitions[0]) === "delivered" && (
                  <Field label="Customer’s handover code">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      placeholder="Ask after delivering the garments"
                    />
                  </Field>
                )}
                <Field label="Note for the order timeline">
                  <input
                    required
                    minLength={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <Button type="submit" busy={busy}>
                  Save order update
                </Button>
              </form>
            )}
          </Panel>
          {o.quoteAdjustment && (
            <Panel title="Confirmed-weight adjustment">
              <p>
                The company recorded {o.quoteAdjustment.confirmedWeight} kg.{" "}
                {o.quoteAdjustment.reason}
              </p>
              <p>
                Proposed laundry charge:{" "}
                <strong>{money(o.quoteAdjustment.subtotal)}</strong>. Refund
                due: {money(o.quoteAdjustment.refundDue)}.
              </p>
              <Status value={o.quoteAdjustment.status} />
              {isCustomer &&
                o.quoteAdjustment.status === "awaiting_customer" && (
                  <Button
                    busy={busy}
                    onClick={() =>
                      void run(
                        () => send(`orders/${o.id}/approve-adjustment`),
                        "Weight adjustment approved. A refund review is now required.",
                      )
                    }
                  >
                    Approve confirmed weight
                  </Button>
                )}
            </Panel>
          )}
          <Panel
            title="A direct line to your laundry."
            description="Order-specific messages, visible only to the customer, company, and authorised support."
          >
            <div className="message-list">
              {o.messages.length ? (
                o.messages.map((m: any) => (
                  <div
                    key={m.id}
                    className={`message ${m.userId === user?.id ? "message-own" : ""}`}
                  >
                    <div>
                      <strong>{m.user.name}</strong>
                      <small>
                        {dateLabel(m.createdAt, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                    <p>{m.body}</p>
                  </div>
                ))
              ) : (
                <p className="muted">
                  No messages yet. Add a note to start the conversation.
                </p>
              )}
            </div>
            <form className="message-form" onSubmit={message}>
              <input
                name="body"
                required
                minLength={1}
                maxLength={2000}
                aria-label="Message to your laundry company"
                placeholder="A question or a little detail…"
              />
              <Button type="submit" busy={busy}>
                Send
              </Button>
            </form>
          </Panel>
          {o.canReview && (
            <Panel
              title="How was your fresh start?"
              description="One review per completed order. Your feedback stays linked to this service."
            >
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      send(`orders/${o.id}/review`, {
                        rating,
                        text: reviewText,
                      }),
                    "Your review has been published.",
                  );
                }}
              >
                <Field label="Your rating">
                  <Select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option value={n} key={n}>
                        {n} {n === 1 ? "star" : "stars"}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Your experience">
                  <textarea
                    minLength={10}
                    maxLength={2000}
                    required
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={3}
                  />
                </Field>
                <Button type="submit" busy={busy}>
                  Share your review
                </Button>
              </form>
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="Every charge, clear.">
            <div className="receipt-lines">
              {o.items.map((i: any) => (
                <div key={i.id}>
                  <span>
                    {i.name} × {i.quantity}
                    {i.estimated ? " (est.)" : ""}
                  </span>
                  <strong>{money(i.lineTotal)}</strong>
                </div>
              ))}
              <div>
                <span>Convenience fee</span>
                <strong>{money(o.convenienceFee)}</strong>
              </div>
              <div>
                <span>Collection & return</span>
                <strong>{money(o.deliveryFee)}</strong>
              </div>
              <div className="receipt-total">
                <span>Total</span>
                <strong>{money(o.total)}</strong>
              </div>
            </div>
            {isBusiness && (
              <div className="company-allocation">
                <div>
                  <span>Company allocation</span>
                  <strong>{money(o.companyShare)}</strong>
                </div>
                <div>
                  <span>Platform commission</span>
                  <strong>{money(o.commission)}</strong>
                </div>
                <p>
                  Before company-borne charges. Gateway costs are borne by the
                  platform according to the fee rules recorded with the
                  transaction.
                </p>
              </div>
            )}
            {o.payments.map((p: any) => (
              <div key={p.id} className="payment-record">
                <Status value={p.status} />
                <span>{money(p.amount)}</span>
                <small>{p.reference}</small>
              </div>
            ))}
          </Panel>
          {o.refunds.length > 0 && (
            <Panel title="Refund records">
              {o.refunds.map((r: any) => (
                <div className="refund-record" key={r.id}>
                  <div>
                    <strong>{money(r.amount)}</strong>
                    <Status value={r.status} />
                  </div>
                  <p>{r.reason}</p>
                  <small>
                    Laundry: {money(r.laundryAmount)} · Convenience:{" "}
                    {money(r.convenienceReversal)}
                  </small>
                </div>
              ))}
            </Panel>
          )}
          <Panel title="Need a little help?">
            <p>
              Keep everything connected to this order. We’ll review the
              instructions and service history.
            </p>
            <Button
              className="full-width"
              variant="secondary"
              onClick={() => setSupport(true)}
            >
              <MessageCircle size={17} /> Open a support case
            </Button>
            {user?.role === "admin" &&
              o.payments.some(
                (payment: any) =>
                  payment.status === "success" &&
                  payment.mode === config?.paymentMode,
              ) &&
              ["paid", "partially_refunded", "refund_required"].includes(
                o.paymentStatus,
              ) && (
                <Button
                  className="full-width"
                  variant="ghost"
                  onClick={() => setRefund(true)}
                >
                  Authorise a refund
                </Button>
              )}
          </Panel>
          {isBusiness &&
            o.items.some((i: any) => i.estimated) &&
            ["collected", "processing"].includes(o.status) && (
              <WeightAdjustment id={o.id} />
            )}
        </aside>
      </div>
      {refund && (
        <RefundModal orderId={o.id} onClose={() => setRefund(false)} />
      )}{" "}
      {support && (
        <Modal
          title="A little help with your order."
          onClose={() => setSupport(false)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await send("contact", {
                  name: user?.name,
                  subject: f.get("subject"),
                  body: f.get("body"),
                  category: "garment-care",
                  orderId: o.id,
                });
                setSupport(false);
              }, "Support case opened. Follow it from Help & support.");
            }}
          >
            <Field label="What needs attention?">
              <input name="subject" required minLength={5} maxLength={200} />
            </Field>
            <Field label="Tell us a little more">
              <textarea
                name="body"
                required
                minLength={10}
                maxLength={4000}
                rows={5}
              />
            </Field>
            <Button type="submit" busy={busy}>
              Open order-linked case
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
function TruckIcon() {
  return <Package size={18} />;
}
export function RefundModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [kind, setKind] = useState("full");
  const [requestKey] = useState(idempotency);
  const options = useData(
    `refund-option-${orderId}`,
    `admin/refund-options?orderId=${encodeURIComponent(orderId)}`,
  );
  const option = options.data?.[0];
  return (
    <Modal title="Authorise a refund" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            if (!option)
              throw new Error("This order has no refundable Paystack balance.");
            await send("admin/refunds", {
              orderId,
              full: kind === "full",
              amount:
                kind === "partial"
                  ? Math.round(Number(f.get("amount")) * 100)
                  : undefined,
              reason: f.get("reason"),
              outcome: f.get("outcome") || undefined,
              idempotencyKey: requestKey,
            });
            onClose();
          }, "Refund request saved. Follow its status in the refund register.");
        }}
      >
        {options.isPending ? (
          <Loading />
        ) : options.isError ? (
          <ErrorState error={options.error} />
        ) : option ? (
          <div className="receipt-lines">
            <div>
              <span>Available to refund</span>
              <strong>{money(option.remainingAmount)}</strong>
            </div>
          </div>
        ) : (
          <Empty text="This order has no refundable payment through the current provider." />
        )}
        <Field label="Refund type">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="full">Full remaining order refund</option>
            <option value="partial" disabled={!option?.remainingLaundry}>
              Partial laundry-only refund
            </option>
          </Select>
        </Field>
        {kind === "partial" && option && (
          <Field label="Laundry portion to refund (GHS)">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={option.remainingLaundry / 100}
              required
              defaultValue={Math.min(50, option.remainingLaundry / 100)}
            />
          </Field>
        )}
        <Field label="Reason (recorded in the audit trail)">
          <textarea
            name="reason"
            required
            minLength={10}
            maxLength={1000}
            rows={3}
          />
        </Field>
        <Button type="submit" busy={busy} disabled={!option}>
          Request refund
        </Button>
      </form>
    </Modal>
  );
}
function WeightAdjustment({ id }: { id: string }) {
  const { run, busy } = useAction();
  return (
    <Panel title="Record confirmed weight">
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(
            () =>
              send(`orders/${id}/adjustment`, {
                weight: Number(f.get("weight")),
                reason: f.get("reason"),
              }),
            "Adjustment sent to the customer for approval.",
          );
        }}
      >
        <Field label="Confirmed kilograms">
          <input name="weight" type="number" min="0.1" step="0.1" required />
        </Field>
        <Field label="Care and weighing note">
          <input name="reason" minLength={5} required />
        </Field>
        <p className="muted small">
          Lower-weight adjustments create an approval request. Increases require
          an additional authorised charge and remain blocked until that
          integration is activated.
        </p>
        <Button type="submit" busy={busy}>
          Request customer approval
        </Button>
      </form>
    </Panel>
  );
}
