// 카테고리는 코드 상수로 관리 (기획서 3절 — 마스터 데이터 관리 화면 없음)
export const CATEGORIES = [
  { code: 'wedding_hall', label: '웨딩홀' },
  { code: 'studio', label: '스튜디오' },
  { code: 'dress', label: '드레스' },
  { code: 'hair_makeup', label: '헤어&메이크업' },
  { code: 'hair', label: '헤어변형' },
  { code: 'main_snap', label: '본식스냅' },
  { code: 'snap', label: '스냅' },
  { code: 'video', label: '영상(DVD)' },
  { code: 'jewelry', label: '예물' },
  { code: 'suit', label: '예복' },
  { code: 'hanbok', label: '한복' },
  { code: 'bouquet', label: '부케' },
  { code: 'invitation', label: '청첩장' },
  { code: 'mc', label: '사회' },
] as const;

export type CategoryCode = (typeof CATEGORIES)[number]['code'];

export const CATEGORY_CODES = CATEGORIES.map((c) => c.code) as CategoryCode[];

export function categoryLabel(code: string): string {
  return CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

// 사진 타입 (기획서 9절)
export const PHOTO_TYPES = ['main', 'gallery', 'dress'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export interface VendorPhoto {
  url: string;
  type: PhotoType;
  label?: string;
  sortOrder: number;
}

export interface ProductItem {
  name: string;
  description: string;
  price?: number | null; // 상품가격 (선택)
  photos?: string[]; // 상품사진 (선택, 여러 장 가능)
}

export interface OptionItem {
  name: string;
  price: number | null;
  desc: string;
}
