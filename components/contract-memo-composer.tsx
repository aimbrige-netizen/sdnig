'use client';

// 새 진행 메모 작성 — 상태를 고르고 내용을 적으면 끝. 저장되면 타임라인 맨 위에 쌓인다.
//
// 날짜는 묻지 않는다. 예전엔 메모마다 날짜를 골라야 했는데, 그 한 칸이 "언제 했다"(과거)와
// "언제 할 거다"(미래)를 겸하는 바람에 달력이 앞으로 할 일까지 활동으로 세고 있었다.
// 지금은 남긴 날짜 = createdAt(자동)이고, 여기서 고르는 건 "다음에 언제 연락할지"뿐이며
// 그것도 선택 사항이다.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BrandLoader } from '@/components/brand-loader';
import { createContractMemo } from '@/app/contracts/actions';
import { contractMemoPayloadSchema } from '@/lib/contract-schema';
import { CONTRACT_STATUSES, type ContractStatus } from '@/lib/contract-constants';
import { addDaysYmd, todayKST } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import type { ContractMemoDTO } from './contract-detail-view';

/** 자주 쓰는 재연락 간격 — "1개월 뒤" 같은 걸 달력에서 짚는 것보다 한 번에 넣는 게 빠르다 */
const QUICK_OFFSETS = [
  { label: '내일', days: 1 },
  { label: '1주 뒤', days: 7 },
  { label: '2주 뒤', days: 14 },
  { label: '1개월 뒤', days: 30 },
] as const;

interface ContractMemoComposerProps {
  contractedVendorId: number;
  /** 저장에 성공하면 새 메모를 즉시 타임라인 맨 위에 올릴 수 있도록 부모에 알린다 */
  onCreated: (memo: ContractMemoDTO) => void;
}

export function ContractMemoComposer({ contractedVendorId, onCreated }: ContractMemoComposerProps) {
  const [status, setStatus] = useState<ContractStatus | null>(null);
  // 기본값은 "안 정함". 예전처럼 오늘 날짜를 미리 채워두면 아무도 안 건드려서
  // 결국 작성일과 똑같은 값만 잔뜩 쌓인다.
  const [nextContactAt, setNextContactAt] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // 저장 성공을 스크린리더에도 알린다 — 타임라인은 시각적으로 바로 갱신되지만, 화면을 안 보는
  // 사용자는 이 문구가 없으면 저장이 됐는지 알 방법이 없다(quick-add 의 기존 패턴과 동일).
  // 값 자체보다 "바뀌었다"는 사실이 중요해 매 저장마다 1씩 늘리기만 한다.
  const [savedCount, setSavedCount] = useState(0);

  async function handleSubmit() {
    if (saving) return;
    setErrors([]);
    const payload = { status: status ?? undefined, nextContactAt, content };
    const parsed = contractMemoPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors([...new Set(parsed.error.issues.map((i) => i.message))]);
      return;
    }

    setSaving(true);
    try {
      const result = await createContractMemo(contractedVendorId, payload);
      if (!result.ok) {
        setErrors(result.errors ?? ['저장에 실패했습니다.']);
        return;
      }
      // 서버가 실제로 저장한 값 그대로 낙관적으로 얹는다 — 곧 도착할 revalidate 응답이
      // 진짜 id·createdAt 으로 덮어써 자연스럽게 정합해진다.
      onCreated({
        id: -Date.now(), // 서버 응답이 올 때까지만 쓰는 임시 id (음수라 실제 id와 절대 겹치지 않는다)
        status: parsed.data.status,
        nextContactAt: parsed.data.nextContactAt ? parsed.data.nextContactAt.toISOString() : null,
        content: parsed.data.content,
        createdAt: new Date().toISOString(),
      });
      setStatus(null);
      setContent('');
      setNextContactAt('');
      setSavedCount((n) => n + 1);
    } catch {
      setErrors(['네트워크 오류로 저장하지 못했습니다. 다시 시도해주세요.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card-surface animate-fade-up mb-4 p-5">
      <h2 className="text-sm font-semibold">새 메모 남기기</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        진행 상태를 고르고 내용을 적으면 아래에 쌓입니다. 남긴 날짜는 자동으로 기록됩니다.
      </p>

      {errors.length > 0 && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/40 bg-red-50 p-2.5 text-xs text-destructive"
        >
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="진행 상태">
          {CONTRACT_STATUSES.map((s) => {
            const isActive = s.code === status;
            return (
              <button
                key={s.code}
                type="button"
                aria-pressed={isActive}
                disabled={saving}
                onClick={() => setStatus(s.code)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-200',
                  isActive
                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                    : 'border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:text-neutral-900 hover:shadow-soft',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dotVar }} />
                {s.label}
              </button>
            );
          })}
        </div>

      </div>

      {/* 다음 연락 예정일 — 선택. 안 정하면 비워두면 되고, 정해두면 오른쪽 레일의
          "다음 연락 예정"과 달력에 뜬다. 자주 쓰는 간격은 버튼으로 한 번에 넣는다. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Label htmlFor="next-contact" className="text-xs text-muted-foreground">
          다음 연락 예정일 <span className="text-neutral-500">(선택)</span>
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_OFFSETS.map((o) => {
            const value = addDaysYmd(todayKST(), o.days);
            const isActive = nextContactAt === value;
            return (
              <button
                key={o.label}
                type="button"
                aria-pressed={isActive}
                disabled={saving}
                onClick={() => setNextContactAt(isActive ? '' : value)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs transition-all duration-200',
                  isActive
                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                    : 'border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:text-neutral-900',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                {o.label}
              </button>
            );
          })}
          <input
            id="next-contact"
            type="date"
            value={nextContactAt}
            onChange={(e) => setNextContactAt(e.target.value)}
            disabled={saving}
            className={cn(
              'h-8 rounded-md border border-input bg-white px-2 text-sm shadow-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          />
          {nextContactAt && (
            <button
              type="button"
              aria-label="다음 연락 예정일 지우기"
              disabled={saving}
              onClick={() => setNextContactAt('')}
              className="grid size-6 place-items-center rounded text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <Label htmlFor="memo-content" className="text-xs text-muted-foreground">
          내용
        </Label>
        <Textarea
          id="memo-content"
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={saving}
          placeholder="통화 내용, 다음 할 일, 상담 결과 등을 자유롭게 적어주세요."
          className="min-h-20"
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {savedCount > 0 && '메모를 저장했습니다.'}
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        {saving && <BrandLoader size="sm" label="" className="mr-1" />}
        <Button type="button" size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? '저장 중...' : '메모 남기기'}
        </Button>
      </div>
    </section>
  );
}
