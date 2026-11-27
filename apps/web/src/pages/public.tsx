import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Heart,
  Layers3,
  Leaf,
  MapPin,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Star,
  Truck,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { CompanyCard } from "../components/company-card";
import {
  Badge,
  Button,
  ButtonLink,
  Empty,
  ErrorState,
  Loading,
  Modal,
  PageHead,
  Panel,
  Select,
} from "../components/ui";
import { dateLabel, money, send, useAction, useApp, useData } from "../lib";

export function Home() {
  const { config } = useApp();
  const navigate = useNavigate();
  const [area, setArea] = useState("");
  const featured = useData("featured", "companies");
  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1>
              Your laundry
              <br /> sorted. Your
              <br /> <span>time back.</span>
              <svg
                className="headline-spark"
                viewBox="0 0 64 64"
                aria-hidden="true"
              >
                <path
                  d="M32 3v18M32 43v18M3 32h18M43 32h18M11 11l13 13M40 40l13 13M11 53l13-13M40 24l13-13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
            </h1>
            <p>
              Less time doing laundry. More time doing you.
              <br className="desktop-only" /> Discover laundry care around
              campus, book a collection,
              <br className="desktop-only" /> and leave the rest to your chosen
              laundry.
            </p>
            <form
              className="hero-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/find-laundry${area ? "?area=" + area : ""}`);
              }}
            >
              <MapPin size={21} />
              <div>
                <label htmlFor="hero-area">Where’s your laundry?</label>
                <Select
                  id="hero-area"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                >
                  <option value="">Choose area</option>
                  {config?.areas.map((a: any) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit">
                <Search size={18} /> Find laundry
              </Button>
            </form>
            <div className="hero-assurance">
              <span>
                <Check size={15} /> Prices upfront
              </span>
              <span>
                <Check size={15} /> Local laundry care
              </span>
              <span>
                <Check size={15} /> No subscription needed
              </span>
            </div>
          </motion.div>
          <motion.div
            className="hero-visual"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <img
              className="hero-image"
              src="/images/folded-towels.webp"
              alt="A carefully folded stack of fresh cotton towels"
              width="1000"
              height="1200"
              fetchPriority="high"
            />
            <div className="hero-image-shade" />
            <div className="hero-bottom-label">
              <span className="mini-label">YOUR WEEK, FRESHLY FOLDED.</span>
              <h2>
                Clean clothes.
                <br /> Clear schedule.
              </h2>
              <div className="hero-photo-note">
                <span className="line" /> A little less laundry. A little more
                life.
              </div>
            </div>
          </motion.div>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A FRESH TAKE ON LAUNDRY DAY</p>
            <h2>Whatever’s in your basket.</h2>
          </div>
        </div>
        <div className="service-categories">
          {[
            [
              Shirt,
              "Wash & fold",
              "Everyday clothes, freshly reset.",
              "wash-fold",
            ],
            [Sparkles, "Press & iron", "A crisp start to your day.", "ironing"],
            [
              Layers3,
              "Bedding & linen",
              "Fresh sheets. Better sleep.",
              "bedding",
            ],
          ].map(([Icon, title, desc, value]: any) => (
            <Link
              className="service-category"
              to={`/find-laundry?service=${value}`}
              key={value}
            >
              <span className="service-icon">
                <Icon size={29} strokeWidth={1.35} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
              <span className="category-plus">
                <Plus size={20} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="section featured-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GOOD CARE, CLOSE BY</p>
              <h2>Meet your next laundry.</h2>
            </div>
            <ButtonLink to="/find-laundry" variant="secondary">
              Explore all laundries
            </ButtonLink>
          </div>
          {featured.isLoading ? (
            <Loading />
          ) : featured.isError ? (
            <ErrorState
              error={featured.error}
              retry={() => void featured.refetch()}
            />
          ) : featured.data?.companies.length ? (
            <div className="company-grid">
              {featured.data.companies.slice(0, 3).map((c: any) => (
                <CompanyCard key={c.id} company={c} />
              ))}
            </div>
          ) : (
            <Empty
              title="Your next laundry could be here."
              text="We’re welcoming local laundry businesses. Explore the platform or apply to become a partner."
              action={
                <ButtonLink to="/for-businesses">List your business</ButtonLink>
              }
            />
          )}
        </div>
      </section>
      <section className="section container how-section">
        <div className="how-intro">
          <p className="eyebrow">YOUR LAUNDRY DAY, SIMPLIFIED</p>
          <h2>
            Fresh clothes.
            <br /> Less effort.
          </h2>
          <p>
            Good care shouldn’t complicate your day.
            <br /> Here’s how we make it feel easy.
          </p>
          <ButtonLink to="/how-it-works" variant="secondary">
            See how it works
          </ButtonLink>
        </div>
        <div className="how-steps">
          {[
            [
              Search,
              "Find your fit",
              "Compare local laundries by price, services, collection options, and turnaround.",
            ],
            [
              CalendarDays,
              "Make it your laundry day",
              "Pick your services and a collection window. Check every charge before you pay.",
            ],
            [
              PackageCheck,
              "Get back to your day",
              "Your chosen laundry handles the care. Follow each update and enjoy the fresh finish.",
            ],
          ].map(([Icon, title, description]: any) => (
            <div className="how-step" key={title}>
              <span>
                <Icon size={24} strokeWidth={1.5} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="container plus-banner">
        <div className="plus-banner-copy">
          <span className="plus-label">
            <Sparkles size={15} /> A LITTLE EXTRA, JUST FOR YOU
          </span>
          <h2>
            A fresh kind
            <br /> of student perk.
          </h2>
          <p>
            Meet Student Plus. Your everyday laundry routine,
            <br className="desktop-only" /> with a few thoughtful extras.
          </p>
          <div className="plus-perks">
            <span>
              <Check size={16} /> Standard convenience fee waived
            </span>
            <span>
              <Check size={16} /> Recurring laundry schedules
            </span>
            <span>
              <Check size={16} /> Your care preferences, remembered
            </span>
          </div>
          <ButtonLink to="/student-plus" variant="light">
            Discover Student Plus
          </ButtonLink>
        </div>
        <div className="plus-art">
          <div className="fabric-orbit orbit-one" />
          <div className="fabric-orbit orbit-two" />
          <div className="membership-card">
            <div className="membership-brand">
              <span>fresh fold.</span>
              <Sparkles size={27} />
            </div>
            <div>
              <small>MADE FOR A LIGHTER LOAD</small>
              <h3>
                Student Plus<span>+</span>
              </h3>
            </div>
            <div className="membership-card-bottom">
              <span>Your campus companion.</span>
              <span>MEMBER</span>
            </div>
          </div>
          <div className="plus-price">
            {money(
              config?.plans.find((p: any) => p.id === "student-plus")?.price ||
                2500,
            )}
            <span>/ 30 days</span>
          </div>
        </div>
      </section>
      <section className="section container business-section">
        <div className="business-image">
          <img
            src="/images/laundry-folding.webp"
            alt="Fresh linen being prepared with care"
            width="1000"
            height="750"
            loading="lazy"
          />
          <span className="photo-tag">Good laundry deserves to be found.</span>
        </div>
        <div className="business-copy">
          <p className="eyebrow">FOR THE PEOPLE BEHIND THE FRESHNESS</p>
          <h2>
            You do the care.
            <br /> We’ll help you grow.
          </h2>
          <p>
            Bring your laundry business closer to campus life. Build your
            profile, manage orders, and keep your business moving with Fresh
            Fold.
          </p>
          <div className="business-benefits">
            <span>
              <CheckCircle2 size={17} /> Your own service catalogue
            </span>
            <span>
              <CheckCircle2 size={17} /> Bookings, all in one place
            </span>
            <span>
              <CheckCircle2 size={17} /> Clear earnings and records
            </span>
          </div>
          <ButtonLink to="/for-businesses">Let’s grow your laundry</ButtonLink>
        </div>
      </section>
      <section className="section faq-section">
        <div className="container faq-grid">
          <div>
            <p className="eyebrow">A FEW THINGS, UNFOLDED</p>
            <h2>
              A little clarity
              <br /> before you book.
            </h2>
            <p>Still have something on your mind?</p>
            <Link className="text-link" to="/help">
              Visit the help centre
            </Link>
          </div>
          <div className="faq-list">
            <FAQ />
          </div>
        </div>
      </section>
      <section className="closing-cta container">
        <span className="round-icon">
          <Leaf size={24} />
        </span>
        <h2>Your next fresh start is right here.</h2>
        <p>Find laundry care that fits your campus life.</p>
        <ButtonLink to="/find-laundry">Find your laundry</ButtonLink>
      </section>
    </>
  );
}
export function FAQ() {
  const faqs = [
    [
      "How does Fresh Fold work?",
      "Fresh Fold helps you discover and book an independent laundry company. Choose services, reserve a collection or drop-off window, review your price, and pay. The company named on your order fulfils the laundry service.",
    ],
    [
      "Do I need a subscription to book?",
      "No. Browsing, comparison, standard booking, order updates, receipts, and support are available on a free account. Student Plus adds optional conveniences.",
    ],
    [
      "Can my laundry be collected from my hall?",
      "Select your service area and check the company’s collection options. Availability depends on the company, your address, and the collection windows shown during booking.",
    ],
    [
      "What happens if something goes wrong?",
      "Open a support case from the order. Your instructions, status history, messages, and any evidence help the company and platform support team review the issue. You can follow confirmed refunds from your order.",
    ],
  ];
  return (
    <>
      {faqs.map(([title, text]) => (
        <details key={title}>
          <summary>
            {title}
            <Plus size={18} />
          </summary>
          <p>{text}</p>
        </details>
      ))}
    </>
  );
}

export function FindLaundry() {
  const { config } = useApp();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = params.toString();
  const data = useData(
    `companies?${search}`,
    `companies?${search}`,
    true,
    true,
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  };
  return (
    <div className="container discovery-page">
      <div className="discovery-top">
        <div>
          <p className="eyebrow">FRESH CARE, AROUND YOUR CORNER</p>
          <h1>Find your kind of fresh.</h1>
          <p>
            Local laundry care that fits your week. Compare, choose, and make it
            yours.
          </p>
        </div>
        <span className="area-pill">
          <MapPin size={16} /> Cape Coast · UCC area
        </span>
      </div>
      <section className="discovery-photo-band" data-reveal>
        <div className="discovery-photo-copy">
          <h2>Find the right hands for what’s in your basket.</h2>
          <p>
            Compare the care, check the details, and choose a laundry that fits
            your week.
          </p>
        </div>
        <div className="discovery-photo-image">
          <img
            src="/images/washer-detail.webp"
            alt="A blue washing-machine door and control panel"
            width="900"
            height="600"
          />
        </div>
      </section>
      <div className="discovery-search">
        <div className="search-input">
          <Search size={20} />
          <input
            aria-label="Search laundry companies"
            placeholder="Search by laundry name…"
            value={params.get("q") || ""}
            onChange={(e) => update("q", e.target.value)}
          />
        </div>
        <div className="location-filter">
          <MapPin size={19} />
          <Select
            aria-label="Laundry location"
            value={params.get("area") || ""}
            onChange={(e) => update("area", e.target.value)}
          >
            <option value="">All campus areas</option>
            {config?.areas.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          className="mobile-only"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={18} /> Filters
        </Button>
      </div>
      <div className="discovery-layout">
        <aside
          className={`filter-sidebar ${filtersOpen ? "filters-open" : ""}`}
        >
          <div className="filter-title">
            <h2>Make it your fit.</h2>
            <button className="text-link" onClick={() => setParams({})}>
              Reset
            </button>
          </div>
          <FilterGroup title="Laundry care">
            <div className="filter-options">
              {[
                ["", "All services"],
                ["wash-fold", "Wash & fold"],
                ["ironing", "Press & iron"],
                ["bedding", "Bedding & linen"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="service-filter"
                    checked={(params.get("service") || "") === value}
                    onChange={() => update("service", value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup title="Collection">
            <label className="check-label">
              <input
                type="checkbox"
                checked={params.get("pickup") === "true"}
                onChange={(e) =>
                  update("pickup", e.target.checked ? "true" : "")
                }
              />{" "}
              Collection available
            </label>
          </FilterGroup>
          <FilterGroup title="Turnaround">
            <Select
              aria-label="Maximum turnaround"
              value={params.get("turnaround") || ""}
              onChange={(e) => update("turnaround", e.target.value)}
            >
              <option value="">Any turnaround</option>
              <option value="24">Within 24 hours</option>
              <option value="48">Within 48 hours</option>
              <option value="72">Within 72 hours</option>
            </Select>
          </FilterGroup>
          <FilterGroup title="Starting price">
            <Select
              aria-label="Maximum starting price"
              value={params.get("maxPrice") || ""}
              onChange={(e) => update("maxPrice", e.target.value)}
            >
              <option value="">Any price</option>
              <option value="1000">Up to GHS 10</option>
              <option value="2000">Up to GHS 20</option>
              <option value="3000">Up to GHS 30</option>
            </Select>
          </FilterGroup>
          <FilterGroup title="Availability">
            <label className="check-label">
              <input
                type="checkbox"
                checked={params.get("available") === "true"}
                onChange={(e) =>
                  update("available", e.target.checked ? "true" : "")
                }
              />{" "}
              Upcoming slots available
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={params.get("open") === "true"}
                onChange={(e) => update("open", e.target.checked ? "true" : "")}
              />{" "}
              Open now
            </label>
          </FilterGroup>
        </aside>
        <div className="results" aria-busy={data.isFetching}>
          <div className="results-bar">
            <p aria-live="polite" aria-atomic="true">
              <strong>
                {data.data?.total ?? "…"}{" "}
                {data.data?.total === 1 ? "laundry" : "laundries"}
              </strong>
            </p>
            <Select
              aria-label="Sort laundries"
              value={params.get("sort") || "recommended"}
              onChange={(e) => update("sort", e.target.value)}
            >
              <option value="recommended">Recommended</option>
              <option value="price">Starting price: low to high</option>
              <option value="fastest">Fastest turnaround</option>
              <option value="rating">Customer rating</option>
            </Select>
          </div>
          {data.isLoading ? (
            <Loading />
          ) : data.isError ? (
            <ErrorState error={data.error} retry={() => void data.refetch()} />
          ) : data.data?.companies.length ? (
            <div className="company-grid results-grid">
              {data.data.companies.map((c: any) => (
                <CompanyCard key={c.id} company={c} />
              ))}
            </div>
          ) : (
            <Empty
              title="A little too specific?"
              text="No laundries match this combination. Try a nearby area or clear a filter."
              action={
                <Button variant="secondary" onClick={() => setParams({})}>
                  Clear filters
                </Button>
              }
            />
          )}
          {data.data?.pages > 1 && (
            <div className="pagination">
              {Array.from({ length: data.data.pages }, (_, i) => (
                <Button
                  key={i}
                  variant={
                    Number(params.get("page") || 1) === i + 1
                      ? "primary"
                      : "secondary"
                  }
                  onClick={() => {
                    const n = new URLSearchParams(window.location.search);
                    n.set("page", String(i + 1));
                    setParams(n);
                  }}
                >
                  Page {i + 1}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="filter-group">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function CompanyProfile() {
  const { slug } = useParams();
  const data = useData(`company-${slug}`, `companies/${slug}`);
  const { user, compare, toggleCompare } = useApp();
  const { run } = useAction();
  const [verification, setVerification] = useState(false);
  if (data.isLoading) return <Loading />;
  if (data.isError)
    return (
      <div className="container section">
        <ErrorState error={data.error} />
      </div>
    );
  const c = data.data;
  return (
    <div className="container profile-page">
      <div className="breadcrumbs">
        <Link to="/find-laundry">Find laundry</Link>
        <span>/</span>
        <span>{c.name}</span>
      </div>
      <div className="profile-cover">
        <img
          src={c.coverPhoto || c.photo}
          alt={`Laundry care for ${c.name}`}
          width="1600"
          height="600"
        />
        <div className="profile-cover-overlay" />
      </div>
      <div className="profile-overview">
        <div>
          <div className="profile-kicker">
            <span className="business-monogram">
              {c.name
                .split(" ")
                .map((s: string) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="eyebrow">CAREFULLY CHOSEN, CLOSE TO CAMPUS</span>
          </div>
          <h1>{c.name}</h1>
          <div className="profile-meta">
            <span>
              <MapPin size={16} />
              {c.location}
            </span>
            {!c.demo && (
              <button onClick={() => setVerification(true)}>
                <ShieldCheck size={16} /> Business application reviewed
              </button>
            )}
            {c.rating && (
              <span className="rating">
                <Star size={15} fill="currentColor" />
                {c.rating.toFixed(1)} · {c.reviewCount} review
              </span>
            )}
          </div>
        </div>
        <div className="profile-actions">
          <Button variant="secondary" onClick={() => toggleCompare(c.id)}>
            {compare.includes(c.id) ? (
              <Check size={17} />
            ) : (
              <Layers3 size={17} />
            )}{" "}
            Compare
          </Button>
          {user && (
            <Button
              variant="secondary"
              aria-label="Save company"
              onClick={() =>
                void run(
                  () => send("favorites", { companyId: c.id }),
                  "Saved laundries updated.",
                )
              }
            >
              <Heart size={18} />
            </Button>
          )}
          <ButtonLink to={`/book/${c.slug}`}>Book your laundry</ButtonLink>
        </div>
      </div>
      <div className="profile-layout">
        <div>
          <Panel title="A little about the care.">
            <p className="body-copy">{c.description}</p>
            <div className="profile-facts">
              <div>
                <Clock3 />
                <strong>{c.turnaroundHours} hours</strong>
                <span>Usual turnaround</span>
              </div>
              <div>
                <Truck />
                <strong>
                  {c.pickup ? "Collection available" : "Drop-off service"}
                </strong>
                <span>
                  {c.deliveryFee
                    ? `${money(c.deliveryFee)} collection fee`
                    : "No collection charge"}
                </span>
              </div>
              <div>
                <Wallet />
                <strong>{money(c.minimum)}</strong>
                <span>Minimum laundry order</span>
              </div>
            </div>
          </Panel>
          <Panel
            title="Fresh care. Clear prices."
            description="Choose what’s in your basket. Full charges are shown before checkout."
          >
            {c.services.map((s: any) => (
              <div className="service-row" key={s.id}>
                <div className="service-row-icon">
                  {s.category === "bedding" ? (
                    <Layers3 />
                  ) : s.category === "ironing" ? (
                    <Sparkles />
                  ) : (
                    <Shirt />
                  )}
                </div>
                <div>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  {s.estimated && (
                    <Badge tone="amber">
                      Estimated weight · approval required for adjustments
                    </Badge>
                  )}
                </div>
                <div className="service-row-price">
                  <strong>{money(s.price)}</strong>
                  <span>per {s.unit}</span>
                </div>
              </div>
            ))}
            <ButtonLink to={`/book/${c.slug}`} className="full-width">
              Choose services & book
            </ButtonLink>
          </Panel>
          <Panel title="Care, without the guesswork.">
            <img
              className="profile-care-photo"
              src="/images/laundry-sorting.webp"
              alt="Shirts and linens prepared for garment care"
              width="900"
              height="500"
              loading="lazy"
            />
            <p className="body-copy">
              Tell the company about special care needs before collection.
              Specialist treatment is only available when explicitly listed.
              Estimated weights are confirmed after collection and changes
              require your approval.
            </p>
            <div className="inline-links">
              <Link to="/care-policy">Care & claims policy</Link>
              <Link to="/refund-policy">Cancellations & refunds</Link>
            </div>
          </Panel>
          <Panel
            title="From the fresh-folded basket."
            description="Experiences shared after completed orders."
          >
            {c.reviews.length ? (
              c.reviews.map((r: any) => (
                <div className="review" key={r.id}>
                  <div className="review-author">
                    <span className="avatar">{r.name[0]}</span>
                    <div>
                      <strong>{r.name}</strong>
                      <span>Completed order · {dateLabel(r.createdAt)}</span>
                    </div>
                    <span className="rating">
                      <Star size={15} fill="currentColor" />
                      {r.rating}
                    </span>
                  </div>
                  <p>{r.text}</p>
                  {r.response && (
                    <blockquote>
                      <strong>Company response</strong>
                      {r.response}
                    </blockquote>
                  )}
                </div>
              ))
            ) : (
              <p>No completed-order reviews yet.</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Fits into your week.">
            <div className="sidebar-stat">
              <CalendarDays size={19} />
              <div>
                <strong>
                  {c.slots.filter((s: any) => s.available > 0).length}{" "}
                  collection windows
                </strong>
                <span>Available in the next seven days</span>
              </div>
            </div>
            <div className="sidebar-stat">
              <MapPin size={19} />
              <div>
                <strong>Serving your neighbourhood</strong>
                <span>{c.areas.map((a: any) => a.name).join(", ")}</span>
              </div>
            </div>
            <h3 className="subheading">Opening hours</h3>
            <div className="hours-list">
              {c.hours.map((h: any) => (
                <div key={h.day}>
                  <span>
                    {
                      [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ][h.day]
                    }
                  </span>
                  <span>
                    {h.open}–{h.close}
                  </span>
                </div>
              ))}
            </div>
            <ButtonLink to={`/book/${c.slug}`} className="full-width">
              Find a collection window
            </ButtonLink>
          </Panel>
          <div className="notice">
            <ShieldCheck size={24} />
            <p>
              Fresh Fold connects you with this company.{" "}
              <strong>{c.name}</strong> fulfils your laundry order.
            </p>
          </div>
        </aside>
      </div>
      {verification && (
        <Modal
          title="What does reviewed mean?"
          onClose={() => setVerification(false)}
        >
          <p className="muted">
            Reviewed {dateLabel(c.verifiedAt)}. Verification cannot be purchased
            and does not guarantee service quality.
          </p>
        </Modal>
      )}
    </div>
  );
}

export function Compare() {
  const { compare, toggleCompare } = useApp();
  const data = useData("comparison-companies", "companies");
  const companies =
    data.data?.companies.filter((c: any) => compare.includes(c.id)) || [];
  return (
    <div className="container section">
      <PageHead
        eyebrow="FIND THE CARE THAT FITS"
        title="A fresh perspective."
        description="Compare practical differences, side by side."
        action={
          <ButtonLink to="/find-laundry" variant="secondary">
            Choose laundries
          </ButtonLink>
        }
      />
      {data.isLoading ? (
        <Loading />
      ) : companies.length ? (
        <div className="comparison-scroll">
          <div
            className="comparison-grid"
            style={{
              gridTemplateColumns: `180px repeat(${companies.length},minmax(240px,1fr))`,
            }}
          >
            <div />
            {companies.map((c: any) => (
              <div className="compare-company" key={c.id}>
                <img src={c.photo} alt={`Laundry care at ${c.name}`} />
                <h2>{c.name}</h2>
                <button
                  className="text-link"
                  onClick={() => toggleCompare(c.id)}
                >
                  Remove
                </button>
              </div>
            ))}
            {[
              ["Location", (c: any) => c.location],
              [
                "Starting price",
                (c: any) => `${money(c.startingPrice)} / ${c.startingUnit}`,
              ],
              ["Turnaround", (c: any) => `${c.turnaroundHours} hours`],
              [
                "Collection",
                (c: any) => (c.pickup ? "Available" : "Drop-off only"),
              ],
              ["Minimum order", (c: any) => money(c.minimum)],
              ["Collection fee", (c: any) => money(c.deliveryFee)],
              [
                "Booking",
                (c: any) =>
                  c.instantBooking
                    ? "Instant booking"
                    : "Company approval first",
              ],
              [
                "Services",
                (c: any) => c.services.map((s: any) => s.name).join(", "),
              ],
              [
                "Customer rating",
                (c: any) =>
                  c.rating
                    ? `${c.rating.toFixed(1)} · ${c.reviewCount} reviews`
                    : "No reviews yet",
              ],
            ].map(([label, render]: any) => (
              <div className="compare-row" key={label}>
                <strong>{label}</strong>
                {companies.map((c: any) => (
                  <div key={c.id}>{render(c)}</div>
                ))}
              </div>
            ))}
            <div />
            {companies.map((c: any) => (
              <div key={c.id}>
                <ButtonLink to={`/laundry/${c.slug}`} className="full-width">
                  View {c.name.split(" ")[0]}
                </ButtonLink>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <img
            className="compare-empty-photo"
            src="/images/linen-shelves.webp"
            alt="Carefully arranged folded linen"
            width="900"
            height="500"
          />
          <Empty
            title="Your fresh match, side by side."
            text="Choose up to three laundries from the discovery page to compare prices, collection, and care."
            action={<ButtonLink to="/find-laundry">Find laundries</ButtonLink>}
          />
        </>
      )}
    </div>
  );
}

export {
  BusinessPricing,
  Contact,
  ContentPage,
  Coverage,
  FixedContent,
  ForBusinesses,
  Help,
  HowItWorks,
  StudentPlus,
} from "./marketing";
