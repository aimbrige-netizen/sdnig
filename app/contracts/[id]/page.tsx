// 계약 업체 상세 — 목록에서 행을 누르면 모달이 아니라 이 페이지로 들어온다.
// 왼쪽에는 업체명·전화번호 등 기본 정보, 본화면(오른쪽)에는 진행 메모를 시간순으로 쌓는다.
import { notFound } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { ContractDetailView, type ContractDetailDTO } from '@/components/contract-detail-view';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_INT4 = 2147483647;

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0 || numId > MAX_INT4) notFound();

  const vendor = await prisma.contractedVendor.findUnique({
    where: { id: numId },
    // id 를 2차 정렬키로 — 같은 밀리초에 찍힌 메모라도 항상 같은 순서로 보이게 한다.
    include: { memos: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } },
  });
  if (!vendor) notFound();

  const dto: ContractDetailDTO = {
    id: vendor.id,
    name: vendor.name,
    contractType: vendor.contractType,
    phone: vendor.phone,
    address: vendor.address,
    managerName: vendor.managerName,
    createdAt: vendor.createdAt.toISOString(),
    memos: vendor.memos.map((m) => ({
      id: m.id,
      status: m.status,
      nextContactAt: m.nextContactAt ? m.nextContactAt.toISOString() : null,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return (
    <>
      <AdminHeader />
      <ContractDetailView vendor={dto} />
    </>
  );
}
