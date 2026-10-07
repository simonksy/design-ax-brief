/* 주간 리포트 메일 HTML.

   메일은 짧다. 맨 위에 그 주 사례 넉 장을 합친 콜라주 한 장, 그 아래 굵은 인사이트
   한 줄, 그 아래 사람 에디터가 쓴 것 같은 짧은 글. 끝에 카드 링크 몇 줄.

   사례를 넉 장 따로 펼치던 구조는 글이 너무 많았다 — 그림과 헤드라인과 설명을
   카드마다 반복하면서, 사이트가 이미 하는 일을 메일이 다시 했다. 메일이 주는 것은
   한 주의 카드를 다 읽은 뒤에야 보이는 한 줄과, 그게 읽는 사람에게 무슨 뜻인지다.

   메일 클라이언트는 <style> 블록과 대부분의 CSS 선택자를 버린다. 인라인 스타일만
   쓰고 레이아웃은 단일 컬럼으로 간다 — 테이블 중첩은 Gmail과 Outlook에서 다르게
   무너진다. 이미지는 width 속성과 max-width를 함께 준다: 속성만 있으면 좁은 화면에서
   넘치고, max-width만 있으면 Outlook이 원본 크기로 늘린다.

   무료와 Pro의 경계는 인사이트가 아니라 사례 링크다. 인사이트와 글은 모두에게
   간다 — 그게 이 메일의 가치이고, 그걸 잠그면 받을 이유가 없어진다. 분기를 조립
   쪽이 아니라 여기 한 곳에 두어, 호출부가 실수로 전체를 넘겨도 새지 않게 한다. */

const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* 고지 문구는 "AI가 작성합니다"뿐이다. 사람이 검수하지 않기로 했으므로
   "사람이 검수합니다"는 어느 언어에도 두지 않는다 — 지키지 않을 약속이다. */
const T = {
  ko: { prefix: "주간 인사이트", weekly: "주간 리포트", cases: "이 글이 본 카드",
        locked: (n) => `이 글이 본 카드가 ${n}건 더 있습니다. Pro 구독자에게 열립니다.`,
        ai: "이 리포트는 AI가 작성합니다.", unsub: "수신 거부" },
  en: { prefix: "Weekly insight", weekly: "Weekly report", cases: "The cards behind this",
        locked: (n) => `${n} more cards behind this piece. Open to Pro subscribers.`,
        ai: "This report is written by AI.", unsub: "Unsubscribe" },
  ja: { prefix: "週次インサイト", weekly: "週次レポート", cases: "この記事が見たカード",
        locked: (n) => `この記事が見たカードがあと${n}件あります。Pro購読者に公開されます。`,
        ai: "このレポートはAIが作成しています。", unsub: "配信停止" },
  zh: { prefix: "每周洞察", weekly: "周报", cases: "这篇文章看过的卡片",
        locked: (n) => `还有 ${n} 张这篇文章看过的卡片，向 Pro 订阅者开放。`,
        ai: "本报告由AI撰写。", unsub: "退订" },
  es: { prefix: "Idea de la semana", weekly: "Informe semanal", cases: "Las tarjetas detrás",
        locked: (n) => `${n} tarjetas más detrás de este texto. Abiertas a suscriptores Pro.`,
        ai: "Este informe lo escribe una AI.", unsub: "Cancelar suscripción" },
};

const SUBJECT_MAX = 96;
const BODY_W = 516;

/* 잘라야 할 땐 단어 한가운데가 아니라 숨 쉬는 자리에서 끊는다. 쉼표를 먼저 본다 —
   절이 끝나는 자리가 가장 잘 읽힌다. 한국어·일본어·중국어는 띄어쓰기가 드물거나
   없어서 더 그렇다. 둘 다 너무 앞이면 그냥 자른다: 반쪽짜리 제목보다 짧은 게 낫다. */
