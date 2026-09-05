'use client';

// 오른쪽 레일의 월 캘린더 — "어제 미팅 몇 건 했나"를 달력 위에서 바로 훑기 위한 것.
//
// 칸 안에는 숫자를 하나만 둔다(그 날 남긴 메모 건수). 등록/미팅을 둘 다 숫자로 넣으면
// 43px 칸 안에서 글자가 9px까지 줄어 결국 아무것도 안 보인다 — 그 날 새로 등록된 업체가
// 있으면 숫자 옆 점으로만 표시한다.
//
// 날짜를 누르면 상태별 건수(재컨텍요망/장기가망/미팅예정/미팅완료/계약완료 + 신규 등록)를
// 모달로 펼친다. 처음엔 모달 없이 곧장 ?date= 로 넘기게 만들었었는데, 그러면 상태별로
// 몇 건인지 보려고 매번 페이지를 갈아끼워야 해서 달력을 훑을 수가 없다는 피드백을 받았다.
//
// 그래도 칸은 여전히 진짜 <Link href="?date=..."> 다. 그래야
//   - ⌘/Ctrl/가운데 클릭으로 그 날 기록을 새 탭에 띄울 수 있고,
//   - 주소를 복사해 남에게 보낼 수 있고,
//   - JS 가 죽어도 최소한 동작한다.
// 평범한 왼쪽 클릭만 가로채 모달을 띄우고, 모달 안의 "이 날 기록 보기"가 실제 이동을 한다.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildContractsUrl, type ContractQuery } from '@/lib/contract-query';
import { addMonths, buildMonthGrid, formatMonthLabel } from '@/lib/contract-activity';
import { formatDayHeadingKST, relativeDayKST } from '@/lib/format-date';
import { DayStatusGrid, statusTotal } from './contract-day-stats';
import { cn } from '@/lib/utils';

