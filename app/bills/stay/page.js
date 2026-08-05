"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RATE_CARD, formatInr } from "@/lib/config";
import { validateGstin } from "@/lib/gstin";
import BrandHeader from "@/components/BrandHeader";

const VILLA_KEYS = Object.keys(RATE_CARD.villas);

/**
 * Room / stay invoice — SAC 997212 @ 18%.
 *
 * The night-by-night quote is fetched from the server before anything is saved,
 * so the operator sees exactly which nights were charged at which rate. The
 * browser never posts a total; the rate card decides.
 */
export default function StayInvoicePage() {
  const router = useRouter();
  const [villa, setVilla] = useState(VILLA_KEYS[0]);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [extraBeds, setExtraBeds] = useState("0");
  const [peak, setPeak] = useState(false);
  // Munish's own agreed pricing. Real bookings are negotiated, so the rate
  // card is a starting point, not the final word.
  const [nightlyRate, setNightlyRate] = useState("");
  const [totalOverride, setTotalOverride] = useState("");
  const [extraCharges, setExtraCharges] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [advance, setAdvance] = useState("");
  const [notes, setNotes] = useState("");
  const [isB2b, setIsB2b] = useState(false);
  const [buyerCompany, setBuyerCompany] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const gstinCheck = useMemo(() => {
    const raw = buyerGstin.trim();
    if (!raw) return { bad: false, message: "" };
    if (raw.length < 15) return { bad: false, message: `${raw.length}/15 characters` };
    const v = validateGstin(raw);
    if (!v.ok) return { bad: true, message: v.error };
    return { bad: false, message: `✓ Valid · ${v.stateName}` };
  }, [buyerGstin]);

  const loadQuote = useCallback(async () => {
    if (!checkIn || !checkOut) {
      setQuote(null);
      setQuoteErr("");
      return;
    }
    const p = new URLSearchParams({
      villa,
      check_in: checkIn,
      check_out: checkOut,
      extra_beds: String(Number(extraBeds) || 0),
      peak: peak ? "1" : "0",
      nightly_rate: String(Number(nightlyRate) || 0),
      total_override: String(Number(totalOverride) || 0),
      extra_charges: String(Number(extraCharges) || 0),
      extra_note: extraNote,
    });
    try {
      const res = await fetch(`/api/bills/stay?${p}`);
      const d = await res.json();
      if (!res.ok) {
        setQuote(null);
        setQuoteErr(d.error || "Could not price this stay");
        return;
      }
      setQuote(d);
      setQuoteErr("");
    } catch (e) {
      setQuoteErr(e.message || "Could not price this stay");
    }
  }, [villa, checkIn, checkOut, extraBeds, peak, nightlyRate, totalOverride, extraCharges, extraNote]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  async function issue() {
    setError("");
    if (!guestName.trim()) return setError("Enter the guest name");
    if (!checkIn || !checkOut) return setError("Enter check-in and check-out dates");
    if (!quote) return setError(quoteErr || "Price the stay first");
    if (isB2b) {
      if (!buyerCompany.trim()) {
        return setError("Company booking: enter the company name to bill to");
      }
      const v = validateGstin(buyerGstin);
      if (!v.ok || v.empty) {
        return setError(v.empty ? "Company booking: enter the customer GSTIN" : v.error);
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/bills/stay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villa,
          check_in: checkIn,
          check_out: checkOut,
          extra_beds: Number(extraBeds) || 0,
          peak,
          nightly_rate: Number(nightlyRate) || null,
          total_override: Number(totalOverride) || null,
          extra_charges: Number(extraCharges) || 0,
          extra_note: extraNote.trim() || null,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim() || null,
          guest_email: guestEmail.trim() || null,
          notes: notes.trim() || null,
          amount_paid: Number(advance) > 0 ? Number(advance) : 0,
          buyer_company: isB2b ? buyerCompany.trim() || null : null,
          buyer_gstin: isB2b ? buyerGstin.trim() || null : null,
          buyer_address: isB2b ? buyerAddress.trim() || null : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Could not issue the invoice");
        setSaving(false);
        return;
      }
      router.push(`/bills/${d.bill.id}?created=1`);
    } catch (e) {
      setError(e.message || "Failed");
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <BrandHeader
        title="Room / stay invoice"
        subtitle="Accommodation · SAC 997212 · GST 18%"
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
            <label>Villa *</label>
            <select value={villa} onChange={(e) => setVilla(e.target.value)}>
              {VILLA_KEYS.map((k) => (
                <option key={k} value={k}>
                  {RATE_CARD.villas[k].label || k}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Check-in *</label>
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div className="field">
            <label>Check-out *</label>
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>
          <div className="field">
            <label>Extra beds</label>
            <input
              value={extraBeds}
              onChange={(e) => setExtraBeds(e.target.value)}
              inputMode="numeric"
              placeholder="0"
            />
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={peak}
                onChange={(e) => setPeak(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span>Peak-period rate</span>
            </label>
          </div>
        </div>

        {/* Munish's own pricing. The rate card fills the quote by default; these
            override it when a rate was actually agreed with the guest. */}
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 2 }}>Pricing</div>
          <div className="muted" style={{ fontSize: "0.8rem", marginBottom: 10 }}>
            Leave blank to use the rate card. Fill either one if a different price
            was agreed — the rack rate is still recorded for comparison.
          </div>
          <div className="field">
            <label>Agreed rate per night (₹)</label>
            <input
              value={nightlyRate}
              onChange={(e) => setNightlyRate(e.target.value)}
              inputMode="decimal"
              placeholder="blank = rate card"
            />
          </div>
          <div className="field">
            <label>Or agreed total for the stay (₹, before GST)</label>
            <input
              value={totalOverride}
              onChange={(e) => setTotalOverride(e.target.value)}
              inputMode="decimal"
              placeholder="blank = rate card"
            />
          </div>
          <div className="field">
            <label>Other charges (₹)</label>
            <input
              value={extraCharges}
              onChange={(e) => setExtraCharges(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div className="field">
            <label>What are the other charges for?</label>
            <input
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="e.g. bonfire, transport, extra meals"
            />
          </div>
          {nightlyRate && totalOverride ? (
            <div style={{ fontSize: "0.8rem", color: "#C2562A", fontWeight: 600 }}>
              Both filled — the agreed total wins and the per-night rate is ignored.
            </div>
          ) : null}
        </div>

        {/* Night-by-night, so a stay spanning a weekend is visibly priced per
            night rather than nights x one rate. */}
        {quoteErr ? <div className="error">{quoteErr}</div> : null}
        {quote ? (
          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              {quote.nightCount} night{quote.nightCount === 1 ? "" : "s"}
            </div>
            {quote.nights.map((n) => (
              <div
                key={n.date}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.88rem",
                  padding: "3px 0",
                }}
              >
                <span>
                  {n.date}{" "}
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    ({n.kind})
                  </span>
                </span>
                <span>{formatInr(n.rate)}</span>
              </div>
            ))}
            {/* When a rate was negotiated, show what the card said and what is
                actually being charged — the discount goes on the record. */}
            {quote.negotiated ? (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "#FDF3EC",
                  border: "1px solid #E8C4A8",
                  fontSize: "0.84rem",
                }}
              >
                <div>
                  Rate card would be <strong>{formatInr(quote.rackTotal)}</strong>
                </div>
                <div>
                  Charging <strong>{formatInr(quote.roomTotal)}</strong>
                  {quote.discount > 0 ? (
                    <span> · discount {formatInr(quote.discount)}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {quote.extraCharges > 0 ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.88rem",
                  padding: "3px 0",
                }}
              >
                <span>{quote.extraChargesNote || "Other charges"}</span>
                <span>{formatInr(quote.extraCharges)}</span>
              </div>
            ) : null}
            {quote.extraBedTotal > 0 ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.88rem",
                  padding: "3px 0",
                }}
              >
                <span>Extra beds</span>
                <span>{formatInr(quote.extraBedTotal)}</span>
              </div>
            ) : null}
            <hr style={{ border: 0, borderTop: "1px solid #E6E9E3", margin: "8px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Taxable value</span>
              <strong>{formatInr(quote.taxableValue)}</strong>
            </div>
            <div
              style={{ display: "flex", justifyContent: "space-between" }}
              className="muted"
            >
              <span>GST {quote.gstPct}% (CGST 9% + SGST 9%)</span>
              <span>{formatInr(quote.taxTotal)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 800,
                fontSize: "1.05rem",
                marginTop: 4,
              }}
            >
              <span>Grand total</span>
              <span>{formatInr(quote.grandTotal)}</span>
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="field">
            <label>Guest name *</label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="As on booking"
            />
          </div>
          <div className="field">
            <label>Guest phone</label>
            <input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>Guest email (optional)</label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Advance / amount paid now (₹)</label>
            <input
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </div>

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
                  maxLength={15}
                  placeholder="07AABCU9603R1ZP"
                  style={{
                    textTransform: "uppercase",
                    borderColor: gstinCheck.bad ? "#C2562A" : undefined,
                  }}
                />
                {gstinCheck.message ? (
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: gstinCheck.bad ? "#C2562A" : "#1F4B43",
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
                />
              </div>
            </>
          ) : null}

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Booking reference, payment details…"
            />
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={issue}
          disabled={saving || !quote}
          style={{ width: "100%", minHeight: 52, fontSize: "1.05rem" }}
        >
          {saving
            ? "Issuing…"
            : quote
              ? `Issue invoice · ${formatInr(quote.grandTotal)}`
              : "Enter dates to price the stay"}
        </button>
      </main>
    </div>
  );
}
