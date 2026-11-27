import {
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Download,
  FileCheck2,
  MapPin,
  Package,
  Plus,
  Settings,
  Shirt,
  Star,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { OrderTable } from "../components/orders";
import { Revenue } from "../components/revenue";
import { SupportWorkspace } from "../components/support";
import {
  BusinessPhotos,
  SettlementAccount,
} from "../components/business-setup";
import { ResetTestAccount } from "../components/reset-test-account";
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
  idempotency,
  money,
  send,
  useAction,
  useApp,
  useData,
} from "../lib";
import { Billing, Messages, Notifications } from "./account";
export function Business() {
  const loc = useLocation();
  const tab = loc.pathname.split("/")[2] || "";
  const company = useData("business");
  const { user } = useApp();
  if (
    ![
      "",
      "orders",
      "calendar",
      "catalogue",
      "customers",
      "messages",
      "reviews",
      "earnings",
      "settlements",
      "subscription",
      "promotions",
      "staff",
      "profile",
      "coverage",
      "branches",
      "onboarding",
      "support",
      "settings",
      "notifications",
      "reports",
    ].includes(tab)
  )
    return <Navigate to="/business" replace />;
  if (
    user?.role === "staff" &&
    ![
      "",
      "orders",
      "calendar",
      "customers",
      "messages",
      "notifications",
      "support",
    ].includes(tab)
  )
    return <Navigate to="/business" replace />;
  if (tab === "reports") return <Navigate to="/business/earnings" replace />;
  if (tab === "earnings") return <Revenue business />;
  if (tab === "notifications") return <Notifications />;
  if (tab === "support") return <SupportWorkspace />;
  if (tab === "subscription") return <Billing business />;
  if (tab === "messages") return <Messages base="/business" />;
  if (company.isLoading) return <Loading />;
  if (company.isError) return <ErrorState error={company.error} />;
  const c = company.data;
  if (tab === "settlements")
    return (
      <>
        <SettlementAccount company={c} />
        <Revenue business settlementsOnly />
      </>
    );
  if (tab === "catalogue") return <Catalogue c={c} />;
  if (tab === "profile") return <BusinessProfile c={c} />;
  if (tab === "coverage") return <CoverageHours c={c} />;
  if (tab === "branches") return <Branches c={c} />;
  if (tab === "onboarding") return <Onboarding c={c} />;
  if (tab === "staff") return <Staff c={c} />;
  if (tab === "promotions") return <Promotions c={c} />;
  if (tab === "reviews") return <Reviews c={c} />;
  if (tab === "settings")
    return (
      <>
        <PageHead
          title="Your business, your settings."
          description="Manage your operational details and account preferences."
        />
        <div className="help-grid">
          {[
            [
              "/business/profile",
              "Business profile",
              "Public identity, booking preferences, and service areas.",
            ],
            [
              "/business/coverage",
              "Coverage & hours",
              "Opening hours, closures, and collection rules.",
            ],
            [
              "/business/staff",
              "Staff permissions",
              "Manage access for the people in your business.",
            ],
            [
              "/account/settings",
              "Personal account",
              "Your own profile, preferences, and privacy controls.",
            ],
          ].map(([to, title, desc]) => (
            <Link className="help-card" to={to} key={to}>
              <Settings />
              <h2>{title}</h2>
              <p>{desc}</p>
            </Link>
          ))}
        </div>
        <ResetTestAccount />
      </>
    );
  return <BusinessOrders c={c} tab={tab} />;
}
function BusinessOrders({ c, tab }: { c: any; tab: string }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    view: "business",
    ...(tab === "calendar" ? { calendar: "true" } : {}),
    ...(tab === "orders"
      ? {
          paged: "true",
          page: String(page),
          ...(filter !== "all" ? { status: filter } : {}),
        }
      : {}),
  });
  const data = useData(
    `business-orders-${params}`,
    `orders?${params}`,
    tab !== "customers",
    true,
  );
  const customerData = useData(
    "business-customers",
    "business/customers",
    tab === "customers",
  );
  const overview = useData("business-overview", "business/overview", !tab);
  if (data.isLoading) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} />;
  if (!tab && overview.isPending) return <Loading />;
  if (!tab && overview.isError) return <ErrorState error={overview.error} />;
  const orders = data.data || [];
  if (tab === "customers") {
    if (customerData.isPending) return <Loading />;
    if (customerData.isError) return <ErrorState error={customerData.error} />;
    const customers = customerData.data || [];
    return (
      <>
        <PageHead
          title="The people behind the baskets."
          description="Only customers connected to your company’s own orders appear here."
        />
        <Panel>
          {customers.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Orders with your company</th>
                    <th>Latest order</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.count}</td>
                      <td>
                        <Link to={`/business/orders/${c.order}`}>
                          Open order
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="Your first customer will appear after an order is created." />
          )}
        </Panel>
      </>
    );
  }
  if (tab === "calendar")
    return (
      <>
        <PageHead
          title="A little room in your week."
          description="Collection windows and orders, shown in Africa/Accra."
        />
        <Calendar companyId={c.id} orders={orders} />
      </>
    );
  return (
    <>
      <PageHead
        eyebrow={
          tab ? "YOUR ORDER WORKSPACE" : "YOUR BUSINESS, THOUGHTFULLY ORGANISED"
        }
        title={
          tab
            ? "Every basket, in its place."
            : `A fresh day at ${c.name.split(" ")[0]}.`
        }
        description={
          tab
            ? "Manage collection, care, handover, and completion with an auditable timeline."
            : `${c.name} · ${c.location}`
        }
        action={
          <ButtonLink to="/business/calendar" variant="secondary">
            <CalendarDays size={17} /> Booking calendar
          </ButtonLink>
        }
      />
      {!tab && (
        <>
          <div className="business-status-band">
            <div>
              <span className="service-icon">
                <Building2 size={22} />
              </span>
              <div>
                <strong>
                  {c.listing?.listed
                    ? "Your business is live on the marketplace."
                    : "Your business is not listed yet."}
                </strong>
                <p>
                  {c.listing?.listed
                    ? "Keep your services and availability up to date."
                    : c.listing?.blockers[0]}
                </p>
              </div>
            </div>
            <Status value={c.listing?.listed ? "listed" : "not_listed"} />
            <ButtonLink to="/business/onboarding" variant="secondary">
              View business readiness
            </ButtonLink>
          </div>
          <div className="metrics-grid three">
            <Metric
              label="Active orders"
              value={overview.data.activeOrders}
              detail="In your care queue"
              icon={<Package size={20} />}
            />
            <Metric
              label="Completed orders"
              value={overview.data.completedOrders}
              detail="Fresh care, delivered"
              icon={<Check size={20} />}
            />
            <Metric
              label="Active services"
              value={overview.data.services}
              detail="From your service catalogue"
              icon={<Shirt size={20} />}
            />
          </div>
          {overview.data.finance && (
            <div className="metrics-grid four">
              <Metric
                label="Paid laundry transactions"
                value={overview.data.finance.orderTransactions}
                detail="Verified successful payments"
                icon={<Check size={20} />}
              />
              <Metric
                label="Customer payments"
                value={money(overview.data.finance.orderCollections)}
                detail="Before customer refunds"
                icon={<Wallet size={20} />}
              />
              <Metric
                label="Company earnings"
                value={money(overview.data.finance.companyNet)}
                detail="Company allocation after refunds"
                icon={<Wallet size={20} />}
              />
              <Metric
                label="Company payable"
                value={money(overview.data.finance.companyPayable)}
                detail="After refunds and settlements"
                icon={<Wallet size={20} />}
              />
            </div>
          )}
        </>
      )}
      <Panel
        title={tab ? "The care queue." : "A little look at your orders."}
        action={
          <Select
            aria-label="Filter orders by status"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All order states</option>
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
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        }
      >
        <OrderTable
          orders={
            tab === "orders"
              ? data.data?.items || []
              : (filter === "all"
                  ? orders
                  : orders.filter((o: any) => o.status === filter)
                ).slice(0, 6)
          }
          base="/business"
          compact={!tab}
        />
        {tab === "orders" && data.data && (
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
function Calendar({ companyId, orders }: { companyId: string; orders: any[] }) {
  const slots = useData(
    `calendar-${companyId}`,
    `companies/${companyId}/slots`,
  );
  const days = new Map<string, any[]>();
  for (const s of slots.data || []) {
    const date = s.startsAt.slice(0, 10);
    days.set(date, [...(days.get(date) || []), s]);
  }
  return slots.isLoading ? (
    <Loading />
  ) : (
    <div className="calendar-grid">
      {Array.from(days).map(([day, ss]) => (
        <Panel key={day} title={dateLabel(day, { weekday: "long" })}>
          {ss.map((s) => (
            <div className="calendar-slot" key={s.id}>
              <strong>
                {new Date(s.startsAt).toLocaleTimeString("en-GB", {
                  timeZone: "Africa/Accra",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                –
                {new Date(s.endsAt).toLocaleTimeString("en-GB", {
                  timeZone: "Africa/Accra",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
              <span>
                {s.available} of {s.capacity} available
              </span>
              {orders
                .filter((o) => o.slotId === s.id)
                .map((o) => (
                  <Link to={`/business/orders/${o.id}`} key={o.id}>
                    {o.reference} · {o.user.name}
                  </Link>
                ))}
            </div>
          ))}
        </Panel>
      ))}
    </div>
  );
}
function Catalogue({ c }: { c: any }) {
  const [edit, setEdit] = useState<any | null>(null);
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="Good care, clearly priced."
        description="Per-item, per-load, package, and estimated weight services. Existing orders retain their price snapshots."
        action={
          <Button onClick={() => setEdit({})}>
            <Plus size={17} /> Add a service
          </Button>
        }
      />
      <Panel>
        {c.services.map((s: any) => (
          <div className="service-row" key={s.id}>
            <span className="service-row-icon">
              <Shirt />
            </span>
            <div>
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <Status value={s.active ? "active" : "inactive"} />
            </div>
            <div className="service-row-price">
              <strong>{money(s.price)}</strong>
              <span>/ {s.unit}</span>
              <Button variant="ghost" onClick={() => setEdit(s)}>
                Edit service
              </Button>
            </div>
          </div>
        ))}
      </Panel>
      {edit && (
        <Modal
          title={edit.id ? "A little service refresh." : "Add a fresh service."}
          onClose={() => setEdit(null)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await send("business/services", {
                  id: edit.id,
                  name: f.get("name"),
                  description: f.get("description"),
                  category: f.get("category"),
                  unit: f.get("unit"),
                  price: Math.round(Number(f.get("price")) * 100),
                  active: f.get("active") === "on",
                  estimated: f.get("estimated") === "on",
                });
                setEdit(null);
              }, "Service catalogue updated.");
            }}
          >
            <Field label="Service name">
              <input
                name="name"
                defaultValue={edit.name}
                required
                minLength={3}
                maxLength={100}
              />
            </Field>
            <Field label="What does this service include?">
              <textarea
                name="description"
                defaultValue={edit.description}
                required
                minLength={10}
                maxLength={1000}
                rows={3}
              />
            </Field>
            <div className="form-row">
              <Field label="Service category">
                <Select
                  name="category"
                  defaultValue={edit.category || "wash-fold"}
                >
                  <option value="wash-fold">Wash & fold</option>
                  <option value="ironing">Ironing</option>
                  <option value="bedding">Bedding</option>
                </Select>
              </Field>
              <Field label="Pricing unit">
                <Select name="unit" defaultValue={edit.unit || "load"}>
                  {["load", "item", "kg", "package"].map((s) => (
                    <option value={s} key={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Price per unit (GHS)">
              <input
                name="price"
                type="number"
                step="0.01"
                min="1"
                defaultValue={edit.price ? edit.price / 100 : 25}
                required
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                name="active"
                defaultChecked={edit.active !== false}
              />{" "}
              Available for new bookings
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                name="estimated"
                defaultChecked={!!edit.estimated}
              />{" "}
              Weight estimate, confirmed after collection
            </label>
            <Button type="submit" busy={busy}>
              Save service
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
function BusinessProfile({ c }: { c: any }) {
  const { config } = useApp();
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="Your care, your identity."
        description="Tell students what your business offers. Keep every detail accurate."
      />
      <Panel title="The details that make you, you.">
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                send(
                  "business",
                  {
                    name: f.get("name"),
                    description: f.get("description"),
                    location: f.get("location"),
                    primaryAreaId: f.get("primaryAreaId"),
                    registrationRef: f.get("registrationRef"),
                    minimum: Math.round(Number(f.get("minimum")) * 100),
                    deliveryFee: Math.round(Number(f.get("deliveryFee")) * 100),
                    capacity: Number(f.get("capacity")),
                    turnaroundHours: Number(f.get("turnaroundHours")),
                    pickup: f.get("pickup") === "on",
                    instantBooking: f.get("instantBooking") === "on",
                    areas: f.getAll("areas"),
                  },
                  "PATCH",
                ),
              "Business profile saved.",
            );
          }}
        >
          <div className="form-row">
            <Field label="Business name">
              <input
                name="name"
                defaultValue={c.name}
                required
                minLength={3}
                maxLength={100}
              />
            </Field>
            <Field label="Registration reference">
              <input
                name="registrationRef"
                defaultValue={c.registrationRef}
                required
                minLength={5}
              />
            </Field>
          </div>
          <Field label="Your business description">
            <textarea
              name="description"
              defaultValue={c.description}
              required
              minLength={30}
              maxLength={2000}
              rows={5}
            />
          </Field>
          <Field label="Business area">
            <Select
              name="primaryAreaId"
              defaultValue={c.primaryAreaId || ""}
              required
            >
              <option value="">Choose your business area</option>
              {config?.areas.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Business location">
            <input
              name="location"
              defaultValue={c.location}
              required
              minLength={5}
            />
          </Field>
          <div className="form-row">
            <Field label="Minimum laundry order (GHS)">
              <input
                name="minimum"
                type="number"
                min="0"
                step="0.01"
                defaultValue={c.minimum / 100}
                required
              />
            </Field>
            <Field label="Collection & return fee (GHS)">
              <input
                name="deliveryFee"
                type="number"
                min="0"
                step="0.01"
                defaultValue={c.deliveryFee / 100}
                required
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Turnaround (hours)">
              <input
                name="turnaroundHours"
                type="number"
                min="6"
                max="168"
                defaultValue={c.turnaroundHours}
                required
              />
            </Field>
            <Field label="Capacity per new window">
              <input
                name="capacity"
                type="number"
                min="1"
                max="200"
                defaultValue={c.capacity}
                required
              />
            </Field>
          </div>
          <fieldset className="field">
            <legend className="field-label">Service areas</legend>
            <div className="checkbox-grid">
              {config?.areas.map((a: any) => (
                <label key={a.id} className="check-label">
                  <input
                    type="checkbox"
                    name="areas"
                    value={a.id}
                    defaultChecked={c.areas.some((x: any) => x.areaId === a.id)}
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="check-label">
            <input type="checkbox" name="pickup" defaultChecked={c.pickup} />{" "}
            Offer collection & return
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              name="instantBooking"
              defaultChecked={c.instantBooking}
            />{" "}
            Allow instant bookings within configured capacity
          </label>
          <Button type="submit" busy={busy}>
            Save business profile
          </Button>
        </form>
      </Panel>
      <BusinessPhotos company={c} />
    </>
  );
}
function CoverageHours({ c }: { c: any }) {
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="Make room for the week."
        description="Set operating hours and closure dates. Booking times use Africa/Accra."
      />
      <div className="settings-layout">
        <Panel title="Opening hours">
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const hours = Array.from({ length: 7 }, (_, day) => ({
                day,
                open: String(f.get(`open-${day}`)),
                close: String(f.get(`close-${day}`)),
              })).filter((h) => f.get(`day-${h.day}`) === "on");
              void run(
                () => send("business/hours", { hours }, "PUT"),
                "Opening hours saved. New slots are generated by the background job.",
              );
            }}
          >
            {[
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ].map((d, i) => {
              const h = c.hours.find((h: any) => h.day === i);
              return (
                <div className="hours-editor" key={d}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      name={`day-${i}`}
                      defaultChecked={!!h}
                    />
                    {d}
                  </label>
                  <input
                    aria-label={`${d} opening time`}
                    name={`open-${i}`}
                    type="time"
                    defaultValue={h?.open || "08:00"}
                  />
                  <span>to</span>
                  <input
                    aria-label={`${d} closing time`}
                    name={`close-${i}`}
                    type="time"
                    defaultValue={h?.close || "18:00"}
                  />
                </div>
              );
            })}
            <Button type="submit" busy={busy}>
              Save opening hours
            </Button>
          </form>
        </Panel>
        <Panel title="Plan a little breathing room.">
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              void run(async () => {
                await send("business/closures", {
                  date: f.get("date"),
                  reason: f.get("reason"),
                });
                form.reset();
              }, "Closure date saved.");
            }}
          >
            <Field label="Closed on">
              <input type="date" name="date" required />
            </Field>
            <Field label="Reason">
              <input
                name="reason"
                required
                minLength={3}
                placeholder="Maintenance, holiday, or a team break"
              />
            </Field>
            <Button type="submit" variant="secondary" busy={busy}>
              Add closure
            </Button>
          </form>
          <div className="simple-list">
            {c.closures.map((x: any) => (
              <div key={x.id}>
                <strong>{dateLabel(x.date)}</strong>
                <span>{x.reason}</span>
              </div>
            ))}
          </div>
          <h3 className="subheading">Currently serving</h3>
          <div className="tag-list">
            {c.areas.map((a: any) => (
              <Badge key={a.areaId}>{a.area.name}</Badge>
            ))}
          </div>
          <Link to="/business/profile">
            Edit service areas & collection rules
          </Link>
        </Panel>
      </div>
    </>
  );
}
function Branches({ c }: { c: any }) {
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="Your care, in more places."
        description="Branches are limited by your active hosting plan."
      />
      <div className="address-grid">
        {c.branches.map((b: any) => (
          <Panel key={b.id}>
            <span className="service-icon">
              <MapPin />
            </span>
            <h2>{b.name}</h2>
            <p>{b.address}</p>
          </Panel>
        ))}
      </div>
      <Panel title="Add a branch">
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () => send("business/branches", Object.fromEntries(f)),
              "Branch added.",
            );
          }}
        >
          <Field label="Branch name">
            <input name="name" minLength={3} required />
          </Field>
          <Field label="Branch address">
            <input name="address" minLength={5} required />
          </Field>
          <Button type="submit" busy={busy}>
            Add branch
          </Button>
        </form>
      </Panel>
    </>
  );
}
function Onboarding({ c }: { c: any }) {
  const { config } = useApp();
  const { run, busy } = useAction();
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      await run(async () => {
        throw new Error("Choose a document up to 3 MB.");
      });
      return;
    }
    setUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await run(
        () =>
          send("files", {
            name: file.name,
            mime: file.type || "text/plain",
            base64: btoa(binary),
            companyId: c.id,
          }),
        "Document uploaded and its review state recorded.",
      );
    } finally {
      setUploading(false);
    }
  };
  return (
    <>
      <PageHead
        title="A clear path to your first order."
        description="Business approval and payment-account approval are separate checks."
        action={<Status value={c.status} />}
      />
      <div className="onboarding-checklist">
        {[
          [
            !!c.description,
            "Tell your business story",
            "Complete your profile, location, coverage, and collection rules.",
            "/business/profile",
          ],
          [
            c.services.some((service: any) => service.active),
            "Build your service catalogue",
            "Add the services you actually offer and clear prices.",
            "/business/catalogue",
          ],
          [
            c.hours.length > 0,
            "Make room in your calendar",
            "Set opening hours and capacity for collections.",
            "/business/coverage",
          ],
          [
            c.verificationReady,
            "Share verification material",
            "Upload the documents needed for the review.",
            "#documents",
          ],
          [
            c.status === "approved",
            "Application review",
            "An administrator reviews the business application.",
            "/business/onboarding",
          ],
          [
            c.listing.hostingActive,
            "Give your business a home",
            "Choose and pay for a hosting subscription.",
            "/pricing",
          ],
          [
            c.listing.listed,
            "Make your fresh start public",
            "Publish after approval and active hosting.",
            "/business/onboarding",
          ],
          [
            c.paymentAccountApproved,
            "Connect your settlement account",
            "Submit your bank details for review before accepting payments.",
            "/business/settlements",
          ],
          [
            !!c.photo,
            "Add your business photography",
            "Show customers the people and premises behind your service.",
            "/business/profile",
          ],
        ].map(([done, title, desc, to]: any) => (
          <div key={title}>
            <span className={done ? "checklist-mark done" : "checklist-mark"}>
              {done ? <Check size={18} /> : <Clock3 size={17} />}
            </span>
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
            {to === "#documents" ? (
              <a className="text-link" href="#documents">
                Review
              </a>
            ) : (
              <Link className="text-link" to={to}>
                Open
              </Link>
            )}
          </div>
        ))}
      </div>
      <Panel
        title="Verification material"
        description="Private documents are restricted to their owner and authorised reviewers."
      >
        <div id="documents" className="file-list">
          {c.files.map((f: any) => (
            <div key={f.id}>
              <FileCheck2 size={21} />
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
                <Download size={17} />
                Download
              </Button>
            </div>
          ))}
        </div>
        <Field
          label="Upload a verification document"
          hint={
            config?.uploads?.pdf
              ? "PDF, PNG, or JPEG · up to 3 MB."
              : "PNG or JPEG · up to 3 MB."
          }
        >
          <input
            type="file"
            accept={
              config?.uploads?.pdf
                ? "application/pdf,image/png,image/jpeg"
                : "image/png,image/jpeg"
            }
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </Field>
      </Panel>
      <Panel title="Ready for your fresh start?">
        <p>
          {c.status === "approved"
            ? "Your application is approved. With active hosting, services, and hours in place, you can publish."
            : "Your company needs administrator approval before it can accept bookings. An administrator can review this application from the Companies workspace."}
        </p>
        <div className="button-row">
          <Button
            busy={busy}
            onClick={() =>
              void run(
                () => send("business/publish"),
                "Business published. It is now eligible for discovery.",
              )
            }
            disabled={c.status !== "approved"}
          >
            {c.published
              ? "Refresh publication readiness"
              : "Publish my business"}
          </Button>
          <ButtonLink to="/business/subscription" variant="secondary">
            Manage hosting
          </ButtonLink>
        </div>
      </Panel>
    </>
  );
}
function Staff({ c }: { c: any }) {
  const { run, busy } = useAction();
  const [modal, setModal] = useState(false);
  return (
    <>
      <PageHead
        title="Good care takes a good team."
        description="Give each person the access they need. Staff cannot change platform fees or settlement details."
        action={
          <Button onClick={() => setModal(true)}>
            <Plus size={17} /> Add a team member
          </Button>
        }
      />
      <Panel>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team member</th>
                <th>Role</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {c.memberships.map((m: any) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.user.name}</strong>
                    <small>{m.user.email}</small>
                  </td>
                  <td>
                    <Status value={m.role} />
                  </td>
                  <td>
                    {m.role === "owner"
                      ? "Owner permissions"
                      : m.permissions.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {modal && (
        <Modal
          title="A new pair of helping hands."
          onClose={() => setModal(false)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await send("business/staff", {
                  name: f.get("name"),
                  email: f.get("email"),
                  password: f.get("password"),
                  permissions: f.getAll("permissions"),
                });
                setModal(false);
              }, "Staff account created with the selected permissions.");
            }}
          >
            <Field label="Team member name">
              <input name="name" required minLength={2} />
            </Field>
            <Field label="Account email">
              <input
                name="email"
                type="email"
                required
                placeholder="staff@yourbusiness.com"
              />
            </Field>
            <Field label="Unique initial password">
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </Field>
            <fieldset className="field">
              <legend>Staff permissions</legend>
              {[
                ["orders.read", "View company orders"],
                ["orders.write", "Update company orders & messages"],
                ["catalogue.write", "Edit services"],
                ["files.read", "Read company documents"],
              ].map(([v, label]) => (
                <label className="check-label" key={v}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={v}
                    defaultChecked={v === "orders.read"}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <Button type="submit" busy={busy}>
              Create restricted staff account
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Promotions({ c }: { c: any }) {
  const { config } = useApp();
  const { run, busy } = useAction();
  const navigate = useNavigate();
  return (
    <>
      <PageHead
        title="A little more time in the spotlight."
        description="Sponsored placements are always labelled and never change verification status."
      />
      <div className="settings-layout">
        <Panel title="Give your profile a little visibility.">
          <Badge tone="amber">CLEARLY LABELLED SPONSORED PLACEMENT</Badge>
          <div className="plan-price">
            {money(config?.rules.sponsoredPrice || 5000)}
            <span>/ {config?.rules.sponsoredDays || 7} days</span>
          </div>
          <p>
            Your published company can appear in the sponsored position of
            recommended listings during its purchased period.
          </p>
          <Button
            busy={busy}
            onClick={() =>
              void run(async () => {
                const p = await send("payments/checkout", {
                  kind: "sponsored",
                  companyId: c.id,
                  idempotencyKey: idempotency(),
                });
                navigate(`/checkout/${p.id}`);
              })
            }
          >
            Purchase sponsored placement
          </Button>
          <p className="muted small">
            Your placement starts after a successful payment. Its active period
            and payment history appear in your business workspace.
          </p>
        </Panel>
        <Panel title="Your placement history">
          {c.campaigns.length ? (
            c.campaigns.map((x: any) => (
              <div className="simple-list" key={x.id}>
                <div>
                  <strong>{money(x.amount)}</strong>
                  <Status value={x.status} />
                </div>
                <p>
                  {dateLabel(x.startsAt)} – {dateLabel(x.endsAt)}
                </p>
              </div>
            ))
          ) : (
            <Empty text="Your paid campaigns will appear here after verified payment." />
          )}
        </Panel>
      </div>
    </>
  );
}
function Reviews({ c }: { c: any }) {
  const { run, busy } = useAction();
  return (
    <>
      <PageHead
        title="A fresh perspective on your care."
        description="Reviews are tied to completed orders. Respond thoughtfully; legitimate criticism cannot be removed through payment."
      />
      {c.reviews.length ? (
        c.reviews.map((r: any) => (
          <Panel key={r.id}>
            <div className="review-author">
              <span className="avatar">{r.user.name[0]}</span>
              <div>
                <strong>{r.user.name}</strong>
                <span>{dateLabel(r.createdAt)}</span>
              </div>
              <Badge>
                <Star size={13} />
                {r.rating}
              </Badge>
            </div>
            <p>{r.text}</p>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    send(`reviews/${r.id}/response`, {
                      response: f.get("response"),
                    }),
                  "Your response is saved.",
                );
              }}
            >
              <Field label="Your company response">
                <textarea
                  name="response"
                  defaultValue={r.response || ""}
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  required
                />
              </Field>
              <Button type="submit" variant="secondary" busy={busy}>
                Save response
              </Button>
            </form>
          </Panel>
        ))
      ) : (
        <Empty text="Reviews from completed company orders will appear here." />
      )}
    </>
  );
}
