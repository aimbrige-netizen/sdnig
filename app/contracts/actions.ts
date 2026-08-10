'use server';

// 계약 업체 등록/수정/삭제 서버 액션.
//
// 왜 fetch + router.refresh() 대신 서버 액션인가:
// 라우트 핸들러에 POST 한 뒤 router.refresh() 로 목록을 갱신하면, 그 refresh 가
// 같은 시점에 나가는 프리페치 요청들과 경합해 간헐적으로 반영되지 않는다(실측 6회 중 2회).
// 저장은 성공했는데 목록에 안 보이니 사용자는 저장이 안 된 줄 알게 된다.
// 서버 액션은 갱신된 화면을 응답에 함께 실어 보내므로 한 번의 왕복으로 반영된다
// (왕복이 하나 줄어 체감 속도도 빨라진다).
//
// revalidatePath 만으로는 프리페치 응답과 경합해 갱신이 유실되는 경우가 남아(4회 중 1회 실측),
// Next 16 의 refresh() 로 클라이언트 라우터까지 확실히 갱신한다.
import { refresh, revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { contractPayloadSchema } from '@/lib/contract-schema';

export interface ActionResult {
  ok: boolean;
  /** 사용자에게 보여줄 오류 메시지 목록 (필드명 포함) */
  errors?: string[];
}

const FIELD_LABELS: Record<string, string> = {
  name: '업체명',
  contractType: '계약 형태',
  phone: '전화번호',
  address: '주소',
  managerName: 'DB담당자',
  memo: '메모',
};

function toMessages(error: { issues: { path: PropertyKey[]; message: string }[] }): string[] {
  return [
    ...new Set(
      error.issues.map((issue) => {
        const root = String(issue.path[0] ?? '');
        return `${FIELD_LABELS[root] ?? root}: ${issue.message}`;
      })
    ),
  ];
}

const MAX_INT4 = 2147483647;
function validId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= MAX_INT4;
}

export async function createContract(input: unknown): Promise<ActionResult> {
  const parsed = contractPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: toMessages(parsed.error) };

  const data = parsed.data;
  await prisma.contractedVendor.create({
    data: {
      name: data.name,
      contractType: data.contractType,
      phone: data.phone,
      address: data.address,
      managerName: data.managerName,
      memo: data.memo,
    },
  });

  revalidatePath('/contracts');
  refresh(); // 클라이언트 라우터 캐시까지 갱신 — 저장 직후 목록에 바로 반영된다
  return { ok: true };
}

export async function updateContract(id: number, input: unknown): Promise<ActionResult> {
  if (!validId(id)) return { ok: false, errors: ['잘못된 업체 ID입니다.'] };

  const parsed = contractPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: toMessages(parsed.error) };

  const data = parsed.data;
  try {
    await prisma.contractedVendor.update({
      where: { id },
      data: {
        name: data.name,
        contractType: data.contractType,
        phone: data.phone,
        address: data.address,
        managerName: data.managerName,
        memo: data.memo,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { ok: false, errors: ['존재하지 않는 업체입니다.'] };
    }
    throw e;
  }

  revalidatePath('/contracts');
  refresh(); // 클라이언트 라우터 캐시까지 갱신 — 저장 직후 목록에 바로 반영된다
  return { ok: true };
}

export async function deleteContract(id: number): Promise<ActionResult> {
  if (!validId(id)) return { ok: false, errors: ['잘못된 업체 ID입니다.'] };

  try {
    await prisma.contractedVendor.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { ok: false, errors: ['존재하지 않는 업체입니다.'] };
    }
    throw e;
  }

  revalidatePath('/contracts');
  refresh(); // 클라이언트 라우터 캐시까지 갱신 — 저장 직후 목록에 바로 반영된다
  return { ok: true };
}
