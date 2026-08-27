// 업체가 올린 원본 파일 목록 만들기
//
// 저장된 파일명은 UUID 라 그대로 받으면 어느 업체 무슨 사진인지 알 수 없다.
// 받을 때 "업체명-갤러리 2 홀 전경" 처럼 알아볼 수 있는 이름을 붙인다.

import type { VendorFormState } from '@/components/vendor-form/form-state';

export interface DownloadItem {
  url: string;
  /** 확장자를 뺀 파일 이름 */
  name: string;
}

/**
 * 폼 상태에서 내려받을 파일 목록을 만든다.
 *
 * 영상 링크(유튜브 등)는 우리 파일이 아니므로 제외한다 — 남의 서버 영상을 받아올 수도 없고,
 * 받아온다 해도 원본이 아니다.
 */
export function collectDownloads(state: VendorFormState): DownloadItem[] {
  const vendor = state.name.trim() || '업체';
  const items: DownloadItem[] = [];
  const withLabel = (base: string, label: string) => (label.trim() ? `${base} ${label.trim()}` : base);

  if (state.mainPhoto) items.push({ url: state.mainPhoto, name: `${vendor}-대표사진` });

  state.galleryPhotos.forEach((p, i) => {
    items.push({ url: p.url, name: withLabel(`${vendor}-갤러리 ${i + 1}`, p.label) });
  });
  state.dressPhotos.forEach((p, i) => {
    items.push({ url: p.url, name: withLabel(`${vendor}-드레스 ${i + 1}`, p.label) });
  });
  state.products.forEach((product, pi) => {
    const productName = product.name.trim() || `상품 ${pi + 1}`;
    product.photos.forEach((url, i) => {
      items.push({ url, name: `${vendor}-${productName} ${i + 1}` });
    });
  });
  state.videos.forEach((v, i) => {
    items.push({ url: v.url, name: withLabel(`${vendor}-영상 ${i + 1}`, v.label) });
  });

  return items;
}
