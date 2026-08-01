"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("staff");
  const [staffOnly, setStaffOnly] = useState(false);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("staff") === "1" || q.get("role") === "staff") {
        setStaffOnly(true);
        setRole("staff");
      }
    } catch {
      /* ignore */
    }
  }, []);
  const [staffList, setStaffList] = useState([]);
  const [staffPick, setStaffPick] = useState("");
  const [staffOther, setStaffOther] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.json())
      .then((d) => setStaffList(d.staff || []))
      .catch(() => setStaffList([]));
    try {
      const saved = localStorage.getItem("sb_staff_name") || "";
      if (!saved) return;
      // Will resolve after staff list loads — set other for now
      setStaffOther(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!staffList.length) return;
    try {
      const saved = localStorage.getItem("sb_staff_name") || "";
      if (!saved) return;
      if (staffList.some((s) => s.name === saved)) {
        setStaffPick(saved);
        setStaffOther("");
      } else {
        setStaffPick("__others__");
        setStaffOther(saved);
      }
    } catch {
      /* ignore */
    }
  }, [staffList]);

  function resolvedName() {
    if (role === "admin") {
      return staffPick === "__others__"
        ? staffOther.trim()
        : staffPick || staffOther.trim();
    }
    if (staffPick === "__others__") return staffOther.trim();
    return String(staffPick || "").trim();
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const name = resolvedName();
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, role, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Wrong PIN");
        setLoading(false);
        return;
      }
      if (name) {
        try {
          localStorage.setItem("sb_staff_name", name);
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
        <p>{staffOnly ? "Billing portal · Staff" : "Billing portal · Staff & owner"}</p>
        {error ? <div className="error">{error}</div> : null}

        {/* ?staff=1 gives a dedicated staff link with no Owner option on screen.
            This is presentation only — real enforcement is the PIN + middleware. */}
        {staffOnly ? null : (
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
        )}

        {role === "staff" ? (
          <>
            <select
              className="search-input"
              style={{ marginBottom: 10, textAlign: "left" }}
              value={staffPick}
              onChange={(e) => setStaffPick(e.target.value)}
            >
              <option value="">Who is logging in?…</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                  {s.phone ? ` · ${s.phone}` : ""}
                </option>
              ))}
              <option value="__others__">Others (type name)…</option>
            </select>
            {staffPick === "__others__" ? (
              <input
                type="text"
                className="search-input"
                style={{ marginBottom: 10, textAlign: "center", letterSpacing: 0 }}
                placeholder="Type your name"
                value={staffOther}
                onChange={(e) => setStaffOther(e.target.value)}
                maxLength={40}
              />
            ) : null}
          </>
        ) : (
          <input
            type="text"
            className="search-input"
            style={{ marginBottom: 10, textAlign: "center", letterSpacing: 0 }}
            placeholder="Your name (optional)"
            value={staffOther || staffPick}
            onChange={(e) => {
              setStaffPick("__others__");
              setStaffOther(e.target.value);
            }}
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
            : "New people? Choose Others and type their name."}
        </p>
      </form>
    </div>
  );
}
