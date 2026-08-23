"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VILLAS, CATEGORY_LABELS, formatInr, PROPERTY } from "@/lib/config";
import { validateGstin } from "@/lib/gstin";
import BrandHeader from "@/components/BrandHeader";

export default function NewBillPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState([]);
  const [category, setCategory] = useState("all");
  const [villa, setVilla] = useState(VILLAS[0]);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [isB2b, setIsB2b] = useState(false);
  const [buyerCompany, setBuyerCompany] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [advance, setAdvance] = useState("");
  /** Guest settling on the card machine — recovers the bank's fee on top. */
  const [cardFee, setCardFee] = useState(false);
  const [staffList, setStaffList] = useState([]);
  /** Roster name, or "__others__" for free-typed person */
  const [staffPick, setStaffPick] = useState("");
  const [staffOther, setStaffOther] = useState("");
  const [qtyMap, setQtyMap] = useState({});
  const [customDesc, setCustomDesc] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem("sb_staff_name") || "";
    } catch {
      /* ignore */
    }
    fetch("/api/login")
      .then((r) => r.json())
      .then((d) => {
        if (d.name) saved = d.name || saved;
      })
      .catch(() => {})
      .finally(() => {
        fetch("/api/staff")
          .then((r) => r.json())
          .then((d) => {
            const list = d.staff || [];
            setStaffList(list);
            if (saved && list.some((s) => s.name === saved)) {
              setStaffPick(saved);
            } else if (list.length === 1) {
              setStaffPick(list[0].name);
            } else if (saved) {
              // Was a free-typed "other" name last time
              setStaffPick("__others__");
              setStaffOther(saved);
            }
          })
          .catch(() => setStaffList([]));
      });
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setCatalog(d.items || []))
      .catch(() => setCatalog([]));
  }, []);

  const filtered = useMemo(() => {
    if (category === "all") return catalog;
    return catalog.filter((c) => c.category === category);
  }, [catalog, category]);

  function setQty(id, next) {
    setQtyMap((prev) => {
      const n = Math.max(0, next);
      const copy = { ...prev };
      if (n === 0) delete copy[id];
      else copy[id] = n;
      return copy;
    });
  }

  const selectedLines = useMemo(() => {
    const lines = [];
    for (const item of catalog) {
      const qty = qtyMap[item.id];
      if (!qty) continue;
      lines.push({
        catalog_item_id: String(item.id).startsWith("d") ? null : item.id,
        description: item.name,
        category: item.category,
        qty,
        rate_inr: Number(item.rate_inr),
        gst_pct: Number(item.gst_pct || 0),
        hsn_sac: item.hsn_sac || PROPERTY.defaultHsn,
      });
    }
    if (customDesc.trim() && Number(customRate) >= 0 && Number(customQty) > 0) {
      lines.push({
        catalog_item_id: null,
        description: customDesc.trim(),
        category: "other",
        qty: Number(customQty),
        rate_inr: Number(customRate),
        gst_pct: PROPERTY.defaultGstPct ?? 5,
        hsn_sac: PROPERTY.defaultHsn,
      });
    }
    return lines;
  }, [catalog, qtyMap, customDesc, customRate, customQty]);

  const preview = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of selectedLines) {
      const base = l.qty * l.rate_inr;
      subtotal += base;
      tax += (base * (l.gst_pct || 0)) / 100;
    }
    const total = Math.round((subtotal + tax) * 100) / 100;
    // 2.5% of the total AFTER tax, and not taxed itself — it recovers the
    // bank's charge on the swipe rather than paying for a supply.
    const fee = cardFee
      ? Math.round(((total * PROPERTY.cardFeePct) / 100) * 100) / 100
      : 0;
    return {
      subtotal,
      tax,
      total,
      fee,
      // What the guest is charged. `total` stays the invoice/revenue figure.
      payable: Math.round((total + fee) * 100) / 100,
      count: selectedLines.length,
    };
  }, [selectedLines, cardFee]);

  /**
   * Check the GSTIN as it is typed, including the government check digit.
   * Catching a typo here is the whole point: a wrong GSTIN on a printed invoice
   * fails the customer's input-credit claim and comes back to us as a reissue.
   */
  const gstinCheck = useMemo(() => {
    const raw = buyerGstin.trim();
    if (!raw) return { bad: false, message: "" };
    if (raw.length < 15) {
      return { bad: false, message: `${raw.length}/15 characters` };
    }
    const v = validateGstin(raw);
    if (!v.ok) return { bad: true, message: v.error };
    return { bad: false, message: `✓ Valid · ${v.stateName}` };
  }, [buyerGstin]);

  async function createBill() {
    setError("");
    const resolvedStaff =
      staffPick === "__others__"
        ? staffOther.trim()
        : String(staffPick || "").trim();
    if (!resolvedStaff) {
      setError(
        staffPick === "__others__"
          ? "Enter the name of the person creating this bill"
          : "Select which staff is creating this bill"
      );
      return;
    }
    if (!guestName.trim()) {
      setError("Enter guest name");
      return;
    }
    if (selectedLines.length === 0) {
      setError("Add at least one item (tap + on menu)");
      return;
    }
    if (isB2b) {
      if (!buyerCompany.trim()) {
        setError("Company booking: enter the company name to bill to");
        return;
      }
      // Refuse rather than print a GSTIN that would fail the customer's claim.
      const v = validateGstin(buyerGstin);
      if (!v.ok || v.empty) {
        setError(v.empty ? "Company booking: enter the customer GSTIN" : v.error);
        return;
      }
    }
    setSaving(true);
    try {
      try {
        localStorage.setItem("sb_staff_name", resolvedStaff);
      } catch {
        /* ignore */
      }
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villa,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim() || null,
          guest_email: guestEmail.trim() || null,
          invoice_kind: "restaurant",
          buyer_company: isB2b ? buyerCompany.trim() || null : null,
          buyer_gstin: isB2b ? buyerGstin.trim() || null : null,
          buyer_address: isB2b ? buyerAddress.trim() || null : null,
          notes: notes.trim() || null,
          lines: selectedLines,
          created_by: resolvedStaff,
          amount_paid: Number(advance) > 0 ? Number(advance) : 0,
          card_fee: cardFee,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create bill");
        setSaving(false);
        return;
      }

      // Demo bills: stash in sessionStorage so bill page can show them
      if (data.demo || data.bill?.demo) {
        sessionStorage.setItem("demo_bill_" + data.bill.id, JSON.stringify(data.bill));
      }

      // Land on bill with PDF ready — staff can download / share WhatsApp
      router.push(`/bills/${data.bill.id}?created=1`);
    } catch (e) {
      setError(e.message || "Failed");
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <BrandHeader
        title="🍽️ F&B bill"
        subtitle={
          staffPick === "__others__" && staffOther.trim()
            ? `Staff: ${staffOther.trim()}`
            : staffPick && staffPick !== "__others__"
              ? `Staff: ${staffPick}`
              : "Food, drink, massage, bonfire · GST 5%"
        }
        right={
          <Link href="/" className="btn btn-ghost">
            Cancel
          </Link>
        }
      />

      <main className="page" style={{ paddingBottom: 140 }}>
        {error ? <div className="error">{error}</div> : null}

        <div className="card">
          <div className="field">
            <label>Staff creating this bill *</label>
            <select
              value={staffPick}
              onChange={(e) => setStaffPick(e.target.value)}
              required
            >
              <option value="">Select staff…</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                  {s.phone ? ` · ${s.phone}` : ""}
                </option>
              ))}
              <option value="__others__">Others (not on list)…</option>
            </select>
            {staffPick === "__others__" ? (
              <input
                style={{ marginTop: 8 }}
                value={staffOther}
                onChange={(e) => setStaffOther(e.target.value)}
                placeholder="Type their name (e.g. temp staff)"
                autoComplete="name"
              />
            ) : null}
            {staffList.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                No roster yet — choose Others and type a name, or add people under Admin → Staff.
              </p>
            ) : (
              <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                New person not on the list? Choose <strong>Others</strong> and type their name.
              </p>
            )}
          </div>
          <div className="field">
            <label>Villa</label>
            <select value={villa} onChange={(e) => setVilla(e.target.value)}>
              {VILLAS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Guest name</label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="As on booking"
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label>Guest phone (WhatsApp)</label>
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="10-digit mobile"
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>Guest email (optional)</label>
            <input
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="for email invoice"
              type="email"
            />
          </div>
          {/* Corporate booking. Off by default — most guests pay personally and
              a B2C invoice needs none of this. When on, the company becomes
              "Buyer (Bill to)" and its GSTIN is printed on the invoice so the
              customer can claim input credit. */}
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={isB2b}
                onChange={(e) => {
                  setIsB2b(e.target.checked);
                  if (!e.target.checked) {
                    setBuyerCompany("");
                    setBuyerGstin("");
                    setBuyerAddress("");
                  }
                }}
                style={{ width: 18, height: 18 }}
              />
              <span>Company booking — bill to a company with GSTIN</span>
            </label>
          </div>
          {isB2b ? (
            <>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Company name (Buyer — Bill to) *</label>
                <input
                  value={buyerCompany}
                  onChange={(e) => setBuyerCompany(e.target.value)}
                  placeholder="Registered name, as on their GST certificate"
                />
              </div>
              <div className="field">
                <label>Customer GSTIN *</label>
                <input
                  value={buyerGstin}
                  onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
                  placeholder="06AAPFV9671F1ZJ"
                  maxLength={15}
                  style={{
                    textTransform: "uppercase",
                    borderColor: gstinCheck.bad ? "#C2562A" : undefined,
                  }}
                />
                {/* Checked as it is typed, against the government check digit —
                    a wrong GSTIN makes the customer's claim fail. */}
                {gstinCheck.message ? (
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: gstinCheck.bad ? "#C2562A" : "#1F4B43",
                      fontWeight: 600,
                    }}
                  >
                    {gstinCheck.message}
                  </span>
                ) : null}
              </div>
              <div className="field">
                <label>Company address (optional)</label>
                <input
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                  placeholder="Printed under the company name"
                />
              </div>
            </>
          ) : null}
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={cardFee}
                onChange={(e) => setCardFee(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>
                Paying by card — add {PROPERTY.cardFeePct}% card payment fee
              </span>
            </label>
            {cardFee ? (
              <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                {formatInr(preview.fee)} on the post-GST total. Guest pays{" "}
                {formatInr(preview.payable)}. The fee is a bank charge, not a
                taxable supply — no GST is added to it.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label>Advance / amount paid now (₹)</label>
            <input
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Poolside dinner, 4 pax"
            />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <strong>Add items from menu</strong>
          <div className="chip-row" style={{ marginTop: 12 }}>
            {[
              ["all", "All"],
              ["fnb", "F&B"],
              ["experience", "Experiences"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip ${category === key ? "active" : ""}`}
                onClick={() => setCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {catalog.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              Menu is loading or empty. You can still add a <strong>Custom line</strong> below,
              or ask the owner to fill Admin → Menu.
            </p>
          ) : null}

          {filtered.map((item) => {
            const q = qtyMap[item.id] || 0;
            return (
              <div key={item.id} className="item-row">
                <div>
                  <div className="item-name">{item.name}</div>
                  <div className="item-rate">
                    {formatInr(item.rate_inr)}
                    {item.gst_pct ? ` · GST ${item.gst_pct}%` : ""}
                    {item.category ? ` · ${CATEGORY_LABELS[item.category] || item.category}` : ""}
                  </div>
                </div>
                <div className="qty">
                  <button type="button" onClick={() => setQty(item.id, q - 1)} aria-label="Decrease">
                    −
                  </button>
                  <span>{q}</span>
                  <button type="button" onClick={() => setQty(item.id, q + 1)} aria-label="Increase">
                    +
                  </button>
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--line)" }}>
            <strong style={{ fontSize: "0.95rem" }}>Custom line</strong>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Description</label>
              <input
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="Anything not on menu"
              />
            </div>
            <div className="row">
              <div className="field">
                <label>Rate ₹</label>
                <input
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div className="field">
                <label>Qty</label>
                <input
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>

          <div className="totals">
            <div className="line">
              <span>Items</span>
              <span>{preview.count}</span>
            </div>
            <div className="line">
              <span>Subtotal</span>
              <span>{formatInr(preview.subtotal)}</span>
            </div>
            <div className="line">
              <span>Tax</span>
              <span>{formatInr(preview.tax)}</span>
            </div>
            <div className="grand">
              <span>Total</span>
              <span>{formatInr(preview.total)}</span>
            </div>
            {preview.fee > 0 ? (
              <>
                <div className="line">
                  <span>Card fee ({PROPERTY.cardFeePct}%)</span>
                  <span>{formatInr(preview.fee)}</span>
                </div>
                <div className="grand">
                  <span>Guest pays</span>
                  <span>{formatInr(preview.payable)}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </main>

      <div className="fab-bar no-print">
        <button
          className="btn btn-primary"
          type="button"
          onClick={createBill}
          disabled={saving}
        >
          {saving
            ? "Creating invoice…"
            : `Generate tax invoice · ${formatInr(preview.payable)}`}
        </button>
      </div>
    </div>
  );
}
