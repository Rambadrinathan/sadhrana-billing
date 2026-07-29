import Link from "next/link";
import { PROPERTY } from "@/lib/config";

/**
 * Sadhrana Bagh logo + title bar for staff/admin portals.
 * Logo is large and always visible (not clipped by flex overflow).
 */
export default function BrandHeader({
  title,
  subtitle,
  right = null,
  homeHref = "/",
}) {
  const brand = PROPERTY.tradeName || PROPERTY.name || "Sadhrana Bagh";

  return (
    <header className="topbar no-print brand-header">
      <div className="brand-header-left">
        <Link href={homeHref} className="brand-logo-link" aria-label={brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt={brand}
            width={56}
            height={56}
            className="brand-logo"
          />
        </Link>
        <div className="brand-header-text">
          <div className="brand-name">{brand}</div>
          <h1>{title}</h1>
          {subtitle ? <p className="sub">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div className="brand-header-right">{right}</div> : null}
    </header>
  );
}
