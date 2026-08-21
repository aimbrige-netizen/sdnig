// 업체 폼 상태 정의 + DB JSON ↔ 폼 상태 변환
// 숫자 입력은 폼에서 문자열로 다루고, 저장 시점에 number 로 변환합니다.

import { CATEGORY_FIELDS, type CategoryField } from '@/lib/category-fields';
import type { CategoryCode, PhotoType, VendorPhoto } from '@/lib/constants';
import { joinRegion, splitRegion } from '@/lib/regions';

export interface ProductRow {
  /** 클라이언트 전용 안정적 식별자 (서버로 전송하지 않음) — 사진 업로드가 진행 중일 때
   * 배열 인덱스만으로 행을 찾으면 다른 행이 추가/삭제된 사이 엉뚱한 행을 덮어쓸 수 있어 도입 */
  id: string;
  name: string;
  description: string;
  price: string; // 상품가격 (선택) — 숫자 입력을 문자열로 보관
  photos: string[]; // 상품사진 (선택, 여러 장 가능)
}

export interface OptionRow {
  name: string;
  price: string; // 숫자 입력을 문자열로 보관
  desc: string;
}

export interface PhotoRow {
  url: string;
  label: string;
}

/** 반복 리스트 한 줄 — 필드 key → 입력값(문자열) */
export type RepeatRow = Record<string, string>;

/** 업종별 필드 폼 값 — key → 문자열/불리언/문자열배열/RepeatRow배열 */
export type CategoryDataState = Record<string, string | boolean | string[] | RepeatRow[]>;

export interface VendorFormState {
  name: string;
  authorName: string;
  category: CategoryCode | '';
  contact: string;
  businessHoursStart: string; // "HH:MM" 또는 ""
  businessHoursEnd: string;
  regionSido: string;
  regionGugun: string;
  address: string;
  products: ProductRow[];
  styleMoods: string[];
  options: OptionRow[];
  description: string;
  sdingBenefit: string;
  /** 카테고리를 바꿨다가 돌아와도 입력값이 유지되도록 카테고리별로 보관 */
  categoryDataByCategory: Partial<Record<CategoryCode, CategoryDataState>>;
  mainPhoto: string | null;
  galleryPhotos: PhotoRow[];
  dressPhotos: PhotoRow[];
  /** 영상(DVD) 업종 샘플 영상 — url + 영상 제목(label) */
  videos: PhotoRow[];
}

/** 서버로 보내는 페이로드 (lib/vendor-schema.ts 로 검증) */
export interface VendorPayloadInput {
  name: string;
  authorName: string;
  category: string;
  contact: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  region: string;
  address: string;
  products: { name: string; description: string; price: number | null; photos: string[] }[];
  styleMoods: string[];
  options: { name: string; price: number | null; desc: string }[];
  description: string;
  sdingBenefit: string;
  categoryData: Record<string, unknown>;
  photos: VendorPhoto[];
}

/** 수정 화면에서 서버 → 클라이언트로 내려주는 DTO */
export interface VendorDTO {
  id: number;
  category: string;
  name: string;
  authorName: string | null;
  contact: string | null;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  region: string | null;
  address: string | null;
  products: unknown;
  description: string | null;
  styleMoods: string[];
  options: unknown;
  sdingBenefit: string | null;
  categoryData: unknown;
  photos: unknown;
}

export function emptyProduct(): ProductRow {
  return { id: crypto.randomUUID(), name: '', description: '', price: '', photos: [] };
}
export const EMPTY_OPTION: OptionRow = { name: '', price: '', desc: '' };

export function emptyRepeatRow(field: Extract<CategoryField, { type: 'repeat_list' }>): RepeatRow {
  const row: RepeatRow = {};
  for (const f of field.itemFields) row[f.key] = '';
  return row;
}

/** 업종별 필드의 초기(빈) 상태 */
export function emptyCategoryData(category: CategoryCode): CategoryDataState {
  const state: CategoryDataState = {};
  for (const field of CATEGORY_FIELDS[category]) {
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'number':
        state[field.key] = '';
        break;
      case 'number_range':
        state[field.keyMin] = '';
        state[field.keyMax] = '';
        break;
      case 'multiselect':
        state[field.key] = [];
        break;
      case 'time_range':
        state[field.keyStart] = '';
        state[field.keyEnd] = '';
        break;
      case 'toggle_text':
        state[field.keyBool] = false;
        state[field.keyText] = '';
        break;
      case 'repeat_list':
        state[field.key] = [emptyRepeatRow(field)];
        break;
    }
  }
  return state;
}

