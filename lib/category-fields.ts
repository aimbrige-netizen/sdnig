// 업종별 전용 필드 정의 (기획서 6절 — category_data JSON에 저장)
// 폼 렌더링과 zod 검증 스키마 생성이 모두 이 정의를 기준으로 동작합니다.

import type { CategoryCode } from './constants';

/** 반복 리스트 안의 항목 필드 */
export interface RepeatItemField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'time' | 'select';
  options?: string[]; // type === 'select'
  placeholder?: string;
  unit?: string; // number 필드 단위 표시 (원, 명 등)
}

export type CategoryField =
  | { type: 'text'; key: string; label: string; placeholder?: string }
  | { type: 'textarea'; key: string; label: string; placeholder?: string }
  | { type: 'number'; key: string; label: string; unit?: string; placeholder?: string }
  | { type: 'number_range'; keyMin: string; keyMax: string; label: string; unit?: string }
  | { type: 'multiselect'; key: string; label: string; options: string[]; allowCustom?: boolean }
  | { type: 'time_range'; keyStart: string; keyEnd: string; label: string }
  | { type: 'toggle_text'; keyBool: string; keyText: string; label: string; toggleLabel: string }
  | { type: 'repeat_list'; key: string; label: string; itemFields: RepeatItemField[]; addLabel?: string };

// 6.6 본식스냅 · 스냅 — 필드구조 동일
const SNAP_FIELDS: CategoryField[] = [
  { type: 'textarea', key: 'product_composition', label: '상품구성' },
  { type: 'textarea', key: 'shoot_scope', label: '촬영범위' },
  { type: 'textarea', key: 'selection_method', label: '셀렉방법' },
  { type: 'textarea', key: 'happy_call_method', label: '해피콜방법' },
];

