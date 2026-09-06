// 캘린더 레일이 쓰는 날짜 계산 — "이 달의 6주 격자"와 "날짜별 건수 집계".
//
// 전부 순수 함수라 서버 컴포넌트에서 계산해 클라이언트로 내려보낼 수 있습니다.
// 날짜 문자열은 전부 KST 기준 YYYY-MM-DD 이고, 내부 계산은 UTC 자정으로만 해
// 서머타임·로컬 타임존의 영향을 받지 않습니다(한국은 서머타임이 없습니다).

import { dateOnlyUTC, ymdKST } from './format-date';

/** YYYY-MM 형태이면서 실제로 존재하는 달인지 — 아니면 null */
export function parseMonthParam(v: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(v)) return null;
  const month = Number(v.slice(5));
  return month >= 1 && month <= 12 ? v : null;
}

/** 어떤 날짜(YYYY-MM-DD)가 속한 달 (YYYY-MM) */
export function monthOf(ymd: string): string {
  return ymd.slice(0, 7);
}

/** YYYY-MM 에 n달을 더한다(음수면 뺀다) */
export function addMonths(ym: string, n: number): string {
  const d = new Date(`${ym}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/** "2026년 9월" */
export function formatMonthLabel(ym: string): string {
  return `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5))}월`;
}

/**
 * 한 달을 6주 × 7일 격자로 편다(일요일 시작). 앞뒤로 이웃 달의 날짜가 채워진다.
 *
 * 행 수를 5/6 으로 들쭉날쭉하게 두면 달을 넘길 때마다 레일 높이가 튀어 옆 목록까지
 * 밀린다 — 그래서 항상 6줄(42칸)로 고정한다.
 */
export function buildMonthGrid(ym: string): string[][] {
  const firstOfMonth = new Date(`${ym}-01T00:00:00.000Z`);
  const start = new Date(firstOfMonth);
  start.setUTCDate(1 - firstOfMonth.getUTCDay()); // 그 주의 일요일까지 되감는다

  const weeks: string[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** 격자의 첫 칸 / 마지막 칸 — 이 범위로 한 번만 조회하면 화면에 그릴 42칸을 다 채울 수 있다 */
export function monthGridRange(ym: string): { start: string; endExclusive: string } {
  const weeks = buildMonthGrid(ym);
  const start = weeks[0][0];
  const last = weeks[5][6];
  const endExclusive = new Date(dateOnlyUTC(last));
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start, endExclusive: endExclusive.toISOString().slice(0, 10) };
}

// 아래 집계 함수들이 Map 이 아니라 평범한 객체를 돌려주는 이유: 이 값이 그대로
// 클라이언트 컴포넌트의 props 로 건너가는데, Map 은 직렬화 경계를 못 넘는다.
//
// ⚠️ "활동"은 전부 createdAt(메모를 남긴 시각) 기준이다. 예전엔 사용자가 고르던 memoDate
//    를 썼는데, 그 칸이 미래 예정일도 겸해서 아직 하지도 않은 미팅이 활동 건수에 섞였다.

/** 메모 행들(작성 시각 기준) → { 'YYYY-MM-DD': 건수 }.
 *  경계는 KST 달력 하루 — 즉 "그 날 남긴 메모가 몇 건인가". */
export function countsByCreatedAtKST(rows: { createdAt: Date }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = ymdKST(r.createdAt);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** 메모 행들 → { 'YYYY-MM-DD': { 상태코드: 건수 } }. 역시 KST 달력 하루 기준.
 *
 *  createdAt 은 타임스탬프라 DB 의 groupBy 로는 이걸 못 만든다 — groupBy(['createdAt'])
 *  는 밀리초까지 다른 값이라 메모 하나당 한 행이 나오고, DB 쪽 날짜 절단은 UTC 기준이라
 *  KST 00~09시에 남긴 메모가 전부 하루 앞으로 밀린다. raw SQL 을 쓰지 않는 한 이렇게
 *  행을 받아 JS 에서 KST 로 묶는 게 유일하게 맞는 방법이다. */
export function countsByCreatedAtAndStatus(
  rows: { createdAt: Date; status: string }[]
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const key = ymdKST(r.createdAt);
    const inner = (out[key] ??= {});
    inner[r.status] = (inner[r.status] ?? 0) + 1;
  }
  return out;
}

/** 예정일(@db.Date, UTC 자정) 행들 → { 'YYYY-MM-DD': 건수 }.
 *  앞으로 할 일이라 활동 집계와는 절대 합치지 않는다 — 달력에서도 다른 표시를 쓴다. */
export function countsByDateOnly(rows: { nextContactAt: Date | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.nextContactAt) continue;
    const key = r.nextContactAt.toISOString().slice(0, 10);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
