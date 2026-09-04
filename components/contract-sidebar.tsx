'use client';

// 상세 페이지 왼쪽 패널 — 업체명·전화번호를 크게 보여주고, 나머지 기본 정보는 그 아래에 둔다.
// 목록 모달에 있던 보기/수정 전환·삭제·업체정보 작성 전환을 그대로 옮겨왔다.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { BrandLoader } from '@/components/brand-loader';
import { deleteContract, updateContract } from '@/app/contracts/actions';
import { contractPayloadSchema } from '@/lib/contract-schema';
import { contractTypeDot, contractTypeLabel } from '@/lib/contract-constants';
import { formatDateTimeKST } from '@/lib/format-date';
import {
  CONTRACT_FIELD_LABELS,
  ContractFields,
  serializeContract,
  type ContractFormState,
} from './contract-fields';
import type { ContractDetailDTO } from './contract-detail-view';

function formStateFrom(vendor: ContractDetailDTO): ContractFormState {
  return {
    name: vendor.name,
    contractType: vendor.contractType === 'written' ? 'written' : 'verbal',
    phone: vendor.phone ?? '',
    address: vendor.address ?? '',
    managerName: vendor.managerName ?? '',
  };
}

/** 값이 없으면 "미입력"을 경고색으로 — 아직 받아야 할 정보임을 드러낸다 */
function InfoRow({ label, value }: { label: string; value: string | null }) {
  const filled = !!value?.trim();
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className={filled ? 'truncate text-right' : 'text-right'}>
        {filled ? (
          value
        ) : (
          <span className="text-xs" style={{ color: 'var(--data-warning-ink)' }}>
            미입력
          </span>
        )}
      </dd>
    </div>
  );
}

interface ContractSidebarProps {
  vendor: ContractDetailDTO;
}

export function ContractSidebar({ vendor }: ContractSidebarProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<ContractFormState>(() => formStateFrom(vendor));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 서버가 내려준 값이 실제로 바뀌었는지 비교하기 위한 서명 (prop 객체는 매 렌더 새로 생성됨)
  const sig = JSON.stringify([vendor.name, vendor.contractType, vendor.phone, vendor.address, vendor.managerName]);
  const [latest, setLatest] = useState<ContractFormState>(() => formStateFrom(vendor));
  const [serverSig, setServerSig] = useState(sig);
  if (sig !== serverSig) {
    setServerSig(sig);
    setLatest(formStateFrom(vendor));
    if (!editing) setState(formStateFrom(vendor));
  }

  const patch = (partial: Partial<ContractFormState>) => setState((prev) => ({ ...prev, ...partial }));
  const busy = saving || deleting;

  async function handleSave() {
    if (busy) return;
    setErrors([]);
    const payload = serializeContract(state);
    const parsed = contractPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors([
        ...new Set(
          parsed.error.issues.map((issue) => {
            const root = String(issue.path[0] ?? '');
            return `${CONTRACT_FIELD_LABELS[root] ?? root}: ${issue.message}`;
          })
        ),
      ]);
      return;
    }

    setSaving(true);
    try {
      const result = await updateContract(vendor.id, payload);
      if (!result.ok) {
        setErrors(result.errors ?? ['저장에 실패했습니다.']);
        return;
      }
      setLatest(state);
      setEditing(false);
    } catch {
      setErrors(['네트워크 오류로 저장하지 못했습니다. 다시 시도해주세요.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    if (!window.confirm(`'${vendor.name}' 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const result = await deleteContract(vendor.id);
      if (!result.ok) {
        setErrors(result.errors ?? ['삭제에 실패했습니다.']);
        setDeleting(false);
        return;
      }
      router.push('/contracts');
    } catch {
      setErrors(['네트워크 오류로 삭제하지 못했습니다.']);
      setDeleting(false);
    }
  }

  return (
    <aside className="card-surface animate-fade-up overflow-hidden lg:sticky lg:top-20 lg:w-80">
      {errors.length > 0 && (
        <div
          role="alert"
          className="m-5 mb-0 rounded-lg border border-destructive/40 bg-red-50 p-2.5 text-xs text-destructive"
        >
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {busy ? (
        <div className="py-10">
          <BrandLoader label={deleting ? '삭제 중' : '저장 중'} />
        </div>
      ) : editing ? (
        <div className="p-5">
          <ContractFields state={state} patch={patch} narrow />
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); setState(latest); setErrors([]); }}>
              취소
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              저장
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 정체성 밴드 — 업체명·전화번호를 가장 크게, 옅은 브랜드 틴트로 나머지와 구분한다 */}
          <div className="border-b border-black/[0.06] p-5 pb-[18px]" style={{ backgroundColor: 'var(--accent)' }}>
            <h1 className="text-lg font-bold break-words">{latest.name}</h1>
            <p className="mt-1.5">
              {latest.phone.trim() ? (
                <a
                  href={`tel:${latest.phone.replace(/[^0-9+]/g, '')}`}
                  className="text-base font-medium text-[var(--brand-to)] hover:underline"
                >
                  {latest.phone}
                </a>
              ) : (
                <span className="text-sm" style={{ color: 'var(--data-warning-ink)' }}>
                  전화번호 미입력
                </span>
              )}
            </p>

            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-neutral-700">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: contractTypeDot(latest.contractType) }}
              />
              {contractTypeLabel(latest.contractType)}
            </span>
          </div>

          <dl className="divide-y divide-black/[0.06] px-5">
            <InfoRow label="주소" value={latest.address} />
            <InfoRow label="DB담당자" value={latest.managerName} />
            <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <dt className="text-xs text-muted-foreground">등록일시</dt>
              <dd className="tabular-nums">{formatDateTimeKST(vendor.createdAt)}</dd>
            </div>
          </dl>

          <div
            className="flex flex-wrap items-center gap-2 border-t border-black/[0.06] p-5"
            style={{ backgroundColor: 'var(--contracts-panel)' }}
          >
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              수정
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
              삭제
            </Button>
            {/* 실제 이동이므로 <a> 로 두고 버튼 스타일만 입힌다.
                Button render={<Link/>} 는 Base UI 가 비-button 요소라고 경고한다. */}
            <Link href={`/vendors/new?fromContract=${vendor.id}`} className={buttonVariants({ size: 'sm' })}>
              업체정보 작성
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}