function clip(s, max) {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const comma = Math.max(head.lastIndexOf(", "), head.lastIndexOf("，"),
                         head.lastIndexOf("、"));
  const space = head.lastIndexOf(" ");
  const cut = comma > max * 0.45 ? comma : (space > max * 0.45 ? space : -1);
  return (cut > 0 ? head.slice(0, cut) : head.trimEnd()) + "…";
}

/* 아티클은 여러 문장이다. 줄바꿈이 있으면 문단으로 나눈다 — 한 덩어리로 흘리면
   메일에서 읽기 나쁘다. 줄바꿈이 없으면 통째로 한 문단이고, 글이 짧아서 그래도 읽힌다. */
function paragraphs(text) {
  return String(text || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
}

export function renderReport({ edition, lang, blocks, entitled, unsubUrl }) {
  const t = T[lang] || T.ko;
  const b = blocks || {};
  const all = (b.evidence || []).filter((e) => e && e.headline && e.url);
  // 무료는 첫 줄까지. 인사이트와 글은 잠그지 않는다 — 그게 메일의 가치다.
  const shown = entitled ? all : all.slice(0, 1);
  const held = all.length - shown.length;

  const out = [];
  out.push(`<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9a9284">` +
    `AX-it NOW · ${esc(t.weekly)} · ${esc(edition)}</div>`);

  if (b.collage) {
    out.push(`<img src="${esc(b.collage)}" alt="" width="${BODY_W}" ` +
      `style="display:block;width:100%;max-width:${BODY_W}px;height:auto;border:0;` +
      `border-radius:12px;margin:18px 0 0">`);
  }

  // 인사이트 한 줄. 이 메일에서 가장 큰 글씨이고, 받는 사람이 기억할 유일한 문장이다.
  out.push(`<p style="margin:22px 0 0;font-size:21px;line-height:1.5;font-weight:700;` +
    `color:#17150f">${esc(b.insight)}</p>`);

  for (const p of paragraphs(b.article)) {
    out.push(`<p style="margin:16px 0 0;font-size:15px;line-height:1.8;color:#413c36">` +
      `${esc(p)}</p>`);
  }

  if (shown.length) {
    out.push(`<div style="margin:30px 0 10px;padding-top:16px;border-top:1px solid #e3dccf;` +
      `font-size:12px;letter-spacing:.06em;color:#9a9284">${esc(t.cases)}</div>`);
    out.push(`<ul style="margin:0;padding:0 0 0 18px">` + shown.map((e) =>
      `<li style="margin:0 0 7px;font-size:14px;line-height:1.55">` +
      `<a href="${esc(e.url)}" style="color:#3a352f">${esc(e.headline)}</a>` +
      (e.section ? `<span style="color:#9a9284"> · ${esc(e.section)}</span>` : "") +
      `</li>`).join("") + `</ul>`);
  }
  if (held > 0) {
    out.push(`<p style="margin:14px 0 0;padding:14px 16px;border-radius:12px;background:#f1ece4;` +
      `font-size:13px;line-height:1.6;color:#5a5450">${esc(t.locked(held))}</p>`);
  }

  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f0e9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:30px 22px 36px;background:#fbf8f3">
${out.join("")}
<hr style="margin:30px 0 14px;border:0;border-top:1px solid #e3dccf">
<p style="margin:0 0 6px;font-size:12px;color:#8a8377">${esc(t.ai)}</p>
<p style="margin:0;font-size:12px"><a href="${esc(unsubUrl)}" style="color:#8a8377">${esc(t.unsub)}</a></p>
</div></body></html>`;

  /* 제목은 그 주의 요점이다 — 받은메일함에서 열어 볼 이유가 거기 있다. 인사이트를
     그대로 쓰면 길어서 중간에 잘리므로 제목용 줄을 따로 받고, 없으면 인사이트로
     떨어진다. */
  const line = String(b.subject || b.insight || "").trim();
  return { subject: clip(`${t.prefix} · ${line}`, SUBJECT_MAX), html };
}
