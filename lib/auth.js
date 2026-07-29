import { cookies } from "next/headers";

const COOKIE = "sb_staff";

export function checkPin(pin) {
  const expected = process.env.MANAGER_PIN || "1234";
  return String(pin || "").trim() === String(expected).trim();
}

export function isAuthed() {
  try {
    const jar = cookies();
    return jar.get(COOKIE)?.value === "1";
  } catch {
    return false;
  }
}

export function authCookieHeader(ok) {
  if (ok) {
    return `${COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  }
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
