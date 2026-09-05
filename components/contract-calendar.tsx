// 오른쪽 레일의 월 캘린더 — "어제 미팅 몇 건 했나"를 달력 위에서 바로 훑기 위한 것.
//
// 칸 안에는 숫자를 하나만 둔다(그 날 남긴 메모 건수). 등록/미팅을 둘 다 숫자로 넣으면
// 39px 칸 안에서 글자가 9px까지 줄어 결국 아무것도 안 보인다 — 그 날 새로 등록된 업체가
// 있으면 오른쪽 위 점으로만 표시하고, 정확한 숫자는 날짜를 눌러 왼쪽 목록에서 본다.
//
// 모달이 아니라 링크인 이유: 모달에서는 업체 상세로 이어 들어갈 수 없고, 뒤로가기도
// 안 먹는다. 날짜를 누르면 URL(?date=)이 바뀌고 왼쪽 목록이 그 날 활동으로 바뀐다.
//
// 상태를 안 들고 있어 서버 컴포넌트로 둔다(칸 42개가 전부 <Link>).
import Link from 'next/link';
import { buildContractsUrl, type ContractQuery } from '@/lib/contract-query';
import { addMonths, buildMonthGrid, formatMonthLabel } from '@/lib/contract-activity';
import { cn } from '@/lib/utils';

const WEEKDAY_HEADS = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface ContractCalendarProps {
  /** 펼쳐 보여줄 달 (YYYY-MM) */
  month: string;
  /** 날짜(YYYY-MM-DD) → 그 날 남긴 메모 건수 */
  activity: Record<string, number>;
  /** 날짜(YYYY-MM-DD) → 그 날 새로 등록된 업체 수 */
  newVendors: Record<string, number>;
  /** 현재 보고 있는 날짜 (없으면 '') */
  activeDate: string;
  /** 서버가 계산한 KST 오늘 — 클라이언트 시계를 쓰면 하이드레이션이 어긋난다 */
  today: string;
  query: ContractQuery;
}

export function ContractCalendar({
  month,
  activity,
  newVendors,
  activeDate,
  today,
  query,
}: ContractCalendarProps) {
  const weeks = buildMonthGrid(month);

  return (
    <section className="card-surface p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold tabular-nums">{formatMonthLabel(month)}</h2>
        <div className="flex items-center gap-0.5">
          {/* 화살표는 달만 바꾼다 — 보고 있던 날짜·필터는 그대로 둔다 */}
          <Link
            href={buildContractsUrl(query, { month: addMonths(month, -1) })}
            prefetch={false}
            aria-label="이전 달"
            className="grid size-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900"
          >
            ‹
          </Link>
          <Link
            href={buildContractsUrl(query, { month: addMonths(month, 1) })}
            prefetch={false}
            aria-label="다음 달"
            className="grid size-7 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px" aria-hidden>
        {WEEKDAY_HEADS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs text-neutral-600">
            {w}
          </div>
        ))}
      </div>

      {/* 항상 6줄 — 달마다 5줄/6줄로 오가면 레일 높이가 튀어 옆 목록까지 밀린다 */}
      <div className="grid grid-cols-7 gap-px">
        {weeks.flat().map((ymd) => {
          const inMonth = ymd.slice(0, 7) === month;
          const count = activity[ymd] ?? 0;
          const newCount = newVendors[ymd] ?? 0;
          const isToday = ymd === today;
          const isActive = ymd === activeDate;
          // 같은 날짜를 다시 누르면 날짜 보기를 끈다(토글)
          const href = buildContractsUrl(query, { date: isActive ? '' : ymd, month });

          const parts = [
            count > 0 ? `메모 ${count}건` : '메모 없음',
            newCount > 0 ? `신규 등록 ${newCount}곳` : '',
          ].filter(Boolean);

          return (
            <Link
              key={ymd}
              href={href}
              // prefetch={false} — 이 링크들은 지금 페이지와 같은 경로(/contracts)를 가리켜,
              // 프리페치 응답이 저장 직후 갱신된 목록을 "저장 전" 스냅샷으로 덮어쓴다.
              // (contract-list-controls.tsx 의 칩들과 같은 이유)
              prefetch={false}
              aria-current={isActive ? 'date' : undefined}
              aria-label={`${ymd} · ${parts.join(', ')}`}
              title={`${ymd} · ${parts.join(' · ')}`}
              className={cn(
                'relative flex h-[42px] flex-col items-center justify-center rounded-md border transition-colors',
                isActive
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : isToday
                    ? 'border-[var(--brand-to)] bg-white hover:bg-neutral-900/5'
                    : 'border-transparent hover:bg-neutral-900/5'
              )}
            >
              <span
                className={cn(
                  'text-[13px] leading-none tabular-nums',
                  isActive ? 'text-white' : inMonth ? 'text-neutral-700' : 'text-neutral-300'
                )}
              >
                {Number(ymd.slice(8))}
              </span>
              {/* 건수가 없어도 이 줄은 자리를 지킨다 — 안 그러면 숫자 있는 칸만 날짜가 위로
                  밀려 줄이 흔들린다. 신규 등록 점도 여기 인라인으로 붙인다: 칸 모서리에
                  띄웠더니 옆 칸 숫자에 붙어 보여서 어느 날 얘기인지 헷갈렸다. */}
              <span
                className={cn(
                  'mt-1 flex h-[13px] items-center justify-center gap-[3px] text-[13px] leading-none font-semibold tabular-nums',
                  isActive ? 'text-white' : 'text-neutral-900'
                )}
              >
                {count > 0 ? count : ''}
                {newCount > 0 && (
                  <span
                    aria-hidden
                    className="size-1 rounded-full"
                    style={{ backgroundColor: isActive ? '#fff' : 'var(--brand-to)' }}
                  />
                )}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-black/[0.06] pt-2.5 text-xs text-neutral-600">
        <span>
          <span className="font-semibold text-neutral-900">숫자</span> = 메모 건수
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-1 rounded-full" style={{ backgroundColor: 'var(--brand-to)' }} />
          점 = 신규 등록
        </span>
      </p>
    </section>
  );
}
