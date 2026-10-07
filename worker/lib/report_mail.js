/* 주간 리포트 메일 HTML.

   이 메일은 섹션별 헤드라인을 다시 늘어놓지 않는다. 그건 사이트가 하는 일이고,
   메일이 그걸 반복하면 따로 존재할 이유가 없다. 한 주의 카드를 전부 읽은 뒤에야
   보이는 관통선 하나를 전한다 — 명제 한 문장, 그 논거 두 문장, 그리고 그 명제를
   떠받치는 사례 몇 건. 뉴스를 하나씩 볼 때 놓치는 것이 그 선이다.

   메일 클라이언트는 <style> 블록과 대부분의 CSS 선택자를 버린다. 인라인 스타일만
   쓰고 레이아웃은 단일 컬럼으로 간다 — 테이블 중첩은 Gmail과 Outlook에서 다르게
   무너진다. 이미지는 width 속성과 max-width를 함께 준다: 속성만 있으면 좁은 화면에서
   넘치고, max-width만 있으면 Outlook이 원본 크기로 늘린다.

   무료 수신자에게 잠긴 사례가 들어가면 유료 콘텐츠 유출이다. 분기를 조립 쪽이
   아니라 여기 한 곳에 두어, 호출부가 실수로 전체를 넘겨도 새지 않게 한다. */

const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* 고지 문구는 "AI가 작성합니다"뿐이다. 사람이 검수하지 않기로 했으므로
   "사람이 검수합니다"는 어느 언어에도 두지 않는다 — 지키지 않을 약속이다. */
const T = {
  ko: { prefix: "주간 인사이트", weekly: "주간 리포트", cases: "이 명제를 떠받치는 것",
        locked: (n) => `이 명제를 떠받치는 사례가 ${n}건 더 있습니다. Pro 구독자에게 열립니다.`,
        ai: "이 리포트는 AI가 작성합니다.", unsub: "수신 거부" },
  en: { prefix: "Weekly insight", weekly: "Weekly report", cases: "What holds it up",
        locked: (n) => `${n} more cases behind this claim. Open to Pro subscribers.`,
        ai: "This report is written by AI.", unsub: "Unsubscribe" },
  ja: { prefix: "週次インサイト", weekly: "週次レポート", cases: "この主張を支えるもの",
        locked: (n) => `この主張を支える事例があと${n}件あります。Pro購読者に公開されます。`,
        ai: "このレポートはAIが作成しています。", unsub: "配信停止" },
  zh: { prefix: "每周洞察", weekly: "周报", cases: "支撑这个判断的事例",
        locked: (n) => `还有 ${n} 个支撑这个判断的事例，向 Pro 订阅者开放。`,
        ai: "本报告由AI撰写。", unsub: "退订" },
  es: { prefix: "Idea de la semana", weekly: "Informe semanal", cases: "Lo que la sostiene",
        locked: (n) => `${n} casos más que sostienen esta tesis. Abiertos a suscriptores Pro.`,
        ai: "Este informe lo escribe una AI.", unsub: "Cancelar suscripción" },
};

const SUBJECT_MAX = 96;

/* 잘라야 할 땐 글자 한가운데가 아니라 숨 쉬는 자리에서 끊는다 — 쉼표나 띄어쓰기.
   한국어·일본어·중국어는 띄어쓰기가 드물거나 없어서 쉼표를 먼저 본다. 끊을 자리가
   앞쪽에 너무 멀면 그냥 자른다: 반쪽짜리 제목보다 짧은 제목이 낫다. */
function clip(s, max) {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  // 쉼표를 먼저 본다 — 절이 끝나는 자리가 가장 잘 읽힌다. 띄어쓰기는 차선이고,
  // 둘 다 너무 앞이면 그냥 자른다: 반쪽짜리 제목보다 짧은 제목이 낫다.
  const comma = Math.max(head.lastIndexOf(", "), head.lastIndexOf("，"),
                         head.lastIndexOf("、"));
  const space = head.lastIndexOf(" ");
  const cut = comma > max * 0.45 ? comma : (space > max * 0.45 ? space : -1);
  return (cut > 0 ? head.slice(0, cut) : head.trimEnd()) + "…";
}

/* 사례 하나 = 이미지 + 헤드라인 링크 + "이 사례가 명제의 어디를 떠받치는가" 한 줄.
   이미지를 못 구한 카드도 사례로 뽑힐 수 있으므로 <img>는 있을 때만 넣는다 —
   빈 src는 클라이언트마다 깨진 아이콘을 다르게 그린다.

   `w`는 이미지의 픽셀 폭이다. 2열일 때와 1열일 때가 다르고, width 속성과
   max-width를 함께 줘야 한다: 속성만 있으면 좁은 화면에서 넘치고, max-width만
   있으면 Outlook이 원본 크기로 늘린다. */
