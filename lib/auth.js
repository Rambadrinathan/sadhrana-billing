import { cookies } from "next/headers";

const COOKIE = "sb_staff";
const ROLE_COOKIE = "sb_role";
const NAME_COOKIE = "sb_name";

export function checkPin(pin, role = "staff") {
  const p = String(pin || "").trim();
  const manager = process.env.MANAGER_PIN || "1234";
  const admin = process.env.ADMIN_PIN || manager;
  if (role === "admin") return p === String(admin).trim();
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

export function getStaffName() {
  try {
    const jar = cookies();
    const n = jar.get(NAME_COOKIE)?.value;
    return n ? decodeURIComponent(n) : "";
  } catch {
    return "";
  }
}

/**
 * Set auth cookies. role: staff | admin
 * @param {boolean} ok
 * @param {string} role
 * @param {string} [displayName]
 */
export function authCookieHeaders(ok, role = "staff", displayName = "") {
  if (!ok) {
    return [
      `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      `${ROLE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      `${NAME_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    ];
  }
  const max = 60 * 60 * 24 * 30;
  const name = String(displayName || "")
    .trim()
    .slice(0, 40);
  const headers = [
    `${COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${max}`,
    `${ROLE_COOKIE}=${role}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${max}`,
  ];
  if (name) {
    headers.push(
      `${NAME_COOKIE}=${encodeURIComponent(name)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${max}`
    );
  }
  return headers;
}

/** @deprecated use authCookieHeaders */
export function authCookieHeader(ok) {
  return authCookieHeaders(ok, "staff")[0];
}