/** 계약 업체 DB에서 넘겨받아 미리 채울 값 (같은 정보를 두 번 입력하지 않기 위함) */
export interface VendorPrefill {
  name: string;
  contact: string;
  address: string;
  regionSido: string;
  regionGugun: string;
  authorName: string;
  /** 참고용 메모 — 폼에 저장되지 않고 화면에만 보여줍니다 */
  memo: string;
}

export function initialFormState(): VendorFormState {
  return {
    name: '',
    authorName: '',
    category: '',
    contact: '',
    businessHoursStart: '',
    businessHoursEnd: '',
    regionSido: '',
    regionGugun: '',
    address: '',
    products: [emptyProduct()],
    styleMoods: [],
    options: [],
    description: '',
    sdingBenefit: '',
    categoryDataByCategory: {},
    mainPhoto: null,
    galleryPhotos: [],
    dressPhotos: [],
    videos: [],
  };
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/** DB의 category_data JSON → 폼 상태 */
export function categoryDataFromJson(category: CategoryCode, json: unknown): CategoryDataState {
  const state = emptyCategoryData(category);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return state;
  const data = json as Record<string, unknown>;

  for (const field of CATEGORY_FIELDS[category]) {
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'number':
        state[field.key] = asString(data[field.key]);
        break;
      case 'number_range':
        state[field.keyMin] = asString(data[field.keyMin]);
        state[field.keyMax] = asString(data[field.keyMax]);
        break;
      case 'multiselect':
        state[field.key] = Array.isArray(data[field.key])
          ? (data[field.key] as unknown[]).filter((v): v is string => typeof v === 'string')
          : [];
        break;
      case 'time_range':
        state[field.keyStart] = asString(data[field.keyStart]);
        state[field.keyEnd] = asString(data[field.keyEnd]);
        break;
      case 'toggle_text':
        state[field.keyBool] = data[field.keyBool] === true;
        state[field.keyText] = asString(data[field.keyText]);
        break;
      case 'repeat_list': {
        const raw = Array.isArray(data[field.key]) ? (data[field.key] as unknown[]) : [];
        const rows: RepeatRow[] = raw
          .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
          .map((r) => {
            const row = emptyRepeatRow(field);
            for (const f of field.itemFields) row[f.key] = asString(r[f.key]);
            return row;
          });
        state[field.key] = rows.length > 0 ? rows : [emptyRepeatRow(field)];
        break;
      }
    }
  }
  return state;
}

function toNumber(v: string): number | undefined {
  const trimmed = v.trim().replace(/,/g, '');
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** 폼 상태 → 저장용 category_data JSON */
export function serializeCategoryData(category: CategoryCode, state: CategoryDataState): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const putString = (key: string) => {
    const v = asString(state[key]).trim();
    if (v) out[key] = v;
  };
  const putNumber = (key: string) => {
    const n = toNumber(asString(state[key]));
    if (n !== undefined) out[key] = n;
  };

  for (const field of CATEGORY_FIELDS[category]) {
    switch (field.type) {
      case 'text':
      case 'textarea':
        putString(field.key);
        break;
      case 'number':
        putNumber(field.key);
        break;
      case 'number_range':
        putNumber(field.keyMin);
        putNumber(field.keyMax);
        break;
      case 'multiselect': {
        const arr = Array.isArray(state[field.key]) ? (state[field.key] as string[]) : [];
        if (arr.length > 0) out[field.key] = arr;
        break;
      }
      case 'time_range':
        putString(field.keyStart);
        putString(field.keyEnd);
        break;
      case 'toggle_text':
        out[field.keyBool] = state[field.keyBool] === true;
        putString(field.keyText);
        break;
      case 'repeat_list': {
        const rows = Array.isArray(state[field.key]) ? (state[field.key] as RepeatRow[]) : [];
        const items = rows
          .map((row) => {
            const item: Record<string, unknown> = {};
            let hasValue = false;
            for (const f of field.itemFields) {
              const raw = (row[f.key] ?? '').trim();
              if (!raw) continue;
              if (f.type === 'number') {
                const n = toNumber(raw);
                if (n !== undefined) {
                  item[f.key] = n;
                  hasValue = true;
                }
              } else {
                item[f.key] = raw;
                hasValue = true;
              }
            }
            return hasValue ? item : null;
          })
          .filter((item): item is Record<string, unknown> => item !== null);
        if (items.length > 0) out[field.key] = items;
        break;
      }
    }
  }
  return out;
}

