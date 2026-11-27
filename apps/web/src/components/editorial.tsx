import {
  Check,
  Heart,
  MapPin,
  MessageCircle,
  Shirt,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  articleBody,
  legacyPublicContent,
  retireCheckoutInstructions,
  type SiteArticle,
} from "../../../../packages/shared/src/site-content";
import { ButtonLink } from "./ui";

export function EditorialHero({
  eyebrow,
  title,
  intro,
  image,
  imageAlt,
  children,
  tone = "mint",
}: {
  eyebrow: string;
  title: ReactNode;
  intro: string;
  image: string;
  imageAlt: string;
  children?: ReactNode;
  tone?: string;
}) {
  return (
    <section className={`editorial-hero editorial-${tone}`}>
      <div className="container editorial-hero-grid">
        <div className="editorial-hero-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="editorial-lead">{intro}</p>
          {children && <div className="button-row">{children}</div>}
        </div>
        <div className="editorial-hero-photo">
          <img
            src={image}
            alt={imageAlt}
            width="1000"
            height="1000"
            fetchPriority="high"
          />
          <span className="photo-corner" aria-hidden="true">
            <Sparkles size={32} strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </section>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="editorial-section-intro" data-reveal>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {children && <p>{children}</p>}
    </div>
  );
}

export function PhotoStory({
  image,
  imageAlt,
  eyebrow,
  title,
  children,
  reverse = false,
}: {
  image: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section
      className={`container section photo-story ${reverse ? "photo-story-reverse" : ""}`}
      data-reveal
    >
      <div className="photo-story-image">
        <img
          src={image}
          alt={imageAlt}
          width="1000"
          height="1000"
          loading="lazy"
        />
      </div>
      <div className="photo-story-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="editorial-checks">
      {items.map((item) => (
        <li key={item}>
          <Check size={18} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function FaqList({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="editorial-faqs">
      {items.map(([question, answer]) => (
        <details key={question}>
          <summary>
            {question}
            <span aria-hidden="true">+</span>
          </summary>
          <div>
            <p>{answer}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({
  title = "A fresh start is closer than you think.",
  text = "Find the laundry care that fits your basket, your area, and your week.",
  business = false,
}: {
  title?: string;
  text?: string;
  business?: boolean;
}) {
  return (
    <section className="container editorial-cta" data-reveal>
      <div>
        <p className="eyebrow">
          {business ? "LET’S GROW YOUR LAUNDRY" : "MAKE ROOM FOR YOUR DAY"}
        </p>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <ButtonLink
        to={business ? "/register?type=company" : "/find-laundry"}
        variant="light"
      >
        {business ? "Create your business profile" : "Find your laundry"}
      </ButtonLink>
    </section>
  );
}

function contentBlocks(body: string) {
  const sections: Array<{
    id: string;
    title: string;
    blocks: Array<{ kind: "paragraph" | "list"; text: string }>;
  }> = [];
  let current = {
    id: "overview",
    title: "Overview",
    blocks: [] as Array<{ kind: "paragraph" | "list"; text: string }>,
  };
  for (const block of body
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (block.startsWith("## ")) {
      if (current.blocks.length) sections.push(current);
      const title = block.slice(3).trim();
      current = {
        id: `section-${sections.length}-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/-$/, "")}`,
        title,
        blocks: [],
      };
    } else
      current.blocks.push({
        kind: block.startsWith("- ") ? "list" : "paragraph",
        text: block,
      });
  }
  if (current.blocks.length) sections.push(current);
  return sections;
}

export function ArticleDocument({
  article,
  stored,
}: {
  article: SiteArticle;
  stored?: { title: string; body: string; updatedAt?: string };
}) {
  const useStored = stored?.body && !legacyPublicContent(stored.body);
  const body = retireCheckoutInstructions(
    useStored ? stored.body : articleBody(article),
  );
  const sections = contentBlocks(body).filter(
    (section) =>
      !(
        section.title === "Overview" &&
        section.blocks.length === 1 &&
        section.blocks[0].text === article.intro
      ),
  );
  const isAbout = article.slug === "about";
  const isGuide = article.slug.startsWith("help/");
  return (
    <>
      <EditorialHero
        eyebrow={article.eyebrow}
        title={
          isAbout && (!useStored || stored.title === article.title) ? (
            <>
              A lighter load.
              <br />A fuller life.
            </>
          ) : useStored ? (
            stored.title
          ) : (
            article.title
          )
        }
        intro={article.intro}
        image={article.image}
        imageAlt={article.imageAlt}
        tone={isAbout ? "lime" : isGuide ? "mint" : "blue"}
      >
        <ButtonLink
          to={isGuide ? "/help" : isAbout ? "/find-laundry" : "/contact"}
          variant="secondary"
        >
          {isGuide
            ? "Explore help centre"
            : isAbout
              ? "Explore local laundry"
              : "Talk to Fresh Fold"}
        </ButtonLink>
      </EditorialHero>
      <div className="container document-layout section">
        <aside className="document-sidebar">
          <nav aria-label="On this page">
            <p className="eyebrow">ON THIS PAGE</p>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
          <div className="document-support">
            <MessageCircle size={25} />
            <h3>A question on your mind?</h3>
            <p>We’re here to help you understand the details.</p>
            <Link className="text-link" to="/contact">
              Talk to our team
            </Link>
          </div>
          {!isAbout && (
            <div className="document-related">
              <p className="eyebrow">USEFUL LINKS</p>
              <Link to="/care-policy">Garment care & claims</Link>
              <Link to="/refund-policy">Cancellations & refunds</Link>
              <Link to="/privacy">Privacy policy</Link>
            </div>
          )}
        </aside>
        <article className="document-copy">
          <div className="document-meta">
            <span>{article.category}</span>
            <span>
              Updated{" "}
              {new Date(
                stored?.updatedAt || "2026-11-24T00:00:00Z",
              ).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Africa/Accra",
              })}
            </span>
          </div>
          {sections.map((section) => (
            <section id={section.id} key={section.id} data-reveal>
              <h2>{section.title}</h2>
              {section.blocks.map((block, i) =>
                block.kind === "list" ? (
                  <ul key={i}>
                    {block.text
                      .split("\n")
                      .filter(Boolean)
                      .map((point) => (
                        <li key={point}>{point.replace(/^-\s*/, "")}</li>
                      ))}
                  </ul>
                ) : (
                  <p key={i}>{block.text}</p>
                ),
              )}
            </section>
          ))}
          <div className="document-end">
            <Shirt size={27} />
            <div>
              <h3>
                {isGuide
                  ? "Ready for your next laundry day?"
                  : "Clear expectations. Thoughtful care."}
              </h3>
              <p>
                {isGuide
                  ? "Keep the guide close, then choose the service that fits your week."
                  : "Keep these details in mind before booking, and reach out whenever you need clarity."}
              </p>
            </div>
          </div>
        </article>
      </div>
      {isAbout && (
        <section className="values-section">
          <div className="container section">
            <SectionIntro
              eyebrow="WHAT MATTERS TO US"
              title="Thoughtful care, in the everyday."
            >
              A useful marketplace is built on the details that make each
              laundry day easier.
            </SectionIntro>
            <div className="editorial-feature-grid">
              {[
                [
                  Heart,
                  "Care feels personal",
                  "The fabric, the preferences, the small instructions. Give your chosen laundry the details that matter to you.",
                ],
                [
                  MapPin,
                  "Local makes sense",
                  "Find care around the communities where you study and live, with coverage you can check before booking.",
                ],
                [
                  Check,
                  "Clarity comes first",
                  "Know who handles your clothes, what the service includes, and what the full basket costs.",
                ],
              ].map(([Icon, title, text]: any) => (
                <article key={title} data-reveal>
                  <span className="service-icon">
                    <Icon size={26} />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
      <CtaBand />
    </>
  );
}
