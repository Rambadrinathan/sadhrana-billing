"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import {
  VILLA_GST_PCT,
  RATE_CARD,
  STAY_OPTIONS,
  estimateStayDeal,
} from "@/lib/config";

const STATUSES = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "quoted", label: "Quoted" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "nurture", label: "Nurture" },
];

const TYPES = [
  ["stay", "Stay (villa nights)"],
  ["event", "Day / event"],
  ["fnb", "F&B only"],
  ["other", "Other"],
];

function emptyForm() {
  return {
    name: "",
    phone: "",
    email: "",
    enquiry_type: "stay",
    preferred_dates: "",
    villa: "Bamboo House",
    check_in: "",
    check_out: "",
    peak_period: false,
    extra_beds_above_5: "",
    extra_beds_5_below: "",
    pax: "",
    adults: "",
    kids: "",
    notes: "",
    status: "new",
    customer_segment: "b2c",
  };
}

/** Live deal preview on the form (client-side, same rack rates as server) */
function liveStayPreview(form) {
  if (form.enquiry_type !== "stay") return null;
  if (!form.check_in || !form.check_out) return null;
  return estimateStayDeal({
    villa: form.villa || "Bamboo House",
    check_in: form.check_in,
    check_out: form.check_out,
    peak_period: form.peak_period === true,
    extra_beds_above_5: Number(form.extra_beds_above_5) || 0,
    extra_beds_5_below: Number(form.extra_beds_5_below) || 0,
  });
}

function formatInr(n) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * If an old lead was pasted as one email blob into `name`,
 * pull out name / email / phone / dates for clean display.
 */
function parseMessyLead(lead) {
  const blob = [lead.name, lead.notes, lead.email, lead.phone]
    .filter(Boolean)
    .join("\n");

  const emailMatch =
    blob.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i) ||
    (lead.email && [lead.email]);
  const phoneMatch =
    blob.match(/(?:\+?\d[\d\s-]{8,}\d)/) ||
    (lead.phone && [lead.phone]);

  let cleanName = String(lead.name || "").trim();
  // "From: Neha Gadi <email>" or "From: Neha Gadi <email> Date:..."
  const fromName = blob.match(/From:\s*([^<\n]+)/i);
  if (fromName) {
    cleanName = fromName[1].trim();
  } else if (cleanName.length > 80 || /Subject:|@|Date:/i.test(cleanName)) {
    // First short line that looks like a person
    const lines = cleanName.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const guess = lines.find(
      (l) => l.length < 40 && !/@/.test(l) && !/Subject:|From:|To:|Date:/i.test(l)
    );
    if (guess) cleanName = guess.replace(/^From:\s*/i, "");
    else if (fromName) cleanName = fromName[1].trim();
    else cleanName = cleanName.slice(0, 40) + (cleanName.length > 40 ? "…" : "");
  }

  // Preferred date hints
  let preferred =
    lead.preferred_dates ||
    blob.match(
      /(?:on|availability on|for)\s+(\d{1,2}(?:st|nd|rd|th)?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{0,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|8th\s*Aug|Aug\s*8)/i
    )?.[1] ||
    "";

  // Notes: strip headers if whole email was dumped
  let notes = lead.notes || "";
  if (!notes && /Wanted to|Good morning|Regards/i.test(blob)) {
    const body = blob
      .replace(/^From:[\s\S]*?Subject:\s*[^\n]*/i, "")
      .replace(/Regards,[\s\S]*$/i, "")
      .trim();
    notes = body.slice(0, 400);
  }

  // Pax
  let pax = lead.pax;
  if (pax == null) {
    const paxM = blob.match(/(\d+)\s*adults?/i);
    const kidsM = blob.match(/(\d+)\s*kids?/i);
    if (paxM) {
      pax = Number(paxM[1]) + (kidsM ? Number(kidsM[1]) : 0);
    }
  }

  return {
    displayName: cleanName || "Guest",
    email: lead.email || (emailMatch && emailMatch[0]) || "",
    phone: lead.phone || (phoneMatch && String(phoneMatch[0]).replace(/\s+/g, " ").trim()) || "",
    preferred_dates: preferred,
    notes,
    pax,
    enquiry_type: lead.enquiry_type || "stay",
    status: lead.status || "new",
    created: lead.created_at,
    raw: lead,
  };
}

