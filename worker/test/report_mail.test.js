import { describe, it, expect } from "vitest";
import { renderReport } from "../lib/report_mail.js";

/* 주간 리포트는 짧다. 맨 위에 그 주 사례 넉 장을 합친 콜라주 한 장, 그 아래
   굵은 인사이트 한 줄, 그 아래 사람 에디터가 쓴 것 같은 짧은 글. 사례를 넉 장
   따로 싣던 구조는 글이 너무 많았다 — 사이트가 이미 하는 일을 메일이 반복했다.
   카드 링크는 남긴다: 메일에서 사이트로 돌아오는 유일한 길이다. */
const BLOCKS = {
  subject: "NASA는 확인 대신 AI 이미지를 금지했다",
  collage: "https://axitnow.com/pipeline/media/mail/collage-2026-W41.jpg",
  insight: "규제를 집행할 사람에게 돈이 가지 않으면 규제는 글자로만 남는다",
  article: "대만은 선거 딥페이크법을 만들었지만 삭제 요청은 한 건도 들어오지 않았다. "
    + "NASA는 가려내는 비용을 감당하지 못하고 AI 이미지를 통째로 금지했다. "
    + "규칙을 읽을 때 같이 봐야 할 것은 그 규칙을 누가 무슨 돈으로 집행하는가다.",
  evidence: [
    { headline: "항소법원, 톰슨 로이터 승소 유지", section: "politics",
      url: "https://axitnow.com/ko/?c=politics:rossappeal",
      image: "https://axitnow.com/pipeline/media/mail/rossappeal.jpg" },
    { headline: "츠다 켄지로 AI 음성 소송", section: "games",
      url: "https://axitnow.com/ko/?c=games:tsuda",
      image: "https://axitnow.com/pipeline/media/mail/tsuda.jpg" },
    { headline: "독립 퍼블리셔 AI 라이선스 원칙", section: "music",
      url: "https://axitnow.com/ko/?c=music:impf",
      image: "https://axitnow.com/pipeline/media/mail/impf.jpg" },
  ],
};
const base = { edition: "2026-W41", lang: "ko", blocks: BLOCKS, unsubUrl: "https://x/u" };

describe("renderReport", () => {
  it("콜라주가 맨 위에 온다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    expect(html).toContain(`<img src="${BLOCKS.collage}"`);
    expect(html.indexOf(BLOCKS.collage)).toBeLessThan(html.indexOf(BLOCKS.insight));
  });

  it("콜라주를 못 만든 주에도 메일은 나간다", () => {
    const { html } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, collage: "" } });
    expect(html).toContain(BLOCKS.insight);
    expect(html).not.toContain("<img src=\"\"");
  });

  it("인사이트가 굵고, 글보다 먼저 온다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    const i = html.indexOf(BLOCKS.insight);
    expect(i).toBeGreaterThan(-1);
    expect(html.slice(Math.max(0, i - 220), i)).toMatch(/font-weight:\s*(700|600|bold)/);
    expect(i).toBeLessThan(html.indexOf("대만은 선거 딥페이크법을"));
  });

  it("아티클이 통째로 들어간다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    expect(html).toContain("규칙을 읽을 때 같이 봐야 할 것은");
  });

  // 메일이 짧아야 한다는 게 이 구조의 요점이다. 사례를 카드로 펼치지 않는다.
  it("사례를 카드로 펼치지 않고 링크 줄로만 단다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    for (const e of BLOCKS.evidence) {
      expect(html).toContain(e.url);
      expect(html).toContain(e.headline);
      expect(html).not.toContain(e.image);   // 사례별 그림은 콜라주에 들어갔다
    }
  });

  /* Global Constraint — 무료 수신자에게 잠긴 사례가 들어가면 유료 콘텐츠 유출이다.
     인사이트와 글은 모두에게 간다(그게 메일의 가치다). 잠그는 것은 사례 링크다. */
  it("무료는 인사이트와 글을 다 받고, 사례 링크는 첫 줄만 받는다", () => {
    const { html } = renderReport({ ...base, entitled: false });
    expect(html).toContain(BLOCKS.insight);
    expect(html).toContain("규칙을 읽을 때 같이 봐야 할 것은");
    expect(html).toContain(BLOCKS.evidence[0].headline);
    for (const e of BLOCKS.evidence.slice(1)) {
      expect(html).not.toContain(e.headline);
      expect(html).not.toContain(e.url);
    }
  });

  it("잠긴 사례가 몇 건인지 알려준다", () => {
    const { html } = renderReport({ ...base, entitled: false });
    expect(html).toMatch(/2\s*건/);
  });

  it("사례가 하나뿐이면 잠금 안내를 붙이지 않는다", () => {
    const { html } = renderReport({ ...base, entitled: false,
      blocks: { ...BLOCKS, evidence: [BLOCKS.evidence[0]] } });
    expect(html).not.toMatch(/Pro/);
  });

  it("사례가 아예 없어도 인사이트와 글은 나간다", () => {
    const { html } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, evidence: [] } });
    expect(html).toContain(BLOCKS.insight);
    expect(html).toContain("대만은 선거 딥페이크법을");
  });

  it("제목용 줄이 있으면 그걸 쓴다", () => {
    const { subject } = renderReport({ ...base, entitled: true });
    expect(subject).toContain("NASA는 확인 대신 AI 이미지를 금지했다");
  });

  it("제목용 줄이 없으면 인사이트로 떨어진다", () => {
    const { subject } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, subject: "" } });
    expect(subject).toContain(BLOCKS.insight);
  });

  it("긴 제목은 단어 중간이 아니라 경계에서 끊는다", () => {
    const long = "이번 주에도 AI 규칙은 늘었지만 지켰는지 확인하는 데 돈을 쓰는 곳이 없어서, "
      + "대만의 선거 딥페이크법에는 삭제 요청이 한 건도 들어오지 않았고 NASA는 금지했다";
    const { subject } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, subject: long } });
    expect(subject.length).toBeLessThanOrEqual(96);
    expect(subject.endsWith("…")).toBe(true);
    const bodyText = subject.slice(0, -1);
    const full = `주간 인사이트 · ${long}`;
    expect(full.startsWith(bodyText)).toBe(true);
    expect(full[bodyText.length]).toMatch(/[ ,，、]/);
  });

  it("AI 작성 고지와 수신 거부 링크가 반드시 들어간다", () => {
    const { html } = renderReport({ ...base, entitled: true, unsubUrl: "https://x/unsub?t=abc" });
    expect(html).toContain("AI가 작성합니다");
    expect(html).not.toContain("사람이 검수");
    expect(html).toContain("https://x/unsub?t=abc");
  });

  it("HTML 특수문자를 이스케이프한다", () => {
    const { html } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, insight: '<script>alert("x")</script>' } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("콜라주 주소의 따옴표를 이스케이프한다", () => {
    const { html } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, collage: 'x.jpg" onerror="alert(1)' } });
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot;");
  });

  it("판본은 본문 어딘가에 남는다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    expect(html).toContain("2026-W41");
  });

  it("언어마다 제목의 머리말이 다르다", () => {
    expect(renderReport({ ...base, lang: "en", entitled: true }).subject)
      .not.toBe(renderReport({ ...base, lang: "ko", entitled: true }).subject);
  });

  it("모르는 언어는 한국어로 떨어진다", () => {
    const { html } = renderReport({ ...base, lang: "qq", entitled: true });
    expect(html).toContain("AI가 작성합니다");
  });
});
