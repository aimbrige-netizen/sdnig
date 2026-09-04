'use client';

// 계약 업체 상세 페이지 — 왼쪽 기본 정보(ContractSidebar) + 오른쪽 진행 메모(작성 + 타임라인).
//
// 메모 목록은 여기서 상태로 들고 있다가 두 자식에게 나눠준다. 메모를 추가·삭제하면 먼저
// 낙관적으로 이 상태를 바꿔 화면에 즉시 반영하고, 서버 액션이 revalidatePath+refresh() 로
// 새 vendor prop 을 내려주면(서버가 확정한 진짜 값) 그걸로 갈아끼운다 — 두 값이 같으면
// 조용히 넘어가고 다르면 서버 쪽을 신뢰한다(뒤로가기 등 외부 요인도 이 경로로 반영된다).
import { useState } from 'react';
import Link from 'next/link';
import { ContractSidebar } from './contract-sidebar';
import { ContractMemoComposer } from './contract-memo-composer';
import { ContractMemoTimeline } from './contract-memo-timeline';

export interface ContractMemoDTO {
  id: number;
  status: string;
  memoDate: string; // ISO
  content: string;
  createdAt: string; // ISO
}

export interface ContractDetailDTO {
  id: number;
  name: string;
  contractType: string;
  phone: string | null;
  address: string | null;
  managerName: string | null;
  createdAt: string; // ISO
  memos: ContractMemoDTO[]; // createdAt 내림차순 (최신이 먼저)
}

function memosSig(memos: ContractMemoDTO[]): string {
  return JSON.stringify(memos.map((m) => [m.id, m.status, m.memoDate, m.content, m.createdAt]));
}

interface ContractDetailViewProps {
  vendor: ContractDetailDTO;
}

export function ContractDetailView({ vendor }: ContractDetailViewProps) {
  const [memos, setMemos] = useState<ContractMemoDTO[]>(vendor.memos);
  const [syncedSig, setSyncedSig] = useState(() => memosSig(vendor.memos));

  // 서버 상태가 실제로 바뀌었을 때만 조정 (effect 가 아니라 렌더 중 조정 — React 권장 패턴)
  const propSig = memosSig(vendor.memos);
  if (propSig !== syncedSig) {
    setSyncedSig(propSig);
    setMemos(vendor.memos);
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="animate-fade-up mb-5">
        <Link href="/contracts" className="text-sm text-muted-foreground transition-colors hover:text-neutral-900">
          ← 계약 업체 DB
        </Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[20rem_1fr]">
        <ContractSidebar vendor={vendor} />

        {/* 본화면 — 메모 작성 + 타임라인. 남은 너비를 전부 쓴다. */}
        <div className="min-w-0">
          <ContractMemoComposer
            contractedVendorId={vendor.id}
            onCreated={(memo) => setMemos((prev) => [memo, ...prev])}
          />
          <ContractMemoTimeline memos={memos} onDeleted={(id) => setMemos((prev) => prev.filter((m) => m.id !== id))} />
        </div>
      </div>
    </main>
  );
}
