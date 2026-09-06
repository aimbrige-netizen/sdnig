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
// ⚠️ 날짜 두 종류를 절대 섞지 마세요 — 뜻이 정반대입니다 (lib/format-date.ts 머리말 참고):
//   - createdAt(타임스탬프)   = "언제 했다". 활동 = 전부 이 값. KST 하루 경계는 kstDayStartUTC()
//   - nextContactAt(@db.Date) = "언제 할 거다". 앞으로 할 일이라 활동 집계에 절대 넣지 않음
//     (선택 입력이라 대개 비어 있습니다). 그 날을 가리키는 Date 는 dateOnlyUTC()
// 예전엔 이 둘을 memoDate 한 칸이 겸해서, 아직 하지도 않은 미팅이 활동 건수에 섞였습니다.
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
  CONTRACT_MILESTONES,
  CONTRACT_MILESTONE_CODES,
  CONTRACT_RESULT_STATUSES,
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
  formatDateKST,
  formatDateTimeKST,
  formatDayHeadingKST,
  formatTimeKST,
  kstDayStartUTC,
  relativeDayKST,
  todayKST,
  ymdKST,
} from '@/lib/format-date';
import {
  countsByCreatedAtAndStatus,
  countsByCreatedAtKST,
  countsByDateOnly,
  monthGridRange,
  monthOf,
  parseMonthParam,
} from '@/lib/contract-activity';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('ko-KR');

/** 한 화면에 그리는 최대 행 수 — 넘치면 잘렸다는 사실을 화면에 명시한다 (조용한 절삭 금지) */
const MAX_ROWS = 500;

/** 레일의 "다음 연락 예정"에 한 번에 보여줄 개수 */
const UPCOMING_LIMIT = 5;

/** 레일의 담당자별 집계에 보여줄 사람 수 — 레일이 끝없이 길어지지 않게 상위 몇 명만 */
const MANAGER_LIMIT = 8;

/** 담당자 실적으로 세는 상태 (미팅완료·계약완료) */
const RESULT_CODES = new Set<string>(CONTRACT_RESULT_STATUSES.map((s) => s.code));

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

/** 진행 상태 배지 — 점 + 라벨 + (있으면) 그 상태를 남긴 최근 메모의 작성일.
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

/** 이정표 한 칸 — 그 단계 메모를 남긴 적이 있으면 날짜를, 없으면 옅은 "–" 를 찍는다.
 *
 *  "찍혔다"는 사실이 먼저 눈에 들어와야 해서 날짜에 단계 색을 그대로 입히고 굵게 쓴다.
 *  세 색 모두 흰 배경에서 본문 대비를 넘긴다(5.4 / 8.0 / 12.0 : 1) — 오른쪽으로 갈수록
 *  진해져서 어디까지 갔는지가 색만으로도 읽힌다.
 *
 *  미팅예정만 날짜의 뜻이 다르다: 잡아둔 미팅 날짜(nextContactAt)가 있으면 그걸 쓰고,
 *  안 정했으면 "미팅예정으로 표시한 날"(createdAt)로 대신한다. 어느 쪽인지는 title 로 밝힌다. */
