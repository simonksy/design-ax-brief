export async function sendMagicLink(env, email, link, code) {
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
      subject: "AX-it NOW 로그인 링크",
      // 코드는 다른 기기에서 열었을 때만 쓰인다 — 로그인을 요청한 화면에 같은 숫자가
      // 떠 있는지 눈으로 맞춰 보라는 용도다. 같은 기기에서 열면 묻지 않는다.
      html: `<p>아래 링크로 로그인하세요 (15분 내 유효):</p>
             <p><a href="${link}">AX-it NOW 로그인 →</a></p>` +
            (code
              ? `<p style="margin-top:18px;color:#555">다른 기기에서 이 링크를 여는 경우,
                 로그인을 요청한 화면에 아래 숫자가 떠 있는지 확인하세요.</p>
                 <p style="font:700 24px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em">${code}</p>
                 <p style="color:#888;font-size:13px">숫자가 다르면 누르지 마세요. 누군가 당신의
                 주소로 로그인을 시도하는 중일 수 있습니다.</p>`
              : ""),
    }),
  });
  if (!res.ok) throw new Error("resend_failed_" + res.status);
}

/* 리포트 발송. 매직링크와 달리 받는 사람이 많으므로, 실패를 삼키지 않고 던져
   호출부가 그 주소만 건너뛰고 나머지를 계속 보내게 한다. 테스트 모드에서는
   env.__sentReports에 쌓아 두어 조립 결과를 검사할 수 있게 한다. */
export async function sendReport(env, to, subject, html) {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "test-resend-key") {
    (env.__sentReports ||= []).push({ to, subject, html });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "AX-it NOW <noreply@axitnow.com>",
      to: [to], subject, html,
    }),
  });
  if (!res.ok) throw new Error("resend_failed_" + res.status);
}
