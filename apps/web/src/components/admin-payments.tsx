import { useState } from "react";
import { Link } from "react-router-dom";
import { dateLabel, money, send, titleCase, useAction, useData } from "../lib";
import {
  Button,
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

export function AdminPayments({
  subscriptions = false,
}: {
  subscriptions?: boolean;
}) {
  const [status, setStatus] = useState(subscriptions ? "pending_approval" : "");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [action, setAction] = useState("approve");
  const path = `admin/${subscriptions ? "subscriptions" : "payments"}?${new URLSearchParams({ status, kind, page: String(page) })}`;
  const data = useData(path, path, true, true);
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title={
          subscriptions ? "Subscriptions & approvals" : "Payments & commission"
        }
        description={
          subscriptions
            ? "Review paid hosting and Student Plus subscriptions, then activate access."
            : "Check Paystack payments, company allocations, and the commission attached to each order."
        }
        action={
          <Link
            className="btn btn-secondary"
            to={subscriptions ? "/admin/payments" : "/admin/subscriptions"}
          >
            {subscriptions ? "View payments" : "Review subscriptions"}
          </Link>
        }
      />
      <div className="payment-admin-filters">
        <Field label="Payment purpose">
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All purposes</option>
            <option value="student">Student Plus</option>
            <option value="hosting">Business hosting</option>
            {!subscriptions && (
              <>
                <option value="order">Laundry orders</option>
                <option value="sponsored">Sponsored placements</option>
              </>
            )}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {(subscriptions
              ? [
                  "pending_approval",
                  "active",
                  "suspended",
                  "expired",
                  "past_due",
                ]
              : ["pending", "success", "failed", "refunded"]
            ).map((value) => (
              <option key={value} value={value}>
                {titleCase(value)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Panel>
        {data.isPending ? (
          <Loading />
        ) : data.isError ? (
          <ErrorState error={data.error} />
        ) : !data.data.items.length ? (
          <Empty text="No records match these filters." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>{subscriptions ? "Subscription" : "Payment"}</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>
                    {subscriptions ? "Access period" : "Company / commission"}
                  </th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.company?.name || item.user.name}</strong>
                      <small>{item.user.email}</small>
                    </td>
                    <td>
                      <strong>
                        {subscriptions ? item.plan.name : titleCase(item.kind)}
                      </strong>
                      <small>
                        {subscriptions
                          ? item.payment?.reference
                          : item.reference}
                      </small>
                      <small>
                        {dateLabel(item.createdAt, { year: "numeric" })}
                      </small>
                    </td>
                    <td>
                      {money(subscriptions ? item.priceSnapshot : item.amount)}
                    </td>
                    <td>
                      <Status value={item.status} />
                      {subscriptions && item.payment && (
                        <small>Payment: {titleCase(item.payment.status)}</small>
                      )}
                      {item.reviewedAt && (
                        <small>Reviewed {dateLabel(item.reviewedAt)}</small>
                      )}
                    </td>
                    <td>
                      {subscriptions ? (
                        item.status === "pending_approval" ? (
                          `${item.periodDaysSnapshot} days from approval`
                        ) : (
                          `${dateLabel(item.startsAt)} – ${dateLabel(item.endsAt)}`
                        )
                      ) : item.order ? (
                        <>
                          <strong>
                            {money(
                              item.order.companyShare + item.order.deliveryFee,
                            )}{" "}
                            to company
                          </strong>
                          <small>
                            {money(item.order.commission)} commission ·{" "}
                            {money(item.order.convenienceFee)} service fee
                          </small>
                          <Link
                            className="text-link"
                            to={`/admin/orders/${item.orderId}`}
                          >
                            {item.order.reference}
                          </Link>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="button-row">
                        <Button
                          variant="secondary"
                          className="btn-sm"
                          onClick={() => {
                            setSelected(item);
                            setAction(
                              subscriptions
                                ? item.status === "pending_approval"
                                  ? "approve"
                                  : item.status === "suspended"
                                    ? "restore"
                                    : "suspend"
                                : "review",
                            );
                          }}
                        >
                          Review
                        </Button>
                        {!subscriptions && item.mode !== "simulator" && (
                          <Button
                            variant="ghost"
                            className="btn-sm"
                            busy={busy}
                            onClick={() =>
                              void run(
                                () => send(`admin/payments/${item.id}/verify`),
                                "Payment checked with Paystack.",
                              )
                            }
                          >
                            Check Paystack
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.data && (
          <div className="payment-pagination">
            <span>
              {data.data.total} records · page {page}
            </span>
            <div className="button-row">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page * 50 >= data.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Panel>
      {selected && (
        <Modal
          title={subscriptions ? selected.plan.name : "Review payment"}
          onClose={() => setSelected(null)}
        >
          <dl className="payment-review-details">
            <div>
              <dt>Account</dt>
              <dd>{selected.company?.name || selected.user.name}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>
                {money(
                  subscriptions ? selected.priceSnapshot : selected.amount,
                )}
              </dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd>
                <Status
                  value={
                    subscriptions
                      ? selected.payment?.status || "unpaid"
                      : selected.status
                  }
                />
              </dd>
            </div>
          </dl>
          {subscriptions && selected.company && (
            <p>
              Business application: <Status value={selected.company.status} />{" "}
              <Link className="text-link" to="/admin/companies">
                Open companies
              </Link>
            </p>
          )}
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void run(
                async () => {
                  await send(
                    subscriptions
                      ? `admin/subscriptions/${selected.id}/status`
                      : `admin/payments/${selected.id}/review`,
                    { action, reason: form.get("reason") },
                  );
                  setSelected(null);
                },
                subscriptions
                  ? "Subscription updated and account notified."
                  : "Verified payment reviewed.",
              );
            }}
          >
            {subscriptions && (
              <Field label="Subscription decision">
                <Select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {selected.status === "pending_approval" && (
                    <option value="approve">Approve and activate</option>
                  )}
                  {selected.status === "active" && (
                    <option value="suspend">Suspend access</option>
                  )}
                  {selected.status === "suspended" && (
                    <option value="restore">Restore paid access</option>
                  )}
                </Select>
              </Field>
            )}
            <Field label="Review notes">
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={1000}
                rows={3}
                placeholder="Record the checks behind this decision."
              />
            </Field>
            <Button
              type="submit"
              busy={busy}
              disabled={
                subscriptions &&
                !["pending_approval", "active", "suspended"].includes(
                  selected.status,
                )
              }
            >
              {subscriptions
                ? "Save subscription decision"
                : "Confirm verified payment"}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
