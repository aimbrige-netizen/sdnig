// "어떤 기간에 상태별로 몇 건" 을 그리는 공용 조각.
//
// 같은 모양을 세 군데서 쓴다 — 맨 위 활동 요약(어제/오늘), 캘린더 날짜 모달, 캘린더 아래
// 이 달 합계. 각자 따로 그리면 칸 순서·0 처리·점 색이 조금씩 달라져서 같은 숫자인데 다른
// 것처럼 보인다.
//
// 칸은 항상 CONTRACT_STATUSES 전체 + 신규 등록으로 고정한다. 0인 상태를 빼버리면 날마다
// 칸이 생겼다 사라졌다 해서 같은 자리를 눈으로 못 찾는다.
import { CONTRACT_STATUSES } from '@/lib/contract-constants';
import { cn } from '@/lib/utils';

export interface DayActivity {
  /** YYYY-MM-DD */
  date: string;
  /** 상태 코드 → 그 날 그 상태로 남긴 메모 건수 */
  byStatus: Record<string, number>;
  /** 그 날 새로 등록된 업체 수 */
  newVendors: number;
}

/** 화면에 실제로 그리는 칸들만 더한다 — 렌더하지 않는 미지의 상태 코드까지 합치면
 *  합계가 자기 칸들의 합과 안 맞아서 산수가 틀린 것처럼 보인다. */
export function statusTotal(byStatus: Record<string, number>): number {
  return CONTRACT_STATUSES.reduce((n, s) => n + (byStatus[s.code] ?? 0), 0);
}

export function DayStatusGrid({
  byStatus,
  newVendors,
  className,
  size = 'lg',
}: {
  byStatus: Record<string, number>;
  newVendors: number;
  /** 그리드 열 수는 놓이는 자리마다 달라서 밖에서 정한다 (레일은 3열, 넓은 카드는 6열) */
  className?: string;
  size?: 'lg' | 'sm';
}) {
  const numCls = size === 'lg' ? 'text-[22px]' : 'text-lg';
  return (
    <dl className={cn('grid gap-y-2.5', className)}>
      {CONTRACT_STATUSES.map((s) => {
        const n = byStatus[s.code] ?? 0;
        return (
          <div key={s.code}>
            {/* 0 은 옅게 — "아무 일도 없었다"는 배경 정보라, 실제로 일어난 숫자가
                먼저 눈에 들어와야 한다. 라벨은 항상 또렷하게 둔다. */}
            <dd className={cn(numCls, 'leading-none font-semibold tabular-nums', n === 0 && 'text-neutral-300')}>
              {n}
            </dd>
            <dt className="mt-1.5 flex items-center gap-1 text-xs text-neutral-600">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.dotVar }} />
              {s.label}
            </dt>
          </div>
        );
      })}
      <div>
        <dd className={cn(numCls, 'leading-none font-semibold tabular-nums', newVendors === 0 && 'text-neutral-300')}>
          {newVendors}
        </dd>
        <dt className="mt-1.5 text-xs text-neutral-600">신규 등록</dt>
      </div>
    </dl>
  );
}
