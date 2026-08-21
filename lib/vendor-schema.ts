// 업체 등록/수정 페이로드 검증 (기획서 5절 공통 필드 + 6절 업종별 필드 + 9절 사진)
// 클라이언트(저장 전)와 서버(API)에서 동일하게 사용합니다.

import { z } from 'zod';
import { CATEGORY_CODES, PHOTO_TYPES, type CategoryCode } from './constants';
import { categoryDataSchema } from './category-schema';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const photoSchema = z.object({
  url: z.string().min(1),
  type: z.enum(PHOTO_TYPES),
  label: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
});

export const productSchema = z.object({
  name: z.string().trim().min(1, '상품명을 입력해주세요'),
  description: z.string().trim().default(''),
  price: z.number().finite().nonnegative('가격은 0 이상이어야 합니다').nullable().default(null),
  photos: z.array(z.string().min(1)).default([]),
});

export const optionSchema = z.object({
  name: z.string().trim().min(1, '옵션명을 입력해주세요'),
  price: z.number().finite().nullable(),
  desc: z.string().trim().default(''),
});

export const vendorPayloadSchema = z
  .object({
    name: z.string().trim().min(1, '업체명을 입력해주세요'),
    authorName: z.string().trim().min(1, '작성자를 입력해주세요'),
    category: z.enum(CATEGORY_CODES as [CategoryCode, ...CategoryCode[]], {
      error: '카테고리를 선택해주세요',
    }),
    contact: z.string().trim().min(1, '업체연락처를 입력해주세요'),
    businessHoursStart: z.string().regex(TIME_RE, '운영 시작시간을 선택해주세요'),
    businessHoursEnd: z.string().regex(TIME_RE, '운영 종료시간을 선택해주세요'),
    region: z.string().trim().min(1, '지역을 선택해주세요'),
    address: z.string().trim().min(1, '주소를 입력해주세요'),
    products: z.array(productSchema).min(1, '상품구성을 1개 이상 입력해주세요'),
    styleMoods: z.array(z.string().trim().min(1)).default([]),
    options: z.array(optionSchema).default([]),
    description: z.string().trim().min(1, '업체설명을 입력해주세요'),
    sdingBenefit: z.string().trim().default(''),
    categoryData: z.record(z.string(), z.unknown()).default({}),
    photos: z.array(photoSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const mainCount = data.photos.filter((p) => p.type === 'main').length;
    if (mainCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['photos'],
        message: '대표사진 1장을 업로드해주세요',
      });
    }
  })
  .transform((data, ctx) => {
    // 업종별 필드는 선택된 카테고리 스키마로 검증·정리 (알 수 없는 키 제거)
    // parse()로 던지면 ZodError가 safeParse 밖으로 전파되므로 이슈로 합류시킨다
    const result = categoryDataSchema(data.category).safeParse(data.categoryData);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ['categoryData', ...issue.path] });
      }
      return z.NEVER;
    }
    return { ...data, categoryData: result.data as Record<string, unknown> };
  });

export type VendorPayload = z.infer<typeof vendorPayloadSchema>;
