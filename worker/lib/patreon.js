export function patreonAuthorizeUrl(env, state) {
  const redirectUri = encodeURIComponent(env.BASE_URL + "/api/auth/patreon/callback");
  const scope = encodeURIComponent("identity identity[email] identity.memberships");
  return `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${env.PATREON_CLIENT_ID}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
}

export async function exchangeCode(env, code) {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: env.PATREON_CLIENT_ID,
    client_secret: env.PATREON_CLIENT_SECRET,
    redirect_uri: env.BASE_URL + "/api/auth/patreon/callback",
  });
  const res = await fetch("https://www.patreon.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error("patreon_token_exchange_failed_" + res.status);
  return res.json();
}

export async function fetchIdentity(env, accessToken) {
  const url = "https://www.patreon.com/api/oauth2/v2/identity?include=memberships&fields%5Buser%5D=email&fields%5Bmember%5D=patron_status";
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error("patreon_identity_failed_" + res.status);
  return res.json();
}

export function membershipStatus(identityJson) {
  const email = identityJson?.data?.attributes?.email ?? null;
  if (!email) return { email: null, active: false };
  const included = identityJson?.included || [];
  const active = included.some(
    (i) => i.type === "member" && i.attributes && i.attributes.patron_status === "active_patron"
  );
  return { email, active };
}
