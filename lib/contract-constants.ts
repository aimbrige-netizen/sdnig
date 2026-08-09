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