export const CATEGORY_FIELDS: Record<CategoryCode, CategoryField[]> = {
  // 여행사는 업종별로 따로 받을 항목이 없어 비워 둔다. 상품구성·옵션·혜택 같은
  // 내용은 전부 공통정보에 이미 있다. 빈 배열이면 폼이 [업종별 정보] 탭에
  // 안내만 띄우고 넘어간다(components/vendor-form/category-fields-form.tsx).
  travel: [],
  // 6.1 웨딩홀
  wedding_hall: [
    {
      type: 'multiselect',
      key: 'hall_types',
      label: '홀 타입 / 예식 형태',
      options: ['채플', '컨벤션홀', '하우스웨딩', '호텔', '야외', '한옥', '스몰웨딩'],
      allowCustom: true,
    },
    { type: 'text', key: 'ceremony_interval', label: '예식 간격', placeholder: '예: 90분 간격' },
    { type: 'number_range', keyMin: 'capacity_min', keyMax: 'capacity_max', label: '수용 인원', unit: '명' },
    {
      type: 'repeat_list',
      key: 'menus',
      label: '메뉴/식대',
      addLabel: '메뉴 추가',
      itemFields: [
        { key: 'name', label: '메뉴명', type: 'text', placeholder: '예: 스탠다드 뷔페' },
        { key: 'price_per_person', label: '1인 가격', type: 'number', unit: '원' },
      ],
    },
    { type: 'number', key: 'rental_fee', label: '대관료', unit: '원' },
    { type: 'number', key: 'production_fee', label: '연출료', unit: '원' },
    { type: 'textarea', key: 'flower_decoration', label: '꽃장식', placeholder: '기본 포함여부, 업그레이드 옵션 등' },
    { type: 'textarea', key: 'alcohol_policy', label: '음주류', placeholder: '반입 가능여부, 콜키지 등' },
    {
      type: 'repeat_list',
      key: 'hall_details',
      label: '홀 타입별 상세설명',
      addLabel: '홀 추가',
      itemFields: [
        { key: 'hall_name', label: '홀 이름', type: 'text', placeholder: '예: 그랜드홀' },
        { key: 'description', label: '설명', type: 'text', placeholder: '예: 최대 300명, 자연광 채광' },
      ],
    },
    { type: 'time_range', keyStart: 'parking_hours_start', keyEnd: 'parking_hours_end', label: '주차 가능시간' },
    { type: 'number', key: 'parking_capacity', label: '주차 가능대수', unit: '대' },
  ],

  // 6.2 스튜디오
  studio: [
    { type: 'text', key: 'shoot_duration', label: '촬영소요시간', placeholder: '예: 4시간' },
    { type: 'textarea', key: 'shoot_schedule', label: '촬영스케줄', placeholder: '회전 간격, 시간대 등' },
    { type: 'textarea', key: 'props', label: '보유소품' },
    { type: 'number', key: 'outfit_count', label: '촬영 의상 벌수', unit: '벌' },
    {
      type: 'toggle_text',
      keyBool: 'hair_vendor_allowed',
      keyText: 'notes',
      label: '참고사항',
      toggleLabel: '외부 헤어변형업체 출입 가능',
    },
  ],

  // 6.3 드레스 (드레스 사진 갤러리는 [사진관리] 탭에서 입력)
  dress: [
    { type: 'text', key: 'consultation_duration', label: '방문상담소요시간', placeholder: '예: 60분' },
    { type: 'text', key: 'basic_duration', label: '기본소요시간', placeholder: '피팅 기본 소요시간, 예: 90분' },
    { type: 'number', key: 'helper_fee', label: '헬퍼비', unit: '원' },
    { type: 'number', key: 'fitting_fee', label: '피팅비', unit: '원' },
  ],

  // 6.4 헤어&메이크업
  hair_makeup: [
    { type: 'text', key: 'main_artist_grade_makeup', label: '메인시술자직급(메이크업)', placeholder: '예: 원장, 부원장, 실장' },
    { type: 'text', key: 'main_artist_grade_hair', label: '메인시술자직급(헤어)', placeholder: '예: 원장, 부원장, 실장' },
    { type: 'textarea', key: 'aftercare', label: '시술자케어' },
  ],

  // 6.5 헤어변형
  hair: [
    { type: 'text', key: 'designer_grade', label: '디자이너직급', placeholder: '예: 원장' },
    {
      type: 'repeat_list',
      key: 'travel_fee_by_region',
      label: '지역별 출장비',
      addLabel: '지역 추가',
      itemFields: [
        { key: 'region', label: '지역명', type: 'text', placeholder: '예: 서울' },
        { key: 'amount', label: '금액', type: 'number', unit: '원' },
      ],
    },
    {
      type: 'repeat_list',
      key: 'time_extra_fees',
      label: '시간대별 추가비용',
      addLabel: '시간대 추가',
      itemFields: [
        { key: 'time_start', label: '시작', type: 'time' },
        { key: 'time_end', label: '종료', type: 'time' },
        { key: 'amount', label: '금액', type: 'number', unit: '원' },
      ],
    },
    { type: 'number', key: 'outdoor_extra_fee', label: '야외촬영 추가비용', unit: '원' },
  ],

  // 6.6 본식스냅 · 스냅 (필드구조 동일)
  main_snap: SNAP_FIELDS,
  snap: SNAP_FIELDS,

  // 6.7 영상(DVD)
  video: [
    { type: 'number', key: 'travel_fee', label: '출장비용', unit: '원' },
    { type: 'textarea', key: 'reservation_form', label: '예약양식', placeholder: '예약 절차/양식 안내' },
  ],

  // 6.8 예물
  jewelry: [
    { type: 'number_range', keyMin: 'avg_budget_min', keyMax: 'avg_budget_max', label: '평균예산대', unit: '원' },
  ],

  // 6.9 예복
  suit: [
    { type: 'textarea', key: 'custom_composition', label: '맞춤시 구성' },
    {
      type: 'repeat_list',
      key: 'price_by_fabric',
      label: '원단별 금액',
      addLabel: '원단 추가',
      itemFields: [
        { key: 'name', label: '원단명', type: 'text' },
        { key: 'amount', label: '금액', type: 'number', unit: '원' },
      ],
    },
    { type: 'number', key: 'custom_package_price', label: '맞춤 패키지 금액', unit: '원' },
    { type: 'textarea', key: 'rental_composition', label: '렌탈시 구성' },
    { type: 'number', key: 'rental_min_price', label: '렌탈 최저금액', unit: '원' },
    { type: 'number', key: 'rental_package_price', label: '렌탈 패키지 금액', unit: '원' },
    {
      type: 'repeat_list',
      key: 'options',
      label: '옵션 (기본구성+추가옵션)',
      addLabel: '옵션 추가',
      itemFields: [
        { key: 'name', label: '옵션명', type: 'text' },
        { key: 'amount', label: '금액', type: 'number', unit: '원' },
      ],
    },
    { type: 'textarea', key: 'special_notes', label: '특이사항' },
  ],

  // 6.10 한복
  hanbok: [
    {
      type: 'repeat_list',
      key: 'packages',
      label: '구성 및 금액',
      addLabel: '구성 추가',
      itemFields: [
        { key: 'type', label: '유형', type: 'select', options: ['맞춤', '대여', '맞춤대여', '가족패키지'] },
        { key: 'min_price', label: '최저금액', type: 'number', unit: '원' },
        { key: 'composition', label: '상세구성', type: 'text' },
      ],
    },
    { type: 'number', key: 'fitting_fee', label: '피팅비', unit: '원' },
    {
      type: 'toggle_text',
      keyBool: 'photo_allowed',
      keyText: 'photo_allowed_note',
      label: '고객안내사항',
      toggleLabel: '사진촬영 가능',
    },
  ],

  // 6.11 부케
  bouquet: [
    { type: 'number', key: 'main_random_price', label: '본식부케 랜덤디자인 금액~', unit: '원' },
    { type: 'number', key: 'main_request_price', label: '본식부케 디자인요청 금액~', unit: '원' },
    { type: 'textarea', key: 'main_set_composition', label: '본식부케 셋트구성' },
    { type: 'number', key: 'rehearsal_random_price', label: '리허설부케 랜덤디자인 금액~', unit: '원' },
    { type: 'number', key: 'rehearsal_request_price', label: '리허설부케 디자인요청 금액~', unit: '원' },
    { type: 'textarea', key: 'rehearsal_set_composition', label: '리허설부케 셋트구성' },
    { type: 'textarea', key: 'flower_directing', label: '플라워디렉팅 구성 및 금액' },
    { type: 'textarea', key: 'order_method', label: '주문방법' },
  ],

  // 6.12 청첩장
  invitation: [
    { type: 'textarea', key: 'order_notice', label: '주문 공지사항 (쿠폰&필수, 제휴혜택 안내)', placeholder: '제휴혜택 적용방법 안내 포함' },
  ],

  // 6.13 사회
  mc: [
    { type: 'textarea', key: 'price_composition', label: '구성 및 금액 (서울예식기준)' },
    { type: 'number', key: 'part1_price', label: '1부예식 금액', unit: '원' },
    { type: 'number', key: 'part1and2_price', label: '1부+2부 사회자 금액', unit: '원' },
    { type: 'number', key: 'travel_fee', label: '출장비', unit: '원' },
    { type: 'number', key: 'designation_fee', label: '지정비', unit: '원' },
    { type: 'textarea', key: 'process_method', label: '진행방식' },
  ],
};
