// 계약 업체 DB 화면에서 공통으로 쓰는 날짜 유틸.
//
// ⚠️ 이 파일에서 가장 중요한 구분: **날짜 컬럼과 시각 컬럼은 경계가 다르다.**
//
//   - ContractMemo.memoDate 는 Prisma 의 @db.Date 라, 값이 항상 "그 날 UTC 자정"으로
//     왕복한다. 즉 2026-09-04 는 DB 에서 2026-09-04T00:00:00.000Z 다.
//     → 쿼리에 쓸 때는 dateOnlyUTC() 를 쓴다.
//   - ContractedVendor.createdAt / ContractMemo.createdAt 은 진짜 타임스탬프다.
//     "KST 기준 9월 4일에 등록된 곳"은 2026-09-03T15:00Z ~ 2026-09-04T15:00Z 구간이다.
//     → 쿼리에 쓸 때는 kstDayStartUTC() 를 쓴다.
//
// 둘을 바꿔 쓰면 결과가 정확히 하루씩 밀린다. 한국은 서머타임이 없어 +09:00 은 영구히 맞다.

export function formatDateKST(date: Date | string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(date))
    .replace(/\. /g, '.')
    .replace(/\.$/, '');
}

export function formatDateTimeKST(date: Date | string): string {
  const d = new Date(date);
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${formatDateKST(d)} ${time}`;
}

/** 시:분만 (예: "14:22") — 같은 날짜 안에서만 쓰는 목록에서 날짜 반복을 피한다 */
export function formatTimeKST(date: Date | string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

/** 임의의 시각을 KST 기준 YYYY-MM-DD 로 — 브라우저·서버의 로컬 타임존을 믿지 않는다 */
export function ymdKST(date: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(date));
}

/** 오늘 날짜를 KST 기준 YYYY-MM-DD 로 */
export function todayKST(): string {
  return ymdKST(new Date());
}

/** YYYY-MM-DD 에 n일을 더한다(n<0 이면 뺀다). UTC 자정으로 계산해 서머타임·타임존 영향을 받지 않는다. */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** memoDate(@db.Date) 전용 — "그 날"을 나타내는 UTC 자정 Date */
export function dateOnlyUTC(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** createdAt(타임스탬프) 전용 — KST 기준 그 날이 시작되는 순간 (= 전날 15:00Z) */
export function kstDayStartUTC(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

/** "오늘 / 어제 / 3일 전 / 08.21" — 최근일수록 사람이 읽는 말로, 오래된 건 날짜로.
 *  기준은 항상 KST 달력 날짜라, 자정 직후에도 "0일 전" 같은 이상한 표현이 안 나온다. */
export function relativeDayKST(date: Date | string): string {
  const ymd = ymdKST(date);
  const today = todayKST();
  if (ymd === today) return '오늘';
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${ymd}T00:00:00.000Z`)) / 86_400_000
  );
  if (diff === 1) return '어제';
  if (diff > 1 && diff <= 6) return `${diff}일 전`;
  if (diff === -1) return '내일';
  if (diff < -1 && diff >= -6) return `${-diff}일 후`;
  return ymd.slice(5).replace('-', '.'); // MM.DD
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "9월 4일 (목)" — 날짜 검색 모드 머리말처럼, 요일까지 있어야 감이 오는 자리에 쓴다 */
export function formatDayHeadingKST(ymd: string): string {
  const d = dateOnlyUTC(ymd);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}
