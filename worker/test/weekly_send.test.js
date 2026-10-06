import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import schema from "../schema.sql?raw";
import { sendWeekly, isoWeekLabel } from "../lib/weekly_send.js";
import { setPrefs } from "../lib/mail_prefs.js";

const BLOCKS = { change: "변화문단", sections: { design: "디자인신호", marketing: "마케팅신호" },
                 dots: "점잇기문단", next: ["다음볼것"] };

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
  it("구독하지 않은 사람은 ①번만 받는다", async () => {
    await setPrefs(env.DB, "free@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W42", BLOCKS);
    const mail = env.__sentReports.find(m => m.to === "free@x.com");
    expect(mail.html).toContain("변화문단");
    expect(mail.html).not.toContain("점잇기문단");
    expect(mail.html).not.toContain("디자인신호");
  });

  // Review Focus 3 — 블록 하나가 비어도 메일은 나간다.
  it("섹션 블록이 비어도 메일은 나간다", async () => {
    await setPrefs(env.DB, "partial@x.com", { weekly: 1, sections: "design,marketing" });
    await sendWeekly(env, "2026-W43", { ...BLOCKS, sections: { design: "디자인신호" } });
    expect(env.__sentReports.some(m => m.to === "partial@x.com")).toBe(true);
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
      ko: { ...BLOCKS, change: "한국어 변화" },
      en: { ...BLOCKS, change: "English change" },
    });
    expect(env.__sentReports.find(m => m.to === "ko@x.com").html).toContain("한국어 변화");
    expect(env.__sentReports.find(m => m.to === "en@x.com").html).toContain("English change");
  });
});
