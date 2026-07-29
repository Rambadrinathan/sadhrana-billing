"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
          width={96}
          height={96}
          style={{
            width: 96,
            height: 96,
            objectFit: "contain",
            borderRadius: "50%",
            marginBottom: 10,
            border: "2px solid var(--green)",
            background: "#fff",
            boxShadow: "0 4px 16px rgba(47,93,58,0.12)",
          }}
        />
        <h1 style={{ color: "var(--green-dark)" }}>
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

        <input
          type="text"
          className="search-input"
          style={{ marginBottom: 10, textAlign: "center", letterSpacing: 0 }}
          placeholder={role === "admin" ? "Your name (optional)" : "Your name (for bill history)"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={40}
        />

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
            ? "Invoices, catalog, reports, Excel & day-end"
            : "Create checkout bills · share · collect"}
        </p>
      </form>
    </div>
  );
}
