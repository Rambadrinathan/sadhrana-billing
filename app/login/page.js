"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [staffList, setStaffList] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => setStaffList(d.staff || []))
      .catch(() => setStaffList([]));
    try {
      const saved = localStorage.getItem("sb_staff_name") || "";
      if (saved) setName(saved);
    } catch {
      /* ignore */
    }
  }, []);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, role, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Wrong PIN");
        setLoading(false);
        return;
      }
      if (name.trim()) {
        try {
          localStorage.setItem("sb_staff_name", name.trim());
        } catch {
          /* ignore */
        }
      }
      if (data.role === "admin" || role === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/");
      }
      router.refresh();
    } catch {
      setError("Could not sign in");
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt={PROPERTY.tradeName || PROPERTY.name}
          width={88}
          height={88}
          style={{
            width: 88,
            height: 88,
            objectFit: "contain",
            borderRadius: "50%",
            marginBottom: 12,
            border: "1px solid var(--line)",
            background: "#fff",
            boxShadow: "0 2px 12px rgba(36,48,40,0.06)",
          }}
        />
        <h1 style={{ color: "var(--green-dark)", fontWeight: 750 }}>
          {PROPERTY.tradeName || PROPERTY.name}
        </h1>
        <p>Billing portal · Staff &amp; owner</p>
        {error ? <div className="error">{error}</div> : null}

        <div className="chip-row" style={{ justifyContent: "center", marginBottom: 14 }}>
          <button
            type="button"
            className={`chip ${role === "staff" ? "active" : ""}`}
            onClick={() => setRole("staff")}
          >
            Staff
          </button>
          <button
            type="button"
            className={`chip ${role === "admin" ? "active" : ""}`}
            onClick={() => setRole("admin")}
          >
            Owner / Admin
          </button>
        </div>

        {role === "staff" && staffList.length > 0 ? (
          <select
            className="search-input"
            style={{ marginBottom: 10, textAlign: "left" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
          >
            <option value="">Who is logging in?…</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
                {s.phone ? ` · ${s.phone}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className="search-input"
            style={{ marginBottom: 10, textAlign: "center", letterSpacing: 0 }}
            placeholder={
              role === "admin" ? "Your name (optional)" : "Your name (for bills)"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={40}
          />
        )}

        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          maxLength={8}
          autoFocus
        />
        <button className="btn btn-primary" type="submit" disabled={loading || !pin}>
          {loading ? "Opening…" : role === "admin" ? "Open dashboard" : "Enter"}
        </button>
        <p className="muted" style={{ marginTop: 14, fontSize: "0.8rem" }}>
          {role === "admin"
            ? "Invoices, staff, menu, reports & day-end"
            : "Create bills · pick your name on each invoice"}
        </p>
      </form>
    </div>
  );
}
