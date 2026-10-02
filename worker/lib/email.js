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
      // 발신 주소는 env.MAIL_FROM으로 바꿀 수 있다. 기본값(onboarding@resend.dev)은
      // Resend 공용 샌드박스 주소라 계정 소유자에게만 배달된다 — 도메인 인증이 끝나면
      // `wrangler secret put MAIL_FROM`(또는 vars)으로 가리키기만 하면 된다.
      from: env.MAIL_FROM || "Design AX Brief <onboarding@resend.dev>",
      to: [email],
      subject: "Design AX Brief 로그인 링크",
      html: `<p>아래 링크로 로그인하세요 (15분 내 유효):</p>
             <p><a href="${link}">Design AX Brief 로그인 →</a></p>`,
    }),
  });
  if (!res.ok) throw new Error("resend_failed_" + res.status);
}
