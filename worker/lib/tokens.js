export async function issueMagicToken(kv, email) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await kv.put("ml:" + token, email, { expirationTtl: 900 });
  return token;
}
export async function consumeMagicToken(kv, token) {
  if (!token) return null;
  const email = await kv.get("ml:" + token);
  if (email) await kv.delete("ml:" + token);
  return email;
}
