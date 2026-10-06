/* 주간 리포트 수신 설정.

   행이 없는 사람은 "아직 고르지 않은 사람"이지 "안 받겠다는 사람"이 아니다.
   기본값을 돌려주되 행은 만들지 않는다 — 설정 화면에 들어온 적 없는 사람에게도
   리포트가 가야 하고, 조회만으로 행이 생기면 "한 번이라도 /api/me를 부른 사람"이
   전부 수신자 목록에 들어와 버린다. */
const DEFAULTS = { lang: "ko", sections: "*", weekly: 1, unsub_all: 0 };
const nowSec = () => Math.floor(Date.now() / 1000);

export async function getPrefs(db, email) {
  const row = await db.prepare(
    "SELECT email, lang, sections, weekly, unsub_all FROM mail_prefs WHERE email = ?"
  ).bind(email).first();
  return row || { email, ...DEFAULTS };
}

export async function setPrefs(db, email, patch) {
  const cur = await getPrefs(db, email);
  const next = { ...cur, ...patch };
  const t = nowSec();
  await db.prepare(
    `INSERT INTO mail_prefs (email,lang,sections,weekly,unsub_all,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET
       lang=excluded.lang, sections=excluded.sections, weekly=excluded.weekly,
       unsub_all=excluded.unsub_all, updated_at=excluded.updated_at`
  ).bind(email, next.lang, next.sections, next.weekly ? 1 : 0, next.unsub_all ? 1 : 0, t, t).run();
  return { ...next, weekly: next.weekly ? 1 : 0, unsub_all: next.unsub_all ? 1 : 0 };
}

/* 수신자는 "설정을 저장한 사람"이 아니라 "우리가 아는 사람" 전부다. mail_prefs
   행만 세면 설정 화면을 한 번도 열지 않은 구독자가 통째로 빠져, 첫 발송이
   아무에게도 가지 않는다. subscribers와 mail_prefs를 합치고, 설정이 있으면
   그걸 덮어쓴다. 명시적으로 끊은 사람만 제외한다. */
export async function listWeeklyRecipients(db) {
  const { results } = await db.prepare(
    `SELECT a.email AS email,
            COALESCE(p.lang, 'ko')     AS lang,
            COALESCE(p.sections, '*')  AS sections
       FROM (SELECT email FROM subscribers
             UNION
             SELECT email FROM mail_prefs) AS a
       LEFT JOIN mail_prefs p ON p.email = a.email
      WHERE COALESCE(p.weekly, 1) = 1
        AND COALESCE(p.unsub_all, 0) = 0`
  ).all();
  return results || [];
}

export async function unsubscribeAll(db, email) {
  await setPrefs(db, email, { weekly: 0, unsub_all: 1 });
  return true;
}
