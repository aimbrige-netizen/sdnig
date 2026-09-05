// 레일 아래쪽 "다가오는 미팅" — 캘린더가 지나간 일을 보여준다면 여기는 앞으로 할 일이다.
//
// 담는 기준: 상태가 "미팅예정"인 **최신** 메모만. 그 뒤에 미팅완료 메모가 하나라도 붙었으면
// 이미 끝난 약속이라 여기 남으면 안 된다(그 필터링은 page.tsx 쪽 쿼리에서 한다).
import Link from 'next/link';
import { buildContractsUrl, type ContractQuery } from '@/lib/contract-query';
import { relativeDayKST } from '@/lib/format-date';

export interface UpcomingMeeting {
  memoId: number;
  vendorId: number;
  vendorName: string;
  /** YYYY-MM-DD */
  date: string;
}

export function ContractUpcomingMeetings({
  items,
  overdueCount,
  query,
}: {
  items: UpcomingMeeting[];
  overdueCount: number;
  query: ContractQuery;
}) {
  return (
    <section className="card-surface overflow-hidden">
      <h2 className="border-b border-black/[0.06] px-4 py-2.5 text-sm font-semibold">
        다가오는 미팅
        {items.length > 0 && <span className="ml-1 font-normal text-neutral-600 tabular-nums">{items.length}건</span>}
      </h2>

      {items.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-neutral-600">예정된 미팅이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {items.map((m) => (
            <li key={m.memoId}>
              <Link
                href={`/contracts/${m.vendorId}`}
                className="flex items-baseline gap-2 px-4 py-2.5 transition-colors hover:bg-neutral-900/5"
              >
                <span className="w-12 shrink-0 text-xs font-medium text-[var(--brand-to)] tabular-nums">
                  {relativeDayKST(`${m.date}T00:00:00.000Z`)}
                </span>
                <span className="truncate text-sm">{m.vendorName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {overdueCount > 0 && (
        <Link
          href={buildContractsUrl(query, { status: 'scheduled', date: '' })}
          prefetch={false}
          className="flex items-center gap-1.5 border-t border-black/[0.06] px-4 py-2.5 text-xs transition-colors hover:bg-neutral-900/5"
          style={{ color: 'var(--data-warning-ink)' }}
        >
          <span aria-hidden>▲</span>
          날짜가 지난 미팅예정 {overdueCount}건
        </Link>
      )}
    </section>
  );
}
