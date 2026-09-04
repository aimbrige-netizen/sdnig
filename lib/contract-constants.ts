// 계약 업체 DB 상수 — 계약 형태(서면/구두) 분류
//
// 색상은 dataviz 스킬의 검증된 categorical 슬롯을 사용합니다.
// (validate_palette.js, light/흰 카드 표면 기준 전 항목 PASS —
//  all-pairs CVD ΔE 24.7, 일반시야 ΔE 33.6, 대비 모두 3:1 이상)
// 실제 색값은 app/globals.css 의 --data-contract-* 토큰에 정의되어 있고,
// 여기서는 역할 이름만 참조합니다. 색은 항상 텍스트가 아니라 옆의 점(mark)이 입습니다.

export const CONTRACT_TYPES = [
  { code: 'written', label: '계약서 작성', dotVar: 'var(--data-contract-written)' },
  { code: 'verbal', label: '구두 계약만', dotVar: 'var(--data-contract-verbal)' },
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number]['code'];

export const CONTRACT_TYPE_CODES = CONTRACT_TYPES.map((t) => t.code) as ContractType[];

export function contractTypeLabel(code: string): string {
  return CONTRACT_TYPES.find((t) => t.code === code)?.label ?? code;
}

export function contractTypeDot(code: string): string {
  return CONTRACT_TYPES.find((t) => t.code === code)?.dotVar ?? 'var(--muted-foreground)';
}

/** 전화번호·주소 중 하나라도 비어 있으면 "정보 미비" — 추가로 받아야 할 곳 */
export function isInfoIncomplete(v: { phone: string | null; address: string | null }): boolean {
  return !v.phone?.trim() || !v.address?.trim();
}

// 계약 진행 상태 — 메모를 남길 때마다 고르는 4단계.
// 업체의 "현재 상태"는 별도 컬럼이 아니라 가장 최근 메모의 status 로 정합니다.
//
// 재컨텍요망 → 미팅예정 → 미팅완료 → 계약완료 순서가 있는 단계라, 서로 다른 색상(categorical)이
// 아니라 단일 색상의 밝기 단계(ordinal 시퀀셜)로 표현합니다. 실제 색값은 app/globals.css 의
// --data-status-* 토큰에 정의되어 있고, validate_palette.js --ordinal 로 검증했습니다.
export const CONTRACT_STATUSES = [
  { code: 'recontact', label: '재컨텍요망', dotVar: 'var(--data-status-recontact)' },
  { code: 'scheduled', label: '미팅예정', dotVar: 'var(--data-status-scheduled)' },
  { code: 'consulted', label: '미팅완료', dotVar: 'var(--data-status-consulted)' },
  { code: 'contracted', label: '계약완료', dotVar: 'var(--data-status-contracted)' },
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number]['code'];

export const CONTRACT_STATUS_CODES = CONTRACT_STATUSES.map((s) => s.code) as ContractStatus[];

export function contractStatusLabel(code: string): string {
  return CONTRACT_STATUSES.find((s) => s.code === code)?.label ?? code;
}

export function contractStatusDot(code: string): string {
  return CONTRACT_STATUSES.find((s) => s.code === code)?.dotVar ?? 'var(--muted-foreground)';
}
