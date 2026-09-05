// 화면 맨 위 "활동 요약" — 이 도구를 만든 이유 그 자체("어제 미팅 몇 건 했나,
// 업체랑 컨택은 어떻게 됐나")를 열자마자 답해주는 자리다.
//
// 그래서 업체 명단보다 위에 둔다. 캘린더를 몇 달 전으로 넘겨놨든 여기는 언제나
// 진짜 어제·오늘만 보여준다 — 넘겨본 달에 따라 "어제"가 달라지면 그건 요약이 아니다.
//
// 상태별 숫자 칸은 캘린더 모달·이 달 합계와 같은 조각(DayStatusGrid)을 쓴다.
import Link from 'next/link';
import { buildContractsUrl, type ContractQuery } from '@/lib/contract-query';
import { formatDayHeadingKST } from '@/lib/format-date';
import { DayStatusGrid, statusTotal, type DayActivity } from './contract-day-stats';

export type { DayActivity };

function DayRow({ title, day, query }: { title: string; day: DayActivity; query: ContractQuery }) {
  const total = statusTotal(day.byStatus);
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

      <DayStatusGrid byStatus={day.byStatus} newVendors={day.newVendors} className="grid-cols-3 sm:grid-cols-6" />
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
