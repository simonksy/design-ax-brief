import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../index.js";
import schema from "../schema.sql?raw";
import { sendWeekly, isoWeekLabel, editionForCron } from "../lib/weekly_send.js";
import { setPrefs, listWeeklyRecipients } from "../lib/mail_prefs.js";

const B = { insight: "핵심 인사이트 한 줄", article: "에디터가 쓴 짧은 글.",
            evidence: [{ headline: "사례", section: "design", url: "https://x/c",
                         image: "https://x/i.jpg", role: "명제를 떠받친다" }] };
const call = (path, init) => worker.fetch(new Request("http://localhost" + path, init), env, {
  waitUntil() {}, passThroughOnException() {},
});

beforeAll(async () => {
  for (const s of schema.split(";").map(x => x.trim()).filter(Boolean))
    await env.DB.exec(s.replace(/\s+/g, " "));
});
beforeEach(async () => {
  env.__sentReports = [];
  await env.DB.exec("DELETE FROM mail_sent");
  await env.DB.exec("DELETE FROM mail_prefs");
  await env.DB.exec("DELETE FROM subscribers");
});

// C3 — cron은 일요일 22:00 UTC(= 월 07:00 KST)에 깨어난다. 그때 보내야 할 것은
// 막 '끝난' 주의 리포트다. 시작된 주를 요청하면 파일이 없어 영영 안 나간다.
describe("editionForCron", () => {
  it("일요일 22:00 UTC에 깨면 막 끝난 주를 요청한다", () => {
    expect(editionForCron(new Date("2026-10-11T22:00:00Z"))).toBe("2026-W41");
  });
  it("그 다음 주도 한 칸씩 밀린다", () => {
    expect(editionForCron(new Date("2026-10-18T22:00:00Z"))).toBe("2026-W42");
  });
});

// C2 — 설정 화면을 한 번도 안 연 구독자도 받아야 한다. mail_prefs 행이 있는
// 사람만 세면 첫 발송이 아무에게도 가지 않는다.
describe("listWeeklyRecipients", () => {
  it("설정을 저장한 적 없는 구독자도 목록에 든다", async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO subscribers (email,status,provider,created_at,updated_at) VALUES (?,?,?,?,?)")
      .bind("payer@x.com", "active", "paddle", now, now).run();
    const list = (await listWeeklyRecipients(env.DB)).map(r => r.email);
    expect(list).toContain("payer@x.com");
  });

  it("그 구독자가 수신 거부하면 빠진다", async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO subscribers (email,status,provider,created_at,updated_at) VALUES (?,?,?,?,?)")
      .bind("quit@x.com", "active", "paddle", now, now).run();
    await setPrefs(env.DB, "quit@x.com", { weekly: 0 });
    expect((await listWeeklyRecipients(env.DB)).map(r => r.email)).not.toContain("quit@x.com");
  });

  it("같은 주소가 두 번 나오지 않는다", async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT INTO subscribers (email,status,provider,created_at,updated_at) VALUES (?,?,?,?,?)")
      .bind("both@x.com", "active", "paddle", now, now).run();
    await setPrefs(env.DB, "both@x.com", { lang: "en" });
    const list = (await listWeeklyRecipients(env.DB)).map(r => r.email);
    expect(list.filter(e => e === "both@x.com").length).toBe(1);
  });
});

describe("sendWeekly 안전장치", () => {
  // I8 — 보여줄 내용이 없으면 보내지 않는다. 빈 메일로 그 주 한 통을 태우면 안 된다.
  it("인사이트가 비면 보내지 않고 기록도 남기지 않는다", async () => {
    await setPrefs(env.DB, "empty@x.com", { weekly: 1 });
    const r = await sendWeekly(env, "2026-W50", { ko: { ...B, insight: "" } });
    expect(env.__sentReports.length).toBe(0);
    expect(r.skipped).toBeGreaterThan(0);
    const row = await env.DB.prepare("SELECT 1 FROM mail_sent WHERE id=?")
      .bind("weekly:2026-W50:empty@x.com").first();
    expect(row).toBeNull();
  });

  // I4 — 일부 언어만 생성된 주에도 각자 읽을 내용을 받아야 한다.
  it("일부 언어만 생성돼도 빈 메일을 보내지 않는다", async () => {
    await setPrefs(env.DB, "ko2@x.com", { weekly: 1, lang: "ko" });
    await sendWeekly(env, "2026-W51", { es: { ...B, insight: "cambio" } });
    const m = env.__sentReports.find(x => x.to === "ko2@x.com");
    expect(m).toBeDefined();
    expect(m.html).toContain("cambio");   // 폴백 블록이라도 내용이 있어야 한다
  });

  // I11 — 보내기 전에 자리를 찜한다. 보낸 뒤 기록하면 그 사이에 죽었을 때 두 번 간다.
  it("발송 전에 기록을 선점해 중복 발송을 막는다", async () => {
    await setPrefs(env.DB, "claim@x.com", { weekly: 1 });
    let seenAtSendTime = null;
    await sendWeekly(env, "2026-W52", { ko: B }, {
      send: async (e, to, s, h) => {
        seenAtSendTime = await env.DB.prepare("SELECT 1 FROM mail_sent WHERE id=?")
          .bind("weekly:2026-W52:claim@x.com").first();
        (e.__sentReports ||= []).push({ to, subject: s, html: h });
      },
    });
    expect(seenAtSendTime).not.toBeNull();
  });

  it("발송에 실패하면 선점을 풀어 다음에 다시 시도할 수 있다", async () => {
    await setPrefs(env.DB, "fail@x.com", { weekly: 1 });
    await sendWeekly(env, "2026-W53", { ko: B }, { send: async () => { throw new Error("x"); } });
    const row = await env.DB.prepare("SELECT 1 FROM mail_sent WHERE id=?")
      .bind("weekly:2026-W53:fail@x.com").first();
    expect(row).toBeNull();
  });
});

// C1 — Pro 전용 본문이 정적 자산으로 그대로 서빙되면 유료 콘텐츠가 공개된다.
describe("reports 노출 차단", () => {
  it("/reports/* 는 누구에게도 열리지 않는다", async () => {
    const r = await call("/reports/2026-W41/ko.json");
    expect(r.status).toBe(403);
  });
});

// I9 — 메일 링크를 프리페치하는 보안 게이트웨이가 유료 구독자를 조용히 끊어버린다.
describe("수신 거부는 눌러야 끊긴다", () => {
  it("GET은 확인 화면만 보여주고 끊지 않는다", async () => {
    const { signUnsub } = await import("../lib/unsub.js");
    const t = await signUnsub("prefetch@x.com", env.SESSION_SIGNING_KEY);
    const r = await call(`/api/mail/unsubscribe?t=${t}`);
    expect(r.status).toBe(200);
    const { getPrefs } = await import("../lib/mail_prefs.js");
    expect((await getPrefs(env.DB, "prefetch@x.com")).unsub_all).toBe(0);
  });

  it("POST라야 실제로 끊긴다", async () => {
    const { signUnsub } = await import("../lib/unsub.js");
    const t = await signUnsub("real@x.com", env.SESSION_SIGNING_KEY);
    const r = await call(`/api/mail/unsubscribe?t=${t}`, { method: "POST" });
    expect(r.status).toBe(200);
    const { getPrefs } = await import("../lib/mail_prefs.js");
    expect((await getPrefs(env.DB, "real@x.com")).unsub_all).toBe(1);
  });
});
