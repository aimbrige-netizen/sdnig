'use client';

// 계약 업체 상세 보기 — 리스트에서 행을 눌러 엽니다.
// 보기 → 수정으로 전환하거나, 삭제하거나, 이 정보를 그대로 들고 업체 등록 화면으로 넘어갈 수 있습니다.
// 업체 등록을 마치면 이 계약 DB 항목은 자동으로 지워집니다(같은 내용을 두 곳에 남기지 않기 위해).
import { useState } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BrandLoader } from '@/components/brand-loader';
import { contractPayloadSchema } from '@/lib/contract-schema';
import { deleteContract, updateContract } from '@/app/contracts/actions';
import { contractTypeDot, contractTypeLabel, type ContractType } from '@/lib/contract-constants';
import {
  CONTRACT_FIELD_LABELS,
  ContractFields,
  serializeContract,
  type ContractFormState,
} from './contract-fields';

export interface ContractDTO {
  id: number;
  name: string;
  contractType: string;
  phone: string | null;
  address: string | null;
  managerName: string | null;
  memo: string | null;
  createdAt: string; // ISO 문자열 (서버 컴포넌트에서 직렬화해 전달)
}

function formStateFrom(vendor: ContractDTO): ContractFormState {
  return {
    name: vendor.name,
    contractType: (vendor.contractType === 'written' ? 'written' : 'verbal') as ContractType,
    phone: vendor.phone ?? '',
    address: vendor.address ?? '',
    managerName: vendor.managerName ?? '',
    memo: vendor.memo ?? '',
  };
}

/** 서버가 내려준 값이 실제로 바뀌었는지 비교하기 위한 서명 (prop 객체는 매 렌더 새로 생성됨) */
function signatureOf(vendor: ContractDTO): string {
  return JSON.stringify([
    vendor.name,
    vendor.contractType,
    vendor.phone ?? '',
    vendor.address ?? '',
    vendor.managerName ?? '',
    vendor.memo ?? '',
  ]);
}

/** 삭제 후 포커스를 되돌릴 안정적인 대상 — 행(=트리거)이 사라져도 남아 있는 목록 제목 */
export const CONTRACTS_HEADING_ID = 'contracts-heading';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(iso))
    .replace(/\. /g, '.')
    .replace(/\.$/, '');
}

/** 값이 없으면 "미입력"을 경고색으로 — 아직 받아야 할 정보임을 드러낸다 */
function InfoRow({ label, value }: { label: string; value: string | null }) {
  const filled = !!value?.trim();
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={filled ? 'text-sm break-words' : 'text-sm'}>
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

interface ContractDetailDialogProps {
  vendor: ContractDTO;
  children: React.ReactNode; // 트리거 (행 안의 버튼)
}

export function ContractDetailDialog({ vendor, children }: ContractDetailDialogProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<ContractFormState>(() => formStateFrom(vendor));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 다이얼로그를 다시 열 때 되돌릴 기준값.
  // vendor prop 만 믿으면 안 된다 — 저장 직후의 router.refresh() 는 비동기라 커밋 전까지
  // prop 이 저장 이전 값이고, 그 상태에서 다시 열어 저장하면 방금 넣은 값이 DB에서 지워진다.
  const [latest, setLatest] = useState<ContractFormState>(() => formStateFrom(vendor));
  const [serverSig, setServerSig] = useState(() => signatureOf(vendor));

  const sig = signatureOf(vendor);
  if (sig !== serverSig) {
    setServerSig(sig);
    setLatest(formStateFrom(vendor));
  }

  const patch = (partial: Partial<ContractFormState>) => setState((prev) => ({ ...prev, ...partial }));
  const busy = saving || deleting;

  function handleOpenChange(next: boolean) {
    if (busy) return; // 저장·삭제 중에는 닫히지 않게
    setOpen(next);
    if (next) {
      setState(latest);
      setErrors([]);
      setEditing(false); // 항상 보기 모드로 열린다
    }
  }

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
      // 서버 액션 — 저장과 목록 갱신이 한 번의 왕복에서 함께 끝난다
      const result = await updateContract(vendor.id, payload);
      if (!result.ok) {
        setErrors(result.errors ?? ['저장에 실패했습니다.']);
        return;
      }
      // 갱신된 화면이 커밋되기 전에 다시 열어도 방금 저장한 값이 보이도록 기준값을 먼저 올린다
      setLatest(state);
      setEditing(false);
      setOpen(false);
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
        return;
      }
      setOpen(false);
      // Base UI 는 닫을 때 트리거로 포커스를 되돌리는데, 그 트리거가 든 행이 곧 언마운트되어
      // 포커스가 body 로 유실된다. 남아 있는 목록 제목으로 명시적으로 옮긴다.
      document.getElementById(CONTRACTS_HEADING_ID)?.focus();
    } catch {
      setErrors(['네트워크 오류로 삭제하지 못했습니다.']);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children as React.ReactElement<Record<string, unknown>>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {editing ? '계약 업체 수정' : latest.name}
            {!editing && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-700">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: contractTypeDot(latest.contractType) }}
                />
                {contractTypeLabel(latest.contractType)}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? '나중에 받은 전화번호·주소를 채워 넣을 수 있습니다.'
              : '업체 정보를 작성하면 이 항목은 계약 DB에서 자동으로 삭제됩니다.'}
          </DialogDescription>
        </DialogHeader>

        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-red-50 p-2.5 text-xs text-destructive"
          >
            <ul className="list-inside list-disc space-y-0.5">
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {saving || deleting ? (
          <div className="py-10">
            <BrandLoader label={deleting ? '삭제 중' : '저장 중'} />
          </div>
        ) : editing ? (
          <ContractFields state={state} patch={patch} className="lg:grid-cols-2" />
        ) : (
          <dl className="divide-y divide-black/[0.06]">
            <InfoRow label="전화번호" value={latest.phone} />
            <InfoRow label="주소" value={latest.address} />
            <InfoRow label="DB담당자" value={latest.managerName} />
            <InfoRow label="메모" value={latest.memo} />
            <div className="grid grid-cols-[5.5rem_1fr] gap-3 py-2">
              <dt className="text-xs text-muted-foreground">등록일</dt>
              <dd className="text-sm tabular-nums">{formatDate(vendor.createdAt)}</dd>
            </div>
          </dl>
        )}

        {!busy && (
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete}>
              삭제
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {editing ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
                    취소
                  </Button>
                  <Button type="button" size="sm" onClick={handleSave}>
                    저장
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                    수정
                  </Button>
                  {/* 실제 이동이므로 <a> 로 두고 버튼 스타일만 입힌다.
                      Button render={<Link/>} 는 Base UI 가 비-button 요소라고 경고한다. */}
                  <Link
                    href={`/vendors/new?fromContract=${vendor.id}`}
                    onClick={() => setOpen(false)}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    업체정보 작성
                  </Link>
                </>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
