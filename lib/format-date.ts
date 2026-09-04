// 계약 업체 DB 화면에서 공통으로 쓰는 날짜 포맷터.
// 서버가 이미 KST 기준으로 날짜만 저장·조회하는 값(memoDate, 등록일)과,
// 실제 기록 시각까지 보여줘야 하는 값(메모를 남긴 시각)을 구분합니다.

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

/** 오늘 날짜를 KST 기준 YYYY-MM-DD 로 — 브라우저의 로컬 타임존을 믿지 않고 명시적으로 서울 기준을 쓴다 */
export function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
