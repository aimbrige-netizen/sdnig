// 계약 업체 DB — 구두/서면 계약만 맺고 상세 정보를 아직 못 받은 업체 명단.
//
// 이 화면이 답해야 하는 질문은 두 가지고, 순서가 있습니다.
//   1) "어제 미팅 몇 건 했지? 업체랑 컨택은 어떻게 됐지?"  → 활동
//   2) "그 업체 전화번호가 뭐였지?"                        → 명단
// 원래는 (2)만 있는 화면이었는데, 실제로 매일 쓰는 건 (1)이라 활동 요약을 맨 위로 올리고
// 오른쪽 레일에 캘린더를 붙였습니다. 캘린더에서 날짜를 누르면 왼쪽이 그 날 활동으로 바뀝니다.
//
// 업체마다 진행 메모를 여러 번 남길 수 있고(상세 페이지 참고), 그중 가장 최근 메모의
// 상태(재컨텍요망/장기가망/미팅예정/미팅완료/계약완료)가 그 업체의 "현재 상태"입니다.
// 아직 메모를 하나도 안 남긴 곳은 "미분류"로 둡니다.
//
// ⚠️ 날짜 컬럼 두 종류를 절대 섞지 마세요 (lib/format-date.ts 머리말 참고):
//   - ContractMemo.memoDate 는 @db.Date → dateOnlyUTC()
//   - createdAt 은 타임스탬프        → kstDayStartUTC()
// 바꿔 쓰면 결과가 정확히 하루씩 밀립니다.
//
// 표면은 딱 2단만 씁니다 — 페이지 배경(--contracts-bg) vs 흰 카드. 회색 톤을 여러 단계로
// 잘게 나눴던 버전은 서로 너무 비슷해 오히려 산만하다는 피드백을 받고 걷어냈습니다.
// 본문 폭은 헤더(components/admin-header.tsx)와 같은 max-w-shell 로 맞춥니다 — 예전엔
// 화면 전체를 쓰다 보니 헤더와 어긋나고, 한 행이 가로로 늘어져 눈이 따라가기 힘들었습니다.
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { AdminHeader } from '@/components/admin-header';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContractRow } from '@/components/contract-row';
import { ContractResultStatus } from '@/components/contract-result-status';
import { ContractListControls } from '@/components/contract-list-controls';
import { ContractQuickAdd } from '@/components/contract-quick-add';
import { ContractCalendar } from '@/components/contract-calendar';
import { ContractActivitySummary, type DayActivity } from '@/components/contract-activity-summary';
import { ContractUpcomingMeetings, type UpcomingMeeting } from '@/components/contract-upcoming-meetings';
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  contractStatusDot,
  contractStatusLabel,
  contractTypeDot,
  contractTypeLabel,
  isInfoIncomplete,
} from '@/lib/contract-constants';
import { type ContractQuery, type ContractSort } from '@/lib/contract-query';
import {
  addDaysYmd,
  dateOnlyUTC,
  formatDateTimeKST,
  formatDayHeadingKST,
  formatTimeKST,
  kstDayStartUTC,
  relativeDayKST,
  todayKST,
  ymdKST,
} from '@/lib/format-date';
import {
  countsByCreatedAtKST,
  countsByDateAndStatus,
  countsByMemoDate,
  monthGridRange,
  monthOf,
  parseMonthParam,
} from '@/lib/contract-activity';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('ko-KR');

/** 한 화면에 그리는 최대 행 수 — 넘치면 잘렸다는 사실을 화면에 명시한다 (조용한 절삭 금지) */
const MAX_ROWS = 500;

/** 레일의 "다가오는 미팅"에 한 번에 보여줄 개수 */
const UPCOMING_LIMIT = 5;

/** 메모를 하나도 안 남긴 업체의 상태 코드 — CONTRACT_STATUSES 에는 없는, 화면 전용 값 */
const NONE_STATUS = 'none';

/** YYYY-MM-DD 형태이면서 실제로 존재하는 날짜인지 — 존재하지 않는 날짜(2월 30일 등)는
 *  new Date() 가 조용히 다음 달로 굴려버리므로 왕복 비교로 걸러낸다. */