const WEEKDAY_HEADS = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface ContractCalendarProps {
  /** 펼쳐 보여줄 달 (YYYY-MM) */
  month: string;
  /** 날짜(YYYY-MM-DD) → 그 날 남긴 메모 건수 (칸에 찍는 숫자) */
  activity: Record<string, number>;
  /** 날짜(YYYY-MM-DD) → { 상태 코드 → 건수 } (모달에 펼치는 내역) */
  activityByStatus: Record<string, Record<string, number>>;
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
  activityByStatus,
  newVendors,
  activeDate,
  today,
  query,
}: ContractCalendarProps) {
  const router = useRouter();
  const weeks = buildMonthGrid(month);

  // 열림 여부와 "어느 날짜인지"를 따로 든다. 하나로 합쳐서 닫을 때 null 로 만들면,
  // 100ms 짜리 닫힘 애니메이션이 도는 동안 모달 내용이 빈 채로 보인다.
  // 날짜는 애니메이션이 끝난 뒤(onOpenChangeComplete) 비운다.
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // 밖에서 달이 바뀌면(브라우저 뒤로/앞으로, ‹ › 화살표) 열려 있던 모달을 닫는다.
  //
  // 서버는 지금 펼친 달의 42칸치 데이터만 내려준다. 8월 달력에서 8/20 모달을 열어둔 채
  // 뒤로가기로 9월로 돌아오면, 같은 경로라 이 컴포넌트는 다시 마운트되지 않고 props 만
  // 갈리는데 — 모달은 그대로 떠 있고 '2026-08-20' 은 새 데이터에 없는 키라 제목은 8월 20일인
  // 채로 내용만 "기록 없음 · 전부 0" 으로 바뀐다. 실제로는 메모가 있는 날인데 없다고 말한다.
  //
  // effect 가 아니라 렌더 중 조정 — contract-list-controls.tsx 가 같은 뒤로가기 문제를
  // 같은 패턴으로 다룬다.
  const [syncedMonth, setSyncedMonth] = useState(month);
  if (month !== syncedMonth) {
    setSyncedMonth(month);
    setOpen(false);
    setSelected(null);
  }

  // 이 달 합계 — 6주 격자에는 앞뒤 달 날짜가 늘 5~14칸 섞여 있어서, 격자 전체를 더하면
  // 항상 다음 달 몫까지 함께 세어진다. 반드시 이 달 날짜만 걸러 더한다.
  const monthTotals: Record<string, number> = {};
  let monthNew = 0;
  for (const ymd of weeks.flat()) {
    if (ymd.slice(0, 7) !== month) continue;
    for (const [code, n] of Object.entries(activityByStatus[ymd] ?? {})) {
      monthTotals[code] = (monthTotals[code] ?? 0) + n;
    }
    monthNew += newVendors[ymd] ?? 0;
  }

  const selectedStatus = selected ? (activityByStatus[selected] ?? {}) : {};
  const selectedNew = selected ? (newVendors[selected] ?? 0) : 0;
  const selectedTotal = statusTotal(selectedStatus);

  function openDay(ymd: string) {
    setSelected(ymd);
    setOpen(true);
  }

  function goToDay() {
    if (!selected) return;
    // 같은 경로(/contracts)의 검색 파라미터만 바뀌는 이동이라 이 컴포넌트는 다시 마운트되지
    // 않는다 — 모달을 직접 닫아주지 않으면 새 목록 위에 그대로 떠 있는다.
    setOpen(false);
    router.push(buildContractsUrl(query, { date: selected, month }));
  }

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

          const parts = [
            count > 0 ? `메모 ${count}건` : '메모 없음',
            newCount > 0 ? `신규 등록 ${newCount}곳` : '',
          ].filter(Boolean);

          return (
            <Link
              key={ymd}
              href={buildContractsUrl(query, { date: ymd, month })}
              // prefetch={false} — 이 링크들은 지금 페이지와 같은 경로(/contracts)를 가리켜,
              // 프리페치 응답이 저장 직후 갱신된 목록을 "저장 전" 스냅샷으로 덮어쓴다.
              // (contract-list-controls.tsx 의 칩들과 같은 이유)
              prefetch={false}
              onClick={(e) => {
                // 새 탭·새 창 등 보조 클릭은 링크 그대로 — 그 날 기록이 새 탭에서 열린다
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                openDay(ymd);
              }}
              aria-current={isActive ? 'date' : undefined}
              aria-label={`${ymd} · ${parts.join(', ')} · 상태별로 자세히 보기`}
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

      {/* 이 달 합계 — 날짜를 하나씩 눌러보지 않아도 "이번 달 미팅 몇 건 했나"가 바로 보인다 */}
      <div className="mt-3 border-t border-black/[0.06] pt-3">
        {/* 바로 위 카드 머리말이 "2026년 9월"이라 여기서 연도를 되풀이하지 않는다 */}
        <h3 className="mb-2 text-xs font-semibold text-neutral-700">
          {Number(month.slice(5))}월 합계{' '}
          <span className="font-normal text-neutral-600 tabular-nums">
            메모 {statusTotal(monthTotals)}건 · 신규 {monthNew}곳
          </span>
        </h3>
        <DayStatusGrid byStatus={monthTotals} newVendors={monthNew} className="grid-cols-3" size="sm" />
      </div>

      {/* 날짜 하나를 펼친 모달. 42칸마다 하나씩 두면 포털·스크롤락도 42개가 되므로,
          격자 밖에 딱 하나만 두고 어느 날짜인지만 상태로 든다. */}
      <Dialog
        open={open}
        onOpenChange={(next) => setOpen(next)}
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected ? formatDayHeadingKST(selected) : ''}</DialogTitle>
            <DialogDescription>
              {selected && (
                <>
                  {relativeDayKST(`${selected}T00:00:00.000Z`)} ·{' '}
                  {selectedTotal === 0 && selectedNew === 0
                    ? '기록 없음'
                    : `메모 ${selectedTotal}건 · 신규 등록 ${selectedNew}곳`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DayStatusGrid byStatus={selectedStatus} newVendors={selectedNew} className="grid-cols-3" />

          <DialogFooter>
            <Button type="button" size="sm" onClick={goToDay} disabled={!selected}>
              이 날 기록 보기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
