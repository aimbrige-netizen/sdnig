// 계약 업체 등록/수정 페이로드 검증 — 클라이언트(저장 전)와 서버(API)에서 동일하게 사용합니다.
//
// 이 화면의 목적은 "구두 계약만 하고 정보를 아직 못 받은 업체"를 일단 쌓아두는 것이라,
// 전화번호·주소는 선택 입력입니다. 업체명·DB담당자·계약형태만 필수.

import { z } from 'zod';
import { CONTRACT_STATUS_CODES, CONTRACT_TYPE_CODES, type ContractStatus, type ContractType } from './contract-constants';

/** 빈 문자열은 "아직 못 받은 값"이므로 null 로 정규화해 저장합니다. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이내로 입력해주세요`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

// .strict() — REST API(app/api/contracts)는 아직 memo 필드를 그냥 보내도 200 을 반환하는
// 외부 소비자가 있을 수 있다. 그 필드를 조용히 버리는 대신, 모르는 키가 오면 에러로 알려준다
// (memo 는 이제 lib/contract-schema.ts 의 contractMemoPayloadSchema 로 별도 등록한다).
export const contractPayloadSchema = z
  .object({
    name: z.string().trim().min(1, '업체명을 입력해주세요').max(100, '100자 이내로 입력해주세요'),
    contractType: z.enum(CONTRACT_TYPE_CODES as [ContractType, ...ContractType[]], {
      error: '계약 형태를 선택해주세요',
    }),
    phone: optionalText(30),
    address: optionalText(200),
    managerName: z.string().trim().min(1, 'DB담당자를 입력해주세요').max(50, '50자 이내로 입력해주세요'),
  })
  .strict();

export type ContractPayload = z.infer<typeof contractPayloadSchema>;

// YYYY-MM-DD — <input type="date"> 가 그대로 내려주는 형식. new Date() 로 직접 파싱하면
// 로컬 타임존에 따라 하루 밀릴 수 있어, 자정 UTC로 명시해 날짜만 그대로 저장합니다.
//
// 정규식은 자릿수 형태만 확인할 뿐 "2월 30일"처럼 달력에 없는 날짜는 걸러내지 못한다 —
// new Date('2026-02-30...') 는 에러 없이 3월 2일로 조용히 넘어가 버린다(일 초과), 반면
// 월이 범위를 넘으면(예: 13월) Invalid Date 가 되어 이후 Prisma 호출에서야 처리되지 않은
// 예외로 서버 액션이 죽는다. <input type="date"> 는 항상 유효한 날짜만 내려주지만, 이 스키마는
// 서버 액션에서도 그대로 쓰여 브라우저를 거치지 않은 직접 호출에 대한 유일한 방어선이라
// 왕복 비교로 "정말 그 날짜가 맞는지"까지 확인한다.
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 선택해주세요')
  .transform((v, ctx) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
      ctx.addIssue({ code: 'custom', message: '실제로 존재하는 날짜를 입력해주세요' });
      return z.NEVER;
    }
    return d;
  });

export const contractMemoPayloadSchema = z
  .object({
    status: z.enum(CONTRACT_STATUS_CODES as [ContractStatus, ...ContractStatus[]], {
      error: '진행 상태를 선택해주세요',
    }),
    // 다음에 언제 연락할지 — 선택 입력. 빈 문자열도 "안 정함"으로 받아 넘긴다
    // (<input type="date"> 를 비우면 '' 가 오고, 아예 안 건드리면 undefined 가 온다).
    // 메모를 남긴 날짜 자체는 물어보지 않는다 — createdAt 이 곧 그 날짜다.
    nextContactAt: z
      .union([dateOnly, z.literal('')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? null : v)),
    content: z.string().trim().min(1, '메모 내용을 입력해주세요').max(1000, '1000자 이내로 입력해주세요'),
  })
  .strict();

export type ContractMemoPayload = z.infer<typeof contractMemoPayloadSchema>;
