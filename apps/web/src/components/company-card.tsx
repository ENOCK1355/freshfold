import { Clock3, Heart, MapPin, Star, Truck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { money, send, useAction, useApp } from "../lib";

export function CompanyCard({ company: c }: { company: any }) {
  const { user, compare, toggleCompare } = useApp();
  const { run } = useAction();
  const navigate = useNavigate();
  return (
    <article className="company-card">
      <Link to={`/laundry/${c.slug}`} className="company-photo">
        <img
          src={c.photo || "/images/folded-towels.webp"}
          srcSet={
            c.photo
              ? `${c.photo.replace(".webp", "-small.webp")} 640w, ${c.photo} 1600w`
              : undefined
          }
          sizes="(max-width:760px) calc(100vw - 40px), (max-width:1190px) 40vw, 400px"
          alt={`Laundry care for ${c.name}`}
          width="640"
          height="420"
          loading="lazy"
        />
        {c.sponsored && <span className="photo-tag sponsored">Sponsored</span>}
      </Link>
      <button
        className="favorite-button"
        aria-label={`Save ${c.name}`}
        onClick={() => {
          if (!user) navigate("/sign-in");
          else
            void run(
              () => send("favorites", { companyId: c.id }),
              "Saved laundries updated.",
            );
        }}
      >
        <Heart size={18} />
      </button>
      <div className="company-card-body">
        <div className="company-title-row">
          <Link to={`/laundry/${c.slug}`}>
            <h3>{c.name}</h3>
          </Link>
          {c.rating && (
            <span className="rating">
              <Star size={14} fill="currentColor" />
              {c.rating.toFixed(1)} <small>({c.reviewCount})</small>
            </span>
          )}
        </div>
        <p className="company-location">
          <MapPin size={13} />
          {c.primaryArea?.name || c.location.split(" · ")[0]} <span>·</span>{" "}
          Cape Coast
        </p>
        <div className="company-tags">
          <span>
            <Clock3 size={14} />
            {c.turnaroundHours}h turnaround
          </span>
          <span>
            {c.pickup ? <Truck size={14} /> : <MapPin size={14} />}{" "}
            {c.pickup ? "Collection available" : "Drop-off"}
          </span>
        </div>
        <div className="company-card-bottom">
          <div className="starting-price">
            <small>From</small>
            <strong>{money(c.startingPrice)}</strong>
            <span> / {c.startingUnit}</span>
          </div>
          <Link to={`/laundry/${c.slug}`} className="btn btn-secondary btn-sm">
            View laundry
          </Link>
        </div>
        <label className="compare-check">
          <input
            type="checkbox"
            checked={compare.includes(c.id)}
            onChange={() => toggleCompare(c.id)}
          />
          <span>Compare laundry</span>
        </label>
      </div>
    </article>
  );
}
