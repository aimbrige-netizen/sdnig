'use client';

// 계약 업체 빠른 등록 — 한 줄 입력 → 저장 → 바로 다음 업체 입력.
// 구두 계약 업체를 몰아서 쌓는 화면이라, 저장 후 담당자·계약형태는 그대로 두고
// 업체명/전화/주소만 비워 연속 입력이 끊기지 않게 합니다.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { contractPayloadSchema } from '@/lib/contract-schema';
import {
  CONTRACT_FIELD_LABELS,
  ContractFields,
  emptyContractForm,
  serializeContract,
  type ContractFormState,
} from './contract-fields';

export function ContractQuickAdd() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ContractFormState>(emptyContractForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  // 저장 성공 시 증가 — 입력창이 다시 활성화된 커밋 이후에 포커스를 돌려주기 위한 신호.
  // (setSaving(false) 와 같은 커밋에 묶이므로 effect 시점엔 disabled 가 이미 풀려 있다)
  const [refocus, setRefocus] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const patch = (partial: Partial<ContractFormState>) => setState((prev) => ({ ...prev, ...partial }));

  useEffect(() => {
    if (refocus > 0) nameRef.current?.focus();
  }, [refocus]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setTimeout(() => nameRef.current?.focus(), 220);
    } else {
      setErrors([]);
      // 닫으면 패널 내부가 inert 가 되므로, 포커스를 토글 버튼으로 되돌려 위치를 잃지 않게 한다
      toggleRef.current?.focus();
    }
  }

  async function handleSave() {
    if (saving) return;
    setErrors([]);
    setSavedName(null); // 이전 성공 메시지가 이번 시도의 결과처럼 보이지 않도록 먼저 지운다
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
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrors([data?.error ?? `저장에 실패했습니다. (HTTP ${res.status})`]);
        return;
      }
      // 담당자·계약형태는 유지 — 같은 담당자가 여러 곳을 연달아 입력하는 흐름이 대부분.
      // 저장 중에는 입력이 잠겨 있으므로(disabled) 여기서 비우는 값이 사용자가 그 사이
      // 입력한 내용을 덮어쓸 일은 없다.
      // 메모는 업체마다 다른 내용이라 반드시 비운다 — 남겨두면 다음 업체에 엉뚱한 메모가 딸려 들어간다.
      // (담당자·계약형태만 유지)
      setSavedName(payload.name);
      setState((prev) => ({ ...prev, name: '', phone: '', address: '', memo: '' }));
      setRefocus((n) => n + 1);
      router.refresh();
    } catch {
      setErrors(['네트워크 오류로 저장하지 못했습니다. 다시 시도해주세요.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card-surface animate-fade-up mb-4 overflow-hidden" style={{ animationDelay: '90ms' }}>
      <button
        ref={toggleRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-neutral-900/[0.02]"
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-gradient text-base leading-none font-medium text-white transition-transform duration-300 ${
              open ? 'rotate-45' : ''
            }`}
          >
            ＋
          </span>
          <span>
            <span className="block text-sm font-medium">업체 빠르게 추가</span>
            <span className="block text-xs text-muted-foreground">
              업체명·DB담당자만 있으면 등록됩니다. 전화번호·주소는 나중에 채워도 됩니다.
            </span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? '접기' : '펼치기'}</span>
      </button>

      {/* 0fr → 1fr 그리드 전환 — 높이를 재지 않고도 부드럽게 열리고 닫힙니다 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        {/* 접혀 있을 때는 높이만 0 일 뿐 내부 컨트롤이 그대로 포커스 가능하므로,
            inert 로 탭 순서와 접근성 트리에서 함께 제외한다 (aria-expanded 와도 일치) */}
        <div className="overflow-hidden" inert={!open}>
          <div className="border-t px-5 py-4">
            {errors.length > 0 && (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-destructive/40 bg-red-50 p-2.5 text-xs text-destructive"
              >
                <ul className="list-inside list-disc space-y-0.5">
                  {errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <ContractFields
              state={state}
              patch={patch}
              onEnter={handleSave}
              nameRef={nameRef}
              disabled={saving}
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
                {savedName && (
                  <span key={savedName} className="animate-fade-up inline-block">
                    ✓ &lsquo;{savedName}&rsquo; 저장했습니다. 이어서 입력하세요.
                  </span>
                )}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={toggle} disabled={saving}>
                  닫기
                </Button>
                <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? '저장 중...' : '저장하고 계속'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
