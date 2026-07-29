"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
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
        body: JSON.stringify({ pin, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Wrong PIN");
        setLoading(false);
        return;
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
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>🧾</div>
        <h1>BillBanaoPay</h1>
        <p>by OmniDEL.ai · Staff &amp; owner access</p>
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
            ? "Owner dashboard: all invoices, payments, collections"
            : "Staff: create bills at checkout"}
        </p>
      </form>
    </div>
  );
}
