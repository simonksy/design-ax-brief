import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import schema from "../schema.sql?raw";
import { sendWeekly, isoWeekLabel } from "../lib/weekly_send.js";
import { setPrefs } from "../lib/mail_prefs.js";

const BLOCKS = {
  insight: "핵심 인사이트 한 줄",
  article: "에디터가 쓴 짧은 글.",
  evidence: [{ headline: "무료사례", section: "design", url: "https://x/c1",
               image: "https://x/i1.jpg", role: "명제의 앞쪽을 떠받친다" },
             { headline: "잠긴사례", section: "music", url: "https://x/c2",
               image: "https://x/i2.jpg", role: "명제의 뒤쪽을 떠받친다" }],
};

beforeAll(async () => {
  for (const s of schema.split(";").map(x => x.trim()).filter(Boolean))
    await env.DB.exec(s.replace(/\s+/g, " "));
  await env.DB.exec("DELETE FROM mail_prefs");
});
beforeEach(async () => {
  env.__sentReports = [];
  await env.DB.exec("DELETE FROM mail_sent");
});

describe("isoWeekLabel", () => {
  // 파이썬 build_report.week_edition과 같은 라벨을 내야 파일을 찾는다.
  it("파이썬 week_edition과 같은 라벨을 만든다", () => {
    expect(isoWeekLabel(new Date("2026-10-06T00:00:00Z"))).toBe("2026-W41");
    expect(isoWeekLabel(new Date("2026-10-05T00:00:00Z"))).toBe("2026-W41");  // 그 주 월요일
    expect(isoWeekLabel(new Date("2026-10-04T00:00:00Z"))).toBe("2026-W40");  // 전주 일요일
  });
});

describe("sendWeekly", () => {
  it("같은 edition을 두 번 돌려도 한 번만 나간다", async () => {
    await setPrefs(env.DB, "dup@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W41", BLOCKS);
    const first = env.__sentReports.length;
    expect(first).toBeGreaterThan(0);
    await sendWeekly(env, "2026-W41", BLOCKS);
    expect(env.__sentReports.length).toBe(first);
  });

  // Review Focus 4 — 발송 '시점'의 권한으로 판단한다.
  it("구독하지 않은 사람은 명제와 첫 사례까지만 받는다", async () => {
    await setPrefs(env.DB, "free@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W42", BLOCKS);
    const mail = env.__sentReports.find(m => m.to === "free@x.com");
    expect(mail.html).toContain("핵심 인사이트 한 줄");
    expect(mail.html).toContain("무료사례");
    expect(mail.html).not.toContain("잠긴사례");
  });

  // Review Focus 3 — 사례를 한 건도 못 뽑은 주에도 명제는 나가야 한다.
  it("사례가 비어도 인사이트만으로 메일은 나간다", async () => {
    await setPrefs(env.DB, "partial@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W43", { ...BLOCKS, evidence: [] });
    const mail = env.__sentReports.find(m => m.to === "partial@x.com");
    expect(mail).toBeDefined();
    expect(mail.html).toContain("핵심 인사이트 한 줄");
  });

  // Review Focus 5 — 한 통의 실패가 나머지를 막지 않는다.
  it("한 주소에서 실패해도 나머지는 계속 보낸다", async () => {
    await env.DB.exec("DELETE FROM mail_prefs");
    await setPrefs(env.DB, "ok1@x.com", { weekly: 1 });
    await setPrefs(env.DB, "boom@x.com", { weekly: 1 });
    await setPrefs(env.DB, "ok2@x.com", { weekly: 1 });
    const r = await sendWeekly(env, "2026-W44", BLOCKS, {
      send: async (e, to, s, h) => {
        if (to === "boom@x.com") throw new Error("nope");
        (e.__sentReports ||= []).push({ to, subject: s, html: h });
      },
    });
    expect(r.failed).toBe(1);
    expect(env.__sentReports.map(m => m.to).sort()).toEqual(["ok1@x.com", "ok2@x.com"]);
  });

  it("실패한 주소는 발송 기록을 남기지 않는다 — 다음 회차에 다시 시도할 수 있다", async () => {
    await env.DB.exec("DELETE FROM mail_prefs");
    await setPrefs(env.DB, "retry@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W45", BLOCKS, { send: async () => { throw new Error("x"); } });
    const row = await env.DB.prepare("SELECT 1 FROM mail_sent WHERE id=?")
      .bind("weekly:2026-W45:retry@x.com").first();
    expect(row).toBeNull();
  });

  it("언어별 블록 묶음을 주면 각자 자기 언어 블록을 받는다", async () => {
    await env.DB.exec("DELETE FROM mail_prefs");
    await setPrefs(env.DB, "ko@x.com", { weekly: 1, lang: "ko" });
    await setPrefs(env.DB, "en@x.com", { weekly: 1, lang: "en" });
    await sendWeekly(env, "2026-W46", {
      ko: { ...BLOCKS, insight: "한국어 인사이트" },
      en: { ...BLOCKS, insight: "English insight" },
    });
    expect(env.__sentReports.find(m => m.to === "ko@x.com").html).toContain("한국어 인사이트");
    expect(env.__sentReports.find(m => m.to === "en@x.com").html).toContain("English insight");
  });
});
