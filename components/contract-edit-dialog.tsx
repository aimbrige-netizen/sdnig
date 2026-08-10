'use client';

// 계약 업체 수정/삭제 다이얼로그 — 리스트에서 행을 눌러 엽니다.
// 나중에 받은 전화번호·주소를 채워 넣는 것이 이 화면의 주 용도입니다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { contractPayloadSchema } from '@/lib/contract-schema';
import type { ContractType } from '@/lib/contract-constants';
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
  // JSON.stringify — 구분자가 값 안에 우연히 들어가 서명이 충돌할 일이 없다
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

interface ContractEditDialogProps {
  vendor: ContractDTO;
  children: React.ReactNode; // 트리거 (행 안의 버튼)
}

export function ContractEditDialog({ vendor, children }: ContractEditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ContractFormState>(() => formStateFrom(vendor));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 다이얼로그를 다시 열 때 되돌릴 기준값.
  // vendor prop 만 믿으면 안 된다 — 저장 직후의 router.refresh() 는 비동기라 커밋 전까지
  // prop 이 저장 이전 값이고, 그 상태에서 다시 열어 저장하면 방금 넣은 값이 DB에서 지워진다.
  // 그래서 저장 성공 시 방금 보낸 값을, 서버 값이 실제로 바뀌면 그 값을 기준으로 삼는다.
  const [latest, setLatest] = useState<ContractFormState>(() => formStateFrom(vendor));
  const [serverSig, setServerSig] = useState(() => signatureOf(vendor));

  const sig = signatureOf(vendor);
  if (sig !== serverSig) {
    setServerSig(sig);
    setLatest(formStateFrom(vendor));
  }

  const patch = (partial: Partial<ContractFormState>) => setState((prev) => ({ ...prev, ...partial }));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // 열 때마다 최신 확정값으로 되돌린다 — 저장하지 않고 닫은 수정이 남지 않도록
    if (next) {
      setState(latest);
      setErrors([]);
    }
  }

  async function handleSave() {
    if (saving) return;
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
      const res = await fetch(`/api/contracts/${vendor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrors([data?.error ?? `저장에 실패했습니다. (HTTP ${res.status})`]);
        return;
      }
      // 서버 갱신(refresh)이 커밋되기 전에 다시 열어도 방금 저장한 값이 보이도록 기준값을 먼저 올린다
      setLatest(state);
      setOpen(false);
      router.refresh();
    } catch {
      setErrors(['네트워크 오류로 저장하지 못했습니다. 다시 시도해주세요.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm(`'${vendor.name}' 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/contracts/${vendor.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrors([data?.error ?? '삭제에 실패했습니다.']);
        return;
      }
      setOpen(false);
      // Base UI 는 닫을 때 트리거로 포커스를 되돌리는데, 그 트리거가 든 행이 곧 언마운트되어
      // 포커스가 body 로 유실된다. 남아 있는 목록 제목으로 명시적으로 옮긴다.
      // (삭제 사실은 목록 위 결과 건수 라이브 리전이 함께 알려준다)
      document.getElementById(CONTRACTS_HEADING_ID)?.focus();
      router.refresh();
    } catch {
      setErrors(['네트워크 오류로 삭제하지 못했습니다.']);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children as React.ReactElement<Record<string, unknown>>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>계약 업체 수정</DialogTitle>
          <DialogDescription>
            나중에 받은 전화번호·주소를 채워 넣을 수 있습니다.
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

        <ContractFields state={state} patch={patch} className="lg:grid-cols-2" />

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={saving || deleting}
          >
            {deleting ? '삭제 중...' : '삭제'}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={saving || deleting}
            >
              취소
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving || deleting}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
