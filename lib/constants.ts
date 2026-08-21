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
// 'video' 는 영상(DVD) 업종의 샘플 영상 — 사진과 같은 photos 배열에 type 으로 구분해 담는다.
// (열을 따로 만들지 않아도 저장·불러오기·파일 정리가 모두 그대로 동작한다)
export const PHOTO_TYPES = ['main', 'gallery', 'dress', 'video'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export interface VendorPhoto {
  url: string;
  type: PhotoType;
  label?: string;
  sortOrder: number;
}

// ---- 업로드 제한 ----
// Supabase 무료 플랜의 파일 1개 최대 크기. 프로덕션에서 실측한 값으로,
// 52,428,800바이트(50MiB)까지는 200, 여기서 1바이트만 넘어도 400을 돌려준다.
// 플랜을 올리면 Supabase 대시보드에서 이 한도를 키울 수 있다(그때 이 값도 같이 올릴 것).
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

// 휴대폰으로 찍은 영상 기준: 안드로이드는 mp4, 아이폰은 mov(quicktime).
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
] as const;

export const UPLOAD_MIME_TYPES = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES] as const;

export function isVideoMime(type: string): boolean {
  return (VIDEO_MIME_TYPES as readonly string[]).includes(type);
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|qt)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

/**
 * 업로드를 받아도 되는 파일인지 판정한다.
 *
 * 일부 안드로이드 기기·브라우저는 파일의 MIME 을 빈 문자열로 준다. MIME 만 보고 막으면
 * 멀쩡한 영상이 거부되므로, 비어 있을 때는 파일명 확장자로 판단한다.
 * (클라이언트와 서버가 같은 규칙을 써야 한쪽만 통과하는 일이 없다.)
 */
export function isAllowedUpload(name: string, type: string): boolean {
  if (type) return (UPLOAD_MIME_TYPES as readonly string[]).includes(type);
  return VIDEO_EXT.test(name) || IMAGE_EXT.test(name);
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
