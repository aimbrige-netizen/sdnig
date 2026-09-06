// 오른쪽 레일의 월 캘린더 — "어제 미팅 몇 건 했나"를 달력 위에서 바로 훑기 위한 것.
//
// 칸 안에는 숫자를 하나만 둔다(그 날 남긴 메모 건수). 등록/미팅을 둘 다 숫자로 넣으면
// 43px 칸 안에서 글자가 9px까지 줄어 결국 아무것도 안 보인다 — 그 날 새로 등록된 업체가
// 있으면 숫자 옆 점으로만 표시한다.
//
// 칸 숫자는 "그 날 남긴 메모 수" = 지나간 활동이다. 앞으로 할 일(다음 연락 예정)은 절대
// 이 숫자에 안 섞고 파란 점으로 따로 표시한다 — 예전엔 한 칸이 둘을 겸해서 아직 하지도
// 않은 미팅이 이번 달 활동 건수에 들어가 있었다.
//
// 날짜를 누르면 왼쪽이 그 날 기록으로 바뀐다(?date=). 한동안 모달로 상태별 건수를 먼저
// 펼쳐 보여줬는데, 결국 그 날 뭘 했는지는 왼쪽 목록을 봐야 알 수 있어서 클릭 한 번이
// 더 드는 셈이었다 — 모달을 걷어내고 곧장 목록으로 간다. 상태별 건수는 그 목록 머리말에
// 그대로 있고, 이 카드 아래에는 달 전체 합계와 담당자별 집계가 있다.
//
// 상태를 안 들고 있어 서버 컴포넌트다(칸 42개가 전부 <Link>).
import Link from "next/link";
import { buildContractsUrl, type ContractQuery } from "@/lib/contract-query";
import {
  addMonths,
  buildMonthGrid,
  formatMonthLabel,
} from "@/lib/contract-activity";
import { DayStatusGrid, statusTotal } from "./contract-day-stats";
import { CONTRACT_RESULT_STATUSES } from "@/lib/contract-constants";
import { cn } from "@/lib/utils";

const WEEKDAY_HEADS = ["일", "월", "화", "수", "목", "금", "토"] as const;

