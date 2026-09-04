'use client';

// 진행 메모 타임라인 — 최신 메모가 위, 오래된 메모가 아래로 차곡차곡 쌓인다.
import { useState } from 'react';
import { deleteContractMemo } from '@/app/contracts/actions';
import { contractStatusDot, contractStatusLabel } from '@/lib/contract-constants';
import { formatDateKST, formatDateTimeKST } from '@/lib/format-date';
import type { ContractMemoDTO } from './contract-detail-view';

interface ContractMemoTimelineProps {
  memos: ContractMemoDTO[];
  /** 삭제에 성공하면 부모 목록에서도 즉시 빼도록 알린다 */
  onDeleted: (memoId: number) => void;
}

function MemoEntry({ memo, onDeleted }: { memo: ContractMemoDTO; onDeleted: (memoId: number) => void }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm('이 메모를 삭제할까요? 되돌릴 수 없습니다.')) return;
    setDeleting(true);
    try {
      const result = await deleteContractMemo(memo.id);
      if (!result.ok) {
        window.alert(result.errors?.[0] ?? '삭제에 실패했습니다.');
        setDeleting(false);
        return;
      }
      onDeleted(memo.id);
    } catch {
      window.alert('네트워크 오류로 삭제하지 못했습니다.');
      setDeleting(false);
    }
  }

  return (
    <li className="animate-fade-up border-b border-black/[0.06] px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: contractStatusDot(memo.status) }}
            />
            {contractStatusLabel(memo.status)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatDateKST(memo.memoDate)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 tabular-nums">{formatDateTimeKST(memo.createdAt)} 기록</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="메모 삭제"
            className="grid size-6 place-items-center rounded text-neutral-400 transition-colors hover:bg-neutral-900/5 hover:text-destructive disabled:opacity-50"
          >
            ×
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap">{memo.content}</p>
    </li>
  );
}

export function ContractMemoTimeline({ memos, onDeleted }: ContractMemoTimelineProps) {
  if (memos.length === 0) {
    return (
      <div className="card-surface animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-14 text-center">
        <p className="text-sm text-muted-foreground">아직 남긴 메모가 없습니다.</p>
        <p className="mt-1 text-xs text-muted-foreground">위에서 첫 메모를 남겨보세요.</p>
      </div>
    );
  }

  return (
    <section className="card-surface animate-fade-up overflow-hidden">
      <h2 className="border-b border-black/[0.06] px-5 py-3 text-sm font-semibold">
        진행 메모 <span className="ml-1 font-normal text-muted-foreground">{memos.length}건</span>
      </h2>
      <ul>
        {memos.map((memo) => (
          <MemoEntry key={memo.id} memo={memo} onDeleted={onDeleted} />
        ))}
      </ul>
    </section>
  );
}