function parseDateParam(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** 비율 표시 — 전부 채워졌을 때만 100%. 99.6% 를 반올림해 "100% · 249/250" 처럼 모순되게 쓰지 않는다. */
function pctText(part: number, total: number): string {
  if (total <= 0) return '0';
  if (part >= total) return '100';
  return String(Math.min(99, Math.floor((part / total) * 100)));
}

/** 전화번호·주소 중 하나라도 비어 있는 상태 (Prisma where 절) */
const INCOMPLETE_WHERE: Prisma.ContractedVendorWhereInput = {
  OR: [{ phone: null }, { phone: '' }, { address: null }, { address: '' }],
};

/** 레일용 한 줄 스탯 — 큰 타일 4개가 본문 맨 위를 차지하던 걸 여기로 옮겨 압축했다.
 *  이 숫자들은 "지금 명단이 어떤 상태인가"라 매일 보는 값은 아니고, 곁눈으로 확인하는 값이다. */
function RailStat({ label, value, dot, tone }: { label: string; value: number; dot?: string; tone?: 'warning' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-600">
        {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
        {tone === 'warning' && (
          <span aria-hidden className="leading-none" style={{ color: 'var(--data-warning-ink)' }}>
            ▲
          </span>
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="text-sm font-semibold tabular-nums">{nf.format(value)}</span>
    </div>
  );
}

/** 진행 상태 배지 — 점 + 라벨 + (있으면) 그 상태로 남긴 최근 메모의 날짜.
 *  날짜는 "오늘/어제/3일 전"처럼 읽어서 바로 감이 오게 쓴다. 예전엔 2026.09.04 를
 *  neutral-400 · 12px 로 흘려 썼는데, 대비가 2.5:1 밖에 안 나와 안 보인다는 지적을 받았다.
 *  미분류는 중립 회색으로 다른 뜻(위험/경고)처럼 보이지 않게 한다. */
function StatusBadge({ status, lastMemoDate }: { status: string | null; lastMemoDate: Date | null }) {
  const label = status ? contractStatusLabel(status) : '미분류';
  const dot = status ? contractStatusDot(status) : 'var(--muted-foreground)';
  return (
    <span className="flex items-center gap-2">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: dot }} />
        {label}
      </span>
      {lastMemoDate && (
        <span className="shrink-0 text-[13px] text-neutral-600 tabular-nums">{relativeDayKST(lastMemoDate)}</span>
      )}
    </span>
  );
}

export default async function ContractsPage({
  searchParams,
}: {
  // 같은 키가 반복되면(?q=a&q=b) 값이 배열로 들어온다 — 문자열로 단정하면 .trim() 에서 500이 난다
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));
  const q = first(sp.q).trim().slice(0, 100);
  const typeParam = first(sp.type);
  const activeType = CONTRACT_TYPES.some((t) => t.code === typeParam) ? typeParam : '';
  const statusParam = first(sp.status);
  const activeStatus =
    CONTRACT_STATUSES.some((s) => s.code === statusParam) || statusParam === NONE_STATUS ? statusParam : '';
  const sort: ContractSort = first(sp.sort) === 'name' ? 'name' : 'latest';
  const onlyIncomplete = first(sp.incomplete) === '1';
  const activeDate = parseDateParam(first(sp.date)) ?? '';
  const monthParam = parseMonthParam(first(sp.m)) ?? '';
  const query: ContractQuery = {
    q,
    type: activeType,
    status: activeStatus,
    sort,
    incomplete: onlyIncomplete,
    date: activeDate,
    month: monthParam,
  };

  // 날짜 기준점은 전부 서버에서 KST 로 계산해 내려보낸다 — 클라이언트 시계를 쓰면
  // 하이드레이션이 어긋나고, 서버 로컬 타임존(UTC)을 쓰면 하루가 밀린다.
  const today = todayKST();
  const yesterday = addDaysYmd(today, -1);
  // 달력이 펼칠 달: 명시된 ?m= > 보고 있는 날짜의 달 > 이번 달
  const activeMonth = monthParam || (activeDate ? monthOf(activeDate) : monthOf(today));
  const gridRange = monthGridRange(activeMonth);

  // 검색어: 업체명·전화번호·주소·담당자·메모 중 아무 곳이나 포함되면 매칭.
  // 메모는 이제 별도 타임라인(ContractMemo)이라, 그중 하나라도 검색어를 포함하면 매칭으로 친다.
  const searchOr: Prisma.ContractedVendorWhereInput = {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { address: { contains: q, mode: 'insensitive' } },
      { managerName: { contains: q, mode: 'insensitive' } },
      { memos: { some: { content: { contains: q, mode: 'insensitive' } } } },
    ],
  };

  // 계약 형태·진행 상태를 뺀 나머지 조건(검색어·정보 미비)만 담은 범위.
  // "칩을 눌러도 숫자가 흔들리지 않는다"는 기존 규칙을, 이제 두 종류(형태/상태)의 칩에 함께 적용한다 —
  // 각 칩 그룹의 카운트는 자기 자신만 뺀 나머지 조건(검색어·정보미비·다른 칩 그룹)을 전부 반영해야
  // "이 칩을 누르면 몇 건이 보일지"가 정확히 맞는다.
  const scopeWhere: Prisma.ContractedVendorWhereInput = {
    AND: [...(q ? [searchOr] : []), ...(onlyIncomplete ? [INCOMPLETE_WHERE] : [])],
  };

  // 진행 상태는 "가장 최근 메모의 status" 로 정해지는데, 이건 Prisma 의 단순 관계 필터(memos: { some })로는
  // 정확히 표현할 수 없다 — some 은 "메모들 중 하나라도" 를 뜻해 과거에 스쳐간 상태까지 걸리기 때문이다.
  // 그래서 범위(검색어·정보미비) 안의 업체를 각자의 최신 메모 status 와 함께 우선 가져와 JS 에서
  // 정확히 집계한다. 규모가 작은 내부 도구라 이 방식이 raw SQL 없이도 충분히 빠르고 정확하다.
  // createdAt 만으로 정렬하면 같은 밀리초에 찍힌 메모 사이의 순서를 Postgres 가 보장하지 않는다
  // (시드 스크립트나 거의 동시에 남긴 메모에서 실제로 발생할 수 있다) — id 를 2차 정렬키로 더해
  // "가장 최근 메모"가 요청마다 바뀌는 일이 없게 한다.
  const scopeRows = await prisma.contractedVendor.findMany({
    where: scopeWhere,
    select: {
      id: true,
      contractType: true,
      memos: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { status: true } },
    },
  });
  const statusOf = (r: { memos: { status: string }[] }): string => r.memos[0]?.status ?? NONE_STATUS;

  const scopeTotal = scopeRows.length;
  const typeCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const r of scopeRows) {
    const st = statusOf(r);
    // 형태별 카운트 — 현재 활성 상태 필터는 유지한 채로("이 형태를 누르면 몇 건") 집계
    if (!activeStatus || st === activeStatus) {
      typeCounts.set(r.contractType, (typeCounts.get(r.contractType) ?? 0) + 1);
    }
    // 상태별 카운트 — 현재 활성 형태 필터는 유지한 채로("이 상태를 누르면 몇 건") 집계
    if (!activeType || r.contractType === activeType) {
      statusCounts.set(st, (statusCounts.get(st) ?? 0) + 1);
    }
  }

  const idsForActiveStatus = activeStatus ? scopeRows.filter((r) => statusOf(r) === activeStatus).map((r) => r.id) : null;

  // OR 를 쓰는 조건이 여럿이라 객체 스프레드로 합치면 서로 덮어쓴다 → AND 배열로 합칩니다.
  const listWhere: Prisma.ContractedVendorWhereInput = {
    AND: [
      ...(activeType ? [{ contractType: activeType }] : []),
      ...(q ? [searchOr] : []),
      ...(onlyIncomplete ? [INCOMPLETE_WHERE] : []),
      ...(idsForActiveStatus ? [{ id: { in: idsForActiveStatus } }] : []),
    ],
  };

  const [
    vendors,
    incompleteCount,
    dateMemos,
    dateNewVendors,
    dayStatusRows,
    dayNewRows,
    monthActivityRows,
    monthNewRows,
    scheduledRows,
  ] = await Promise.all([
    // 업체 명단 — 날짜 보기에서는 안 쓴다
    activeDate
      ? Promise.resolve([])
      : prisma.contractedVendor.findMany({
          where: listWhere,
          orderBy: sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' },
          take: MAX_ROWS,
          include: { memos: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } },
        }),
    // 정보 미비 건수는 레일 스탯·완성도 미터에 항상 쓰이므로 날짜 보기에서도 계산한다
    prisma.contractedVendor.count({ where: { AND: [scopeWhere, INCOMPLETE_WHERE] } }),
    // 날짜 보기 — 계약 형태/진행 상태/검색어/정렬과는 독립된 별도 보기라 그 필터들과
    // 조합하지 않는다(ContractListControls 쪽에서 이 필터들을 조작하면 date 를 함께 지운다).
    // memoDate(실제 업무/미팅 날짜) 기준으로 모으되, 각 행에 기록 시각(createdAt)도 함께 보여준다.
    activeDate
      ? prisma.contractMemo.findMany({
          where: { memoDate: dateOnlyUTC(activeDate) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { contractedVendor: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
    // 그 날 새로 등록된 업체 — 메모가 아니라 등록 자체도 "그 날 한 일"이다
    activeDate
      ? prisma.contractedVendor.findMany({
          where: { createdAt: { gte: kstDayStartUTC(activeDate), lt: kstDayStartUTC(addDaysYmd(activeDate, 1)) } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, createdAt: true },
        })
      : Promise.resolve([]),
    // 어제·오늘 활동 (상태별)
    prisma.contractMemo.groupBy({
      by: ['memoDate', 'status'],
      where: { memoDate: { in: [dateOnlyUTC(yesterday), dateOnlyUTC(today)] } },
      _count: { _all: true },
    }),
    // 어제·오늘 신규 등록 — createdAt 은 타임스탬프라 KST 하루 경계로 잘라야 한다
    prisma.contractedVendor.findMany({
      where: { createdAt: { gte: kstDayStartUTC(yesterday), lt: kstDayStartUTC(addDaysYmd(today, 1)) } },
      select: { createdAt: true },
    }),
    // 달력에 뿌릴 42칸치 메모 건수 — 상태까지 쪼개서 가져온다(날짜 모달이 상태별로 펼친다).
    // 최악이라도 42일 × 상태 5개 = 210행이라 그냥 한 번에 받는다.
    // ⚠️ 양쪽 경계 모두 dateOnlyUTC — 한쪽이라도 kstDayStartUTC 로 바꾸면 창이 9시간 밀려
    //    첫 칸이 빠지고 화면에 없는 43일째가 딸려 들어온다.
    prisma.contractMemo.groupBy({
      by: ['memoDate', 'status'],
      where: { memoDate: { gte: dateOnlyUTC(gridRange.start), lt: dateOnlyUTC(gridRange.endExclusive) } },
      _count: { _all: true },
    }),
    // 달력에 뿌릴 42칸치 신규 등록.
    // 여기만 groupBy 가 아닌 findMany 인 건 실수가 아니다 — createdAt 은 타임스탬프라
    // groupBy(['createdAt']) 는 업체 하나당 한 행이 나와 집계가 안 되고, DB 쪽 날짜 절단은
    // UTC 기준이라 KST 00~09시에 등록된 곳이 전부 하루 앞으로 밀린다. KST 하루로 묶으려면
    // raw SQL 을 쓰거나 지금처럼 JS 에서 ymdKST 로 세는 수밖에 없다.
    prisma.contractedVendor.findMany({
      where: {
        createdAt: { gte: kstDayStartUTC(gridRange.start), lt: kstDayStartUTC(gridRange.endExclusive) },
      },
      select: { createdAt: true },
    }),
    // "미팅예정" 메모 전체 — 이 중 아직 그 업체의 **최신** 메모인 것만 진짜 예정이다.
    // (뒤에 미팅완료 메모가 붙었으면 이미 끝난 약속이다.) 최신 여부는 Prisma where 로
    // 표현할 수 없어 JS 에서 거른다. 내부 도구 규모라 전체를 들고 와도 부담이 없다.
    prisma.contractMemo.findMany({
      where: { status: 'scheduled' },
      orderBy: [{ memoDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        memoDate: true,
        contractedVendor: {
          select: {
            id: true,
            name: true,
            memos: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true } },
          },
        },
      },
    }),
  ]);

  // ── 활동 요약 (어제 / 오늘) ────────────────────────────────────────────────
  const dayStatus = countsByDateAndStatus(dayStatusRows);
  const dayNew = countsByCreatedAtKST(dayNewRows);
  const dayActivityOf = (ymd: string): DayActivity => ({
    date: ymd,
    byStatus: dayStatus[ymd] ?? {},
    newVendors: dayNew[ymd] ?? 0,
  });

  // ── 달력 ──────────────────────────────────────────────────────────────────
  // 칸에 찍는 숫자는 상태 구분 없는 하루 합계, 모달에 펼치는 건 상태별 내역.
  // 같은 groupBy 결과를 두 가지로 접기만 하므로 쿼리는 하나면 된다.
  const calendarActivity = countsByMemoDate(monthActivityRows);
  const calendarActivityByStatus = countsByDateAndStatus(monthActivityRows);
  const calendarNewVendors = countsByCreatedAtKST(monthNewRows);

  // ── 다가오는 미팅 ─────────────────────────────────────────────────────────
  const liveScheduled = scheduledRows.filter((r) => r.contractedVendor.memos[0]?.id === r.id);
  const todayDate = dateOnlyUTC(today);
  const upcoming: UpcomingMeeting[] = liveScheduled
    .filter((r) => r.memoDate >= todayDate)
    .slice(0, UPCOMING_LIMIT)
    .map((r) => ({
      memoId: r.id,
      vendorId: r.contractedVendor.id,
      vendorName: r.contractedVendor.name,
      date: r.memoDate.toISOString().slice(0, 10),
    }));
  const overdueCount = liveScheduled.filter((r) => r.memoDate < todayDate).length;

  // 각 칩 그룹의 "전체" 항목 — scopeTotal(검색어·정보미비만 반영) 을 그대로 쓰면 안 된다.
  // 다른 축(형태/상태)에 이미 필터가 걸려 있을 때, "전체"를 눌러도 실제로는 그 다른 축의
  // 필터는 유지된 채로 이 축만 풀리므로, 표시 숫자도 그 상태를 반영해야 한다 —
  // 정확히 typeCounts/statusCounts 는 이미 그렇게 계산돼 있으니 그 합을 쓴다.
  const typeScopeTotal = [...typeCounts.values()].reduce((a, b) => a + b, 0);
  const statusScopeTotal = [...statusCounts.values()].reduce((a, b) => a + b, 0);

  const completeCount = scopeTotal - incompleteCount;
  const completePct = scopeTotal > 0 ? (completeCount / scopeTotal) * 100 : 0;
  const completeLabel = pctText(completeCount, scopeTotal);
  // 현재 조건(형태·상태 칩 포함)에 실제로 맞는 총 건수 — 표시 상한에 걸려도 진짜 숫자를 보여준다
  const matchingTotal = activeStatus
    ? (statusCounts.get(activeStatus) ?? 0)
    : activeType
      ? (typeCounts.get(activeType) ?? 0)
      : scopeTotal;
  // '정보 미비만 보기' 상태에서는 완성도가 정의상 0% 라 아무 정보도 주지 못하므로 감춘다
  const showMeter = !onlyIncomplete;

  // 칩 카운트는 서버에서 계산해 넘긴다 (필터 조작은 클라이언트 컨트롤이 일괄 처리)
  const typeChips = [
    { code: '', label: '전체', dot: '', count: typeScopeTotal },
    ...CONTRACT_TYPES.map((t) => ({
      code: t.code as string,
      label: t.label,
      dot: t.dotVar,
      count: typeCounts.get(t.code) ?? 0,
    })),
  ];
  const statusChips = [
    { code: '', label: '전체', dot: '', count: statusScopeTotal },
    ...CONTRACT_STATUSES.map((s) => ({
      code: s.code as string,
      label: s.label,
      dot: s.dotVar,
      count: statusCounts.get(s.code) ?? 0,
    })),
    { code: NONE_STATUS, label: '미분류', dot: 'var(--muted-foreground)', count: statusCounts.get(NONE_STATUS) ?? 0 },
  ];

  const filterDesc = [
    q ? `"${q}" 검색` : '',
    activeType ? contractTypeLabel(activeType) : '',
    activeStatus ? (activeStatus === NONE_STATUS ? '미분류' : contractStatusLabel(activeStatus)) : '',
    onlyIncomplete ? '정보 미비' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // 날짜 보기 머리말용 — 그 날 상태별로 몇 건이었는지
  const dateStatusCounts = new Map<string, number>();
  for (const m of dateMemos) dateStatusCounts.set(m.status, (dateStatusCounts.get(m.status) ?? 0) + 1);

  return (
    <>
      <AdminHeader />
      <div className="min-h-screen" style={{ backgroundColor: 'var(--contracts-bg)' }}>
        <main className="mx-auto w-full max-w-shell px-4 py-6">
          <div className="animate-fade-up mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                계약 업체 DB{' '}
                <span className="ml-1 text-sm font-normal text-neutral-600 tabular-nums">
                  {nf.format(matchingTotal)}곳
                </span>
              </h1>
              <p className="mt-1 text-sm text-neutral-600">
                오늘·어제 한 일을 먼저 보고, 달력에서 날짜를 누르면 그 날 기록이 펼쳐집니다.
              </p>
            </div>
            {/* 실제 이동이므로 <a> 로 두고 버튼 스타일만 입힌다.
                Button render={<Link/>} 는 Base UI 가 비-button 요소라고 경고한다. */}
            <Link href="/vendors" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              입점 업체 리스트
            </Link>
          </div>

          {/* 왼쪽=하는 일, 오른쪽=날짜/상황 파악. 좁은 화면에서는 레일이 목록 아래로 내려간다.
              레일은 고정 폭이라 본문 폭을 넓히면 늘어난 만큼이 전부 왼쪽 목록으로 간다. */}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-w-0">
              <ContractActivitySummary
                yesterday={dayActivityOf(yesterday)}
                today={dayActivityOf(today)}
                query={query}
              />

              <ContractQuickAdd />

              <ContractListControls query={query} typeChips={typeChips} statusChips={statusChips} />

              {activeDate ? (
                <>
                  {/* 날짜 보기 머리말 — 그 날을 한 줄로 요약하고, 아래에 기록을 시간순으로 편다 */}
                  <div className="card-surface animate-fade-up mb-3 px-5 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h2 className="text-base font-semibold">{formatDayHeadingKST(activeDate)}</h2>
                      <span className="text-xs text-neutral-600">{relativeDayKST(dateOnlyUTC(activeDate))}</span>
                      <span className="text-sm text-neutral-600 tabular-nums">
                        메모 {nf.format(dateMemos.length)}건 · 신규 등록 {nf.format(dateNewVendors.length)}곳
                      </span>
                    </div>
                    {dateStatusCounts.size > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {CONTRACT_STATUSES.filter((s) => dateStatusCounts.get(s.code)).map((s) => (
                          <span
                            key={s.code}
                            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
                          >
                            <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: s.dotVar }} />
                            {s.label}
                            <span className="font-semibold tabular-nums">{dateStatusCounts.get(s.code)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {dateNewVendors.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-black/[0.06] pt-2.5">
                        <span className="text-xs text-neutral-600">새로 등록</span>
                        {dateNewVendors.map((v) => (
                          <Link
                            key={v.id}
                            href={`/contracts/${v.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs transition-colors hover:border-black/20"
                          >
                            {v.name}
                            <span className="text-neutral-600 tabular-nums">{formatTimeKST(v.createdAt)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  {dateMemos.length === 0 ? (
                    <div className="animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-16 text-center">
                      <p className="text-neutral-600">이 날짜에 남긴 메모가 없습니다.</p>
                    </div>
                  ) : (
                    <ul className="card-surface animate-fade-up divide-y divide-black/[0.06] overflow-hidden">
                      {dateMemos.map((m) => {
                        // 지난 날짜의 일을 오늘 몰아 적은 경우 — 그 사실이 보여야 기록을 믿을 수 있다
                        const loggedYmd = ymdKST(m.createdAt);
                        const backdated = loggedYmd !== activeDate;
                        return (
                          <li key={m.id} className="px-5 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                                  <span
                                    aria-hidden
                                    className="size-1.5 rounded-full"
                                    style={{ backgroundColor: contractStatusDot(m.status) }}
                                  />
                                  {contractStatusLabel(m.status)}
                                </span>
                                <Link
                                  href={`/contracts/${m.contractedVendor.id}`}
                                  className="text-[15px] font-semibold hover:underline"
                                >
                                  {m.contractedVendor.name}
                                </Link>
                              </div>
                              <span
                                className="text-[13px] tabular-nums"
                                style={{ color: backdated ? 'var(--data-warning-ink)' : undefined }}
                                title={formatDateTimeKST(m.createdAt)}
                              >
                                {backdated
                                  ? `${loggedYmd.slice(5).replace('-', '/')} ${formatTimeKST(m.createdAt)} 기록`
                                  : `${formatTimeKST(m.createdAt)} 기록`}
                              </span>
                            </div>
                            {/* 폭을 넓히면 이 본문만 한 줄이 70자를 넘어가 읽기 나빠진다 —
                                한글 45자쯤에서 끊는다. ch 단위는 라틴 "0" 글자폭 기준이라
                                한글에서는 절반밖에 안 돼서 못 쓴다(em 으로 잡는다). */}
                            <p className="mt-2 max-w-[46em] text-[15px] leading-[1.7] whitespace-pre-wrap">
                              {m.content}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <ContractResultStatus
                    count={matchingTotal}
                    filterDesc={filterDesc}
                    truncated={vendors.length >= MAX_ROWS}
                  />

                  {vendors.length === 0 ? (
                    <div className="animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-16 text-center">
                      <p className="text-neutral-600">
                        {filterDesc ? `${filterDesc} 조건에 해당하는 업체가 없습니다.` : '아직 등록된 계약 업체가 없습니다.'}
                      </p>
                      {!filterDesc && (
                        <p className="mt-1.5 text-sm text-neutral-600">
                          위의 &lsquo;업체 빠르게 추가&rsquo;를 펼쳐 업체명과 담당자만으로 등록할 수 있습니다.
                        </p>
                      )}
                    </div>
                  ) : (
                    // 열을 7개에서 5개로 줄였다 — 주소는 업체명 아래 둘째 줄로, 계약 형태는
                    // 업체명 앞 점으로 접었다. 예전엔 한 행이 화면 끝까지 늘어져서 업체명과
                    // 진행 상태 사이 눈이 한참을 건너가야 했다.
                    <div className="card-surface animate-fade-up overflow-hidden">
                      {/* table-fixed — auto 레이아웃이면 긴 주소 하나가 열 폭을 다 먹어
                          업체명이 찌그러진다. 좁은 화면에서는 짓눌리는 대신 가로 스크롤.
                          min-w 가 820px 인 이유: 진행 상태 칸의 배지와 날짜는 둘 다 shrink-0
                          이고 셀이 whitespace-nowrap 이라, 칸이 좁아지면 줄어드는 게 아니라
                          옆 칸으로 삐져나온다. 이 폭이 안 삐져나오는 하한이다.
                          퍼센트는 늘어난 폭이 주소(유일하게 잘리는 열)로 가도록 잡았다. */}
                      <Table className="table-fixed min-w-[820px] [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3">
                        <TableHeader>
                          <TableRow className="[&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-neutral-600">
                            <TableHead style={{ width: '42%' }}>업체 · 주소</TableHead>
                            <TableHead style={{ width: '17%' }}>전화번호</TableHead>
                            <TableHead style={{ width: '10%' }}>DB담당자</TableHead>
                            <TableHead style={{ width: '19%' }}>진행 상태</TableHead>
                            <TableHead style={{ width: '12%' }} className="text-right">
                              등록
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendors.map((v) => {
                            const incomplete = isInfoIncomplete(v);
                            const latestStatus = v.memos[0]?.status ?? null;
                            // memoDate(실제 업무 날짜)를 쓴다 — createdAt(기록한 시각)을 쓰면
                            // 지난 날짜의 일을 오늘 적었을 때 "오늘 미팅한 것"처럼 보인다.
                            const lastMemoDate = v.memos[0]?.memoDate ?? null;
                            return (
                              <ContractRow key={v.id} id={v.id}>
                                <TableCell>
                                  {/* 실제 링크 — 키보드로 Tab+Enter 접근이 되고, 클릭도 이 앵커가 그대로 처리한다
                                      (ContractRow 의 행 onClick 은 <a> 위 클릭은 건드리지 않고 비켜준다). */}
                                  <Link
                                    href={`/contracts/${v.id}`}
                                    className="group/edit flex items-center gap-1.5 transition-colors hover:text-[var(--brand-to)]"
                                  >
                                    <span
                                      aria-hidden
                                      className="size-[7px] shrink-0 rounded-full"
                                      style={{ backgroundColor: contractTypeDot(v.contractType) }}
                                      title={contractTypeLabel(v.contractType)}
                                    />
                                    <span className="min-w-0 truncate text-[15px] font-semibold underline-offset-4 group-hover/edit:underline">
                                      {v.name}
                                    </span>
                                    <span className="sr-only">({contractTypeLabel(v.contractType)})</span>
                                  </Link>
                                  {/* max-width 는 table-layout:auto 인 <td> 에서 무시되므로,
                                      안쪽 블록 요소에 걸어야 긴 주소가 실제로 말줄임된다. */}
                                  {v.address?.trim() ? (
                                    <span
                                      className="mt-0.5 block truncate pl-[13px] text-[13px] text-neutral-600"
                                      title={v.address}
                                    >
                                      {v.address}
                                    </span>
                                  ) : (
                                    <span
                                      className="mt-0.5 block pl-[13px] text-[13px]"
                                      style={{ color: 'var(--data-warning-ink)' }}
                                    >
                                      주소 미입력
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {v.phone?.trim() ? (
                                    // stopPropagation 이 없어도 된다 — ContractRow 의 행 onClick 은
                                    // el.closest('a') 로 <a> 위 클릭을 이미 비켜준다.
                                    <a href={`tel:${v.phone.replace(/[^0-9+]/g, '')}`} className="text-sm hover:underline">
                                      {v.phone}
                                    </a>
                                  ) : (
                                    <span className="text-[13px]" style={{ color: 'var(--data-warning-ink)' }}>
                                      미입력
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="truncate text-sm text-neutral-600">
                                  {v.managerName || '-'}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge status={latestStatus} lastMemoDate={lastMemoDate} />
                                </TableCell>
                                <TableCell className="text-right text-[13px] text-neutral-600 tabular-nums">
                                  <span title={formatDateTimeKST(v.createdAt)}>{relativeDayKST(v.createdAt)}</span>
                                  {incomplete && <span className="sr-only"> (정보 미비)</span>}
                                </TableCell>
                              </ContractRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      {vendors.length >= MAX_ROWS && (
                        <p className="border-t px-4 py-3 text-xs" style={{ color: 'var(--data-warning-ink)' }}>
                          ▲ 최근 {nf.format(MAX_ROWS)}곳만 표시하고 있습니다 (조건에 맞는 업체는{' '}
                          {nf.format(matchingTotal)}곳). 검색어나 필터로 범위를 좁혀주세요.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 오른쪽 레일 — 스크롤을 내려도 달력이 따라온다(목록이 길어도 날짜를 계속 짚을 수 있게).
                헤더가 56px 스티키라 top 을 그 아래로 맞춘다. */}
            <aside className="animate-fade-up space-y-4 lg:sticky lg:top-[4.5rem]" style={{ animationDelay: '80ms' }}>
              <ContractCalendar
                month={activeMonth}
                activity={calendarActivity}
                activityByStatus={calendarActivityByStatus}
                newVendors={calendarNewVendors}
                activeDate={activeDate}
                today={today}
                query={query}
              />

              <ContractUpcomingMeetings items={upcoming} overdueCount={overdueCount} query={query} />

              <section className="card-surface px-4 py-3">
                <h2 className="mb-1 text-sm font-semibold">명단 현황</h2>
                <dl className="divide-y divide-black/[0.06]">
                  {/* typeScopeTotal 을 쓴다 — 아래 두 줄(계약서 작성/구두 계약만)이 진행 상태 필터를
                      반영해 줄어들 수 있는데, "전체"가 그 둘의 합과 안 맞으면 산수가 깨져 보인다. */}
                  <RailStat label="전체" value={typeScopeTotal} />
                  <RailStat label="계약서 작성" value={typeCounts.get('written') ?? 0} dot="var(--data-contract-written)" />
                  <RailStat label="구두 계약만" value={typeCounts.get('verbal') ?? 0} dot="var(--data-contract-verbal)" />
                  <RailStat label="정보 미비" value={incompleteCount} tone="warning" />
                </dl>

                {showMeter && (
                  <div className="mt-2.5 border-t border-black/[0.06] pt-2.5">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-xs text-neutral-600">정보 완성도</span>
                      <span className="text-xs font-semibold text-neutral-700 tabular-nums">{completeLabel}%</span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--meter-track)' }}
                      role="img"
                      aria-label={`정보 완성도 ${completeLabel}퍼센트 (전화번호·주소까지 받은 곳 ${completeCount} / ${scopeTotal})`}
                    >
                      <div
                        className="h-full rounded-full bg-brand-gradient transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.min(100, completePct)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-neutral-600 tabular-nums">
                      전화번호·주소까지 받은 곳 {nf.format(completeCount)} / {nf.format(scopeTotal)}
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </main>
      </div>
    </>
  );
}
