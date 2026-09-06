// 레일 아래쪽 "다음 연락 예정" — 캘린더가 지나간 일을 보여준다면 여기는 앞으로 할 일이다.
//
// 담는 기준: 다음 연락 예정일이 잡혀 있는 **최신** 메모만. 그 뒤에 다른 메모가 하나라도
// 붙었으면 이미 처리된 약속이라 여기 남으면 안 된다(그 필터링은 page.tsx 쿼리에서 한다).
// 상태를 미팅예정으로 좁히지 않는다 — 재컨텍요망("3일 뒤 다시")이나 장기가망("다음 달에")
// 에도 예정일을 잡는 게 이 기능의 핵심이다.
import Link from 'next/link';
import { contractStatusDot, contractStatusLabel } from '@/lib/contract-constants';
import { formatDateKST, relativeDayKST } from '@/lib/format-date';

export interface UpcomingMeeting {
  memoId: number;
  vendorId: number;
  vendorName: string;
  /** 그 예정을 남긴 메모의 진행 상태 */
  status: string;
  /** 다음 연락 예정일 YYYY-MM-DD */
  date: string;
}

export function ContractUpcomingMeetings({
  items,
  overdueCount,
}: {
  items: UpcomingMeeting[];
  overdueCount: number;
}) {
  return (
    <section className="card-surface overflow-hidden">
      <h2 className="border-b border-black/[0.06] px-4 py-2.5 text-sm font-semibold">
        다음 연락 예정
        {items.length > 0 && <span className="ml-1 font-normal text-neutral-600 tabular-nums">{items.length}건</span>}
      </h2>

      {items.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-neutral-600">
          잡아둔 연락 예정이 없습니다.
          <br />
          메모를 남길 때 날짜를 정해두면 여기 뜹니다.
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.06]">
          {items.map((m) => (
            <li key={m.memoId}>
              <Link
                href={`/contracts/${m.vendorId}`}
                className="block px-4 py-2.5 transition-colors hover:bg-neutral-900/5"
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="w-12 shrink-0 text-xs font-medium tabular-nums"
                    style={{ color: 'var(--brand-to)' }}
                    title={formatDateKST(`${m.date}T00:00:00.000Z`)}
                  >
                    {relativeDayKST(`${m.date}T00:00:00.000Z`)}
                  </span>
                  <span className="truncate text-sm">{m.vendorName}</span>
                </div>
                {/* 어떤 상태에서 잡은 약속인지 — "미팅예정 3일 후"와 "장기가망 1개월 후"는
                    같은 줄에 있어도 성격이 전혀 다르다 */}
                <span className="mt-0.5 ml-14 flex items-center gap-1 text-xs text-neutral-600">
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: contractStatusDot(m.status) }}
                  />
                  {contractStatusLabel(m.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* 링크가 아니라 알림인 이유: 예정일은 어떤 상태에서도 잡을 수 있어서 "지난 예정"만
          걸러내는 필터가 없다. 갈 데 없는 링크를 두느니 사실만 말한다 — 위 목록에서
          날짜가 "3일 전"처럼 과거로 표시되는 항목이 바로 그것들이다. */}
      {overdueCount > 0 && (
        <p
          className="flex items-center gap-1.5 border-t border-black/[0.06] px-4 py-2.5 text-xs"
          style={{ color: 'var(--data-warning-ink)' }}
        >
          <span aria-hidden>▲</span>
          연락 예정일이 지난 곳 {overdueCount}곳
        </p>
      )}
    </section>
  );
}
