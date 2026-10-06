import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import schema from "../schema.sql?raw";
import { getPrefs, setPrefs, listWeeklyRecipients, unsubscribeAll } from "../lib/mail_prefs.js";

beforeAll(async () => {
  for (const s of schema.split(";").map(x => x.trim()).filter(Boolean))
    await env.DB.exec(s.replace(/\s+/g, " "));
});

describe("mail_prefs", () => {
  it("행이 없으면 기본값을 주되 행을 만들지는 않는다", async () => {
    const p = await getPrefs(env.DB, "nobody@x.com");
    expect(p).toMatchObject({ email: "nobody@x.com", sections: "*", weekly: 1, unsub_all: 0 });
    const row = await env.DB.prepare("SELECT 1 FROM mail_prefs WHERE email=?").bind("nobody@x.com").first();
    expect(row).toBeNull();
  });

  it("준 필드만 덮어쓰고 나머지는 유지한다", async () => {
    await setPrefs(env.DB, "a@x.com", { lang: "en" });
    await setPrefs(env.DB, "a@x.com", { sections: "design,marketing" });
    const p = await getPrefs(env.DB, "a@x.com");
    expect(p.lang).toBe("en");
    expect(p.sections).toBe("design,marketing");
    expect(p.weekly).toBe(1);
  });

  it("수신 거부한 사람과 weekly=0인 사람은 발송 목록에서 빠진다", async () => {
    await setPrefs(env.DB, "on@x.com", { weekly: 1 });
    await setPrefs(env.DB, "off@x.com", { weekly: 0 });
    await setPrefs(env.DB, "gone@x.com", { weekly: 1 });
    await unsubscribeAll(env.DB, "gone@x.com");
    const list = (await listWeeklyRecipients(env.DB)).map(r => r.email);
    expect(list).toContain("on@x.com");
    expect(list).not.toContain("off@x.com");
    expect(list).not.toContain("gone@x.com");
  });
});
