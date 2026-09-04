// 업체 등록 (기획서 10절)
// ?fromContract=<id> 로 들어오면 계약 업체 DB에 적어둔 내용을 미리 채워 넣습니다.
// 같은 정보를 두 번 입력하지 않게 하고, 저장이 끝나면 그 계약 DB 항목은 삭제됩니다.
import { notFound } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { VendorForm } from '@/components/vendor-form/vendor-form';
import type { VendorPrefill } from '@/components/vendor-form/form-state';
import { contractStatusLabel } from '@/lib/contract-constants';
import { formatDateKST } from '@/lib/format-date';
import { parseRegionFromAddress } from '@/lib/regions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function NewVendorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.fromContract) ? sp.fromContract[0] : sp.fromContract;
  const fromContractId = raw && /^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null;

  let prefill: VendorPrefill | undefined;
  if (fromContractId) {
    const contract = await prisma.contractedVendor.findUnique({
      where: { id: fromContractId },
      include: { memos: { orderBy: { createdAt: 'desc' } } },
    });
    if (!contract) notFound();
    const { sido, gugun } = parseRegionFromAddress(contract.address);
    // 참고용으로만 보여주는 메모 — 최신 순으로 한 줄씩 나열한다 (폼에는 저장되지 않는다)
    const memoLines = contract.memos.map(
      (m) => `[${contractStatusLabel(m.status)} · ${formatDateKST(m.memoDate)}] ${m.content}`
    );
    prefill = {
      name: contract.name,
      contact: contract.phone ?? '',
      address: contract.address ?? '',
      regionSido: sido,
      regionGugun: gugun,
      // DB담당자를 작성자 기본값으로 — 대부분 같은 사람이 이어서 작성한다
      authorName: contract.managerName ?? '',
      memo: memoLines.join('\n'),
    };
  }

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold tracking-tight">새 업체 등록</h1>
        <VendorForm prefill={prefill} fromContractId={fromContractId ?? undefined} />
      </main>
    </>
  );
}
