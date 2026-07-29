import Link from "next/link";
import { PROPERTY } from "@/lib/config";

/**
 * Sadhrana Bagh logo + title bar for staff/admin portals.
 */
export default function BrandHeader({
  title,
  subtitle,
  right = null,
  homeHref = "/",
}) {
  return (
    <header className="topbar no-print brand-header">
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <Link href={homeHref} style={{ flexShrink: 0, lineHeight: 0 }}>
          <img
            src="/logo.png"
            alt={PROPERTY.tradeName || PROPERTY.name}
            width={48}
            height={48}
            style={{
              width: 48,
              height: 48,
              objectFit: "contain",
              borderRadius: "50%",
              background: "#fff",
              border: "1px solid var(--line)",
            }}
          />
        </Link>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--green)",
            }}
          >
            {PROPERTY.tradeName || PROPERTY.name}
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.05rem" }}>{title}</h1>
          {subtitle ? <p className="sub">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{right}</div> : null}
    </header>
  );
}
