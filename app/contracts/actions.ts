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
import { contractMemoPayloadSchema, contractPayloadSchema } from '@/lib/contract-schema';

export interface ActionResult {
  ok: boolean;
  /** 사용자에게 보여줄 오류 메시지 목록 (필드명 포함) */
  errors?: string[];
  /** 생성 성공 시 새로 만들어진 행의 id (createContract 전용) */
  id?: number;
}

const FIELD_LABELS: Record<string, string> = {
  name: '업체명',
  contractType: '계약 형태',
  phone: '전화번호',
  address: '주소',
  managerName: 'DB담당자',
  status: '진행 상태',
  memoDate: '날짜',
  content: '메모 내용',
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
  const created = await prisma.contractedVendor.create({
    data: {
      name: data.name,
      contractType: data.contractType,
      phone: data.phone,
      address: data.address,
      managerName: data.managerName,
    },
  });

  revalidatePath('/contracts');
  refresh(); // 클라이언트 라우터 캐시까지 갱신 — 저장 직후 목록에 바로 반영된다
  return { ok: true, id: created.id };
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
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { ok: false, errors: ['존재하지 않는 업체입니다.'] };
    }
    throw e;
  }

  revalidatePath('/contracts');
  revalidatePath('/contracts/[id]', 'page');
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
  // refresh() 를 쓰지 않는다 — 이 액션의 유일한 호출부(ContractSidebar)는 성공하면 항상
  // router.push('/contracts') 로 떠난다. refresh() 는 "지금 떠 있는 라우트"를 서버가 방금 만든
  // 값으로 다시 그리게 하는데, 지금 떠 있는 라우트는 바로 이 삭제된 업체의 상세 페이지
  // (/contracts/[id]) 자신이다 — 그 라우트를 다시 그리면 notFound() 가 실행돼, push 가 이어지기
  // 직전 순간에 스타일 없는 기본 404 화면이 한 번 스쳐 지나간다. revalidatePath 만으로도
  // 도착할 /contracts 목록은 새 데이터로 뜬다(캐시 무효화는 이동할 때도 적용된다).
  return { ok: true };
}

/** 메모 등록 — 상태·날짜·내용을 함께 남깁니다. 업체의 "현재 상태"는 이 메모들 중 최신 것으로 정해집니다. */
export async function createContractMemo(contractedVendorId: number, input: unknown): Promise<ActionResult> {
  if (!validId(contractedVendorId)) return { ok: false, errors: ['잘못된 업체 ID입니다.'] };

  const parsed = contractMemoPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: toMessages(parsed.error) };

  const data = parsed.data;
  try {
    await prisma.contractMemo.create({
      data: {
        contractedVendorId,
        status: data.status,
        memoDate: data.memoDate,
        content: data.content,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return { ok: false, errors: ['존재하지 않는 업체입니다.'] };
    }
    throw e;
  }

  revalidatePath('/contracts');
  revalidatePath('/contracts/[id]', 'page');
  refresh();
  return { ok: true };
}

export async function deleteContractMemo(memoId: number): Promise<ActionResult> {
  if (!validId(memoId)) return { ok: false, errors: ['잘못된 메모 ID입니다.'] };

  try {
    await prisma.contractMemo.delete({ where: { id: memoId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { ok: false, errors: ['존재하지 않는 메모입니다.'] };
    }
    throw e;
  }

  revalidatePath('/contracts');
  revalidatePath('/contracts/[id]', 'page');
  refresh();
  return { ok: true };
}
