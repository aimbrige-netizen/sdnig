// 계약 업체 리스트의 필터 상태 ↔ URL 쿼리 변환.
// 서버 컴포넌트(칩 링크 생성)와 클라이언트 컨트롤이 같은 규칙을 써야 하므로
// 'use client' 모듈이 아닌 공용 모듈에 둡니다.

export type ContractSort = 'latest' | 'name';

export interface ContractQuery {
  q: string;
  type: string;
  /** 진행 상태 필터 — ContractStatus 코드 하나, 또는 아직 메모가 없는 곳만 보는 'none', 또는 전체('') */
  status: string;
  sort: ContractSort;
  incomplete: boolean;
  /** 날짜로 작업 검색(YYYY-MM-DD) — 켜져 있으면 업체 목록 대신 그 날짜의 메모 전체를 모아 보여준다.
   * 계약 형태·진행 상태·검색어·정렬과는 독립적인 별도 보기라, 그 필터들과 함께 조합되지 않는다. */
  date: string;
  /** 오른쪽 캘린더가 펼쳐 보여줄 달(YYYY-MM). 빈 값 = 이번 달.
   * 목록을 거르는 조건이 아니라 "달력을 어디까지 넘겨놨나"만 담는다 — 그래서 칩·검색을
   * 조작해도 이 값은 그대로 따라다닌다(달력이 제자리로 튀어 돌아가지 않게). */
  month: string;
}

/** 현재 필터 상태에서 일부만 바꾼 /contracts URL을 만듭니다. */
export function buildContractsUrl(current: ContractQuery, changes: Partial<ContractQuery>): string {
  const next = { ...current, ...changes };
  const params = new URLSearchParams();
  if (next.q.trim()) params.set('q', next.q.trim());
  if (next.type) params.set('type', next.type);
  if (next.status) params.set('status', next.status);
  if (next.sort !== 'latest') params.set('sort', next.sort);
  if (next.incomplete) params.set('incomplete', '1');
  if (next.date) params.set('date', next.date);
  if (next.month) params.set('m', next.month);
  const qs = params.toString();
  return qs ? `/contracts?${qs}` : '/contracts';
}
