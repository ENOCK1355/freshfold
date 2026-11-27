import {
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  Heart,
  MapPin,
  Mail,
  MessageCircle,
  PackageCheck,
  Search,
  ShieldCheck,
  Shirt,
  Sparkles,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  siteArticles,
  type SiteArticle,
} from "../../../../packages/shared/src/site-content";
import {
  ArticleDocument,
  CheckList,
  CtaBand,
  EditorialHero,
  FaqList,
  PhotoStory,
  SectionIntro,
} from "../components/editorial";
import {
  Button,
  ButtonLink,
  ErrorState,
  Field,
  Loading,
  Panel,
  Select,
  Success,
} from "../components/ui";
import { idempotency, money, send, useAction, useApp, useData } from "../lib";

export function HowItWorks() {
  return (
    <>
      <EditorialHero
        eyebrow="YOUR WEEK, A LITTLE LIGHTER"
        title={
          <>
            From laundry basket
            <br />
            <em>to fresh start.</em>
          </>
        }
        intro="Choose your local laundry. Pick a collection window. Keep your day for the things you would rather be doing."
        image="/images/collection-delivery.webp"
        imageAlt="A bicycle courier ready for a collection journey"
        tone="lime"
      >
        <ButtonLink to="/find-laundry">Find your laundry</ButtonLink>
        <a className="text-link" href="#your-laundry-day">
          See the whole journey
        </a>
      </EditorialHero>
      <section id="your-laundry-day" className="container section">
        <SectionIntro
          eyebrow="FROM FIRST CLICK TO FRESH CLOTHES"
          title="A good laundry day has a simple rhythm."
        >
          Every practical detail, from comparing prices to checking your
          returned basket, has its place.
        </SectionIntro>
        <div className="process-grid">
          {[
            [
              Search,
              "Find your kind of care",
              "Choose your area and compare services, pricing units, collection options, and turnaround. Open a profile to see the company behind the care.",
            ],
            [
              Shirt,
              "Build your basket",
              "Pick services and quantities, add your hall or hostel, and tell the company about anything that needs special attention.",
            ],
            [
              CalendarDays,
              "Make a little room",
              "Choose an available collection or drop-off window. Some companies accept bookings instantly; others review your request first.",
            ],
            [
              Wallet,
              "Check the full price",
              "Review laundry charges, any collection fee, and the convenience fee before payment. An instant booking holds your window for 15 minutes during checkout.",
            ],
            [
              Truck,
              "Follow every fresh step",
              "Your chosen company collects, cares for, and returns your laundry. Keep updates and questions together in the order conversation.",
            ],
            [
              PackageCheck,
              "Enjoy the fresh finish",
              "Check your returned items, then share your delivery confirmation code. Once the order is complete, you can leave an order-linked review.",
            ],
          ].map(([Icon, title, text]: any) => (
            <article key={title} data-reveal>
              <span className="service-icon">
                <Icon size={27} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="sunshine-section">
        <PhotoStory
          image="/images/laundry-basket.webp"
          imageAlt="Garments gathered in a basket before laundry collection"
          eyebrow="A LITTLE PREP GOES A LONG WAY"
          title="Good care starts with a thoughtful basket."
        >
          <p>
            Help your laundry understand what makes your clothes yours. A few
            clear details before collection make the next steps easier.
          </p>
          <CheckList
            items={[
              "Empty pockets and check the care labels.",
              "Separate delicate or specialist items.",
              "Add useful stain, fabric, and drying notes.",
              "Be ready at your chosen place and collection window.",
            ]}
          />
          <ButtonLink to="/help/care" variant="secondary">
            Read the garment care guide
          </ButtonLink>
        </PhotoStory>
      </div>
      <section className="container section faq-editorial" data-reveal>
        <div>
          <p className="eyebrow">A FEW THINGS, UNFOLDED</p>
          <h2>
            Know before
            <br />
            you book.
          </h2>
          <p>Clear answers make for a lighter laundry day.</p>
          <Link className="text-link" to="/help">
            Explore the help centre
          </Link>
        </div>
        <FaqList
          items={[
            [
              "Do I need a membership?",
              "No. A free account includes discovery, comparison, booking, order tracking, receipts, and support. Student Plus is optional.",
            ],
            [
              "Can you collect from my hall or hostel?",
              "Choose your area and check the company’s coverage. Your exact address and the available collection windows are confirmed during booking.",
            ],
            [
              "Who actually cleans my clothes?",
              "The independent laundry company you select handles your garments, collection, and delivery. Its name stays visible on your booking and order.",
            ],
            [
              "What if the weight changes?",
              "Weight-based services start as estimates. The company confirms the weight after collection, and a higher charge needs your approval.",
            ],
            [
              "What happens if something needs attention?",
              "Open a support case from the order. Your instructions, messages, and order timeline give the team the context needed to review it.",
            ],
          ]}
        />
      </section>
      <CtaBand />
    </>
  );
}

export function StudentPlus() {
  const { config, user } = useApp();
  const { run, busy } = useAction();
  const navigate = useNavigate();
  const [orders, setOrders] = useState(6);
  const plan = config?.plans.find((p: any) => p.id === "student-plus");
  const price = plan?.price ?? 2500;
  const fee = config?.rules.convenienceFee ?? 300;
  const saved = orders * fee;
  const purchase = () => {
    if (user?.premium) {
      navigate("/account/billing");
      return;
    }
    if (!user) {
      navigate("/register?redirect=/student-plus");
      return;
    }
    void run(async () => {
      const payment = await send("payments/checkout", {
        kind: "student",
        planId: "student-plus",
        idempotencyKey: idempotency(),
        method: "card",
      });
      navigate(`/checkout/${payment.id}`);
    });
  };
  return (
    <>
      <EditorialHero
        eyebrow="STUDENT PLUS"
        title={
          <>
            A little extra.
            <br />
            <em>A lot more you.</em>
          </>
        }
        intro="Keep the essentials. Add the thoughtful extras. A membership for the routine you want to spend less time organising."
        image="/images/colourful-towels.webp"
        imageAlt="Colourful fresh towels arranged in a wicker basket"
        tone="lime"
      >
        <Button onClick={purchase} busy={busy}>
          {user?.premium ? "Manage your membership" : "Discover your Plus"}
        </Button>
        <span className="hero-price">
          {money(price)} <small>/ 30 days</small>
        </span>
      </EditorialHero>
      <section className="container section">
        <SectionIntro
          eyebrow="YOUR ROUTINE, WITH A FEW LOVELY EXTRAS"
          title="Make your everyday a little easier."
        >
          Plus works alongside the laundry company you choose. Laundry and
          collection charges remain separate.
        </SectionIntro>
        <div className="membership-pricing">
          <div className="plus-benefit-list">
            {[
              [
                Wallet,
                "A lighter checkout",
                `The standard ${money(fee)} convenience fee is waived on eligible orders while your membership is active.`,
              ],
              [
                CalendarDays,
                "A rhythm that works",
                "Save a weekly or fortnightly schedule. Each booking still needs available capacity and your payment authorisation.",
              ],
              [
                Heart,
                "Care that remembers",
                "Keep detergent and garment-care preferences ready for the next basket, with the option to update them each time.",
              ],
              [
                MessageCircle,
                "A little extra support",
                "Get priority platform support for your questions. Collection windows and cleaning speed depend on your chosen company.",
              ],
            ].map(([Icon, title, text]: any) => (
              <div key={title} data-reveal>
                <span className="service-icon">
                  <Icon size={25} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="pricing-card premium-pricing" data-reveal>
            <div className="pricing-card-kicker">
              <span>Fresh Fold</span>
              <Sparkles size={26} />
            </div>
            <h2>Student Plus</h2>
            <div className="plan-price">
              {money(price)}
              <span>/ 30 days</span>
            </div>
            <p>A little less admin. A routine that feels more yours.</p>
            <CheckList
              items={
                plan?.features || [
                  "Standard convenience fee waived",
                  "Recurring booking schedules",
                  "Saved care preferences",
                  "Priority platform support",
                ]
              }
            />
            <Button
              className="full-width"
              variant="light"
              onClick={purchase}
              busy={busy}
            >
              {user?.premium
                ? "Open membership & billing"
                : "Make room for your day"}
            </Button>
            <small>
              This purchase covers 30 days. Automatic renewal is not enabled by
              this checkout. Mobile money renewals need fresh authorisation.
            </small>
          </div>
        </div>
      </section>
      <section className="savings-section">
        <div className="container savings-layout section" data-reveal>
          <div>
            <p className="eyebrow">MAKE IT MAKE SENSE FOR YOU</p>
            <h2>
              A quick look
              <br />
              at the numbers.
            </h2>
            <p>
              Move the slider to see the convenience fees that Plus would waive.
              Choose a plan for the benefits you will actually use.
            </p>
            <label htmlFor="monthly-orders">
              Laundry orders in 30 days <strong>{orders}</strong>
            </label>
            <input
              id="monthly-orders"
              type="range"
              min="0"
              max="20"
              value={orders}
              onChange={(event) => setOrders(Number(event.target.value))}
            />
            <div className="range-labels">
              <span>Occasionally</span>
              <span>A regular routine</span>
            </div>
          </div>
          <div className="savings-card">
            <div>
              <span>Standard convenience fees</span>
              <strong>{money(saved)}</strong>
            </div>
            <div>
              <span>Student Plus for 30 days</span>
              <strong>{money(price)}</strong>
            </div>
            <div className="savings-result">
              <span>
                {saved >= price
                  ? "Fee savings after membership"
                  : "Membership above fee savings"}
              </span>
              <strong>{money(Math.abs(saved - price))}</strong>
            </div>
            <p>
              Based on {money(fee)} per eligible order. Laundry and collection
              charges are excluded. Other Plus benefits are not assigned a cash
              value.
            </p>
          </div>
        </div>
      </section>
      <section className="container section faq-editorial">
        <div data-reveal>
          <p className="eyebrow">GOOD CARE IS FOR EVERYONE</p>
          <h2>
            Free is still
            <br />a fresh start.
          </h2>
          <p>
            Discover, compare, book, track, and get support with a free account.
            Plus is your choice.
          </p>
          <ButtonLink to="/register" variant="secondary">
            Create a free account
          </ButtonLink>
        </div>
        <FaqList
          items={[
            [
              "Will Plus make my laundry faster?",
              "No. Plus does not change the company’s turnaround, reserve collection capacity, or promise faster delivery.",
            ],
            [
              "Do I still pay the laundry company?",
              "Yes. Your laundry charges and any company collection charge still apply. The standard platform convenience fee is the part waived by Plus.",
            ],
            [
              "What happens when my paid period ends?",
              "Your account remains available as a free account. Renew through Membership & billing when you want the Plus benefits again.",
            ],
            [
              "Does a recurring schedule pay automatically?",
              "No. A schedule helps organise your routine. Each booking needs capacity and your payment authorisation.",
            ],
          ]}
        />
      </section>
      <CtaBand />
    </>
  );
}

export function ForBusinesses() {
  return (
    <>
      <EditorialHero
        eyebrow="FOR LOCAL LAUNDRY BUSINESSES"
        title={
          <>
            You do the care.
            <br />
            <em>We help you grow.</em>
          </>
        }
        intro="Bring your business closer to campus life. Give students a clear way to find you, and give your team a better way to manage the work."
        image="/images/laundromat-interior.webp"
        imageAlt="A laundry operator working among commercial washing machines"
        tone="peach"
      >
        <ButtonLink to="/register?type=company">List your laundry</ButtonLink>
        <ButtonLink to="/pricing" variant="secondary">
          Explore business plans
        </ButtonLink>
      </EditorialHero>
      <section className="container section">
        <SectionIntro
          eyebrow="A WORKSPACE THAT WORKS WITH YOU"
          title="Less juggling. More focus on the care."
        >
          Your profile, team, bookings, and records come together, so the next
          step is easier to see.
        </SectionIntro>
        <div className="editorial-feature-grid four">
          {[
            [
              Building2,
              "Be easy to understand",
              "Show your services, pricing units, opening hours, coverage, and collection options on one clear business profile.",
            ],
            [
              PackageCheck,
              "Keep orders moving",
              "Manage requests, collection, garment care, return, and customer conversations from a shared order queue.",
            ],
            [
              Wallet,
              "Know your numbers",
              "See earnings, commission deductions, refunds, and settlement records alongside their source transactions.",
            ],
            [
              Users,
              "Give your team the right access",
              "Choose a plan with the staff capacity you need. Assign permissions that match each person’s responsibilities.",
            ],
          ].map(([Icon, title, text]: any) => (
            <article key={title} data-reveal>
              <span className="service-icon">
                <Icon size={27} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="mint-section">
        <PhotoStory
          image="/images/washer-loading.webp"
          imageAlt="Clothes being loaded into a commercial washing machine"
          eyebrow="YOUR BUSINESS, THOUGHTFULLY PRESENTED"
          title="A good profile does some of the explaining for you."
        >
          <p>
            Help a student understand your care before their first collection.
            Clear information sets expectations and gives every order a better
            starting point.
          </p>
          <CheckList
            items={[
              "Show the work with photographs you have permission to use.",
              "Explain what each service includes and how it is priced.",
              "Set realistic capacity, coverage, and turnaround.",
              "Keep your opening hours and closures up to date.",
            ]}
          />
          <ButtonLink to="/help/business" variant="secondary">
            Read the partner guide
          </ButtonLink>
        </PhotoStory>
      </div>
      <section className="container section">
        <SectionIntro
          eyebrow="YOUR FIRST ORDER STARTS HERE"
          title="A clear path to getting listed."
        >
          Prepare the details once, then keep them working for your business.
        </SectionIntro>
        <ol className="partner-path">
          {[
            [
              "Create your account",
              "Choose a business account and add your location and main service area.",
            ],
            [
              "Build your profile",
              "Add your services, rates, hours, capacity, and application documents.",
            ],
            [
              "Complete review & payment setup",
              "Respond to application questions and arrange your approved settlement details.",
            ],
            [
              "Choose a plan & publish",
              "Pick the workspace that fits your team, check your availability, and go live.",
            ],
          ].map(([title, text]) => (
            <li key={title} data-reveal>
              <Check size={20} />
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="container section faq-editorial">
        <div data-reveal>
          <p className="eyebrow">BEFORE YOU JOIN THE FOLD</p>
          <h2>
            Practical answers
            <br />
            for your business.
          </h2>
          <p>
            Talk to us if you want help choosing a plan or preparing your
            profile.
          </p>
          <ButtonLink to="/contact" variant="secondary">
            Talk to Fresh Fold
          </ButtonLink>
        </div>
        <FaqList
          items={[
            [
              "Does paying for hosting approve my business?",
              "No. Application review and payment-account approval are separate from your hosting plan. Your business needs the required approvals before receiving paid bookings.",
            ],
            [
              "Can my staff manage orders?",
              "Yes. Hosting plans include different staff capacities. Owners assign permissions, while sensitive company and financial settings remain restricted.",
            ],
            [
              "Can I stop bookings on a busy day?",
              "Keep collection capacity and closures up to date in your business workspace so students see windows your team can serve.",
            ],
            [
              "What happens if my plan expires?",
              "New bookings stop, while existing order records and support remain available. Renew the plan and check your listing before taking new work.",
            ],
          ]}
        />
      </section>
      <CtaBand
        business
        title="Good laundry deserves to be found."
        text="Bring your services, team, and next chapter into one place."
      />
    </>
  );
}

export function BusinessPricing() {
  const { config, user } = useApp();
  const { run, busy } = useAction();
  const navigate = useNavigate();
  const plans =
    config?.plans.filter((plan: any) => plan.kind === "hosting") || [];
  const choose = (plan: any) => {
    if (!user || !user.companyId) {
      navigate("/register?type=company");
      return;
    }
    void run(async () => {
      const payment = await send("payments/checkout", {
        kind: "hosting",
        planId: plan.id,
        companyId: user.companyId,
        idempotencyKey: idempotency(),
      });
      navigate(`/checkout/${payment.id}`);
    });
  };
  return (
    <>
      <EditorialHero
        eyebrow="BUSINESS PLANS"
        title={
          <>
            Good care.
            <br />
            <em>Clear plans.</em>
          </>
        }
        intro="From a focused local laundry to a growing team, choose the workspace that fits the business you are building."
        image="/images/laundromat.webp"
        imageAlt="A bright laundry interior with a row of washing machines"
        tone="peach"
      >
        <a href="#choose-your-plan" className="btn btn-primary">
          Find your fit
        </a>
        <ButtonLink to="/contact" variant="secondary">
          Talk through the options
        </ButtonLink>
      </EditorialHero>
      <section id="choose-your-plan" className="container section">
        <SectionIntro
          eyebrow="ROOM TO GROW AT YOUR PACE"
          title="Your business. Your next step."
        >
          Every plan includes a service catalogue, order tools, and a clear
          place for your business to be discovered.
        </SectionIntro>
        {!config ? (
          <Loading />
        ) : (
          <div className="plans-grid">
            {plans.map((plan: any) => (
              <article
                key={plan.id}
                className={`pricing-card ${plan.id === "growth" ? "plan-featured" : ""}`}
                data-reveal
              >
                {plan.id === "growth" && (
                  <span className="plan-ribbon">For your next chapter</span>
                )}
                <h2>{plan.name.replace("Company ", "")}</h2>
                <div className="plan-price">
                  {money(plan.price)}
                  <span>/ 30 days</span>
                </div>
                <p>
                  {plan.id === "essential"
                    ? "A clear, focused start."
                    : plan.id === "growth"
                      ? "More room for a growing routine."
                      : "A bigger workspace for a wider reach."}
                </p>
                <CheckList items={plan.features} />
                <Button
                  className="full-width"
                  variant={plan.id === "growth" ? "primary" : "secondary"}
                  onClick={() => choose(plan)}
                  busy={busy}
                >
                  Choose {plan.name.replace("Company ", "")}
                </Button>
              </article>
            ))}
          </div>
        )}
        <div className="pricing-footnote">
          <ShieldCheck size={25} />
          <p>
            Transaction commission is{" "}
            {((config?.rules.commissionBps ?? 1200) / 100).toFixed(0)}% of
            eligible laundry charges. Hosting is separate. Application review
            and payment-account approval are required for paid bookings.
          </p>
        </div>
      </section>
      <div className="mint-section">
        <section className="container section" data-reveal>
          <SectionIntro
            eyebrow="KNOW WHAT YOU ARE CHOOSING"
            title="The details that make a difference."
          >
            Pick for the people and places you manage today. You can review your
            plan as the business changes.
          </SectionIntro>
          <div className="plan-comparison-wrap">
            <table className="plan-comparison">
              <caption>Hosting plan capacity and included services</caption>
              <thead>
                <tr>
                  <th scope="col">Your workspace</th>
                  {plans.map((plan: any) => (
                    <th scope="col" key={plan.id}>
                      {plan.name.replace("Company ", "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Staff seats", (plan: any) => plan.staffSeats],
                  ["Branches", (plan: any) => plan.branches],
                  ["Service catalogue & orders", () => "Included"],
                  ["Customer conversations", () => "Included"],
                  ["Earnings & transaction records", () => "Included"],
                ].map(([label, value]: any) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {plans.map((plan: any) => (
                      <td key={plan.id}>{value(plan)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="container section faq-editorial">
        <div data-reveal>
          <p className="eyebrow">SIMPLE PLANS, CLEAR EXPECTATIONS</p>
          <h2>
            A little clarity
            <br />
            before you choose.
          </h2>
          <p>
            Plan features support your workspace. Good care and accurate company
            information remain at the heart of your listing.
          </p>
        </div>
        <FaqList
          items={[
            [
              "Is commission included in hosting?",
              "No. Hosting pays for the workspace and plan features. Transaction commission applies separately to eligible laundry charges.",
            ],
            [
              "Does a plan guarantee bookings?",
              "No. Students choose among available companies. Keep your profile, services, pricing, and collection availability clear and up to date.",
            ],
            [
              "What happens to existing orders when a plan ends?",
              "Existing orders, records, and support remain available. An expired plan stops new bookings until hosting is active again.",
            ],
            [
              "Is business verification included in the price?",
              "Verification cannot be purchased. The application and payment-account review are separate requirements.",
            ],
          ]}
        />
      </section>
      <CtaBand business />
    </>
  );
}

function PublicArticle({ slug }: { slug: string }) {
  const data = useData(
    `content-${slug}`,
    `content/${encodeURIComponent(slug)}`,
  );
  const fallback = siteArticles[slug];
  if (!fallback && data.isLoading) return <Loading />;
  if (!fallback && data.isError)
    return (
      <div className="container section">
        <ErrorState error={data.error} />
      </div>
    );
  const article: SiteArticle = fallback || {
    slug,
    title: data.data.title,
    eyebrow: "FRESH FOLD HELP CENTRE",
    category: "Help centre",
    intro: "Practical information for your next laundry day.",
    image: "/images/linen-shelves.webp",
    imageAlt: "Carefully arranged clean linen",
    sections: [],
  };
  return <ArticleDocument article={article} stored={data.data} />;
}
export function FixedContent({ slug }: { slug: string }) {
  return <PublicArticle slug={slug} />;
}
export function ContentPage() {
  const { article } = useParams();
  return <PublicArticle slug={`help/${article}`} />;
}

export function Help() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All guides");
  const data = useData("help-content", "content");
  const articles = Object.values(siteArticles).filter((article) =>
    article.slug.startsWith("help/"),
  );
  const custom =
    data.data
      ?.filter(
        (page: any) =>
          page.slug.startsWith("help/") && !siteArticles[page.slug],
      )
      .map((page: any) => ({
        slug: page.slug,
        title: page.title,
        intro: (
          page.body || "Practical information from the Fresh Fold team."
        ).split("\n\n")[0],
        category: "More help",
        image: "/images/linen-shelves.webp",
      })) || [];
  const all = [...articles, ...custom];
  const categories = [
    "All guides",
    ...new Set(all.map((article) => article.category)),
  ] as string[];
  const matches = all.filter(
    (article) =>
      (category === "All guides" || category === article.category) &&
      `${article.title} ${article.intro} ${article.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <EditorialHero
        eyebrow="THE FRESH FOLD HELP CENTRE"
        title={
          <>
            A little help.
            <br />
            <em>A clearer day.</em>
          </>
        }
        intro="Find the practical answer, understand your next step, and get back to the rest of your week."
        image="/images/laundry-room.webp"
        imageAlt="A bright and organised laundry room"
        tone="blue"
      >
        <div className="search-input help-search">
          <Search size={21} />
          <input
            placeholder="Search booking, payments, care…"
            aria-label="Search help articles"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </EditorialHero>
      <section className="container section">
        <div className="help-category-tabs" aria-label="Filter help guides">
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="help-result-count" role="status">
          {matches.length} {matches.length === 1 ? "guide" : "guides"}
          {query ? ` for “${query}”` : " to make things easier"}
        </p>
        <div className="guide-grid">
          {matches.map((article) => (
            <Link
              to={`/${article.slug}`}
              className="guide-card"
              key={article.slug}
              data-reveal
            >
              <div className="guide-photo">
                <img
                  src={article.image}
                  alt=""
                  width="700"
                  height="430"
                  loading="lazy"
                />
              </div>
              <div>
                <span className="guide-category">{article.category}</span>
                <h2>{article.title}</h2>
                <p>{article.intro}</p>
                <span className="text-link">Read the guide</span>
              </div>
            </Link>
          ))}
        </div>
        {!matches.length && (
          <div className="help-no-results">
            <Search size={34} />
            <h2>Let’s try a different word.</h2>
            <p>Try “booking”, “payment”, “care”, or browse every guide.</p>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setCategory("All guides");
              }}
            >
              Show all guides
            </Button>
          </div>
        )}
      </section>
      <section className="container support-band" data-reveal>
        <span className="service-icon">
          <MessageCircle size={28} />
        </span>
        <div>
          <h2>Could use a human hand?</h2>
          <p>
            For a general question, talk to us. For an existing booking, keep
            support linked to the order.
          </p>
        </div>
        <ButtonLink to="/contact">Contact support</ButtonLink>
      </section>
      <CtaBand />
    </>
  );
}

export function Contact() {
  const { config, user } = useApp();
  const { run, busy } = useAction();
  const [success, setSuccess] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") || "").trim();
    void run(async () => {
      const result = await send("contact", {
        name: form.get("name"),
        subject: `${form.get("topic")}: ${form.get("subject")}`,
        body: `${phone ? `Reply on WhatsApp: ${phone}\n\n` : ""}${form.get("body")}`,
        category: "general",
      });
      setSuccess(result.reference);
    });
  };
  return (
    <>
      <section className="container section contact-page-grid">
        <div className="contact-story">
          <p className="eyebrow">LET’S TALK IT THROUGH</p>
          <h1>
            A little help.
            <br />
            <em>A human touch.</em>
          </h1>
          <p className="editorial-lead">
            Your next laundry day, a booking question, or a new business idea.
            We’re here to help you find the next step.
          </p>
          <a
            className="contact-whatsapp"
            href={`https://wa.me/${config?.whatsapp || "233551234987"}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="service-icon">
              <MessageCircle size={27} />
            </span>
            <div>
              <strong>Talk on WhatsApp</strong>
              <span>+{config?.whatsapp || "233551234987"}</span>
            </div>
          </a>
          {config?.companyEmail && !config.companyEmail.endsWith(".test") && (
            <a
              className="contact-whatsapp"
              href={`mailto:${config.companyEmail}`}
            >
              <span className="service-icon">
                <Mail size={27} />
              </span>
              <div>
                <strong>Email Fresh Fold</strong>
                <span>{config.companyEmail}</span>
              </div>
            </a>
          )}
          <div className="contact-editorial-photo">
            <img
              src="/images/laundry-care.webp"
              alt="Clean linen prepared with care"
              width="900"
              height="600"
            />
          </div>
          <div className="contact-location-note">
            <MapPin size={20} />
            <p>
              Made for campus life around UCC and the surrounding communities in
              Cape Coast.
            </p>
          </div>
        </div>
        <Panel
          title="What’s on your mind?"
          description="Share a little context so your message reaches the right conversation."
        >
          {success ? (
            <Success title="Your message is with us.">
              <p>
                Your reference is <strong>{success}</strong>. Keep it handy when
                you follow up. For a direct conversation, you can also reach us
                on WhatsApp.
              </p>
              <Button onClick={() => setSuccess("")} variant="secondary">
                Send another message
              </Button>
            </Success>
          ) : (
            <form className="form-stack" onSubmit={submit}>
              <Field label="Your name">
                <input
                  name="name"
                  defaultValue={user?.name}
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="How should we address you?"
                  autoComplete="name"
                />
              </Field>
              <Field
                label="WhatsApp number"
                hint="Include a number if you would like a reply on WhatsApp."
              >
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  placeholder="Your number, with country code"
                />
              </Field>
              <Field label="What can we help with?">
                <Select name="topic">
                  <option>General question</option>
                  <option>Booking & collection</option>
                  <option>Payment & refund</option>
                  <option>Student Plus</option>
                  <option>Business partnership</option>
                </Select>
              </Field>
              <Field label="Subject">
                <input
                  name="subject"
                  required
                  minLength={5}
                  maxLength={150}
                  placeholder="A little context helps"
                />
              </Field>
              <Field label="Your message">
                <textarea
                  name="body"
                  required
                  minLength={10}
                  maxLength={3800}
                  rows={6}
                  placeholder="Tell us what you need a hand with…"
                />
              </Field>
              <Button type="submit" busy={busy} className="full-width">
                Send your message
              </Button>
              <p className="muted small">
                We use these details to handle your request. Read our{" "}
                <Link to="/privacy">privacy policy</Link>. Keep card details and
                payment PINs out of your message.
              </p>
            </form>
          )}
        </Panel>
      </section>
      <section className="container support-options">
        <Link to="/account/support" data-reveal>
          <PackageCheck size={28} />
          <h2>Help with an order</h2>
          <p>
            Open a case from your booking so the team can see its payments,
            messages, and care history.
          </p>
          <span className="text-link">Go to your support cases</span>
        </Link>
        <Link to="/help" data-reveal>
          <BookOpen size={28} />
          <h2>A quick, practical answer</h2>
          <p>
            Explore guides for your first booking, garment care, checkout,
            membership, and account.
          </p>
          <span className="text-link">Browse the help centre</span>
        </Link>
        <Link to="/for-businesses" data-reveal>
          <Building2 size={28} />
          <h2>Bring your business to campus</h2>
          <p>
            See how to prepare a profile, choose a plan, and organise your next
            chapter.
          </p>
          <span className="text-link">Explore becoming a partner</span>
        </Link>
      </section>
      <CtaBand />
    </>
  );
}

const localAreas = [
  { id: "amamoma", name: "Amamoma" },
  { id: "kwaprow", name: "Kwaprow" },
  { id: "ucc-science", name: "UCC Science" },
  { id: "ayensu", name: "Ayensu" },
  { id: "apewosika", name: "Apewosika" },
  { id: "diaspora", name: "Diaspora halls" },
];
const areaCopy: Record<string, string> = {
  amamoma:
    "Laundry care for your weekday routine, with collection options around your hall or hostel.",
  kwaprow:
    "Find nearby services and choose a window that works around lectures and the rest of your day.",
  "ucc-science":
    "Keep laundry off the study timetable. Compare companies serving your campus address.",
  ayensu:
    "Explore wash-and-fold, bedding, and garment care options for your next basket.",
  apewosika:
    "Check the local care options, collection coverage, and prices before you book.",
  diaspora:
    "Make collection easier with your hall, room, entrance, and a useful landmark.",
};
export function Coverage() {
  const { config } = useApp();
  const companies = useData("coverage-companies", "companies");
  const areas = config?.areas || localAreas;
  return (
    <>
      <EditorialHero
        eyebrow="GOOD CARE, CLOSE TO CAMPUS"
        title={
          <>
            Around campus.
            <br />
            <em>Around you.</em>
          </>
        }
        intro="Your laundry day should fit where you live. Explore the communities around UCC, then find the companies and collection windows that work for you."
        image="/images/sunlit-laundry.webp"
        imageAlt="Freshly washed garments hanging in the sunlight"
        tone="lime"
      >
        <a className="btn btn-primary" href="#service-areas">
          Explore service areas
        </a>
        <ButtonLink to="/find-laundry" variant="secondary">
          Find laundry
        </ButtonLink>
      </EditorialHero>
      <section id="service-areas" className="container section">
        <SectionIntro
          eyebrow="CAPE COAST, WITH CARE"
          title="Find your corner of fresh."
        >
          Choose an area to compare services. Exact collection availability
          depends on your address, chosen company, and available windows.
        </SectionIntro>
        <div className="area-card-grid">
          {areas.map((area: any) => {
            const count = companies.data?.areaCounts[area.id] || 0;
            return (
              <Link
                key={area.id}
                to={`/find-laundry?area=${area.id}`}
                className="area-card"
                data-reveal
              >
                <span className="service-icon">
                  <MapPin size={26} />
                </span>
                <h2>{area.name}</h2>
                <p>
                  {areaCopy[area.id] ||
                    "Discover local laundry care, compare service details, and check collection options for your address."}
                </p>
                <span className="area-availability">
                  {count
                    ? `${count} ${count === 1 ? "laundry" : "laundries"} to explore`
                    : "No laundries currently listed"}
                </span>
                <span className="text-link">Explore {area.name}</span>
              </Link>
            );
          })}
        </div>
      </section>
      <div className="mint-section">
        <PhotoStory
          image="/images/laundry-ready.webp"
          imageAlt="Linens being carried through a laundry facility"
          eyebrow="A SMOOTHER COLLECTION STARTS HERE"
          title="A good address makes all the difference."
        >
          <p>
            A few useful details help your chosen company find the right
            entrance and make the handover easier.
          </p>
          <CheckList
            items={[
              "Select your community and the correct hall or hostel.",
              "Include your room, entrance, and a helpful landmark.",
              "Check that you can be reached during the collection window.",
              "Save the address for the next laundry day.",
            ]}
          />
          <ButtonLink to="/help/collections" variant="secondary">
            Read the collection guide
          </ButtonLink>
        </PhotoStory>
      </div>
      <section className="container section faq-editorial">
        <div data-reveal>
          <p className="eyebrow">LET’S FIND YOUR FRESH START</p>
          <h2>
            Not sure about
            <br />
            your location?
          </h2>
          <p>
            Compare the coverage on company profiles, or talk to us before
            booking.
          </p>
          <ButtonLink to="/contact" variant="secondary">
            Ask about your area
          </ButtonLink>
        </div>
        <FaqList
          items={[
            [
              "Does every company cover every listed area?",
              "No. Choose an area to find laundries based there. Each company sets its own collection coverage, which you can check on its profile and during booking.",
            ],
            [
              "What if there are no collection windows?",
              "Try another date or company, check whether drop-off is offered, or contact the company before placing a booking.",
            ],
            [
              "Can I save more than one address?",
              "Yes. Use My addresses in your account to keep the places you book from. Choose and check the correct one for each order.",
            ],
          ]}
        />
      </section>
      <CtaBand />
    </>
  );
}
