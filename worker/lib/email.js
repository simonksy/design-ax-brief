export async function sendMagicLink(env, email, link) {
  // Test mode: no real key → just capture for assertions (keeps auth tests hermetic).
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "test-resend-key") {
    env.__lastMagicLink = link;
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "Design AX Brief <onboarding@resend.dev>", // Task 8: swap to a verified domain sender
      to: [email],
      subject: "Design AX Brief 로그인 링크",
      html: `<p>아래 링크로 로그인하세요 (15분 내 유효):</p>
             <p><a href="${link}">Design AX Brief 로그인 →</a></p>`,
    }),
  });
  if (!res.ok) throw new Error("resend_failed_" + res.status);
}
