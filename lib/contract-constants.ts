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

// 계약 진행 상태 — 메모를 남길 때마다 고르는 5단계.
// 업체의 "현재 상태"는 별도 컬럼이 아니라 가장 최근 메모의 status 로 정합니다.
//
// 재컨텍요망 → 장기가망 → 미팅예정 → 미팅완료 → 계약완료 순서가 있는 단계라, 서로 다른
// 색상(categorical)이 아니라 단일 색상의 밝기 단계(ordinal 시퀀셜)로 표현합니다. "장기가망"은
// 연락은 닿았지만 전환까지 오래 걸릴 걸로 보이는 곳 — 재컨텍요망(연락 자체가 안 된 상태)보다는
// 따뜻하고 미팅예정보다는 이릅니다. 실제 색값은 app/globals.css 의 --data-status-* 토큰에
// 정의되어 있고, validate_palette.js --ordinal 로 검증했습니다.
export const CONTRACT_STATUSES = [
  { code: 'recontact', label: '재컨텍요망', dotVar: 'var(--data-status-recontact)' },
  { code: 'longterm', label: '장기가망', dotVar: 'var(--data-status-longterm)' },
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

/** 목록에서 "어디까지 갔나"를 한 줄로 보여주는 이정표 3단계.
 *
 *  5단계 전부를 열로 만들지는 않는다 — 재컨텍요망·장기가망은 "아직 못 만났다"는 같은 말이라
 *  진행 상태 배지 하나로 충분하고, 열이 늘어난 만큼 한 줄이 다시 늘어진다.
 *  이 세 개만 "실제로 일어난 사건"이라 날짜를 찍을 수 있다.
 *
 *  색은 --data-status-* 램프 그대로라 오른쪽으로 갈수록 진해진다. 셋 다 흰 배경에서
 *  본문 대비를 넘긴다(5.4 / 8.0 / 12.0 : 1) — 밝은 쪽 두 단계(재컨텍요망 2.5:1,
 *  장기가망 3.6:1)는 글자색으로 못 쓰지만 여기엔 안 들어온다. */
export const CONTRACT_MILESTONES = [
  { code: 'scheduled', label: '미팅예정', colorVar: 'var(--data-status-scheduled)' },
  { code: 'consulted', label: '미팅완료', colorVar: 'var(--data-status-consulted)' },
  { code: 'contracted', label: '계약완료', colorVar: 'var(--data-status-contracted)' },
] as const;

export const CONTRACT_MILESTONE_CODES = CONTRACT_MILESTONES.map((m) => m.code) as ContractStatus[];

/** 담당자 실적으로 세는 "결과" 두 단계.
 *
 *  미팅예정은 뺀다 — 아직 일어난 일이 아니라 잡아만 둔 약속이고, 그건 레일의
 *  "다음 연락 예정"이 이미 보여준다. 재컨텍요망·장기가망도 뺀다: 진행 중인 상태지
 *  결과가 아니다. 세로로 다섯 칸을 늘어놓으면 어느 게 어느 건지 못 읽는다는
 *  피드백을 받고 둘로 줄였다 — 대신 숫자마다 글자 라벨을 붙인다. */
export const CONTRACT_RESULT_STATUSES = [
  { code: 'consulted', label: '미팅완료', colorVar: 'var(--data-status-consulted)' },
  { code: 'contracted', label: '계약완료', colorVar: 'var(--data-status-contracted)' },
] as const;