/** 폼 상태 전체 → 서버 페이로드 */
export function serializeForm(state: VendorFormState): VendorPayloadInput {
  const category = state.category as CategoryCode;
  const categoryState = state.categoryDataByCategory[category] ?? (category ? emptyCategoryData(category) : {});

  const photos: VendorPhoto[] = [];
  let order = 0;
  if (state.mainPhoto) {
    photos.push({ url: state.mainPhoto, type: 'main' as PhotoType, sortOrder: order++ });
  }
  for (const p of state.galleryPhotos) {
    photos.push({ url: p.url, type: 'gallery', label: p.label.trim() || undefined, sortOrder: order++ });
  }
  // 드레스 사진은 카테고리와 무관하게 보존한다 — 카테고리를 잠시 다른 업종으로
  // 바꿔 저장해도 기존 드레스 사진이 삭제되지 않도록 (UI에서는 드레스 업종일 때만 표시)
  for (const p of state.dressPhotos) {
    photos.push({ url: p.url, type: 'dress', label: p.label.trim() || undefined, sortOrder: order++ });
  }
  // 영상도 같은 이유로 카테고리와 무관하게 보존한다 (UI에서는 영상(DVD) 업종일 때만 표시)
  for (const v of state.videos) {
    photos.push({ url: v.url, type: 'video', label: v.label.trim() || undefined, sortOrder: order++ });
  }

  return {
    name: state.name.trim(),
    authorName: state.authorName.trim(),
    category,
    contact: state.contact.trim(),
    businessHoursStart: state.businessHoursStart,
    businessHoursEnd: state.businessHoursEnd,
    region: joinRegion(state.regionSido, state.regionGugun),
    address: state.address.trim(),
    products: state.products
      .map((p) => ({
        name: p.name.trim(),
        description: p.description.trim(),
        price: toNumber(p.price) ?? null,
        photos: p.photos,
      }))
      .filter((p) => p.name || p.description || p.price !== null || p.photos.length > 0),
    styleMoods: state.styleMoods,
    options: state.options
      .map((o) => ({ name: o.name.trim(), price: toNumber(o.price) ?? null, desc: o.desc.trim() }))
      .filter((o) => o.name || o.desc || o.price !== null),
    description: state.description.trim(),
    sdingBenefit: state.sdingBenefit.trim(),
    categoryData: category ? serializeCategoryData(category, categoryState) : {},
    photos,
  };
}

/** 계약 업체 DB에서 가져온 값 → 폼 초기 상태 (등록 화면) */
export function formStateFromPrefill(prefill: VendorPrefill): VendorFormState {
  const state = initialFormState();
  state.name = prefill.name;
  state.contact = prefill.contact;
  state.address = prefill.address;
  state.regionSido = prefill.regionSido;
  state.regionGugun = prefill.regionGugun;
  state.authorName = prefill.authorName;
  return state;
}

/** DB 레코드(DTO) → 폼 상태 (수정 화면 초기값) */
export function formStateFromVendor(vendor: VendorDTO): VendorFormState {
  const state = initialFormState();
  const category = vendor.category as CategoryCode;
  state.name = vendor.name ?? '';
  state.authorName = vendor.authorName ?? '';
  state.category = category;
  state.contact = vendor.contact ?? '';
  state.businessHoursStart = vendor.businessHoursStart ?? '';
  state.businessHoursEnd = vendor.businessHoursEnd ?? '';
  const { sido, gugun } = splitRegion(vendor.region);
  state.regionSido = sido;
  state.regionGugun = gugun;
  state.address = vendor.address ?? '';
  state.description = vendor.description ?? '';
  state.sdingBenefit = vendor.sdingBenefit ?? '';
  state.styleMoods = Array.isArray(vendor.styleMoods) ? vendor.styleMoods : [];

  const products = Array.isArray(vendor.products) ? (vendor.products as unknown[]) : [];
  state.products = products
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      id: crypto.randomUUID(),
      name: asString(p.name),
      description: asString(p.description),
      price: asString(p.price),
      photos: Array.isArray(p.photos) ? p.photos.filter((u): u is string => typeof u === 'string') : [],
    }));
  if (state.products.length === 0) state.products = [emptyProduct()];

  const options = Array.isArray(vendor.options) ? (vendor.options as unknown[]) : [];
  state.options = options
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map((o) => ({ name: asString(o.name), price: asString(o.price), desc: asString(o.desc) }));

  state.categoryDataByCategory = { [category]: categoryDataFromJson(category, vendor.categoryData) };

  const photos = Array.isArray(vendor.photos) ? (vendor.photos as VendorPhoto[]) : [];
  const sorted = [...photos]
    .filter((p) => p && typeof p.url === 'string')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  state.mainPhoto = sorted.find((p) => p.type === 'main')?.url ?? null;
  state.galleryPhotos = sorted.filter((p) => p.type === 'gallery').map((p) => ({ url: p.url, label: p.label ?? '' }));
  state.dressPhotos = sorted.filter((p) => p.type === 'dress').map((p) => ({ url: p.url, label: p.label ?? '' }));
  state.videos = sorted.filter((p) => p.type === 'video').map((p) => ({ url: p.url, label: p.label ?? '' }));

  return state;
}
