import {
  Bell,
  Check,
  Crown,
  Download,
  Heart,
  Leaf,
  MapPin,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { OrderTable } from "../components/orders";
import { ResetTestAccount } from "../components/reset-test-account";
import { PasswordChange } from "../components/account-security";
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
  dateLabel,
  idempotency,
  money,
  send,
  useAction,
  useApp,
  useData,
} from "../lib";
export function Account() {
  const loc = useLocation();
  const tab = loc.pathname.split("/")[2] || "";
  if (
    ![
      "",
      "orders",
      "addresses",
      "settings",
      "favorites",
      "schedules",
      "billing",
      "support",
      "notifications",
      "messages",
      "receipts",
    ].includes(tab)
  )
    return <Navigate to="/account" replace />;
  if (
    tab === "addresses" ||
    tab === "settings" ||
    tab === "favorites" ||
    tab === "schedules"
  )
    return <AccountProfile tab={tab} />;
  if (tab === "billing") return <Billing />;
  if (tab === "support") return <SupportWorkspace />;
  if (tab === "notifications") return <Notifications />;
  if (tab === "messages") return <Messages base="/account" />;
  return <AccountOrders overview={!tab} receipts={tab === "receipts"} />;
}
function AccountOrders({
  overview,
  receipts,
}: {
  overview: boolean;
  receipts: boolean;
}) {
  const { user } = useApp();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    paged: "true",
    page: String(page),
    limit: overview ? "4" : "25",
    ...(overview
      ? { status: "active" }
      : filter === "all"
        ? {}
        : { status: filter }),
    ...(receipts ? { receipts: "true" } : {}),
  });
  const data = useData(
    `account-orders-${params}`,
    `orders?${params}`,
    true,
    true,
  );
  const summary = useData("account-overview", "account/overview", overview);
  const selectFilter = (value: string) => {
    setFilter(value);
    setPage(1);
  };
  if (data.isLoading) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} />;
  if (overview && summary.isPending) return <Loading />;
  if (overview && summary.isError) return <ErrorState error={summary.error} />;
  const orders = data.data?.items || [];
  const active = orders.filter(
    (o: any) => !["completed", "cancelled"].includes(o.status),
  );
  const rows = orders;
  return (
    <>
      <PageHead
        eyebrow={
          overview
            ? "YOUR DAY, A LITTLE LIGHTER"
            : receipts
              ? "EVERY CHARGE, IN ONE PLACE"
              : "FRESH CARE, FROM START TO FINISH"
        }
        title={
          overview
            ? `A fresh day, ${user?.name.split(" ")[0]}.`
            : receipts
              ? "Your receipts."
              : "Your laundry, in the fold."
        }
        description={
          overview
            ? "A little less laundry to think about. Here’s where things stand."
            : receipts
              ? "Open an order to inspect its payment breakdown and print a receipt."
              : "Keep every collection, care update, and fresh delivery in view."
        }
        action={
          <ButtonLink to="/find-laundry">
            <Plus size={17} /> Book laundry
          </ButtonLink>
        }
      />
      {overview && (
        <>
          <div className="account-welcome">
            <div>
              <Badge tone="cream">
                <Leaf size={13} /> MAKE ROOM FOR YOUR DAY
              </Badge>
              <h2>
                One less thing
                <br />
                on your to-do list.
              </h2>
              <p>Find a local laundry and give your week a fresh start.</p>
              <ButtonLink to="/find-laundry" variant="light">
                Find your laundry
              </ButtonLink>
            </div>
            <img
              className="welcome-lifestyle"
              src="/images/folded-garments.webp"
              alt="Everyday clothes neatly folded and ready to wear"
              width="900"
              height="600"
            />
          </div>
          <div className="metrics-grid three">
            <Metric
              label="In the care queue"
              value={summary.data.activeOrders}
              detail="Active laundry orders"
              icon={<Package size={21} />}
            />
            <Metric
              label="Fresh starts, completed"
              value={summary.data.completedOrders}
              detail="Completed orders"
              icon={<Check size={21} />}
            />
            <Metric
              label="Your membership"
              value={user?.premium ? "Student Plus" : "Fresh Fold Free"}
              detail={
                user?.premium
                  ? "Your standard convenience fee is waived."
                  : "All the laundry essentials, always available."
              }
              icon={<Crown size={21} />}
            />
          </div>
        </>
      )}
      <Panel
        title={
          overview
            ? "A little look at your laundry."
            : receipts
              ? "Your order receipts."
              : "Every order, organised."
        }
        action={
          overview ? (
            <Link className="text-link" to="/account/orders">
              View all orders
            </Link>
          ) : (
            <div className="segmented-control small">
              <button
                className={filter === "all" ? "active" : ""}
                onClick={() => selectFilter("all")}
              >
                All
              </button>
              <button
                className={filter === "active" ? "active" : ""}
                onClick={() => selectFilter("active")}
              >
                Active
              </button>
              <button
                className={filter === "completed" ? "active" : ""}
                onClick={() => selectFilter("completed")}
              >
                Completed
              </button>
            </div>
          )
        }
      >
        <OrderTable
          orders={overview ? active.slice(0, 4) : rows}
          compact={overview}
        />
        {!overview && data.data && (
          <Pagination
            {...data.data}
            onPage={setPage}
            busy={data.isFetching}
            label="orders"
          />
        )}
      </Panel>
      {overview && !user?.premium && (
        <div className="upgrade-banner">
          <span className="service-icon">
            <Sparkles size={23} />
          </span>
          <div>
            <h3>A little extra, just for you.</h3>
            <p>
              Meet Student Plus. Fee benefits, recurring schedules, and a
              lighter routine.
            </p>
          </div>
          <ButtonLink to="/student-plus" variant="secondary">
            Explore Plus
          </ButtonLink>
        </div>
      )}
    </>
  );
}
function AccountProfile({ tab }: { tab: string }) {
  const { user, config } = useApp();
  const data = useData("profile");
  const [modal, setModal] = useState(false);
  const { run, busy } = useAction();
  if (data.isLoading) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} />;
  const p = data.data;
  const titles: Record<string, string> = {
    addresses: "Your corner of campus.",
    favorites: "Your kind of fresh.",
    schedules: "Find your laundry rhythm.",
    settings: "Make this space yours.",
  };
  return (
    <>
      <PageHead
        eyebrow="A LITTLE MORE YOU"
        title={titles[tab]}
        description={
          tab === "addresses"
            ? "Saved addresses for a smoother next collection."
            : tab === "favorites"
              ? "Keep the laundries you like, close by."
              : tab === "schedules"
                ? "Save a recurring routine. Bookings still need capacity and fresh payment authorisation."
                : "Your profile, preferences, and privacy controls."
        }
        action={
          tab === "addresses" || tab === "schedules" ? (
            <Button onClick={() => setModal(true)}>
              <Plus size={17} />
              {tab === "addresses" ? "Add an address" : "Save a schedule"}
            </Button>
          ) : undefined
        }
      />
      {tab === "addresses" ? (
        <div className="address-grid">
          {p.addresses.map((a: any) => (
            <Panel key={a.id}>
              <span className="service-icon">
                <MapPin />
              </span>
              <h2>{a.label}</h2>
              <p>{a.detail}</p>
              <p>{a.area.name}</p>
              {a.instructions && <p className="muted">{a.instructions}</p>}
              <Button
                variant="ghost"
                busy={busy}
                onClick={() =>
                  void run(
                    () => send(`addresses/${a.id}`, {}, "DELETE"),
                    "Address removed.",
                  )
                }
              >
                <Trash2 size={16} /> Remove
              </Button>
            </Panel>
          ))}
          {!p.addresses.length && (
            <Empty text="Add a collection address to make your next booking a little quicker." />
          )}
        </div>
      ) : tab === "favorites" ? (
        p.favorites.length ? (
          <div className="saved-grid">
            {p.favorites.map((f: any) => (
              <Panel key={f.companyId}>
                <img
                  className="saved-photo"
                  src={f.company.photo}
                  alt={"Fresh laundry and garment care"}
                />
                <h2>{f.company.name}</h2>
                <div className="button-row">
                  <ButtonLink
                    to={`/laundry/${f.company.slug}`}
                    variant="secondary"
                  >
                    Open laundry
                  </ButtonLink>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void run(
                        () => send("favorites", { companyId: f.companyId }),
                        "Saved laundry removed.",
                      )
                    }
                    aria-label={`Remove ${f.company.name}`}
                  >
                    <Heart size={18} />
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <Empty
            title="Your favourites will feel at home here."
            text="Save a laundry from its listing or profile, and find it here next time."
            action={
              <ButtonLink to="/find-laundry">Find a laundry to love</ButtonLink>
            }
          />
        )
      ) : tab === "schedules" ? (
        <>
          {!user?.premium && (
            <div className="notice">
              <Sparkles size={23} />
              <div>
                <h3>A little Plus perk.</h3>
                <p>
                  Active Student Plus unlocks recurring schedules. Your existing
                  schedules remain visible when benefits expire.
                </p>
                <ButtonLink to="/student-plus" variant="secondary">
                  Explore Student Plus
                </ButtonLink>
              </div>
            </div>
          )}
          {p.schedules.length ? (
            p.schedules.map((s: any) => (
              <Panel key={s.id}>
                <div className="panel-head">
                  <div>
                    <h2>{s.company.name}</h2>
                    <p>
                      Every{" "}
                      {
                        [
                          "Sunday",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                        ][s.day]
                      }{" "}
                      · {s.frequency}
                    </p>
                  </div>
                  <Status value={s.active ? "active" : "paused"} />
                </div>
                <div className="button-row">
                  <ButtonLink
                    to={`/book/${s.company.slug}?day=${s.day}`}
                    variant="secondary"
                  >
                    Book the next collection
                  </ButtonLink>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void run(
                        () => send(`schedules/${s.id}`, {}, "DELETE"),
                        "Schedule removed.",
                      )
                    }
                  >
                    Remove schedule
                  </Button>
                </div>
              </Panel>
            ))
          ) : (
            <Empty text="Save a weekly or fortnightly rhythm with Student Plus." />
          )}
        </>
      ) : (
        <div className="settings-layout">
          <Panel title="A little about you.">
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    send(
                      "profile",
                      {
                        name: f.get("name"),
                        phone: f.get("phone") || undefined,
                        preferences: {
                          notifications: f.get("notifications") === "on",
                          detergent: f.get("detergent"),
                        },
                      },
                      "PATCH",
                    ),
                  "Your preferences are saved.",
                );
              }}
            >
              <Field label="Your name">
                <input
                  name="name"
                  defaultValue={p.name}
                  required
                  minLength={2}
                />
              </Field>
              <Field label="Ghanaian phone number (optional)">
                <input
                  name="phone"
                  type="tel"
                  defaultValue={p.phone || ""}
                  placeholder="0XX XXX XXXX"
                  pattern="(?:\+233|0)[235][0-9]{8}"
                />
              </Field>
              <Field label="Detergent preference">
                <Select
                  name="detergent"
                  defaultValue={p.preferences?.detergent || "standard"}
                >
                  <option value="standard">Standard detergent</option>
                  <option value="fragrance-free">
                    Fragrance-free if available
                  </option>
                </Select>
              </Field>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="notifications"
                  defaultChecked={p.preferences?.notifications !== false}
                />{" "}
                Receive in-app service updates
              </label>
              <Button type="submit" busy={busy}>
                Save your preferences
              </Button>
            </form>
          </Panel>
          <Panel title="Your data, your say.">
            <p>
              Export your account records or ask support to review an account
              deletion request.
            </p>
            <a
              className="btn btn-secondary full-width"
              href="/api/account/export"
            >
              <Download size={17} /> Export my account
            </a>
            <Button
              className="full-width"
              variant="ghost"
              busy={busy}
              onClick={() =>
                void run(
                  () => send("account/delete"),
                  "Your deletion request is saved. Follow the case from support.",
                )
              }
            >
              Request account deletion
            </Button>
            <p className="muted small">
              Financial and dispute records may be retained under the approved
              retention policy. Read our{" "}
              <Link to="/privacy">privacy policy</Link>.
            </p>
          </Panel>
        </div>
      )}
      {tab === "settings" && (
        <>
          <PasswordChange />
          <ResetTestAccount />
        </>
      )}
      {modal && (
        <Modal
          title={
            tab === "addresses"
              ? "A place for your next collection."
              : "Save your laundry rhythm."
          }
          onClose={() => setModal(false)}
        >
          {tab === "addresses" ? (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                void run(async () => {
                  await send("addresses", f);
                  setModal(false);
                }, "Address saved.");
              }}
            >
              <Field label="A name for this address">
                <input
                  name="label"
                  placeholder="My hall"
                  required
                  minLength={2}
                />
              </Field>
              <Field label="Service area">
                <Select name="areaId" required>
                  {config?.areas.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Address & landmark">
                <textarea
                  name="detail"
                  required
                  minLength={5}
                  maxLength={500}
                  rows={3}
                />
              </Field>
              <Field label="Collection instructions">
                <input name="instructions" maxLength={500} />
              </Field>
              <Button type="submit" busy={busy}>
                Save address
              </Button>
            </form>
          ) : (
            <ScheduleForm onDone={() => setModal(false)} />
          )}
        </Modal>
      )}
    </>
  );
}
function ScheduleForm({ onDone }: { onDone: () => void }) {
  const companies = useData("schedule-companies", "companies");
  const { run, busy } = useAction();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(async () => {
          await send("schedules", {
            companyId: f.get("companyId"),
            day: Number(f.get("day")),
            frequency: f.get("frequency"),
          });
          onDone();
        }, "Recurring schedule saved.");
      }}
    >
      <Field label="Your laundry">
        <Select name="companyId" required>
          {companies.data?.companies.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Your laundry day">
        <Select name="day">
          {[
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ].map((d, i) => (
            <option value={i} key={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="How often?">
        <Select name="frequency">
          <option value="weekly">Every week</option>
          <option value="fortnightly">Every two weeks</option>
        </Select>
      </Field>
      <Button type="submit" busy={busy}>
        Save your rhythm
      </Button>
    </form>
  );
}
export function Billing({ business = false }: { business?: boolean }) {
  const { user } = useApp();
  const data = useData("subscriptions");
  const { run, busy } = useAction();
  const navigate = useNavigate();
  return (
    <>
      <PageHead
        eyebrow={
          business
            ? "A WORKSPACE THAT GROWS WITH YOU"
            : "A FEW THOUGHTFUL EXTRAS"
        }
        title={
          business ? "Your hosting, clearly." : "Your membership, your way."
        }
        description="See your purchased periods, renewal method, and billing records."
        action={
          <ButtonLink
            to={business ? "/pricing" : "/student-plus"}
            variant="secondary"
          >
            {business ? "Explore business plans" : "Explore Student Plus"}
          </ButtonLink>
        }
      />
      {data.isLoading ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} />
      ) : (
        <>
          {data.data
            .filter((s: any) => (business ? !!s.companyId : !s.companyId))
            .map((s: any) => (
              <Panel key={s.id} className="subscription-panel">
                <div className="panel-head">
                  <div>
                    <Badge>
                      {business ? "BUSINESS HOSTING" : "STUDENT MEMBERSHIP"}
                    </Badge>
                    <h2>{s.plan.name}</h2>
                  </div>
                  <Status value={s.status} />
                </div>
                <div className="subscription-dates">
                  <div>
                    <span>Service period</span>
                    <strong>
                      {s.status === "pending_approval" ? (
                        `${s.periodDaysSnapshot} days from approval`
                      ) : (
                        <>
                          {dateLabel(s.startsAt)} –{" "}
                          {dateLabel(s.endsAt, { year: "numeric" })}
                        </>
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Price paid</span>
                    <strong>{money(s.priceSnapshot)}</strong>
                  </div>
                  <div>
                    <span>Renewal</span>
                    <strong>
                      {s.cancelAtEnd
                        ? "Cancelled at period end"
                        : s.renewalMethod === "card_auto"
                          ? "Authorised card renewal"
                          : "Fresh customer authorisation"}
                    </strong>
                  </div>
                </div>
                <div className="button-row">
                  {s.status === "active" && !s.cancelAtEnd && (
                    <Button
                      variant="secondary"
                      busy={busy}
                      onClick={() =>
                        void run(
                          () => send(`subscriptions/${s.id}/cancel`),
                          "Future renewal cancelled. Access remains through your paid period.",
                        )
                      }
                    >
                      Cancel future renewal
                    </Button>
                  )}
                  {["expired", "past_due", "inactive"].includes(s.status) && (
                    <Button
                      busy={busy}
                      onClick={() =>
                        void run(async () => {
                          const p = await send("payments/checkout", {
                            kind: business ? "hosting" : "student",
                            companyId: business ? user?.companyId : undefined,
                            planId: s.planId,
                            idempotencyKey: idempotency(),
                            method: "mobile_money",
                          });
                          navigate(`/checkout/${p.id}`);
                        })
                      }
                    >
                      Renew with a fresh payment
                    </Button>
                  )}
                </div>
                {s.status === "pending_approval" && (
                  <p className="body-copy">
                    Payment received. Your subscription is awaiting
                    administrator approval. Your full service period begins when
                    it is activated.
                  </p>
                )}
                {s.payment && (
                  <p className="muted small">Receipt: {s.payment.reference}</p>
                )}
              </Panel>
            ))}
          {!data.data.filter((s: any) =>
            business ? !!s.companyId : !s.companyId,
          ).length && (
            <Empty
              title={
                business
                  ? "A home for your business."
                  : "Your essentials are already here."
              }
              text={
                business
                  ? "Choose a hosting plan after your application is approved."
                  : "Standard bookings, tracking, receipts, and help are available on your free account."
              }
              action={
                <ButtonLink to={business ? "/pricing" : "/student-plus"}>
                  Explore {business ? "hosting plans" : "Student Plus"}
                </ButtonLink>
              }
            />
          )}
        </>
      )}
      <div className="notice">
        <ShieldCheck size={23} />
        <p>
          Mobile money renewals require fresh customer authorisation. A
          cancelled renewal keeps access until the paid period ends. Benefits
          apply during your active paid period.
        </p>
      </div>
    </>
  );
}
export function Messages({ base }: { base: string }) {
  const data = useData(
    `message-orders-${base}`,
    `orders${base === "/business" ? "?view=business" : ""}`,
  );
  return (
    <>
      <PageHead
        eyebrow="KEEP THE CARE CONNECTED"
        title="A direct line to your laundry."
        description="Open an order to view its private conversation and send a message."
      />
      {data.isLoading ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} />
      ) : (
        <Panel>
          <OrderTable orders={data.data || []} base={base} />
        </Panel>
      )}
    </>
  );
}
export function Notifications() {
  const [page, setPage] = useState(1);
  const data = useData(
    `notifications-page-${page}`,
    `notifications?paged=true&page=${page}`,
    true,
    true,
  );
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="A little heads-up."
        description="Your private booking, payment, and account updates."
        action={
          <Button
            variant="secondary"
            busy={busy}
            onClick={() =>
              void run(
                () => send("notifications/read"),
                "Notifications marked as read.",
              )
            }
          >
            Mark all read
          </Button>
        }
      />
      {data.isLoading ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} />
      ) : (
        <Panel>
          {data.data?.items.length === 0 && (
            <Empty
              title="You're up to date."
              text="Your booking, payment, and account updates will appear here."
            />
          )}
          {data.data?.items.map((n: any) => (
            <Link
              key={n.id}
              className={`notification-item ${!n.readAt ? "unread" : ""}`}
              to={n.href}
            >
              <span className="service-icon">
                <Bell size={20} />
              </span>
              <div>
                <h3>{n.title}</h3>
                <p>{n.body}</p>
                <small>
                  {dateLabel(n.createdAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
            </Link>
          ))}
          {data.data && (
            <Pagination
              {...data.data}
              onPage={setPage}
              busy={data.isFetching}
              label="notifications"
            />
          )}
        </Panel>
      )}
    </>
  );
}
