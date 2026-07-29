"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
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
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Wrong PIN");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not sign in");
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>🌿</div>
        <h1>Sadhrana Bagh</h1>
        <p>Checkout billing — manager access</p>
        {error ? <div className="error">{error}</div> : null}
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
          {loading ? "Opening…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
