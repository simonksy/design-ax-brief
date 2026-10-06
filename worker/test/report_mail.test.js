import { describe, it, expect } from "vitest";
import { renderReport } from "../lib/report_mail.js";

const BLOCKS = {
  change: "이번 주의 변화 문단",
  sections: { design: "디자인 신호", marketing: "마케팅 신호" },
  dots: "흩어진 점 잇기 문단",
  next: ["다음에 볼 것 1", "다음에 볼 것 2"],
};
const base = { edition: "2026-W41", lang: "ko", blocks: BLOCKS, unsubUrl: "https://x/u" };

describe("renderReport", () => {
  it("Pro는 네 부분을 모두 받는다", () => {
    const { html } = renderReport({ ...base, entitled: true, sections: ["design", "marketing"] });
    expect(html).toContain("이번 주의 변화 문단");
    expect(html).toContain("디자인 신호");
    expect(html).toContain("흩어진 점 잇기 문단");
    expect(html).toContain("다음에 볼 것 1");
  });

  // Global Constraint — 무료 메일에 ②③④가 들어가면 유료 콘텐츠 유출이다.
  it("무료는 ①번만 받는다 — ②③④가 들어가면 안 된다", () => {
    const { html } = renderReport({ ...base, entitled: false, sections: ["design", "marketing"] });
    expect(html).toContain("이번 주의 변화 문단");
    expect(html).not.toContain("디자인 신호");
    expect(html).not.toContain("흩어진 점 잇기 문단");
    expect(html).not.toContain("다음에 볼 것 1");
  });

  it("고른 섹션만 담는다", () => {
    const { html } = renderReport({ ...base, entitled: true, sections: ["design"] });
    expect(html).toContain("디자인 신호");
    expect(html).not.toContain("마케팅 신호");
  });

  it("AI 작성 고지와 수신 거부 링크가 반드시 들어간다", () => {
    const { html } = renderReport({ ...base, entitled: true, sections: ["design"],
      unsubUrl: "https://x/unsub?t=abc" });
    expect(html).toContain("AI가 작성합니다");
    expect(html).not.toContain("사람이 검수");   // 지키지 않을 약속은 적지 않는다
    expect(html).toContain("https://x/unsub?t=abc");
  });

  // Review Focus 3 — 블록 하나가 없어도 메일은 나가야 한다.
  it("섹션 블록이 없으면 그 섹션만 빠지고 나머지는 남는다", () => {
    const { html } = renderReport({ ...base, entitled: true, sections: ["design", "marketing"],
      blocks: { ...BLOCKS, sections: { design: "디자인 신호" } } });
    expect(html).toContain("디자인 신호");
    expect(html).toContain("흩어진 점 잇기 문단");
  });

  it("HTML 특수문자가 든 블록을 이스케이프한다", () => {
    const { html } = renderReport({ ...base, entitled: true, sections: [],
      blocks: { ...BLOCKS, change: '<script>alert("x")</script>' } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("언어마다 제목이 다르다", () => {
    expect(renderReport({ ...base, lang: "en", entitled: true, sections: [] }).subject)
      .not.toBe(renderReport({ ...base, lang: "ko", entitled: true, sections: [] }).subject);
  });
});
