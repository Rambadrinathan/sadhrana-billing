"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/components/BrandHeader";
import { VILLAS } from "@/lib/config";

export default function GuestsPage() {
  const [guests, setGuests] = useState([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    preferred_villa: "",
    notes: "",
  });

  async function load(search = q) {
    const res = await fetch(`/api/guests?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    setGuests(data.guests || []);
  }

  useEffect(() => {
    load("").catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone || null,
          email: form.email || null,
          preferred_villa: form.preferred_villa || null,
          notes: form.notes || null,
          source: "web",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setForm({ name: "", phone: "", email: "", preferred_villa: "", notes: "" });
      setMsg("Guest saved.");
      await load(q);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <BrandHeader
        title="Guests"
        subtitle="Directory for outbound · Telegram /guest"
        right={
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        }
      />
      <main className="page">
        {msg ? <p className="muted">{msg}</p> : null}
        <input
          className="search-input"
          placeholder="Search name or phone…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            load(e.target.value).catch(() => {});
          }}
        />

        <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
          <strong>Add guest</strong>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Preferred villa</label>
            <select
              value={form.preferred_villa}
              onChange={(e) =>
                setForm({ ...form, preferred_villa: e.target.value })
              }
            >
              <option value="">—</option>
              {VILLAS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Save guest
          </button>
        </form>

        <div className="card" style={{ marginTop: 12 }}>
          <strong>Directory ({guests.length})</strong>
          {guests.map((g) => (
            <div
              key={g.id}
              style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}
            >
              <div style={{ fontWeight: 700 }}>{g.name}</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                {[g.phone, g.email, g.preferred_villa].filter(Boolean).join(" · ") ||
                  "—"}
              </div>
              {g.notes ? (
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {g.notes}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