function evidenceBlock(e, w) {
  const out = [];
  if (e.image) {
    out.push(`<a href="${esc(e.url)}" style="display:block;text-decoration:none">` +
      `<img src="${esc(e.image)}" alt="" width="${w}" ` +
      `style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:10px"></a>`);
  }
  if (e.section) {
    out.push(`<div style="margin:10px 0 4px;font-size:11px;letter-spacing:.08em;` +
      `text-transform:uppercase;color:#9a9284">${esc(e.section)}</div>`);
  }
  out.push(`<div style="margin:0 0 6px;font-size:16px;line-height:1.4;font-weight:600">` +
    `<a href="${esc(e.url)}" style="color:#1c1a18;text-decoration:none">${esc(e.headline)}</a></div>`);
  out.push(`<p style="margin:0;font-size:13px;line-height:1.6;color:#5f5953">${esc(e.role)}</p>`);
  return out.join("");
}

/* 사례를 2열로 깐다.

   메일에서 다단은 테이블이라야 버틴다 — Outlook 데스크톱은 Word 엔진이라 flex도
   inline-block도 못 읽고 칸을 한 줄로 쏟아 버린다. <style> 블록과 미디어 쿼리도
   클라이언트마다 지워지므로, 좁은 화면에서 접히게 만들 수단이 없다. 그래서 칸 폭을
   퍼센트로 두고 이미지가 같이 줄게 한다.

   사례가 하나뿐이면(= 무료 수신자) 쪼개지 않는다. 한 장을 반쪽 칸에 가두면 작고
   초라해지고, 그 한 장이 구독을 설득해야 하는 유일한 그림이다. */
function evidenceGrid(list) {
  if (list.length === 1) {
    return `<div style="margin:0 0 28px">${evidenceBlock(list[0], 516)}</div>`;
  }
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    const pair = [list[i], list[i + 1]];
    const cells = pair.map((e, j) =>
      `<td width="50%" valign="top" style="width:50%;padding:0 ${j === 0 ? "10px 28px 0" : "0 28px 10px"}">` +
      (e ? evidenceBlock(e, 248) : "") + `</td>`).join("");
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;border-collapse:collapse">${rows.join("")}</table>`;
}

export function renderReport({ edition, lang, blocks, entitled, unsubUrl }) {
  const t = T[lang] || T.ko;
  const b = blocks || {};
  const all = (b.evidence || []).filter((e) => e && e.headline);
  // 무료는 첫 사례까지. 사이트의 "첫 카드만 열고 나머지는 흐리게"와 같은 경계다.
  const shown = entitled ? all : all.slice(0, 1);
  const held = all.length - shown.length;

  const out = [];
  out.push(`<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9a9284">` +
    `AX-it NOW · ${esc(t.weekly)} · ${esc(edition)}</div>`);
  out.push(`<h1 style="margin:14px 0 0;font-size:23px;line-height:1.45;font-weight:600;color:#17150f">` +
    `${esc(b.thesis)}</h1>`);
  if (b.ground) {
    out.push(`<p style="margin:16px 0 0;font-size:15px;line-height:1.75;color:#413c36">` +
      `${esc(b.ground)}</p>`);
  }

  if (shown.length) {
    out.push(`<div style="margin:34px 0 18px;padding-top:18px;border-top:1px solid #e3dccf;` +
      `font-size:12px;letter-spacing:.06em;color:#9a9284">${esc(t.cases)}</div>`);
    out.push(evidenceGrid(shown));
  }
  if (held > 0) {
    out.push(`<p style="margin:0;padding:16px 18px;border-radius:12px;background:#f1ece4;` +
      `font-size:14px;line-height:1.6;color:#5a5450">${esc(t.locked(held))}</p>`);
  }

  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f0e9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:30px 22px 36px;background:#fbf8f3">
${out.join("")}
<hr style="margin:34px 0 14px;border:0;border-top:1px solid #e3dccf">
<p style="margin:0 0 6px;font-size:12px;color:#8a8377">${esc(t.ai)}</p>
<p style="margin:0;font-size:12px"><a href="${esc(unsubUrl)}" style="color:#8a8377">${esc(t.unsub)}</a></p>
</div></body></html>`;

  /* 제목은 판본 번호가 아니라 그 주의 요점이다 — 받은메일함에서 열어 볼 이유가
     거기 있다. 명제를 구체적으로 쓰라고 하면서 길어졌으므로(이름과 숫자가 자리를
     먹는다) 제목용 짧은 줄을 따로 받고, 없으면 명제로 떨어진다. */
  const line = String(b.subject || b.thesis || "").trim();
  return { subject: clip(`${t.prefix} · ${line}`, SUBJECT_MAX), html };
}
