const NAME = "ax_session";
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
export function sessionSetCookie(token) {
  return `${NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}
export function sessionClearCookie() {
  return `${NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export const SESSION_COOKIE = NAME;