function FieldRow({ label, children }) {
  if (children == null || children === "" || children === "—") return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "88px 1fr",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid var(--line)",
        fontSize: "0.9rem",
      }}
    >
      <div
        className="muted"
        style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          paddingTop: 3,
        }}
      >
        {label}
      </div>
      <div style={{ wordBreak: "break-word", lineHeight: 1.4 }}>{children}</div>
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function load(status = filter) {
    const q = status ? `?status=${status}` : "";
    const res = await fetch(`/api/leads${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    setLeads(data.leads || []);
  }

  useEffect(() => {
    load("").catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayLeads = useMemo(
    () => leads.map((l) => ({ lead: l, view: parseMessyLead(l) })),
    [leads]
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          enquiry_type: form.enquiry_type,
          preferred_dates:
            form.preferred_dates.trim() ||
            (form.check_in && form.check_out
              ? `${form.check_in} → ${form.check_out}`
              : null),
          villa: form.villa || null,
          check_in: form.check_in || null,
          check_out: form.check_out || null,
          peak_period: form.peak_period === true,
          extra_beds_above_5: form.extra_beds_above_5
            ? Number(form.extra_beds_above_5)
            : 0,
          extra_beds_5_below: form.extra_beds_5_below
            ? Number(form.extra_beds_5_below)
            : 0,
          pax: form.pax
            ? Number(form.pax)
            : form.adults || form.kids
              ? Number(form.adults || 0) + Number(form.kids || 0)
              : null,
          adults: form.adults ? Number(form.adults) : null,
          kids: form.kids ? Number(form.kids) : null,
          notes: form.notes.trim() || null,
          status: form.status || "new",
          customer_segment: form.customer_segment || "b2c",
          source: "web",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const est =
        data.lead?.deal_value_inr ?? data.lead?.estimated_value_inr;
      setForm(emptyForm());
      setShowForm(false);
      setMsg(
        est
          ? `Enquiry saved · deal value ${formatInr(est)} (${String(data.lead.customer_segment || "").toUpperCase()})`
          : "Enquiry saved."
      );
      await load(filter);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit?.name?.trim()) {
      setMsg("Name is required");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edit.id,
          name: edit.name.trim(),
          phone: edit.phone.trim() || null,
          email: edit.email.trim() || null,
          enquiry_type: edit.enquiry_type,
          preferred_dates: edit.preferred_dates.trim() || null,
          villa: edit.villa || null,
          check_in: edit.check_in || null,
          check_out: edit.check_out || null,
          pax: edit.pax ? Number(edit.pax) : null,
          adults: edit.adults ? Number(edit.adults) : null,
          kids: edit.kids ? Number(edit.kids) : null,
          notes: edit.notes.trim() || null,
          status: edit.status,
          customer_segment: edit.customer_segment || "b2c",
          discount_pct: edit.discount_pct !== "" ? Number(edit.discount_pct) : 0,
          source: edit.source || "web",
          assigned_to: edit.assigned_to || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setEditId(null);
      setEdit(null);
      setMsg("Updated.");
      await load(filter);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id, status) {
    setBusy(true);
    try {
      const lead = leads.find((l) => l.id === id);
      if (!lead) return;
      // Prefer cleaned name if current name is an email dump
      const view = parseMessyLead(lead);
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lead,
          name:
            lead.name && lead.name.length < 60
              ? lead.name
              : view.displayName,
          phone: lead.phone || view.phone || null,
          email: lead.email || view.email || null,
          preferred_dates: lead.preferred_dates || view.preferred_dates || null,
          notes: lead.notes || view.notes || null,
          pax: lead.pax != null ? lead.pax : view.pax,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load(filter);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeLead(id, displayName) {
    const label = displayName || "this enquiry";
    if (
      !confirm(
        `Delete enquiry for ${label}?\n\nThis cannot be undone. You can add the same person again as a new lead.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/leads?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (editId === id) {
        setEditId(null);
        setEdit(null);
      }
      setMsg("Enquiry deleted. You can add it again with + New enquiry.");
      await load(filter);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(lead, view) {
    setEditId(lead.id);
    setEdit({
      id: lead.id,
      name: view.displayName !== "Guest" ? view.displayName : lead.name?.slice(0, 60) || "",
      phone: view.phone || "",
      email: view.email || "",
      enquiry_type: view.enquiry_type || "stay",
      preferred_dates: view.preferred_dates || lead.preferred_dates || "",
      villa: lead.villa || "Bamboo House",
      check_in: lead.check_in ? String(lead.check_in).slice(0, 10) : "",
      check_out: lead.check_out ? String(lead.check_out).slice(0, 10) : "",
      pax: view.pax != null ? String(view.pax) : "",
      adults: lead.adults != null ? String(lead.adults) : "",
      kids: lead.kids != null ? String(lead.kids) : "",
      notes: view.notes || "",
      status: view.status || "new",
      customer_segment: lead.customer_segment === "b2b" ? "b2b" : "b2c",
      discount_pct:
        lead.discount_pct != null ? String(lead.discount_pct) : "0",
      estimated_value_inr:
        lead.estimated_value_inr != null
          ? String(lead.estimated_value_inr)
          : lead.deal_value_inr != null
            ? String(lead.deal_value_inr)
            : "",
      source: lead.source,
      assigned_to: lead.assigned_to,
    });
  }

  async function recomputeLead(lead) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lead,
          id: lead.id,
          // Clear stale overrides so rack re-parses from notes/dates
          force_estimated: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recompute failed");
      setMsg(
        data.lead?.estimated_value_inr != null
          ? `Recomputed · rack ${formatInr(data.lead.estimated_value_inr)}` +
              (data.lead.discount_pct
                ? ` · ${data.lead.discount_pct}% off → ${formatInr(data.lead.quoted_value_inr ?? data.lead.deal_value_inr)}`
                : "")
          : "Recomputed (no rack value — set villa + dates)."
      );
      await load(filter);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDiscount(lead, discountPct) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...lead,
          id: lead.id,
          discount_pct: Number(discountPct) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg(
        `Discount ${Number(discountPct) || 0}% · quoted ${formatInr(
          data.lead?.quoted_value_inr ?? data.lead?.deal_value_inr
        )}`
      );
      await load(filter);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = (id) => TYPES.find(([t]) => t === id)?.[1] || id || "—";

  const pipeline = useMemo(() => {
    const open = leads.filter((l) => !["lost", "won"].includes(l.status));
    const openVal = open.reduce(
      (s, l) =>
        s + Number(l.deal_value_inr || l.estimated_value_inr || 0),
      0
    );
    const wonVal = leads
      .filter((l) => l.status === "won")
      .reduce(
        (s, l) => s + Number(l.deal_value_inr || l.estimated_value_inr || 0),
        0
      );
    return { openCount: open.length, openVal, wonVal };
  }, [leads]);

  const formPreview = useMemo(() => liveStayPreview(form), [form]);

  return (
    <div className="app-shell">
      <BrandHeader
        title="Enquiries"
        subtitle="Clean pipeline · name · phone · email · dates"
        right={
          <Link href="/admin" className="btn btn-ghost">
            Admin
          </Link>
        }
      />
      <main className="page" style={{ paddingBottom: 40 }}>
        {msg ? (
          <p className="muted" style={{ marginBottom: 10 }}>
            {msg}
          </p>
        ) : null}

        <div className="stat-grid" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="label">Open pipeline</div>
            <div className="value" style={{ fontSize: "1.15rem" }}>
              {formatInr(pipeline.openVal)}
            </div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              {pipeline.openCount} open leads
            </div>
          </div>
          <div className="stat">
            <div className="label">Won (listed)</div>
            <div className="value" style={{ fontSize: "1.15rem" }}>
              {formatInr(pipeline.wonVal)}
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            marginBottom: 14,
            background: "var(--green-soft, #e8f5ee)",
            fontSize: "0.82rem",
          }}
        >
          <strong>Domestic rack (CP · breakfast incl.)</strong>
          <div className="muted" style={{ marginTop: 4, fontSize: "0.75rem" }}>
            {RATE_CARD.seasonLabel} · +{RATE_CARD.gstPct}% GST
          </div>
          <div style={{ marginTop: 8, overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ padding: "4px 6px" }}>Villa</th>
                  <th style={{ padding: "4px 6px" }}>Mon–Thu</th>
                  <th style={{ padding: "4px 6px" }}>Fri–Sun</th>
                  <th style={{ padding: "4px 6px" }}>Peak</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(RATE_CARD.villas).map(([name, r]) => (
                  <tr key={name} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "4px 6px", fontWeight: 600 }}>
                      {name}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {" "}
                        ({r.bedrooms}BR)
                      </span>
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      ₹{Number(r.weekday).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      ₹{Number(r.weekend).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      ₹{Number(r.peak).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.75rem" }}>
            Extra bed &gt;5y ₹{RATE_CARD.extraBedAbove5.toLocaleString("en-IN")} · ≤5y ₹
            {RATE_CARD.extraBed5AndBelow.toLocaleString("en-IN")} / night. Deal = sum of
            each night’s band + {RATE_CARD.gstPct}% GST.
          </p>
        </div>

        {/* Status filter */}
        <div className="chip-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={`chip ${!filter ? "active" : ""}`}
            onClick={() => {
              setFilter("");
              load("").catch(() => {});
            }}
          >
            All ({leads.length})
          </button>
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip ${filter === s.id ? "active" : ""}`}
              onClick={() => {
                setFilter(s.id);
                load(s.id).catch(() => {});
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", marginBottom: 14 }}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Hide form" : "+ New enquiry"}
        </button>

        {showForm ? (
          <form className="card" onSubmit={submit} style={{ marginBottom: 14 }}>
            <strong>New enquiry</strong>
            <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 10px" }}>
              Fill separate fields — do not paste a whole email into Name.
            </p>
            <div className="field">
              <label>Guest / contact name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Neha Gadi"
                required
              />
            </div>
            <div className="row">
              <div className="field">
                <label>Mobile</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 …"
                  inputMode="tel"
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@email.com"
                />
              </div>
            </div>
            <div className="field">
              <label>Customer type *</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {[
                  {
                    id: "b2c",
                    title: "B2C",
                    sub: "Family / personal / friends",
                  },
                  {
                    id: "b2b",
                    title: "B2B",
                    sub: "Corporate · company · group · agent",
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, customer_segment: opt.id })
                    }
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border:
                        form.customer_segment === opt.id
                          ? "2px solid var(--green, #1a5c3a)"
                          : "1px solid var(--line)",
                      background:
                        form.customer_segment === opt.id
                          ? "var(--green-soft, #e8f5ee)"
                          : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{opt.title}</div>
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {opt.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Enquiry type</label>
              <select
                value={form.enquiry_type}
                onChange={(e) =>
                  setForm({ ...form, enquiry_type: e.target.value })
                }
              >
                {TYPES.map(([id, lab]) => (
                  <option key={id} value={id}>
                    {lab}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Which villa / stay? *</label>
              <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 8px" }}>
                Four villa types each have their own Mon–Thu / Fri–Sun / Peak rate.
                Or choose <strong>entire property buyout</strong> (sum of all four).
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {STAY_OPTIONS.map((opt) => {
                  const rates =
                    opt.kind === "buyout"
                      ? null
                      : RATE_CARD.villas[opt.id];
                  const buyoutWd =
                    opt.kind === "buyout"
                      ? Object.values(RATE_CARD.villas).reduce(
                          (s, v) => s + Number(v.weekday),
                          0
                        )
                      : 0;
                  const selected = form.villa === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setForm({ ...form, villa: opt.id })}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: selected
                          ? "2px solid var(--green, #1a5c3a)"
                          : "1px solid var(--line)",
                        background: selected
                          ? "var(--green-soft, #e8f5ee)"
                          : opt.kind === "buyout"
                            ? "#fffaf0"
                            : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>
                        {opt.label}
                        {opt.kind === "buyout" ? " 🏠" : ""}
                      </div>
                      {rates ? (
                        <div
                          className="muted"
                          style={{ fontSize: "0.75rem", marginTop: 4 }}
                        >
                          Mon–Thu ₹{Number(rates.weekday).toLocaleString("en-IN")}
                          {" · "}
                          Fri–Sun ₹{Number(rates.weekend).toLocaleString("en-IN")}
                          {" · "}
                          Peak ₹{Number(rates.peak).toLocaleString("en-IN")}
                          {" · "}
                          +{RATE_CARD.gstPct}% GST
                        </div>
                      ) : (
                        <div
                          className="muted"
                          style={{ fontSize: "0.75rem", marginTop: 4 }}
                        >
                          Buyout ≈ Mon–Thu ₹
                          {buyoutWd.toLocaleString("en-IN")}/night (all villas
                          summed) · Fri–Sun / Peak higher · +{RATE_CARD.gstPct}% GST
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Check-in</label>
                <input
                  type="date"
                  value={form.check_in}
                  onChange={(e) =>
                    setForm({ ...form, check_in: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Check-out</label>
                <input
                  type="date"
                  value={form.check_out}
                  onChange={(e) =>
                    setForm({ ...form, check_out: e.target.value })
                  }
                />
              </div>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                fontSize: "0.9rem",
              }}
            >
              <input
                type="checkbox"
                checked={form.peak_period === true}
                onChange={(e) =>
                  setForm({ ...form, peak_period: e.target.checked })
                }
              />
              Peak period rates (use peak rack for all nights)
            </label>
            <div className="row">
              <div className="field">
                <label>Extra beds (&gt;5 years)</label>
                <input
                  value={form.extra_beds_above_5}
                  onChange={(e) =>
                    setForm({ ...form, extra_beds_above_5: e.target.value })
                  }
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <div className="field">
                <label>Extra beds (≤5 years)</label>
                <input
                  value={form.extra_beds_5_below}
                  onChange={(e) =>
                    setForm({ ...form, extra_beds_5_below: e.target.value })
                  }
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
            </div>
            {formPreview && formPreview.nights > 0 ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  background: "var(--green-soft, #e8f5ee)",
                  borderRadius: 8,
                  border: "1px solid var(--green, #1a5c3a)",
                  fontSize: "0.88rem",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {form.customer_segment === "b2b" ? "B2B" : "B2C"} ·{" "}
                  {formPreview.is_buyout
                    ? "Entire property buyout"
                    : form.villa}
                </div>
                <div>
                  <strong>{formPreview.nights} night(s)</strong> · room base ₹
                  {formPreview.room_subtotal.toLocaleString("en-IN")}
                  {formPreview.extra_bed_inr
                    ? ` · extra beds ₹${formPreview.extra_bed_inr.toLocaleString("en-IN")}`
                    : ""}
                </div>
                {formPreview.is_buyout ? (
                  <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>
                    Buyout = Beri + Kerala + Library + Bamboo for each night
                  </div>
                ) : null}
                {formPreview.night_lines?.length ? (
                  <div className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>
                    {formPreview.night_lines
                      .slice(0, 7)
                      .map(
                        (n) =>
                          `${n.date || "night"} ${n.band} ₹${Number(n.rate).toLocaleString("en-IN")}`
                      )
                      .join(" · ")}
                    {formPreview.night_lines.length > 7 ? " …" : ""}
                  </div>
                ) : null}
                <div className="muted" style={{ marginTop: 4 }}>
                  GST {formPreview.gst_pct}%: ₹
                  {formPreview.gst_inr.toLocaleString("en-IN")}
                </div>
                <div style={{ marginTop: 4 }}>
                  Est. deal / buyout value:{" "}
                  <strong style={{ color: "var(--green, #1a5c3a)" }}>
                    {formatInr(formPreview.deal_value_inr)}
                  </strong>
                </div>
              </div>
            ) : form.enquiry_type === "stay" ? (
              <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 10 }}>
                Pick villa or entire buyout, then check-in / check-out. Each night
                uses Mon–Thu / Fri–Sun / Peak + {VILLA_GST_PCT}% GST.
              </p>
            ) : null}
            <div className="row">
              <div className="field">
                <label>Total pax</label>
                <input
                  value={form.pax}
                  onChange={(e) => setForm({ ...form, pax: e.target.value })}
                  inputMode="numeric"
                  placeholder="e.g. 21"
                />
              </div>
              <div className="field">
                <label>Adults</label>
                <input
                  value={form.adults}
                  onChange={(e) => setForm({ ...form, adults: e.target.value })}
                  inputMode="numeric"
                />
              </div>
              <div className="field">
                <label>Kids</label>
                <input
                  value={form.kids}
                  onChange={(e) => setForm({ ...form, kids: e.target.value })}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="field">
              <label>Preferred date(s)</label>
              <input
                value={form.preferred_dates}
                onChange={(e) =>
                  setForm({ ...form, preferred_dates: e.target.value })
                }
                placeholder="e.g. 8 Aug 2026, 12–6 pm"
              />
            </div>
            <div className="field">
              <label>Notes / requirements</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Lunch, hi-tea, drinks… (used to estimate deal value from menu rates)"
                rows={3}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Save enquiry
            </button>
          </form>
        ) : null}

        {/* Pipeline cards */}
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Pipeline ({displayLeads.length})
        </div>

        {displayLeads.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No enquiries yet. Tap + New enquiry or use Telegram{" "}
              <code>/lead Name | phone | stay | notes</code>
            </p>
          </div>
        ) : (
          displayLeads.map(({ lead, view }) => {
            const isEdit = editId === lead.id && edit;

            if (isEdit) {
              return (
                <div key={lead.id} className="card" style={{ marginBottom: 12 }}>
                  <strong style={{ color: "var(--green)" }}>Edit enquiry</strong>
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Name *</label>
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    />
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Mobile</label>
                      <input
                        value={edit.phone}
                        onChange={(e) =>
                          setEdit({ ...edit, phone: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Email</label>
                      <input
                        value={edit.email}
                        onChange={(e) =>
                          setEdit({ ...edit, email: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Type</label>
                      <select
                        value={edit.enquiry_type}
                        onChange={(e) =>
                          setEdit({ ...edit, enquiry_type: e.target.value })
                        }
                      >
                        {TYPES.map(([id, lab]) => (
                          <option key={id} value={id}>
                            {lab}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Pax</label>
                      <input
                        value={edit.pax}
                        onChange={(e) =>
                          setEdit({ ...edit, pax: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Villa / rooms</label>
                    <select
                      value={edit.villa || "Bamboo House"}
                      onChange={(e) =>
                        setEdit({ ...edit, villa: e.target.value })
                      }
                    >
                      {STAY_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Check-in</label>
                      <input
                        type="date"
                        value={edit.check_in || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, check_in: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Check-out</label>
                      <input
                        type="date"
                        value={edit.check_out || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, check_out: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Preferred date(s) text</label>
                    <input
                      value={edit.preferred_dates}
                      onChange={(e) =>
                        setEdit({ ...edit, preferred_dates: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Notes</label>
                    <textarea
                      value={edit.notes}
                      onChange={(e) =>
                        setEdit({ ...edit, notes: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                  <div className="field">
                    <label>B2B or B2C</label>
                    <select
                      value={edit.customer_segment || "b2c"}
                      onChange={(e) =>
                        setEdit({ ...edit, customer_segment: e.target.value })
                      }
                    >
                      <option value="b2c">B2C — Family / personal</option>
                      <option value="b2b">B2B — Corporate / company / group</option>
                    </select>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Adults</label>
                      <input
                        value={edit.adults || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, adults: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Kids</label>
                      <input
                        value={edit.kids || ""}
                        onChange={(e) =>
                          setEdit({ ...edit, kids: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Discount % (fair / commercial)</label>
                      <input
                        value={edit.discount_pct || "0"}
                        onChange={(e) =>
                          setEdit({ ...edit, discount_pct: e.target.value })
                        }
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </div>
                    <div className="field">
                      <label>Rack estimate ₹ (auto on save)</label>
                      <input
                        value={edit.estimated_value_inr || ""}
                        readOnly
                        className="muted"
                        placeholder="Computed from rates"
                      />
                    </div>
                  </div>
                  <p className="muted" style={{ fontSize: "0.75rem", marginTop: -6 }}>
                    Save recomputes <strong>estimated rack</strong> from rooms + dates,
                    then applies discount % → quoted value for client estimate.
                  </p>
                  <div className="field">
                    <label>Status</label>
                    <select
                      value={edit.status}
                      onChange={(e) =>
                        setEdit({ ...edit, status: e.target.value })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={saveEdit}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setEditId(null);
                        setEdit(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() => removeLead(edit.id, edit.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={lead.id}
                className="card"
                style={{
                  marginBottom: 12,
                  borderLeft: "4px solid var(--green, #1a5c3a)",
                }}
              >
                {/* Title row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>
                      {view.displayName}
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      Received {fmtDate(view.created)}
                      {lead.source ? ` · ${lead.source}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <span
                      className="badge"
                      style={{
                        textTransform: "uppercase",
                        background:
                          lead.customer_segment === "b2b"
                            ? "#e8f0fe"
                            : "var(--green-soft, #e8f5ee)",
                        color:
                          lead.customer_segment === "b2b"
                            ? "#1a56db"
                            : "var(--green, #1a5c3a)",
                        fontWeight: 800,
                      }}
                    >
                      {lead.customer_segment === "b2b" ? "B2B" : "B2C"}
                    </span>
                    <span
                      className="badge"
                      style={{
                        textTransform: "capitalize",
                        background: "#f4f1ea",
                        color: "#444",
                        fontWeight: 700,
                      }}
                    >
                      {view.status}
                    </span>
                  </div>
                </div>

                {/* Rooms + stay — always show clearly */}
                <div
                  style={{
                    marginBottom: 10,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  {(lead.villa || view.notes?.match(/library|bamboo|beri|kerala/i)) && (
                    <span
                      className="badge"
                      style={{
                        background: "#fff8e6",
                        color: "#7a5a00",
                        fontWeight: 800,
                        fontSize: "0.8rem",
                      }}
                    >
                      🏠 {lead.villa || "Rooms in notes — recompute"}
                    </span>
                  )}
                  {(lead.check_in || lead.check_out || view.preferred_dates) && (
                    <span
                      className="badge"
                      style={{
                        background: "#eef2ff",
                        color: "#3730a3",
                        fontWeight: 700,
                        fontSize: "0.78rem",
                      }}
                    >
                      📅{" "}
                      {lead.check_in && lead.check_out
                        ? `${String(lead.check_in).slice(0, 10)} → ${String(lead.check_out).slice(0, 10)}`
                        : view.preferred_dates || "—"}
                      {lead.nights ? ` · ${lead.nights}n` : ""}
                    </span>
                  )}
                </div>

                {/* Estimated rack + discount + quoted */}
                <div
                  style={{
                    marginBottom: 10,
                    padding: "12px 14px",
                    background: "var(--green-soft, #e8f5ee)",
                    borderRadius: 10,
                    border: "1px solid var(--green, #1a5c3a)",
                  }}
                >
                  <div
                    className="muted"
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Estimated rack value
                    <span style={{ fontWeight: 500, textTransform: "none" }}>
                      {" "}
                      (not final — discounts apply below)
                    </span>
                  </div>
                  {lead.estimated_value_inr != null ||
                  lead.deal_value_inr != null ? (
                    <>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: "1.35rem",
                          color: "var(--green, #1a5c3a)",
                        }}
                      >
                        {formatInr(
                          lead.estimated_value_inr ?? lead.deal_value_inr
                        )}
                      </div>
                      {(Number(lead.discount_pct) > 0 ||
                        Number(lead.discount_inr) > 0) && (
                        <div style={{ fontSize: "0.9rem", marginTop: 4 }}>
                          Discount{" "}
                          {lead.discount_pct
                            ? `${lead.discount_pct}%`
                            : formatInr(lead.discount_inr)}
                          {" → "}
                          <strong>
                            Quoted {formatInr(
                              lead.quoted_value_inr ?? lead.deal_value_inr
                            )}
                          </strong>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                      No estimate yet — rooms/dates were only in notes.
                      Tap <strong>Recompute estimate</strong> to parse Library &amp; Bamboo + dates.
                    </div>
                  )}
                  {lead.estimate_breakdown ? (
                    <pre
                      className="muted"
                      style={{
                        margin: "8px 0 0",
                        fontSize: "0.72rem",
                        whiteSpace: "pre-wrap",
                        fontFamily: "inherit",
                      }}
                    >
                      {lead.estimate_breakdown}
                    </pre>
                  ) : null}

                  {/* Quick discount presets */}
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <span
                      className="muted"
                      style={{ fontSize: "0.72rem", fontWeight: 700 }}
                    >
                      Fair discount:
                    </span>
                    {[0, 5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        className={`chip ${
                          Number(lead.discount_pct) === pct ? "active" : ""
                        }`}
                        disabled={busy}
                        onClick={() => saveDiscount(lead, pct)}
                        style={{ fontSize: "0.75rem", minHeight: 28 }}
                      >
                        {pct === 0 ? "0%" : `−${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Structured fields */}
                <div style={{ marginTop: 4 }}>
                  <FieldRow label="Rooms">
                    {lead.villa || "— (see notes / recompute)"}
                  </FieldRow>
                  <FieldRow label="Phone">
                    {view.phone ? (
                      <a href={`tel:${view.phone.replace(/\s/g, "")}`}>
                        {view.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </FieldRow>
                  <FieldRow label="Email">
                    {view.email ? (
                      <a href={`mailto:${view.email}`}>{view.email}</a>
                    ) : (
                      "—"
                    )}
                  </FieldRow>
                  <FieldRow label="Segment">
                    {lead.customer_segment === "b2b"
                      ? "B2B — Corporate / group"
                      : "B2C — Family / personal"}
                  </FieldRow>
                  <FieldRow label="Type">
                    {typeLabel(view.enquiry_type)}
                  </FieldRow>
                  <FieldRow label="Dates">
                    {lead.check_in && lead.check_out
                      ? `${String(lead.check_in).slice(0, 10)} → ${String(lead.check_out).slice(0, 10)}`
                      : view.preferred_dates || "—"}
                  </FieldRow>
                  <FieldRow label="Pax">
                    {view.pax != null
                      ? `${view.pax}${
                          lead.adults != null || lead.kids != null
                            ? ` (${lead.adults || 0} adults · ${lead.kids || 0} kids)`
                            : ""
                        }`
                      : "—"}
                  </FieldRow>
                  <FieldRow label="Notes">
                    {view.notes ? (
                      <span style={{ whiteSpace: "pre-wrap" }}>{view.notes}</span>
                    ) : (
                      "—"
                    )}
                  </FieldRow>
                </div>

                {/* Status pipeline */}
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <div
                    className="muted"
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Status
                  </div>
                  <div className="chip-row">
                    {STATUSES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`chip ${view.status === s.id ? "active" : ""}`}
                        disabled={busy || view.status === s.id}
                        onClick={() => setStatus(lead.id, s.id)}
                        style={{ fontSize: "0.78rem", minHeight: 32 }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className="row"
                  style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}
                >
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: "1 1 120px" }}
                    disabled={busy}
                    onClick={() => recomputeLead(lead)}
                  >
                    Recompute estimate
                  </button>
                  <a
                    className="btn btn-secondary"
                    href={`/api/leads/${lead.id}/estimate`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ flex: "1 1 120px", textAlign: "center" }}
                  >
                    Estimate PDF
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: "1 1 80px" }}
                    onClick={() => startEdit(lead, view)}
                    disabled={busy}
                  >
                    Edit
                  </button>
                  {view.phone ? (
                    <a
                      className="btn btn-ghost"
                      href={`https://wa.me/91${view.phone.replace(/\D/g, "").slice(-10)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ flex: "1 1 80px", textAlign: "center" }}
                    >
                      WhatsApp
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ flex: "1 1 80px" }}
                    disabled={busy}
                    onClick={() => removeLead(lead.id, view.displayName)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