interface ContractCalendarProps {
  /** 펼쳐 보여줄 달 (YYYY-MM) */
  month: string;
  /** 날짜(YYYY-MM-DD) → 그 날 남긴 메모 건수 (칸에 찍는 숫자) */
  activity: Record<string, number>;
  /** 날짜(YYYY-MM-DD) → { 상태 코드 → 건수 } (모달에 펼치는 내역) */
  activityByStatus: Record<string, Record<string, number>>;
  /** 날짜(YYYY-MM-DD) → 그 날 새로 등록된 업체 수 */
  newVendors: Record<string, number>;
  /** 날짜(YYYY-MM-DD) → 그 날로 잡아둔 다음 연락 예정 건수 (앞으로 할 일) */
  plans: Record<string, number>;
  /** 담당자별 이 달 실적 — 미팅완료·계약완료 두 가지만.
   *  상태 코드를 키로 잡아 CONTRACT_RESULT_STATUSES 와 나란히 읽는다. */
  byManager: { name: string; counts: Record<string, number> }[];
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
  plans,
  byManager,
  activeDate,
  today,
  query,
}: ContractCalendarProps) {
  const weeks = buildMonthGrid(month);

  // 이 달 합계 — 6주 격자에는 앞뒤 달 날짜가 늘 5~14칸 섞여 있어서, 격자 전체를 더하면
  // 항상 다음 달 몫까지 함께 세어진다. 반드시 이 달 날짜만 걸러 더한다.
  const monthTotals: Record<string, number> = {};
  let monthNew = 0;
  let monthPlans = 0;
  for (const ymd of weeks.flat()) {
    if (ymd.slice(0, 7) !== month) continue;
    for (const [code, n] of Object.entries(activityByStatus[ymd] ?? {})) {
      monthTotals[code] = (monthTotals[code] ?? 0) + n;
    }
    monthNew += newVendors[ymd] ?? 0;
    monthPlans += plans[ymd] ?? 0;
  }

  return (
    <section className="card-surface p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold tabular-nums">
          {formatMonthLabel(month)}
        </h2>
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
          const planCount = plans[ymd] ?? 0;
          const isToday = ymd === today;
          const isActive = ymd === activeDate;

          const parts = [
            count > 0 ? `메모 ${count}건` : "메모 없음",
            newCount > 0 ? `신규 등록 ${newCount}곳` : "",
            planCount > 0 ? `연락 예정 ${planCount}건` : "",
          ].filter(Boolean);

          return (
            <Link
              key={ymd}
              // 같은 날짜를 다시 누르면 날짜 보기가 풀린다(토글)
              href={buildContractsUrl(query, {
                date: isActive ? "" : ymd,
                month,
              })}
              // prefetch={false} — 이 링크들은 지금 페이지와 같은 경로(/contracts)를 가리켜,
              // 프리페치 응답이 저장 직후 갱신된 목록을 "저장 전" 스냅샷으로 덮어쓴다.
              // (contract-list-controls.tsx 의 칩들과 같은 이유)
              prefetch={false}
              aria-current={isActive ? "date" : undefined}
              aria-label={`${ymd} · ${parts.join(", ")}`}
              title={`${ymd} · ${parts.join(" · ")}`}
              className={cn(
                "relative flex h-[42px] flex-col items-center justify-center rounded-md border transition-colors",
                isActive
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : isToday
                    ? "border-[var(--brand-to)] bg-white hover:bg-neutral-900/5"
                    : "border-transparent hover:bg-neutral-900/5",
              )}
            >
              <span
                className={cn(
                  "text-[13px] leading-none tabular-nums",
                  isActive
                    ? "text-white"
                    : inMonth
                      ? "text-neutral-700"
                      : "text-neutral-300",
                )}
              >
                {Number(ymd.slice(8))}
              </span>
              {/* 건수가 없어도 이 줄은 자리를 지킨다 — 안 그러면 숫자 있는 칸만 날짜가 위로
                  밀려 줄이 흔들린다. 신규 등록 점도 여기 인라인으로 붙인다: 칸 모서리에
                  띄웠더니 옆 칸 숫자에 붙어 보여서 어느 날 얘기인지 헷갈렸다. */}
              <span
                className={cn(
                  "mt-1 flex h-[13px] items-center justify-center gap-[3px] text-[13px] leading-none font-semibold tabular-nums",
                  isActive ? "text-white" : "text-neutral-900",
                )}
              >
                {count > 0 ? count : ""}
                {newCount > 0 && (
                  <span
                    aria-hidden
                    className="size-1 rounded-full"
                    style={{
                      backgroundColor: isActive ? "#fff" : "var(--brand-to)",
                    }}
                  />
                )}
                {/* 예정은 활동과 색을 달리한다 — 숫자로 넣으면 "한 일"과 구분이 안 된다 */}
                {planCount > 0 && (
                  <span
                    aria-hidden
                    className="size-1 rounded-full"
                    style={{
                      backgroundColor: isActive
                        ? "#fff"
                        : "var(--data-status-scheduled)",
                    }}
                  />
                )}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-black/[0.06] pt-2.5 text-xs text-neutral-600">
        <span>
          <span className="font-semibold text-neutral-900">숫자</span> = 그 날
          남긴 메모
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="size-1 rounded-full"
            style={{ backgroundColor: "var(--brand-to)" }}
          />
          신규 등록
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="size-1 rounded-full"
            style={{ backgroundColor: "var(--data-status-scheduled)" }}
          />
          연락 예정
        </span>
      </p>

      {/* 이 달 합계 — 날짜를 하나씩 눌러보지 않아도 "이번 달 미팅 몇 건 했나"가 바로 보인다 */}
      <div className="mt-3 border-t border-black/[0.06] pt-3">
        {/* 바로 위 카드 머리말이 "2026년 9월"이라 여기서 연도를 되풀이하지 않는다 */}
        <h3 className="mb-2 text-xs font-semibold text-neutral-700">
          {Number(month.slice(5))}월 합계{" "}
          <span className="font-normal text-neutral-600 tabular-nums">
            메모 {statusTotal(monthTotals)}건 · 신규 {monthNew}곳
            {monthPlans > 0 && ` · 연락 예정 ${monthPlans}건`}
          </span>
        </h3>
        <DayStatusGrid
          byStatus={monthTotals}
          newVendors={monthNew}
          className="grid-cols-3"
          size="sm"
        />
      </div>

      {/* 담당자별 — 같은 달을 누가 얼마나 움직였나.
          미팅완료·계약완료 둘만 센다. 다섯 단계를 작은 점 색으로만 구분해 늘어놨더니
          어느 칸이 어느 상태인지 못 읽겠다는 피드백을 받고 줄였다. 지금은 색이 아니라
          글자 머리말이 뜻을 지고, 색은 본문 표(이정표 열)와 같은 값을 그대로 써서
          거들기만 한다 — 색을 못 봐도 표가 그대로 읽힌다. */}
      <div className="mt-3 border-t border-black/[0.06] pt-3">
        <h3 className="mb-1.5 text-xs font-semibold text-neutral-700">
          담당자별 {Number(month.slice(5))}월 실적{" "}
          <span className="font-normal text-neutral-600">맡은 업체 기준</span>
        </h3>
        {/* 비어 있어도 칸 자체는 남긴다 — 통째로 사라지면 고장 난 줄 안다 */}
        {byManager.length === 0 ? (
          <p className="py-2 text-xs text-neutral-600">
            이 달에는 미팅완료·계약완료 기록이 없습니다.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            {/* 한 화면에 표가 둘(업체 목록 + 이 표)이라 각자 이름을 갖고 있어야
                스크린리더에서 "미팅완료" 머리말이 어느 표의 것인지 구분된다 */}
            <caption className="sr-only">담당자별 {Number(month.slice(5))}월 실적 (미팅완료·계약완료 건수)</caption>
            <thead>
              <tr className="border-b border-black/[0.06] text-xs text-neutral-600">
                <th className="pb-1 text-left font-medium">담당자</th>
                {CONTRACT_RESULT_STATUSES.map((st) => (
                  <th
                    key={st.code}
                    className="w-[4.5rem] pb-1 text-right font-medium"
                  >
                    {st.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byManager.map((m) => (
                <tr
                  key={m.name}
                  className="border-b border-black/[0.04] last:border-b-0"
                >
                  <td className="max-w-0 truncate py-1.5 pr-2" title={m.name}>
                    {m.name}
                  </td>
                  {CONTRACT_RESULT_STATUSES.map((st) => {
                    const n = m.counts[st.code] ?? 0;
                    return (
                      <td
                        key={st.code}
                        className="py-1.5 text-right tabular-nums"
                      >
                        <span
                          className={
                            n === 0 ? "text-neutral-300" : "font-semibold"
                          }
                          style={n === 0 ? undefined : { color: st.colorVar }}
                        >
                          {n}
                        </span>
                        <span className="sr-only"> {st.label}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
