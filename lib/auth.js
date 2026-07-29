import { cookies } from "next/headers";

const COOKIE = "sb_staff";
const ROLE_COOKIE = "sb_role";

export function checkPin(pin, role = "staff") {
  const p = String(pin || "").trim();
  const manager = process.env.MANAGER_PIN || "1234";
  const admin = process.env.ADMIN_PIN || manager;
  if (role === "admin") return p === String(admin).trim();
  // staff pin accepts manager pin
  return p === String(manager).trim() || p === String(admin).trim();
}

export function isAuthed() {
  try {
    const jar = cookies();
    return jar.get(COOKIE)?.value === "1";
  } catch {
    return false;
  }
}

export function getRole() {
  try {
    const jar = cookies();
    return jar.get(ROLE_COOKIE)?.value || "staff";
  } catch {
    return "staff";
  }
}

/** Set auth cookies. role: staff | admin */
export function authCookieHeaders(ok, role = "staff") {
  if (!ok) {
    return [
      `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      `${ROLE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    ];
  }
  return [
    `${COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    `${ROLE_COOKIE}=${role}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
  ];
}

/** @deprecated use authCookieHeaders */
export function authCookieHeader(ok) {
  return authCookieHeaders(ok, "staff")[0];
}
