import { describe, it, expect } from "vitest";
import { renderReport } from "../lib/report_mail.js";

/* 주간 리포트는 섹션별 헤드라인을 다시 늘어놓지 않는다 — 그건 사이트가 하는
   일이고, 메일이 그걸 반복하면 따로 존재할 이유가 없다. 메일이 주는 것은 뉴스를
   하나씩 볼 때는 보이지 않는 관통선 하나다: 명제 한 문장, 그 논거, 그리고 그
   명제를 떠받치는 사례들. */
const BLOCKS = {
  thesis: "모델에 들어가는 재료에 값이 붙기 시작했다",
  ground: "같은 주에 판결 두 건이 같은 방향을 가리켰다. 값을 매기는 장치도 함께 나왔다.",
  evidence: [
    { headline: "항소법원, 톰슨 로이터 승소 유지", section: "politics",
      url: "https://axitnow.com/ko/?c=politics:rossappeal",
      image: "https://axitnow.com/pipeline/media/rossappeal.jpg",
      role: "학습 데이터에 값이 있다고 법원이 처음 인정했다" },
    { headline: "츠다 켄지로 AI 음성 소송", section: "games",
      url: "https://axitnow.com/ko/?c=games:tsuda",
      image: "https://axitnow.com/pipeline/media/tsuda.jpg",
      role: "목소리도 같은 저울에 올랐다" },
    { headline: "독립 퍼블리셔 AI 라이선스 원칙", section: "music",
      url: "https://axitnow.com/ko/?c=music:impf",
      image: "https://axitnow.com/pipeline/media/impf.jpg",
      role: "값을 매기는 쪽이 기준을 먼저 적었다" },
  ],
};
const base = { edition: "2026-W41", lang: "ko", blocks: BLOCKS, unsubUrl: "https://x/u" };

describe("renderReport", () => {
  it("명제와 논거는 본문 맨 앞에 온다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    expect(html).toContain("모델에 들어가는 재료에 값이 붙기 시작했다");
    expect(html).toContain("같은 주에 판결 두 건이 같은 방향을 가리켰다");
    expect(html.indexOf("모델에 들어가는")).toBeLessThan(html.indexOf("항소법원"));
  });

  // 제목은 판본 번호가 아니라 명제다. 받은메일함에서 열어 볼 이유가 거기 있다.
  it("메일 제목이 명제를 담는다", () => {
    const { subject } = renderReport({ ...base, entitled: true });
    expect(subject).toContain("모델에 들어가는 재료에 값이 붙기 시작했다");
  });

  it("Pro는 사례 전부를 이미지와 함께 받는다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    for (const e of BLOCKS.evidence) {
      expect(html).toContain(e.headline);
      expect(html).toContain(e.role);
      expect(html).toContain(`<img src="${e.image}"`);
      expect(html).toContain(e.url);
    }
  });

  /* Global Constraint — 무료 메일에 잠긴 사례가 들어가면 유료 콘텐츠 유출이다.
     경계는 사이트와 같다: 첫 사례는 열고 나머지는 잠근다. */
  it("무료는 명제·논거·첫 사례까지만 받는다", () => {
    const { html } = renderReport({ ...base, entitled: false });
    expect(html).toContain("모델에 들어가는 재료에 값이 붙기 시작했다");
    expect(html).toContain("같은 주에 판결 두 건이");
    expect(html).toContain("항소법원, 톰슨 로이터 승소 유지");
    expect(html).toContain("학습 데이터에 값이 있다고 법원이 처음 인정했다");
    for (const e of BLOCKS.evidence.slice(1)) {
      expect(html).not.toContain(e.headline);
      expect(html).not.toContain(e.role);
      expect(html).not.toContain(e.image);
    }
  });

  // 잠긴 자리에 "구독하세요"만 있으면 무엇을 못 보는지 알 수 없다. 몇 건인지 말한다.
  it("잠긴 사례가 몇 건인지 알려준다", () => {
    const { html } = renderReport({ ...base, entitled: false });
    expect(html).toMatch(/2\s*건/);
  });

  it("사례가 하나뿐이면 잠금 안내를 붙이지 않는다", () => {
    const { html } = renderReport({ ...base, entitled: false,
      blocks: { ...BLOCKS, evidence: [BLOCKS.evidence[0]] } });
    expect(html).toContain("항소법원, 톰슨 로이터 승소 유지");
    expect(html).not.toMatch(/Pro/);
  });

  // Review Focus — 미디어를 못 구한 카드가 사례로 뽑힐 수 있다. 사례는 남아야 한다.
  it("이미지가 없는 사례도 글은 그대로 담는다", () => {
    const { html } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, evidence: [{ ...BLOCKS.evidence[0], image: "" }] } });
    expect(html).toContain("항소법원, 톰슨 로이터 승소 유지");
    expect(html).toContain("학습 데이터에 값이 있다고 법원이 처음 인정했다");
    expect(html).not.toContain("<img src=\"\"");
  });

  it("사례가 아예 없어도 명제는 나간다", () => {
    const { html } = renderReport({ ...base, entitled: true, blocks: { ...BLOCKS, evidence: [] } });
    expect(html).toContain("모델에 들어가는 재료에 값이 붙기 시작했다");
  });

  it("AI 작성 고지와 수신 거부 링크가 반드시 들어간다", () => {
    const { html } = renderReport({ ...base, entitled: true, unsubUrl: "https://x/unsub?t=abc" });
    expect(html).toContain("AI가 작성합니다");
    expect(html).not.toContain("사람이 검수");   // 지키지 않을 약속은 적지 않는다
    expect(html).toContain("https://x/unsub?t=abc");
  });

  it("HTML 특수문자를 이스케이프한다", () => {
    const { html } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, thesis: '<script>alert("x")</script>' } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  // 이미지 src도 이스케이프해야 한다 — 따옴표 하나로 속성을 빠져나갈 수 있다.
  it("이미지 주소의 따옴표를 이스케이프한다", () => {
    const { html } = renderReport({ ...base, entitled: true,
      blocks: { ...BLOCKS, evidence: [{ ...BLOCKS.evidence[0], image: 'x.jpg" onerror="alert(1)' }] } });
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot;");
  });

  it("판본은 본문 어딘가에 남는다 — 어느 주의 리포트인지는 알아야 한다", () => {
    const { html } = renderReport({ ...base, entitled: true });
    expect(html).toContain("2026-W41");
  });

  it("언어마다 제목의 머리말이 다르다", () => {
    const en = renderReport({ ...base, lang: "en", entitled: true }).subject;
    const ko = renderReport({ ...base, lang: "ko", entitled: true }).subject;
    expect(en).not.toBe(ko);
  });

  it("모르는 언어는 한국어로 떨어진다", () => {
    const { html } = renderReport({ ...base, lang: "qq", entitled: true });
    expect(html).toContain("AI가 작성합니다");
  });
});
