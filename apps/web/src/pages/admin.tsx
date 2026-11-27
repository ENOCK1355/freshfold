import {
  BookOpen,
  Building2,
  Clock3,
  FileCheck2,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { OrderTable, RefundModal } from "../components/orders";
import { Revenue } from "../components/revenue";
import { AdminPayments } from "../components/admin-payments";
import { Notifications } from "./account";
import { SupportWorkspace } from "../components/support";
import {
  Badge,
  Button,
  ButtonLink,
  Empty,
  ErrorState,
  Field,
  Loading,
  Metric,
  Modal,
  PageHead,
  Pagination,
  Panel,
  Select,
  Status,
} from "../components/ui";
import {
  api,
  dateLabel,
  money,
  send,
  titleCase,
  useAction,
  useApp,
  useData,
} from "../lib";
export function Admin() {
  const tab = useLocation().pathname.split("/")[2] || "";
  const { user } = useApp();
  if (
    ![
      "",
      "companies",
      "users",
      "orders",
      "revenue",
      "payments",
      "subscriptions",
      "notifications",
      "refunds",
      "support",
      "plans",
      "coverage",
      "content",
      "audit",
      "settings",
    ].includes(tab)
  )
    return <Navigate to="/admin" replace />;
  if (user?.role === "support" && !["", "orders", "support"].includes(tab))
    return <Navigate to="/admin" replace />;
  if (tab === "payments") return <AdminPayments />;
  if (tab === "subscriptions") return <AdminPayments subscriptions />;
  if (tab === "notifications") return <Notifications />;
  if (tab === "revenue") return <Revenue />;
  if (tab === "companies") return <Companies />;
  if (tab === "users") return <People />;
  if (tab === "support") return <SupportWorkspace />;
  if (tab === "plans") return <Plans />;
  if (tab === "refunds") return <Refunds />;
  if (tab === "coverage") return <AdminCoverage />;
  if (tab === "content") return <ContentEditor />;
  if (tab === "audit") return <Audit />;
  if (tab === "settings") return <LaunchSetup />;
  if (tab === "orders") return <AdminOrders />;
  return <AdminOverview />;
}
function AdminOverview() {
  const { user } = useApp();
  const overview = useData("admin-overview", "admin/overview");
  const orders = useData("admin-overview-orders", "orders");
  if (overview.isLoading) return <Loading />;
  if (overview.isError) return <ErrorState error={overview.error} />;
  const v = overview.data;
  return (
    <>
      <PageHead
        eyebrow="THE FRESH FOLD MARKETPLACE"
        title={
          user?.role === "admin"
            ? "Welcome back, Fresh Fold."
            : "Welcome back, support team."
        }
        description={`Your platform at a glance · ${dateLabel(v.now, { weekday: "long", year: "numeric" })}`}
        action={
          user?.role === "admin" ? (
            <ButtonLink to="/admin/companies" variant="secondary">
              <Building2 size={17} /> Review companies
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="metrics-grid four">
        <Metric
          label="Live laundry listings"
          value={v.listed}
          detail={`${v.companies} registered · ${v.pending} awaiting review`}
          icon={<Building2 size={20} />}
        />
        <Metric
          label="Student accounts"
          value={v.students}
          detail="Registered student accounts"
          icon={<Users size={20} />}
        />
        <Metric
          label="Laundry orders"
          value={v.orders}
          detail={`${v.unpaid} awaiting verified payment`}
          icon={<Package size={20} />}
        />
        <Metric
          label={
            user?.role === "admin"
              ? "Platform earned revenue"
              : "Open support cases"
          }
          value={user?.role === "admin" ? money(v.finance.earned) : v.tickets}
          detail={
            user?.role === "admin"
              ? "Earned against completed service"
              : "Cases needing attention"
          }
          icon={<Wallet size={20} />}
        />
      </div>
      <div className="admin-action-grid">
        <Link
          to={user?.role === "admin" ? "/admin/companies" : "/admin/support"}
        >
          <span className="service-icon">
            <FileCheck2 />
          </span>
          <div>
            <h3>
              {user?.role === "admin"
                ? `${v.pending} applications to look over.`
                : "Your support workspace."}
            </h3>
            <p>
              {user?.role === "admin"
                ? "Thoughtful checks before a business goes live."
                : `${v.tickets} open cases in the support queue.`}
            </p>
          </div>
          <Plus size={20} />
        </Link>
        <Link to="/admin/support">
          <span className="service-icon">
            <MessageCircle />
          </span>
          <div>
            <h3>{v.tickets} cases need a human hand.</h3>
            <p>Keep every response and resolution connected.</p>
          </div>
          <Plus size={20} />
        </Link>
      </div>
      {user?.role === "admin" && (
        <Panel
          title="Collections and revenue are different."
          description="Inspect the source records behind each amount."
          action={
            <Link className="text-link" to="/admin/revenue">
              Open financial workspace
            </Link>
          }
        >
          <div className="revenue-summary-row">
            <div>
              <span>Total collections</span>
              <strong>{money(v.finance.collected)}</strong>
            </div>
            <div>
              <span>Company payables</span>
              <strong>{money(v.finance.companyPayable)}</strong>
            </div>
            <div>
              <span>Deferred platform revenue</span>
              <strong>{money(v.finance.deferred)}</strong>
            </div>
            <div>
              <span>Recorded gateway costs</span>
              <strong>{money(v.finance.gatewayCosts)}</strong>
            </div>
          </div>
          <div className="revenue-summary-row">
            <div>
              <span>Successful transactions</span>
              <strong>{v.finance.successfulTransactions}</strong>
            </div>
            <div>
              <span>Pending payments</span>
              <strong>{v.finance.transactions.byStatus.pending || 0}</strong>
            </div>
            <div>
              <span>Refunds processed</span>
              <strong>{money(v.finance.refunded)}</strong>
            </div>
            <div>
              <span>Collections after refunds</span>
              <strong>{money(v.finance.netCollections)}</strong>
            </div>
          </div>
        </Panel>
      )}
      <Panel
        title="A little look at marketplace activity."
        action={
          <Link className="text-link" to="/admin/orders">
            View all orders
          </Link>
        }
      >
        {orders.isLoading ? (
          <Loading />
        ) : (
          <OrderTable
            orders={orders.data?.slice(0, 6) || []}
            base="/admin"
            compact
          />
        )}
      </Panel>
    </>
  );
}
function AdminOrders() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    paged: "true",
    page: String(page),
    ...(filter ? { status: filter } : {}),
  });
  const data = useData(
    `admin-orders-${params}`,
    `orders?${params}`,
    true,
    true,
  );
  return (
    <>
      <PageHead
        title="Every order, one clear view."
        description="Authorised platform oversight. Keep payment and fulfilment states separate."
      />
      <Panel
        action={
          <Select
            aria-label="Order state"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All states</option>
            {[
              "requested",
              "accepted",
              "collection_scheduled",
              "collected",
              "processing",
              "ready",
              "out_for_delivery",
              "delivered",
              "completed",
              "cancelled",
            ].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        }
      >
        {data.isLoading ? (
          <Loading />
        ) : data.isError ? (
          <ErrorState error={data.error} />
        ) : (
          <OrderTable orders={data.data?.items || []} base="/admin" />
        )}
        {data.data && (
          <Pagination
            {...data.data}
            onPage={setPage}
            busy={data.isFetching}
            label="orders"
          />
        )}
      </Panel>
    </>
  );
}
function CompanyHosting({ company }: { company: any }) {
  const hosting =
    company.subscriptions.find(
      (subscription: any) =>
        subscription.id === company.listing.activeHostingId,
    ) || company.subscriptions[0];
  if (!hosting) return <>Not purchased</>;
  return (
    <>
      <strong>{hosting.plan.name}</strong>
      <small>
        {hosting.id === company.listing.activeHostingId
          ? "Active"
          : hosting.status === "active"
            ? "Expired"
            : titleCase(hosting.status)}
      </small>
    </>
  );
}
function Companies() {
  const data = useData("admin-companies", "admin/companies");
  const { run, busy } = useAction();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [status, setStatus] = useState("approved");
  return (
    <>
      <PageHead
        title="Good care starts with good checks."
        description="Review, approve, suspend, and reinstate company applications. Payment-account approval remains separate."
      />
      <div className="filter-tabs">
        {[
          "",
          "listed",
          "not_listed",
          "pending",
          "approved",
          "rejected",
          "suspended",
        ].map((s) => (
          <button
            key={s}
            className={filter === s ? "active" : ""}
            onClick={() => setFilter(s)}
          >
            {s === "listed"
              ? "Live listings"
              : s
                ? titleCase(s)
                : "All companies"}
          </button>
        ))}
      </div>
      {data.data && (
        <div className="metrics-grid four">
          <Metric label="Registered companies" value={data.data.length} />
          <Metric
            label="Live listings"
            value={
              data.data.filter((company: any) => company.listing?.listed).length
            }
          />
          <Metric
            label="Approved applications"
            value={
              data.data.filter((company: any) => company.status === "approved")
                .length
            }
          />
          <Metric
            label="Awaiting review"
            value={
              data.data.filter((company: any) => company.status === "pending")
                .length
            }
          />
        </div>
      )}
      <Panel>
        {data.isLoading ? (
          <Loading />
        ) : data.isError ? (
          <ErrorState error={data.error} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Application</th>
                  <th>Public listing</th>
                  <th>Hosting</th>
                  <th>Documents</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.data
                  .filter(
                    (c: any) =>
                      !filter ||
                      (filter === "listed"
                        ? c.listing.listed
                        : filter === "not_listed"
                          ? !c.listing.listed
                          : c.status === filter),
                  )
                  .map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <div className="table-company">
                          {c.photo ? (
                            <img
                              src={c.photo}
                              alt="Laundry service photograph"
                            />
                          ) : (
                            <span className="avatar">{c.name[0]}</span>
                          )}
                          <div>
                            <strong>{c.name}</strong>
                            <small>{c.location}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Status value={c.status} />
                        <small>{c.registrationRef}</small>
                      </td>
                      <td>
                        <Status
                          value={c.listing.listed ? "listed" : "not_listed"}
                        />
                        {!c.listing.listed && (
                          <small>{c.listing.blockers[0]}</small>
                        )}
                      </td>
                      <td>
                        <CompanyHosting company={c} />
                      </td>
                      <td>
                        {c.files.length} file{c.files.length === 1 ? "" : "s"}
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          className="btn-sm"
                          onClick={() => {
                            setSelected(c);
                            setStatus(
                              c.status === "approved"
                                ? "suspended"
                                : "approved",
                            );
                          }}
                        >
                          Review application
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <p className="body-copy">{selected.description}</p>
          <p className="muted small">
            {selected.registrationRef} · {selected.location}
          </p>
          <div className="file-list">
            {selected.files.map((f: any) => (
              <div key={f.id}>
                <FileCheck2 size={20} />
                <div>
                  <strong>{f.name}</strong>
                  <Status value={f.status} />
                </div>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void run(async () => {
                      const l = await api(`files/${f.id}/link`);
                      window.open(l.url, "_blank", "noopener");
                    })
                  }
                >
                  Read file
                </Button>
                {f.status === "quarantined" && (
                  <Button
                    variant="secondary"
                    busy={busy}
                    onClick={() =>
                      void run(async () => {
                        await send(`admin/files/${f.id}/scan`);
                        setSelected(null);
                      }, "Document scan completed.")
                    }
                  >
                    Scan document
                  </Button>
                )}
              </div>
            ))}
          </div>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await send(`admin/companies/${selected.id}/status`, {
                  status,
                  reason: f.get("reason"),
                });
                setSelected(null);
              }, "Application decision saved and owner notified.");
            }}
          >
            <Field label="Application decision">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="approved">Approve / reinstate</option>
                <option value="pending">Return to pending review</option>
                <option value="rejected">Reject application</option>
                <option value="suspended">Suspend new bookings</option>
              </Select>
            </Field>
            <Field label="Reason and reviewed evidence">
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={1000}
                rows={4}
                placeholder="Explain the decision for the owner and audit trail."
              />
            </Field>
            <div className="notice compact">
              <ShieldCheck size={18} />
              <p>
                Approval requires a reviewed document photograph or scanned PDF.
                Suspension preserves access to active orders and customer
                support.
              </p>
            </div>
            <Button type="submit" busy={busy}>
              Record decision
            </Button>
          </form>
          <hr />
          <h3>Settlement account</h3>
          <Status
            value={selected.paymentAccountApproved ? "approved" : "pending"}
          />
          <SettlementReview
            company={selected}
            onSaved={() => setSelected(null)}
          />
          <hr />
          <h3>Public listing</h3>
          <Status value={selected.listing.listed ? "listed" : "not_listed"} />
          {!!selected.listing.blockers.length && (
            <ul className="body-copy">
              {selected.listing.blockers.map((reason: string) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p>
            {selected.published
              ? "This company is published."
              : "This company is not published."}
          </p>
          <div className="button-row">
            <Button
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(
                  async () => {
                    await send(`admin/companies/${selected.id}/publish`, {
                      published: !selected.published,
                    });
                    setSelected(null);
                  },
                  selected.published
                    ? "Company removed from discovery."
                    : "Company published.",
                )
              }
            >
              {selected.published
                ? "Unpublish listing"
                : "Publish approved company"}
            </Button>
            <ButtonLink to="/admin/subscriptions" variant="secondary">
              Review hosting payments
            </ButtonLink>
          </div>
        </Modal>
      )}
    </>
  );
}
function SettlementReview({
  company,
  onSaved,
}: {
  company: any;
  onSaved: () => void;
}) {
  const { run, busy } = useAction();
  let destination: any;
  try {
    destination = JSON.parse(company.settlementDestination || "null");
  } catch {
    destination = null;
  }
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void run(async () => {
          await send(`admin/companies/${company.id}/settlement-account`, {
            code: String(form.get("code") || "").trim() || undefined,
            reason: form.get("reason"),
          });
          onSaved();
        }, "Settlement account checked with Paystack and approved.");
      }}
    >
      {destination && (
        <p>
          {destination.accountName}
          <br />
          {destination.bankName} ·{" "}
          {destination.accountNumber ||
            `ending ${destination.accountLast4 || "—"}`}
        </p>
      )}
      <Field
        label="Existing Paystack subaccount code"
        hint="Leave blank to create an account from the owner's submitted bank details."
      >
        <input
          name="code"
          defaultValue={company.paystackSubaccount || ""}
          placeholder="ACCT_…"
          pattern="ACCT_[a-zA-Z0-9]+"
        />
      </Field>
      <Field label="Settlement review notes">
        <textarea
          name="reason"
          required
          minLength={10}
          maxLength={1000}
          rows={2}
        />
      </Field>
      <Button type="submit" variant="secondary" busy={busy}>
        Verify and approve settlement account
      </Button>
    </form>
  );
}
function People() {
  const data = useData("admin-users", "admin/users");
  const [q, setQ] = useState("");
  const [recover, setRecover] = useState<any>(null),
    [link, setLink] = useState("");
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="The people in the fold."
        description="Manage student, business, staff, and platform accounts."
      />
      <div className="search-input table-search">
        <Users size={18} />
        <input
          aria-label="Search accounts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or role…"
        />
      </div>
      <Panel>
        {data.isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Account status</th>
                  <th>Account recovery</th>
                </tr>
              </thead>
              <tbody>
                {data.data
                  ?.filter((u: any) =>
                    (u.name + " " + u.role)
                      .toLowerCase()
                      .includes(q.toLowerCase()),
                  )
                  .map((u: any) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </td>
                      <td>
                        <Badge tone="neutral">{u.role}</Badge>
                      </td>
                      <td>
                        <Status value={u.deletedAt ? "closed" : "active"} />
                      </td>
                      <td>
                        {!u.deletedAt &&
                          ["student", "owner", "staff"].includes(u.role) && (
                            <Button
                              variant="secondary"
                              className="btn-sm"
                              onClick={() => {
                                setRecover(u);
                                setLink("");
                              }}
                            >
                              Create recovery link
                            </Button>
                          )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {recover && (
        <Modal
          title={`Account recovery · ${recover.name}`}
          onClose={() => {
            setRecover(null);
            setLink("");
          }}
        >
          {link ? (
            <>
              <p>
                This private link expires in 30 minutes and can be used once.
                Share it with the account holder through your verified support
                conversation.
              </p>
              <Field label="Recovery link">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </Field>
              <Button
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(link);
                  }, "Recovery link copied.")
                }
              >
                Copy recovery link
              </Button>
            </>
          ) : (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void run(async () => {
                  const result = await send(
                    `admin/users/${recover.id}/recovery`,
                    { reason: form.get("reason") },
                  );
                  setLink(result.url);
                });
              }}
            >
              <p>
                Confirm the account holder's identity before issuing a recovery
                link. Email delivery is not required.
              </p>
              <Field label="Identity check and reason">
                <textarea
                  name="reason"
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={3}
                />
              </Field>
              <Button type="submit" busy={busy}>
                Create private recovery link
              </Button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
function Plans() {
  const data = useData("admin-settings", "admin/settings");
  const { run, busy } = useAction();
  const [edit, setEdit] = useState<any>(null);
  if (data.isLoading) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} />;
  const r = data.data.rules;
  return (
    <>
      <PageHead
        title="Clear plans. Clear economics."
        description="Manage prices and fee rules. Changes apply to future purchases; posted transactions retain their original terms."
      />
      <div className="plans-admin-grid">
        {data.data.plans.map((p: any) => (
          <Panel key={p.id}>
            <Badge tone="neutral">{p.kind}</Badge>
            <h2>{p.name}</h2>
            <div className="plan-price">
              {money(p.price)}
              <span>/ {p.periodDays} days</span>
            </div>
            <p>
              {p.staffSeats} staff seats · {p.branches} branch
              {p.branches === 1 ? "" : "es"}
            </p>
            <Button variant="secondary" onClick={() => setEdit(p)}>
              Edit plan & limits
            </Button>
          </Panel>
        ))}
      </div>
      <Panel title="The transaction rules.">
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                send(
                  "admin/rules",
                  {
                    commissionBps: Math.round(
                      Number(f.get("commission")) * 100,
                    ),
                    convenienceFee: Math.round(
                      Number(f.get("convenience")) * 100,
                    ),
                    sponsoredPrice: Math.round(
                      Number(f.get("sponsored")) * 100,
                    ),
                    sponsoredDays: Number(f.get("days")),
                    gatewayBps: Math.round(Number(f.get("gateway")) * 100),
                    partialRefundConvenience: false,
                    productionPricesApproved: f.get("approved") === "on",
                  },
                  "PATCH",
                ),
              "Rules saved for future purchases.",
            );
          }}
        >
          <div className="form-row">
            <Field label="Commission on laundry charges (%)">
              <input
                name="commission"
                type="number"
                min="0"
                max="50"
                step="0.01"
                defaultValue={r.commissionBps / 100}
                required
              />
            </Field>
            <Field label="Standard convenience fee (GHS)">
              <input
                name="convenience"
                type="number"
                min="0"
                step="0.01"
                defaultValue={r.convenienceFee / 100}
                required
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Sponsored placement price (GHS)">
              <input
                name="sponsored"
                type="number"
                min="1"
                step="0.01"
                defaultValue={r.sponsoredPrice / 100}
                required
              />
            </Field>
            <Field label="Placement length (days)">
              <input
                name="days"
                type="number"
                min="1"
                max="90"
                defaultValue={r.sponsoredDays}
                required
              />
            </Field>
          </div>
          <Field
            label="Estimated gateway cost (%)"
            hint="Actual payment processing costs are recorded from provider verification."
          >
            <input
              name="gateway"
              type="number"
              min="0"
              max="10"
              step="0.01"
              defaultValue={r.gatewayBps / 100}
              required
            />
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              name="approved"
              defaultChecked={r.productionPricesApproved}
            />{" "}
            Owner has approved these prices for a separately configured
            production environment
          </label>
          <div className="notice">
            <ShieldCheck size={22} />
            <p>
              Laundry charges are commissionable. Collection fees are passed to
              the company. The platform bears recorded gateway costs. Plus
              waives the convenience fee, funded by membership revenue. Full
              refunds reverse all refundable components; partial laundry refunds
              reverse commission proportionally.
            </p>
          </div>
          <Button type="submit" busy={busy}>
            Save financial rules
          </Button>
        </form>
      </Panel>
      {edit && (
        <Modal title={`Edit ${edit.name}`} onClose={() => setEdit(null)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await send(
                  `admin/plans/${edit.id}`,
                  {
                    price: Math.round(Number(f.get("price")) * 100),
                    staffSeats: Number(f.get("staffSeats")),
                    branches: Number(f.get("branches")),
                    active: f.get("active") === "on",
                  },
                  "PATCH",
                );
                setEdit(null);
              }, "Plan updated.");
            }}
          >
            <Field label="Price per service period (GHS)">
              <input
                name="price"
                type="number"
                step="0.01"
                min="1"
                defaultValue={edit.price / 100}
                required
              />
            </Field>
            <div className="form-row">
              <Field label="Staff seats">
                <input
                  name="staffSeats"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={edit.staffSeats}
                  required
                />
              </Field>
              <Field label="Branches">
                <input
                  name="branches"
                  type="number"
                  min="1"
                  max="50"
                  defaultValue={edit.branches}
                  required
                />
              </Field>
            </div>
            <label className="check-label">
              <input
                name="active"
                type="checkbox"
                defaultChecked={edit.active}
              />{" "}
              Available for new purchases
            </label>
            <Button type="submit" busy={busy}>
              Save plan
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Refunds() {
  const data = useData("admin-refunds", "admin/refunds");
  const orders = useData("refund-eligible-orders", "admin/refund-options");
  const { run, busy } = useAction();
  const { config } = useApp();
  const [selected, setSelected] = useState("");
  const [modal, setModal] = useState(false);
  return (
    <>
      <PageHead
        title="Every reversal, accounted for."
        description="Requested, pending, failed, and confirmed refunds remain distinct."
      />
      <Panel title="Authorise an order refund">
        <div className="button-row">
          <Select
            aria-label="Order to refund"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a paid order</option>
            {orders.data?.map((o: any) => (
              <option key={o.id} value={o.id}>
                {o.reference} · {money(o.remainingAmount)} available
              </option>
            ))}
          </Select>
          <Button disabled={!selected} onClick={() => setModal(true)}>
            Review refund
          </Button>
        </div>
      </Panel>
      <Panel title="The refund register.">
        {data.isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Company reversal</th>
                  <th>Commission reversal</th>
                  <th>Convenience reversal</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/admin/orders/${r.orderId}`}>
                        {r.order.reference}
                      </Link>
                      <small>{r.reason}</small>
                    </td>
                    <td>{money(r.amount)}</td>
                    <td>
                      <Status value={r.status} />
                      {r.failureReason && <small>{r.failureReason}</small>}
                    </td>
                    <td>{money(r.companyReversal)}</td>
                    <td>{money(r.commissionReversal)}</td>
                    <td>{money(r.convenienceReversal)}</td>
                    <td>
                      {config?.paymentMode !== "simulator" &&
                        !["processed", "failed"].includes(r.status) && (
                          <div className="button-row">
                            <Button
                              variant="secondary"
                              className="btn-sm"
                              busy={busy}
                              onClick={() =>
                                void run(
                                  () => send(`admin/refunds/${r.id}/check`),
                                  "Refund status updated.",
                                )
                              }
                            >
                              Check status
                            </Button>
                            {r.status === "attention_required" &&
                              !r.providerId && (
                                <Button
                                  variant="ghost"
                                  className="btn-sm"
                                  busy={busy}
                                  onClick={() =>
                                    void run(
                                      () => send(`admin/refunds/${r.id}/retry`),
                                      "Refund request checked and submitted.",
                                    )
                                  }
                                >
                                  Retry saved request
                                </Button>
                              )}
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {modal && (
        <RefundModal orderId={selected} onClose={() => setModal(false)} />
      )}
    </>
  );
}
function AdminCoverage() {
  const { config } = useApp();
  return (
    <>
      <PageHead
        title="A clear view of where we care."
        description="Configured service areas are independent from any claim of university affiliation."
      />
      <Panel>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Campus area</th>
                <th>Status</th>
                <th>Listings</th>
              </tr>
            </thead>
            <tbody>
              {config?.areas.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong>
                  </td>
                  <td>Cape Coast · UCC area</td>
                  <td>
                    <Status value={a.active ? "active" : "inactive"} />
                  </td>
                  <td>
                    <Link to={`/find-laundry?area=${a.id}`}>
                      Inspect available businesses
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="notice">
        <MapPinIcon />
        <p>
          These areas organise discovery. Each business manages its own service
          coverage and collection capacity.
        </p>
      </div>
    </>
  );
}
function MapPinIcon() {
  return <Building2 size={22} />;
}
function ContentEditor() {
  const data = useData("admin-content", "content");
  const [selected, setSelected] = useState("");
  const content = useData(
    `edit-content-${selected}`,
    `content/${encodeURIComponent(selected)}`,
    !!selected,
  );
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="Words that make things clearer."
        description="Edit operational help and draft policies. Text is rendered safely without executable HTML."
      />
      <div className="settings-layout">
        <Panel title="Your content library">
          <div className="content-list">
            {data.data?.map((p: any) => (
              <button
                className={selected === p.slug ? "selected" : ""}
                key={p.slug}
                onClick={() => setSelected(p.slug)}
              >
                <BookOpen size={18} />
                {p.title}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Make a thoughtful edit">
          {!selected ? (
            <Empty text="Choose an article or policy to review its saved content." />
          ) : content.isLoading ? (
            <Loading />
          ) : (
            content.data && (
              <form
                key={selected + content.data.updatedAt}
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    () =>
                      send(
                        `admin/content/${encodeURIComponent(selected)}`,
                        { title: f.get("title"), body: f.get("body") },
                        "PUT",
                      ),
                    "Content saved.",
                  );
                }}
              >
                <Field label="Page title">
                  <input
                    name="title"
                    defaultValue={content.data.title}
                    required
                    minLength={5}
                  />
                </Field>
                <Field
                  label="Page content"
                  hint="Separate paragraphs with a blank line."
                >
                  <textarea
                    name="body"
                    defaultValue={content.data.body}
                    required
                    minLength={20}
                    maxLength={20000}
                    rows={20}
                  />
                </Field>
                <Button type="submit" busy={busy}>
                  Save published content
                </Button>
              </form>
            )
          )}
        </Panel>
      </div>
    </>
  );
}
function Audit() {
  const data = useData("admin-audit", "admin/audit");
  return (
    <>
      <PageHead
        title="A clear record of what changed."
        description="Sensitive actions include the actor, target, reason, and UTC timestamp."
      />
      <Panel>
        {data.isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Reason</th>
                  <th>UTC date</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.action}</strong>
                    </td>
                    <td>{a.actorId}</td>
                    <td className="break-word">{a.targetId}</td>
                    <td>{a.reason || "Recorded system action"}</td>
                    <td>
                      {dateLabel(a.createdAt, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
function LaunchSetup() {
  const data = useData("setup");
  const jobs = useData("admin-jobs", "admin/jobs");
  const { run, busy } = useAction();
  if (data.isLoading) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} />;
  const s = data.data;
  return (
    <>
      <PageHead
        title="Platform settings."
        description="Manage platform integrations and service settings."
      />
      <div className="settings-layout">
        <Panel title="Payment integration">
          <div className="simple-list">
            {Object.entries(s.credentials)
              .filter(([key]) => key !== "testEmail")
              .map(([k, v]) => (
                <div key={k}>
                  <span>{titleCase(k)} configured</span>
                  <Status value={v ? "configured" : "missing"} />
                </div>
              ))}
          </div>
          <Field label="Webhook endpoint">
            <input readOnly value={s.webhookUrl} />
          </Field>
        </Panel>
        <Panel title="Service readiness">
          <ul className="launch-checklist">
            {s.launchDependencies.map((x: string) => (
              <li key={x}>
                <Clock3 size={16} />
                {x}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel
        title="Background jobs & recovery."
        action={
          <div className="button-row">
            <Button
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(
                  () => send("admin/jobs/run"),
                  "Due business jobs processed.",
                )
              }
            >
              <RefreshCw size={16} /> Run due jobs
            </Button>
            <Button
              variant="secondary"
              busy={busy}
              onClick={() =>
                void run(
                  () => send("admin/jobs/reconcile"),
                  "Provider reconciliation queued.",
                )
              }
            >
              Reconcile provider payments
            </Button>
          </div>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Last error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.data?.map((j: any) => (
                <tr key={j.id}>
                  <td>{j.kind}</td>
                  <td>
                    <Status value={j.status} />
                  </td>
                  <td>{j.attempts}</td>
                  <td>{j.lastError || "No recorded failure"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
