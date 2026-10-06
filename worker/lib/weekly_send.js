import { listWeeklyRecipients } from "./mail_prefs.js";
import { getEntitlement } from "./entitlement.js";
import { renderReport } from "./report_mail.js";
import { sendReport } from "./email.js";
import { signUnsub } from "./unsub.js";

/* ISO 주차 라벨. pipeline/build_report.py의 week_edition과 결과가 같아야 한다 —
   한쪽이 2026-W41을 쓰는데 다른 쪽이 2026-W40을 찾으면 리포트 파일을 못 찾아
   메일이 조용히 나가지 않는다. 양쪽 모두 테스트로 고정했다. */
export function isoWeekLabel(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;            // 월=1 … 일=7
  t.setUTCDate(t.getUTCDate() + 4 - day);    // 그 주의 목요일 = ISO 주차의 기준
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* 발송은 한 사람씩 독립적이다. 한 통이 실패해도 나머지는 계속 간다 — 실패한
   주소는 기록을 남기지 않아 다음 회차에 다시 시도할 수 있지만, 그 주 리포트를
   뒤늦게 따로 보내지는 않는다. 지난 호를 늦게 받는 것보다 건너뛰는 게 낫다.

   `blocksByLang`은 {ko:{...}, en:{...}} 꼴이다. 블록 하나만 넘기면 모든 언어가
   그걸 쓴다 — 호출부가 두 모양이면 한쪽이 반드시 틀린다. */
export async function sendWeekly(env, edition, blocksByLang, opts = {}) {
  const send = opts.send || sendReport;
  const byLang = blocksByLang || {};
  const looksPerLang = byLang.ko || byLang.en || byLang.ja || byLang.zh || byLang.es;
  const pick = (lang) => (looksPerLang ? (byLang[lang] || byLang.ko || byLang.en) : byLang);

  const people = await listWeeklyRecipients(env.DB);
  let sent = 0, skipped = 0, failed = 0;

  for (const person of people) {
    const id = `weekly:${edition}:${person.email}`;
    const seen = await env.DB.prepare("SELECT 1 FROM mail_sent WHERE id = ?").bind(id).first();
    if (seen) { skipped++; continue; }

    const blocks = pick(person.lang) || {};
    // 권한은 발송 '시점'에 읽는다 — 목록을 만든 시각과 보내는 시각 사이에
    // 구독이 끝날 수 있고, 그때 ②③④가 나가면 유료 콘텐츠 유출이다.
    const ent = await getEntitlement(env.DB, person.email);
    const sections = person.sections === "*"
      ? Object.keys(blocks.sections || {})
      : String(person.sections || "").split(",").map((s) => s.trim()).filter(Boolean);

    const token = await signUnsub(person.email, env.SESSION_SIGNING_KEY);
    const { subject, html } = renderReport({
      edition, lang: person.lang, blocks, entitled: ent.entitled, sections,
      unsubUrl: `${env.BASE_URL}/api/mail/unsubscribe?t=${token}`,
    });

    try {
      await send(env, person.email, subject, html);
      await env.DB.prepare("INSERT OR IGNORE INTO mail_sent (id, sent_at) VALUES (?,?)")
        .bind(id, Math.floor(Date.now() / 1000)).run();
      sent++;
    } catch (e) {
      // 기록을 남기지 않는다 — 보내지 못한 것을 보냈다고 적으면 영영 못 간다.
      console.error("weekly: send failed", person.email, String((e && e.message) || e));
      failed++;
    }
  }
  return { sent, skipped, failed };
}
