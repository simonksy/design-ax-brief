/* 주간 리포트 메일 HTML.

   메일 클라이언트는 <style> 블록과 대부분의 CSS 선택자를 버린다. 인라인 스타일만
   쓰고 레이아웃은 단일 컬럼으로 간다 — 테이블 중첩은 Gmail과 Outlook에서 다르게
   무너진다.

   무료 수신자에게 ②③④가 들어가면 유료 콘텐츠 유출이다. 분기를 조립 쪽이 아니라
   여기 한 곳에 두어, 호출부가 실수로 전체를 넘겨도 새지 않게 한다. */

const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* 고지 문구는 "AI가 작성합니다"뿐이다. 사람이 검수하지 않기로 했으므로
   "사람이 검수합니다"는 어느 언어에도 두지 않는다 — 지키지 않을 약속이다. */
const T = {
  ko: { subject: (e) => `AX-it NOW 주간 리포트 · ${e}`, change: "이번 주의 변화",
        signals: "분야별 신호", dots: "흩어진 점 잇기", next: "다음에 볼 것",
        ai: "이 리포트는 AI가 작성합니다.", unsub: "수신 거부",
        locked: "분야별 신호와 교차 인사이트는 Pro 구독자에게 열립니다." },
  en: { subject: (e) => `AX-it NOW weekly · ${e}`, change: "What changed this week",
        signals: "Signals by field", dots: "Connecting the dots", next: "What to watch",
        ai: "This report is written by AI.", unsub: "Unsubscribe",
        locked: "Signals and cross-section insight are open to Pro subscribers." },
  ja: { subject: (e) => `AX-it NOW 週次レポート · ${e}`, change: "今週の変化",
        signals: "分野別シグナル", dots: "点と点をつなぐ", next: "次に見るもの",
        ai: "このレポートはAIが作成しています。", unsub: "配信停止",
        locked: "分野別シグナルと横断インサイトはPro購読者に公開されます。" },
  zh: { subject: (e) => `AX-it NOW 周报 · ${e}`, change: "本周的变化",
        signals: "分领域信号", dots: "把散点连起来", next: "接下来值得关注",
        ai: "本报告由AI撰写。", unsub: "退订",
        locked: "分领域信号与跨领域洞察向Pro订阅者开放。" },
  es: { subject: (e) => `AX-it NOW semanal · ${e}`, change: "Qué cambió esta semana",
        signals: "Señales por área", dots: "Uniendo los puntos", next: "Qué observar",
        ai: "Este informe lo escribe una AI.", unsub: "Cancelar suscripción",
        locked: "Las señales por área y la visión transversal están abiertas a suscriptores Pro." },
};

export function renderReport({ edition, lang, blocks, entitled, sections, unsubUrl }) {
  const t = T[lang] || T.ko;
  const b = blocks || {};
  const p = (s) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#2a2622">${esc(s)}</p>`;
  const h = (s) =>
    `<h2 style="margin:28px 0 10px;font-size:16px;color:#1c1a18">${esc(s)}</h2>`;

  const out = [];
  if (b.change) out.push(h(t.change), p(b.change));

  if (entitled) {
    // 블록이 없는 섹션은 그냥 빠진다 — 한 섹션의 생성 실패가 메일 전체를
    // 멈추면, 고치는 동안 그 주 리포트는 아무에게도 가지 않는다.
    const got = (sections || []).filter((s) => (b.sections || {})[s]);
    if (got.length) {
      out.push(h(t.signals));
      for (const s of got) out.push(p(b.sections[s]));
    }
    if (b.dots) out.push(h(t.dots), p(b.dots));
    if ((b.next || []).length) {
      out.push(h(t.next));
      for (const n of b.next) out.push(p("· " + n));
    }
  } else {
    out.push(`<p style="margin:24px 0 0;padding:14px 16px;border-radius:12px;background:#f1ece4;
      font-size:14px;line-height:1.6;color:#5a5450">${esc(t.locked)}</p>`);
  }

  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f0e9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 22px 36px;background:#fbf8f3">
<div style="font-size:12px;color:#8a8377;letter-spacing:.06em">AX-it NOW · ${esc(edition)}</div>
${out.join("")}
<hr style="margin:30px 0 14px;border:0;border-top:1px solid #e3dccf">
<p style="margin:0 0 6px;font-size:12px;color:#8a8377">${esc(t.ai)}</p>
<p style="margin:0;font-size:12px"><a href="${esc(unsubUrl)}" style="color:#8a8377">${esc(t.unsub)}</a></p>
</div></body></html>`;

  return { subject: t.subject(edition), html };
}
