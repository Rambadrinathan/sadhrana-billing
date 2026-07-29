"use client";

import { useEffect, useState } from "react";
import { formatInr } from "@/lib/config";

/**
 * Shows archived invoice versions + current version for a bill.
 */
export default function VersionHistory({ billId, currentVersion, currentTotal }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!billId || String(billId).startsWith("demo-")) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bills/${billId}/edit`);
        const data = await res.json();
        if (!cancelled) {
          if (!res.ok) setError(data.error || "Could not load history");
          else setVersions(data.versions || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [billId]);

  if (loading) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <strong>Version history</strong>
        <p className="muted" style={{ marginTop: 8 }}>
          Loading…
        </p>
      </div>
    );
  }

  const hasArchive = versions.length > 0;

  return (
    <div className="card no-print" style={{ marginTop: 12 }}>
      <strong>Version history</strong>
      <p className="muted" style={{ fontSize: "0.85rem", margin: "6px 0 12px" }}>
        When an invoice is edited, the previous version is kept so you can see what changed.
      </p>

      {error ? <div className="error">{error}</div> : null}

      {/* Current */}
      <div
        style={{
          padding: "10px 0",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>
            Current · v{currentVersion || 1}
            <span className="badge badge-paid" style={{ marginLeft: 8 }}>
              live
            </span>
          </div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            Final billed amount
          </div>
        </div>
        <div style={{ fontWeight: 800 }}>{formatInr(currentTotal)}</div>
      </div>

      {!hasArchive ? (
        <p className="muted" style={{ marginTop: 12, fontSize: "0.9rem" }}>
          No prior versions yet. Edit this invoice (Telegram <code>/edit</code> or web) to create
          history.
        </p>
      ) : (
        versions.map((v) => {
          const snap = v.snapshot || {};
          const lines = snap.bill_lines || [];
          return (
            <div
              key={v.id}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Archived · v{v.version}</div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    {v.created_at
                      ? new Date(v.created_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })
                      : ""}
                    {v.change_note ? ` · ${v.change_note}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>{formatInr(snap.grand_total)}</div>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    Tax {formatInr(snap.tax_total || 0)}
                  </div>
                </div>
              </div>
              {lines.length > 0 ? (
                <ul
                  style={{
                    margin: "8px 0 0",
                    paddingLeft: 18,
                    fontSize: "0.85rem",
                    color: "var(--ink-muted)",
                  }}
                >
                  {lines.map((l, i) => (
                    <li key={i}>
                      {l.description} × {l.qty} @ ₹{Number(l.rate_inr).toLocaleString("en-IN")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {v.pdf_url ? (
                <a
                  href={v.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost"
                  style={{ minHeight: 34, marginTop: 8, display: "inline-flex" }}
                >
                  Open archived PDF
                </a>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
