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
  const qs = params.toString();
  return qs ? `/contracts?${qs}` : '/contracts';
}
