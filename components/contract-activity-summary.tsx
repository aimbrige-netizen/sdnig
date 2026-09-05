// 화면 맨 위 "활동 요약" — 이 도구를 만든 이유 그 자체("어제 미팅 몇 건 했나,
// 업체랑 컨택은 어떻게 됐나")를 열자마자 답해주는 자리다.
//
// 그래서 업체 명단보다 위에 둔다. 캘린더를 몇 달 전으로 넘겨놨든 여기는 언제나
// 진짜 어제·오늘만 보여준다 — 넘겨본 달에 따라 "어제"가 달라지면 그건 요약이 아니다.
import Link from 'next/link';
import { CONTRACT_STATUSES } from '@/lib/contract-constants';
import { buildContractsUrl, type ContractQuery } from '@/lib/contract-query';
import { formatDayHeadingKST } from '@/lib/format-date';
import { cn } from '@/lib/utils';

export interface DayActivity {
  /** YYYY-MM-DD */
  date: string;
  /** 상태 코드 → 그 날 그 상태로 남긴 메모 건수 */
  byStatus: Record<string, number>;
  /** 그 날 새로 등록된 업체 수 */
  newVendors: number;
}

function DayRow({ title, day, query }: { title: string; day: DayActivity; query: ContractQuery }) {
  const total = Object.values(day.byStatus).reduce((a, b) => a + b, 0);
  const isActive = query.date === day.date;

  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-neutral-600 tabular-nums">{formatDayHeadingKST(day.date)}</span>
        <span className="text-xs text-neutral-600">
          {total === 0 && day.newVendors === 0 ? '기록 없음' : `총 ${total + day.newVendors}건`}
        </span>
        <Link
          href={buildContractsUrl(query, { date: isActive ? '' : day.date })}
          prefetch={false}
          className="ml-auto text-xs font-medium text-[var(--brand-to)] hover:underline"
        >
          {isActive ? '보기 해제' : '이 날 기록 보기 ›'}
        </Link>
      </div>

      {/* 6칸 고정 — 날마다 칸이 생겼다 사라졌다 하면 같은 자리를 눈으로 못 찾는다 */}
      <dl className="grid grid-cols-3 gap-y-2 sm:grid-cols-6">
        {CONTRACT_STATUSES.map((s) => {
          const n = day.byStatus[s.code] ?? 0;
          return (
            <div key={s.code}>
              {/* 0 은 옅게 — "아무 일도 없었다"는 배경 정보라, 실제로 일어난 숫자가
                  먼저 눈에 들어와야 한다. 라벨은 항상 또렷하게 둔다. */}
              <dd className={cn('text-[22px] leading-none font-semibold tabular-nums', n === 0 && 'text-neutral-300')}>
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
          <dd
            className={cn(
              'text-[22px] leading-none font-semibold tabular-nums',
              day.newVendors === 0 && 'text-neutral-300'
            )}
          >
            {day.newVendors}
          </dd>
          <dt className="mt-1.5 text-xs text-neutral-600">신규 등록</dt>
        </div>
      </dl>
    </div>
  );
}

export function ContractActivitySummary({
  yesterday,
  today,
  query,
}: {
  yesterday: DayActivity;
  today: DayActivity;
  query: ContractQuery;
}) {
  return (
    <section className="card-surface animate-fade-up mb-4 divide-y divide-black/[0.06] px-5 py-4">
      <DayRow title="어제" day={yesterday} query={query} />
      <DayRow title="오늘" day={today} query={query} />
    </section>
  );
}
