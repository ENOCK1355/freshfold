import {
  ChartNoAxesCombined,
  Clock3,
  Download,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { dateLabel, money, titleCase, useData } from "../lib";
import {
  Badge,
  Empty,
  ErrorState,
  Field,
  Loading,
  Metric,
  Modal,
  PageHead,
  Panel,
  Status,
} from "./ui";
export function Revenue({
  business = false,
  settlementsOnly = false,
}: {
  business?: boolean;
  settlementsOnly?: boolean;
}) {
  const run = "all";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [journal, setJournal] = useState<any>(null);
  const params = new URLSearchParams({
    run,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const data = useData(`finance-${params}-${business}`, `finance?${params}`);
  if (data.isLoading) return <Loading />;
  if (data.isError)
    return <ErrorState error={data.error} retry={() => void data.refetch()} />;
  const r = data.data;
  const chartEarned = Math.max(0, business ? r.companyNet : r.earned);
  const chartDeferred = business ? r.companyReversed : Math.max(0, r.deferred);
  const streamLabels: Record<string, string> = {
    order: "Laundry order collections",
    student: "Student memberships",
    hosting: "Company subscriptions",
    sponsored: "Sponsored placements",
    companyNet: "Company allocation after refunds",
    planPayments: "Hosting and promotion payments",
  };
  const amount = (n: number) => money(n);
  return (
    <>
      <PageHead
        eyebrow={
          business
            ? "YOUR WORK, CLEARLY ACCOUNTED FOR"
            : "CLEAR RECORDS. A HEALTHIER MARKETPLACE."
        }
        title={
          settlementsOnly
            ? "Every settlement, in view."
            : business
              ? "A clear view of your earnings."
              : "Follow the money. Clearly."
        }
        description={
          business
            ? "Company allocations, recorded charges, refunds, and settlement status."
            : "Collections, earned revenue, deferred balances, and platform allocations from source records."
        }
        action={
          <a
            className="btn btn-secondary"
            href={`/api/finance/export?${params}`}
          >
            <Download size={17} /> Export CSV
          </a>
        }
      />
      <div className="finance-filters">
        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Through">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <div className="metrics-grid four">
        <Metric
          label={business ? "Customer payments" : "Total collections"}
          value={amount(business ? r.orderCollections : r.collected)}
          detail={
            business
              ? "Verified laundry payments before refunds"
              : "Successful customer & business payments"
          }
          icon={<Wallet size={20} />}
        />
        <Metric
          label={business ? "Company earnings" : "Platform gross allocations"}
          value={amount(business ? r.companyNet : r.grossAllocations)}
          detail={
            business
              ? "Company allocation after refunds"
              : "After refunds, before gateway costs"
          }
          icon={<ChartNoAxesCombined size={20} />}
        />
        <Metric
          label={business ? "Refunds processed" : "Earned platform revenue"}
          value={amount(business ? r.refunded : r.earned)}
          detail={
            business
              ? "Completed customer refunds"
              : "Recognised against delivered service periods"
          }
          icon={<ReceiptText size={20} />}
        />
        <Metric
          label={business ? "Company payable" : "Deferred revenue"}
          value={amount(business ? r.companyPayable : r.deferred)}
          detail={
            business
              ? "After refunds and settlements"
              : "Future service and uncompleted orders"
          }
          icon={<Clock3 size={20} />}
        />
      </div>
      {!settlementsOnly && (
        <>
          <div className="revenue-panels">
            <Panel
              title={
                business
                  ? "Your financial breakdown."
                  : "A closer look at collections."
              }
              description="Amounts are calculated from underlying payment and ledger records."
            >
              <div className="stream-bars">
                {Object.entries(
                  business
                    ? {
                        order: r.orderCollections,
                        companyNet: r.companyNet,
                        planPayments: r.planPayments,
                      }
                    : r.streams,
                ).map(([key, value]) => (
                  <div key={key}>
                    <div>
                      <span>{streamLabels[key] || key}</span>
                      <strong>{amount(value as number)}</strong>
                    </div>
                    <span className="stream-track">
                      <span
                        style={{
                          width: `${r.collected ? ((value as number) / r.collected) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
              <div className="finance-totals">
                <div>
                  <span>Laundry transaction value</span>
                  <strong>{amount(r.laundryValue)}</strong>
                </div>
                <div>
                  <span>
                    {business
                      ? "Commission deducted"
                      : "Commission, earned & deferred"}
                  </span>
                  <strong>
                    {amount(
                      (r.balances.commission_revenue || 0) +
                        (r.balances.commission_deferred || 0),
                    )}
                  </strong>
                </div>
                <div>
                  <span>
                    {business
                      ? "Customer convenience fees paid to Fresh Fold"
                      : "Convenience fees"}
                  </span>
                  <strong>{amount(r.balances.convenience_revenue || 0)}</strong>
                </div>
                <div>
                  <span>
                    {business
                      ? "Gateway costs paid by the platform"
                      : "Recorded gateway processing costs"}
                  </span>
                  <strong>{amount(r.gatewayCosts)}</strong>
                </div>
                <div>
                  <span>Refunds processed</span>
                  <strong>{amount(r.refunded)}</strong>
                </div>
                <div>
                  <span>Company payables</span>
                  <strong>{amount(r.companyPayable)}</strong>
                </div>
                <div className="total-line">
                  <span>
                    {business
                      ? "Company allocation after refunds"
                      : "Platform receipts after gateway costs"}
                  </span>
                  <strong>
                    {amount(business ? r.companyNet : r.platformReceipts)}
                  </strong>
                </div>
              </div>
            </Panel>
            <Panel
              title={
                business
                  ? "Your company allocation."
                  : "A collection isn’t all earned."
              }
              description={
                business
                  ? "Your share of laundry payments, after platform commission and customer refunds."
                  : "Timing matters. Every advance payment has a service period."
              }
            >
              <div
                className="recognition-chart"
                role="img"
                aria-label={
                  business
                    ? `Company allocation ${money(chartEarned)}, reversed allocation ${money(chartDeferred)}`
                    : `Earned revenue ${money(r.earned)}, deferred revenue ${money(r.deferred)}`
                }
              >
                <svg viewBox="0 0 240 240">
                  <circle
                    cx="120"
                    cy="120"
                    r="90"
                    fill="none"
                    stroke="#e3ebf6"
                    strokeWidth="24"
                  />
                  <circle
                    cx="120"
                    cy="120"
                    r="90"
                    fill="none"
                    stroke="#2b5ea7"
                    strokeWidth="24"
                    strokeDasharray={`${(chartEarned / (chartEarned + chartDeferred || 1)) * 565.49} 565.49`}
                    transform="rotate(-90 120 120)"
                    strokeLinecap="round"
                  />
                </svg>
                <div>
                  <strong>{money(chartEarned + chartDeferred)}</strong>
                  <span>
                    {business
                      ? "Company gross allocation"
                      : "Platform revenue balances"}
                  </span>
                </div>
              </div>
              <div className="chart-legend">
                <span>
                  <i /> {business ? "After refunds" : "Earned"}{" "}
                  <strong>{money(chartEarned)}</strong>
                </span>
                <span>
                  <i /> {business ? "Reversed" : "Deferred"}{" "}
                  <strong>{money(chartDeferred)}</strong>
                </span>
              </div>
              <p className="muted small">{r.recognitionPolicy}</p>
            </Panel>
          </div>
          <Panel
            title={
              business
                ? "Your payment records."
                : "Collections, with the details."
            }
            description="Open an order or its ledger journal to inspect the source transaction."
          >
            {r.payments.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Revenue stream</th>
                      <th>Amount</th>
                      <th>Gateway cost</th>
                      <th>Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          {p.orderId ? (
                            <Link
                              className="table-strong"
                              to={`${business ? "/business" : "/admin"}/orders/${p.orderId}`}
                            >
                              {p.reference}
                            </Link>
                          ) : (
                            <strong>{p.reference}</strong>
                          )}
                        </td>
                        <td>
                          {business
                            ? p.kind === "order"
                              ? "Received · Laundry"
                              : `Paid · ${titleCase(p.kind)}`
                            : titleCase(p.kind)}
                        </td>
                        <td>
                          {money(
                            business && p.kind !== "order"
                              ? -p.amount
                              : p.amount,
                          )}
                        </td>
                        <td>{money(p.providerFees)}</td>
                        <td>{dateLabel(p.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No completed payments yet."
                text="Successful payments in this reporting view will appear here as customer activity is recorded."
              />
            )}
          </Panel>
          <Panel
            title="The auditable ledger."
            description="Posted journals are immutable. Corrections use balancing entries."
          >
            {r.journals.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Journal</th>
                      <th>Debits</th>
                      <th>Credits</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.journals.map((j: any) => (
                      <tr key={j.id}>
                        <td>
                          <button
                            className="text-link"
                            onClick={() => setJournal(j)}
                          >
                            {j.description}
                          </button>
                          <small>{j.payment?.reference || j.key}</small>
                        </td>
                        <td>
                          {money(
                            j.lines.reduce(
                              (n: number, l: any) => n + l.debit,
                              0,
                            ),
                          )}
                        </td>
                        <td>
                          {money(
                            j.lines.reduce(
                              (n: number, l: any) => n + l.credit,
                              0,
                            ),
                          )}
                        </td>
                        <td>{dateLabel(j.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No journals match this view.</p>
            )}
          </Panel>
        </>
      )}
      <Panel
        title="Settlements & payables."
        description="Review recorded settlement status, references, and supporting notes."
      >
        {r.settlements.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {r.settlements.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.reference}</td>
                    <td>{money(s.amount)}</td>
                    <td>
                      <Status value={s.status} />
                    </td>
                    <td>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No settlement records yet. Company allocations remain payable until
            a recorded settlement or corrective adjustment.
          </p>
        )}
      </Panel>
      <div className="notice">
        <ShieldCheck size={23} />
        <p>
          Platform receipts after gateway costs are not total business profit.
          Other operating expenses may remain. The baseline has no discounts,
          delivery fees, or taxes; gateway costs are separately recorded.
          Existing transactions keep their snapshotted rules.
        </p>
      </div>
      {journal && (
        <Modal
          title="A balanced view of the transaction."
          onClose={() => setJournal(null)}
        >
          <p>{journal.description}</p>
          <p className="muted small">
            {journal.payment?.reference || journal.key} ·{" "}
            {dateLabel(journal.createdAt, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {journal.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td>{l.account?.name || l.accountCode}</td>
                    <td>{money(l.debit)}</td>
                    <td>{money(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Badge>
            <CheckIcon /> Debits equal credits
          </Badge>
        </Modal>
      )}
    </>
  );
}
function CheckIcon() {
  return <ShieldCheck size={13} />;
}
