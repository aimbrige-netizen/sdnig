// 계약 업체 등록/수정 페이로드 검증 — 클라이언트(저장 전)와 서버(API)에서 동일하게 사용합니다.
//
// 이 화면의 목적은 "구두 계약만 하고 정보를 아직 못 받은 업체"를 일단 쌓아두는 것이라,
// 전화번호·주소는 선택 입력입니다. 업체명·DB담당자·계약형태만 필수.

import { z } from 'zod';
import { CONTRACT_TYPE_CODES, type ContractType } from './contract-constants';

/** 빈 문자열은 "아직 못 받은 값"이므로 null 로 정규화해 저장합니다. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이내로 입력해주세요`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

export const contractPayloadSchema = z.object({
  name: z.string().trim().min(1, '업체명을 입력해주세요').max(100, '100자 이내로 입력해주세요'),
  contractType: z.enum(CONTRACT_TYPE_CODES as [ContractType, ...ContractType[]], {
    error: '계약 형태를 선택해주세요',
  }),
  phone: optionalText(30),
  address: optionalText(200),
  managerName: z.string().trim().min(1, 'DB담당자를 입력해주세요').max(50, '50자 이내로 입력해주세요'),
  memo: optionalText(1000),
});

export type ContractPayload = z.infer<typeof contractPayloadSchema>;