function MilestoneCell({
  label,
  color,
  hit,
}: {
  label: string;
  color: string;
  hit?: { createdAt: Date; nextContactAt: Date | null };
}) {
  if (!hit) {
    return (
      <span className="text-[13px] text-neutral-300" title={`${label} 기록 없음`}>
        –<span className="sr-only">{label} 기록 없음</span>
      </span>
    );
  }
  const planned = hit.nextContactAt;
  const shown = planned ?? hit.createdAt;
  const title = planned
    ? `${label} — 예정일 ${formatDateKST(planned)} (${formatDateTimeKST(hit.createdAt)} 기록)`
    : `${label} — ${formatDateTimeKST(hit.createdAt)} 기록`;
  return (
    <span className="text-[13px] font-semibold tabular-nums" style={{ color }} title={title}>
      {formatDateKST(shown).slice(5)}
      <span className="sr-only"> {label}</span>
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
    plannedRows,
    milestoneRows,
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
    // 그 날 "남긴" 메모를 모은다 — 경계는 KST 하루(= 전날 15:00Z ~ 그 날 15:00Z).
    activeDate
      ? prisma.contractMemo.findMany({
          where: {
            createdAt: { gte: kstDayStartUTC(activeDate), lt: kstDayStartUTC(addDaysYmd(activeDate, 1)) },
          },
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
    // 어제·오늘 활동 (상태별). groupBy 를 못 쓰는 이유는 countsByCreatedAtAndStatus 주석 참고 —
    // createdAt 은 타임스탬프라 DB 에서 KST 하루로 묶을 방법이 없다. 이틀치라 행도 얼마 안 된다.
    prisma.contractMemo.findMany({
      where: { createdAt: { gte: kstDayStartUTC(yesterday), lt: kstDayStartUTC(addDaysYmd(today, 1)) } },
      select: { createdAt: true, status: true },
    }),
    // 어제·오늘 신규 등록 — createdAt 은 타임스탬프라 KST 하루 경계로 잘라야 한다
    prisma.contractedVendor.findMany({
      where: { createdAt: { gte: kstDayStartUTC(yesterday), lt: kstDayStartUTC(addDaysYmd(today, 1)) } },
      select: { createdAt: true },
    }),
    // 달력에 뿌릴 42칸치 메모 — 상태까지 함께 받아 칸 숫자와 모달 내역을 한 번에 만든다.
    // ⚠️ 양쪽 경계 모두 kstDayStartUTC — 한쪽만 바꾸면 창이 9시간 밀려 첫 칸이 빠지고
    //    화면에 없는 43일째가 딸려 들어온다.
    prisma.contractMemo.findMany({
      where: {
        createdAt: { gte: kstDayStartUTC(gridRange.start), lt: kstDayStartUTC(gridRange.endExclusive) },
      },
      // managerName 을 함께 받아 담당자별 집계까지 이 한 번으로 끝낸다.
      // 메모에는 작성자가 없어서 "업체의 DB담당자"로 묶는 수밖에 없다.
      select: { createdAt: true, status: true, contractedVendor: { select: { managerName: true } } },
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
    // 다음 연락 예정일이 잡힌 메모 전체 — 이 중 아직 그 업체의 **최신** 메모인 것만 살아 있는
    // 약속이다(뒤에 다른 메모가 붙었으면 이미 처리된 것). 최신 여부는 Prisma where 로 표현할
    // 수 없어 JS 에서 거른다. 상태를 'scheduled' 로 좁히지 않는 이유: 재컨텍요망("3일 뒤 다시")
    // 이나 장기가망("다음 달에")에도 예정일을 잡는 게 이 기능의 핵심이다.
    prisma.contractMemo.findMany({
      where: { nextContactAt: { not: null } },
      orderBy: [{ nextContactAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        nextContactAt: true,
        contractedVendor: {
          select: {
            id: true,
            name: true,
            memos: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true } },
          },
        },
      },
    }),
    // 목록의 이정표 열(미팅예정/미팅완료/계약완료)에 찍을 날짜.
    // 업체마다 그 상태의 **가장 최근** 메모 하나씩만 있으면 되는데, Prisma 로는
    // "그룹별 상위 1건"을 못 뽑는다 — 그래서 내림차순으로 받아 JS 에서 처음 만난 것만 남긴다.
    // 범위는 화면에 뜨는 목록과 같은 조건(listWhere)으로 묶어 한 번에 가져온다.
    activeDate
      ? Promise.resolve([])
      : prisma.contractMemo.findMany({
          where: { status: { in: CONTRACT_MILESTONE_CODES }, contractedVendor: listWhere },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { contractedVendorId: true, status: true, createdAt: true, nextContactAt: true },
        }),
  ]);

  // ── 활동 요약 (어제 / 오늘) ────────────────────────────────────────────────
  const dayStatus = countsByCreatedAtAndStatus(dayStatusRows);
  const dayNew = countsByCreatedAtKST(dayNewRows);
  const dayActivityOf = (ymd: string): DayActivity => ({
    date: ymd,
    byStatus: dayStatus[ymd] ?? {},
    newVendors: dayNew[ymd] ?? 0,
  });

  // ── 달력 ──────────────────────────────────────────────────────────────────
  // 칸에 찍는 숫자는 상태 구분 없는 하루 합계, 모달에 펼치는 건 상태별 내역.
  // 같은 행 묶음을 두 가지로 접기만 하므로 쿼리는 하나면 된다.
  const calendarActivity = countsByCreatedAtKST(monthActivityRows);
  const calendarActivityByStatus = countsByCreatedAtAndStatus(monthActivityRows);
  const calendarNewVendors = countsByCreatedAtKST(monthNewRows);

  // ── 다음 연락 예정 ────────────────────────────────────────────────────────
  const livePlans = plannedRows.filter((r) => r.contractedVendor.memos[0]?.id === r.id);
  const upcoming: UpcomingMeeting[] = livePlans
    .filter((r) => r.nextContactAt!.toISOString().slice(0, 10) >= today)
    .slice(0, UPCOMING_LIMIT)
    .map((r) => ({
      memoId: r.id,
      vendorId: r.contractedVendor.id,
      vendorName: r.contractedVendor.name,
      status: r.status,
      date: r.nextContactAt!.toISOString().slice(0, 10),
    }));
  const overdueCount = livePlans.filter((r) => r.nextContactAt!.toISOString().slice(0, 10) < today).length;
  // 달력에 "이 날 연락 예정" 표시를 위해 — 활동(지나간 일)과 절대 합치지 않는다
  const calendarPlans = countsByDateOnly(livePlans);
  // 날짜 보기의 "이 날 예정" 칸. 이미 받아온 livePlans 를 거르기만 하므로 쿼리가 늘지 않는다.
  // 여기 뜨는 건 "이 날 하기로 한 일"이라, 위의 "이 날 한 일"과는 다른 목록이다 —
  // 미팅예정만 날짜가 둘(잡은 날 / 만나는 날)이라 이렇게 갈라야 섞이지 않는다.
  const dayPlans = activeDate
    ? livePlans.filter((r) => r.nextContactAt!.toISOString().slice(0, 10) === activeDate)
    : [];

  // ── 담당자별 (이 달) ──────────────────────────────────────────────────────
  // 격자에는 앞뒤 달 날짜가 늘 섞여 있으므로 반드시 이 달 것만 골라 센다 — 월 합계와 같은 규칙.
  const managerBuckets = new Map<string, Record<string, number>>();
  for (const r of monthActivityRows) {
    if (ymdKST(r.createdAt).slice(0, 7) !== activeMonth) continue;
    if (!RESULT_CODES.has(r.status)) continue; // 미팅완료·계약완료만 실적으로 센다
    const name = r.contractedVendor.managerName?.trim() || '담당자 없음';
    const bucket = managerBuckets.get(name) ?? {};
    bucket[r.status] = (bucket[r.status] ?? 0) + 1;
    managerBuckets.set(name, bucket);
  }
  const byManager = [...managerBuckets.entries()]
    .map(([name, counts]) => ({ name, counts }))
    // 많이 한 사람부터. 동점이면 이름순이라 순서가 요청마다 흔들리지 않는다.
    .sort(
      (a, b) =>
        Object.values(b.counts).reduce((x, y) => x + y, 0) -
          Object.values(a.counts).reduce((x, y) => x + y, 0) || a.name.localeCompare(b.name, 'ko')
    )
    .slice(0, MANAGER_LIMIT);

  // ── 이정표 (업체 × 단계 → 날짜) ───────────────────────────────────────────
  // 내림차순으로 받았으니 먼저 만난 것이 그 단계의 최신 메모다. 이후 것은 버린다.
  const milestoneOf = new Map<number, Map<string, { createdAt: Date; nextContactAt: Date | null }>>();
  for (const r of milestoneRows) {
    const perVendor = milestoneOf.get(r.contractedVendorId) ?? new Map();
    if (!perVendor.has(r.status)) {
      perVendor.set(r.status, { createdAt: r.createdAt, nextContactAt: r.nextContactAt });
      milestoneOf.set(r.contractedVendorId, perVendor);
    }
  }

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
                        {dayPlans.length > 0 && ` · 예정 ${nf.format(dayPlans.length)}건`}
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

                  {/* 이 날 하기로 한 일 — 위 목록("이 날 한 일")과 일부러 갈라 둔다.
                      지난 날짜에서도 보여준다: "어제 미팅 잡혀 있었는데 했나?" 가 바로 확인된다. */}
                  {dayPlans.length > 0 && (
                    <div className="card-surface animate-fade-up mb-3 overflow-hidden">
                      <h3 className="border-b border-black/[0.06] px-5 py-2.5 text-sm font-semibold">
                        이 날 예정{' '}
                        <span className="ml-1 font-normal text-neutral-600 tabular-nums">{dayPlans.length}건</span>
                        <span className="ml-2 text-xs font-normal text-neutral-600">
                          (미리 잡아둔 일정 — 위의 &lsquo;한 일&rsquo;과 별개입니다)
                        </span>
                      </h3>
                      <ul className="divide-y divide-black/[0.06]">
                        {dayPlans.map((r) => (
                          <li key={r.id}>
                            <Link
                              href={`/contracts/${r.contractedVendor.id}`}
                              className="flex flex-wrap items-center gap-2 px-5 py-2.5 transition-colors hover:bg-neutral-900/5"
                            >
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                                <span
                                  aria-hidden
                                  className="size-1.5 rounded-full"
                                  style={{ backgroundColor: contractStatusDot(r.status) }}
                                />
                                {contractStatusLabel(r.status)}
                              </span>
                              <span className="text-[15px] font-semibold">{r.contractedVendor.name}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {dateMemos.length === 0 ? (
                    <div className="animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-16 text-center">
                      <p className="text-neutral-600">
                        {dayPlans.length > 0
                          ? '이 날 남긴 메모는 없습니다. 위는 미리 잡아둔 일정입니다.'
                          : '이 날짜에 남긴 메모가 없습니다.'}
                      </p>
                    </div>
                  ) : (
                    <section className="card-surface animate-fade-up overflow-hidden">
                      <h3 className="border-b border-black/[0.06] px-5 py-2.5 text-sm font-semibold">
                        이 날 한 일{' '}
                        <span className="ml-1 font-normal text-neutral-600 tabular-nums">{dateMemos.length}건</span>
                      </h3>
                      <ul className="divide-y divide-black/[0.06]">
                      {dateMemos.map((m) => {
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
                              {/* 날짜가 이미 머리말에 있으니 여기는 시:분만 — 이 목록은 정의상
                                  전부 같은 날에 남긴 메모다(작성 시각으로 모았다). */}
                              <span className="text-[13px] text-neutral-600 tabular-nums" title={formatDateTimeKST(m.createdAt)}>
                                {formatTimeKST(m.createdAt)} 기록
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
                    </section>
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
                    // 전화번호 열을 빼고 그 자리에 이정표 3단계(미팅예정/미팅완료/계약완료)를
                    // 넣었다 — 한 줄만 봐도 어디까지 갔는지 보이라고. 전화번호는 없어진 게
                    // 아니라 업체명 아래 둘째 줄로 내려갔다(주소와 같은 줄).
                    <div className="card-surface animate-fade-up overflow-hidden">
                      {/* table-fixed — auto 레이아웃이면 긴 주소 하나가 열 폭을 다 먹어
                          업체명이 찌그러진다. 좁은 화면에서는 짓눌리는 대신 가로 스크롤.
                          min-w 가 980px 인 이유: 진행 상태 칸의 배지와 날짜는 둘 다 shrink-0
                          이고 셀이 whitespace-nowrap 이라, 칸이 좁아지면 줄어드는 게 아니라
                          옆 칸으로 삐져나온다. 열이 5개에서 7개로 늘어 하한도 820 → 980 이다. */}
                      <Table className="table-fixed min-w-[980px] [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3">
                        <caption className="sr-only">
                          계약 업체 목록 — 업체별 연락처와 진행 단계별 날짜
                        </caption>
                        <TableHeader>
                          <TableRow className="[&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-neutral-600">
                            <TableHead style={{ width: '32%' }}>업체 · 연락처</TableHead>
                            <TableHead style={{ width: '9%' }}>DB담당자</TableHead>
                            <TableHead style={{ width: '17%' }}>진행 상태</TableHead>
                            {/* 이정표 — 그 단계 메모를 남긴 적이 있으면 날짜, 없으면 빈 칸 */}
                            {CONTRACT_MILESTONES.map((m) => (
                              <TableHead key={m.code} style={{ width: '11%' }} className="text-center">
                                {m.label}
                              </TableHead>
                            ))}
                            <TableHead style={{ width: '9%' }} className="text-right">
                              등록
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendors.map((v) => {
                            const incomplete = isInfoIncomplete(v);
                            const latestStatus = v.memos[0]?.status ?? null;
                            // 마지막으로 이 업체를 건드린 날 = 최신 메모를 남긴 날.
                            const lastMemoDate = v.memos[0]?.createdAt ?? null;
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
                                  {/* 둘째 줄에 전화번호·주소를 함께 둔다 — 전화번호 열을 빼서
                                      생긴 자리에 이정표를 넣었지만, 번호 자체를 잃지는 않는다.
                                      둘 다 없으면 "미입력"을 한 번만 적는다(예전엔 열마다
                                      따로 떠서 한 줄에 "미입력"이 두 번 보였다).
                                      max-width 는 table-layout:auto 인 <td> 에서 무시되므로
                                      안쪽 블록 요소에 걸어야 긴 주소가 실제로 말줄임된다. */}
                                  {v.phone?.trim() || v.address?.trim() ? (
                                    <span
                                      className="mt-0.5 flex items-baseline gap-1.5 truncate pl-[13px] text-[13px] text-neutral-600"
                                      title={[v.phone, v.address].filter(Boolean).join(' · ')}
                                    >
                                      {v.phone?.trim() && (
                                        // stopPropagation 이 없어도 된다 — ContractRow 의 행 onClick 은
                                        // el.closest('a') 로 <a> 위 클릭을 이미 비켜준다.
                                        <a
                                          href={`tel:${v.phone.replace(/[^0-9+]/g, '')}`}
                                          className="shrink-0 tabular-nums hover:underline"
                                        >
                                          {v.phone}
                                        </a>
                                      )}
                                      {v.phone?.trim() && v.address?.trim() && (
                                        <span aria-hidden className="shrink-0 text-neutral-400">
                                          ·
                                        </span>
                                      )}
                                      {v.address?.trim() && <span className="truncate">{v.address}</span>}
                                    </span>
                                  ) : (
                                    <span
                                      className="mt-0.5 block pl-[13px] text-[13px]"
                                      style={{ color: 'var(--data-warning-ink)' }}
                                    >
                                      전화번호·주소 미입력
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="truncate text-sm text-neutral-600">
                                  {v.managerName || '-'}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge status={latestStatus} lastMemoDate={lastMemoDate} />
                                </TableCell>
                                {CONTRACT_MILESTONES.map((m) => (
                                  <TableCell key={m.code} className="text-center">
                                    <MilestoneCell
                                      label={m.label}
                                      color={m.colorVar}
                                      hit={milestoneOf.get(v.id)?.get(m.code)}
                                    />
                                  </TableCell>
                                ))}
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
                plans={calendarPlans}
                byManager={byManager}
                activeDate={activeDate}
                today={today}
                query={query}
              />

              <ContractUpcomingMeetings items={upcoming} overdueCount={overdueCount} />

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
