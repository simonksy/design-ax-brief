import { listWeeklyRecipients } from "./mail_prefs.js";
import { getEntitlement } from "./entitlement.js";
import { renderReport } from "./report_mail.js";
import { sendReport } from "./email.js";
import { signUnsub } from "./unsub.js";

const LANG_KEYS = new Set(["en", "ko", "ja", "zh", "es"]);

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

/* cron은 일요일 22:00 UTC(= 월요일 07:00 KST)에 깨어난다. 그 시점의 KST 날짜는
   이미 '새 주의 월요일'이므로, 그대로 라벨을 만들면 아직 존재하지 않는 주의
   리포트를 찾게 되어 영영 아무것도 보내지 않는다. 7일을 빼 막 끝난 주를 구한다. */
export function editionForCron(now = new Date()) {
  return isoWeekLabel(new Date(now.getTime() + 9 * 3600 * 1000 - 7 * 86400 * 1000));
}

/* 발송은 한 사람씩 독립적이다. 한 통이 실패해도 나머지는 계속 간다 — 실패한
   주소는 기록을 남기지 않아 다음 회차에 다시 시도할 수 있지만, 그 주 리포트를
   뒤늦게 따로 보내지는 않는다. 지난 호를 늦게 받는 것보다 건너뛰는 게 낫다.

   `blocksByLang`은 {ko:{...}, en:{...}} 꼴이다. 블록 하나만 넘기면 모든 언어가
   그걸 쓴다 — 호출부가 두 모양이면 한쪽이 반드시 틀린다.

   내용이 있다는 판정 기준은 `insight` 하나다. 이 메일의 핵심이 그 한 줄이므로,
   그게 없으면 카드가 몇 장 있어도 보낼 것이 없다. */
export async function sendWeekly(env, edition, blocksByLang, opts = {}) {
  const send = opts.send || sendReport;
  const byLang = blocksByLang || {};
  // 블록 모양을 추측하지 않는다. 언어별 맵이면 그 언어를, 아니면 통째로 쓴다 —
  // 일부 언어만 생성된 주에 "맵인지 블록인지" 추측하다가 빈 메일을 보낸 적이 있다.
  const perLang = Object.keys(byLang).some((k) => LANG_KEYS.has(k));
  const pick = (lang) => {
    if (!perLang) return byLang;
    const got = byLang[lang];
    if (got && got.insight) return got;
    // 그 언어가 없으면 내용이 '있는' 아무 블록으로 떨어진다. 머리말은 수신자
    // 언어로 나가고 본문만 폴백이라 어색하지만, 빈 메일보다는 낫다.
    return Object.values(byLang).find((b) => b && b.insight) || got || {};
  };

  const people = await listWeeklyRecipients(env.DB);
  let sent = 0, skipped = 0, failed = 0;

  for (const person of people) {
    const id = `weekly:${edition}:${person.email}`;
    const blocks = pick(person.lang) || {};

    // 보여줄 내용이 없으면 보내지 않는다. 인사이트 없는 메일은 그 주의 단 한 번뿐인
    // 접점을 태우고, 받는 쪽에는 스팸으로 읽힌다.
    if (!blocks.insight) { skipped++; continue; }

    // 자리를 먼저 선점한다. 보낸 뒤에 기록하면 그 사이에 격리가 죽었을 때
    // 다음 실행이 같은 사람에게 한 번 더 보낸다. 실패하면 선점을 푼다.
    const claim = await env.DB.prepare(
      "INSERT OR IGNORE INTO mail_sent (id, sent_at) VALUES (?,?)"
    ).bind(id, Math.floor(Date.now() / 1000)).run();
    if (!(claim.meta && claim.meta.changes)) { skipped++; continue; }
    // 권한은 발송 '시점'에 읽는다 — 목록을 만든 시각과 보내는 시각 사이에
    // 구독이 끝날 수 있고, 그때 ②③④가 나가면 유료 콘텐츠 유출이다.
    const ent = await getEntitlement(env.DB, person.email);
    const token = await signUnsub(person.email, env.SESSION_SIGNING_KEY);
    const { subject, html } = renderReport({
      edition, lang: person.lang, blocks, entitled: ent.entitled,
      unsubUrl: `${env.BASE_URL}/api/mail/unsubscribe?t=${token}`,
    });

    try {
      await send(env, person.email, subject, html);
      sent++;
    } catch (e) {
      // 선점을 푼다 — 보내지 못한 것을 보냈다고 남겨 두면 영영 못 간다.
      await env.DB.prepare("DELETE FROM mail_sent WHERE id = ?").bind(id).run();
      console.error("weekly: send failed", person.email, String((e && e.message) || e));
      failed++;
    }
  }
  return { sent, skipped, failed };
}
