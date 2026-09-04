// 계약 업체 DB — 구두/서면 계약만 맺고 상세 정보를 아직 못 받은 업체 명단.
// 정식 입점 업체(/vendors)와 달리 업체명·전화번호·주소·DB담당자 + 진행 메모만 받고,
// 계약서를 쓴 곳과 구두로만 한 곳을 구분해 관리합니다.
//
// 업체마다 진행 메모를 여러 번 남길 수 있고(상세 페이지 참고), 그중 가장 최근 메모의
// 상태(재컨텍요망/미팅예정/미팅완료/계약완료)가 그 업체의 "현재 상태"입니다. 아직 메모를
// 하나도 안 남긴 곳은 "미분류"로 둡니다.
//
// 요약부는 차트가 아니라 KPI 스탯 타일 + 미터입니다(dataviz: "몇 개의 헤드라인 숫자" → KPI row,
// "한계 대비 비율 하나" → 미터). 색은 계약 형태를 가르는 점(mark)과 경고 상태에만 쓰고,
// 숫자·라벨은 항상 잉크 색을 유지합니다.
//
// 표면은 3단 단차를 씁니다 — 페이지 배경(--contracts-bg, 가장 짙음) → 카드(흰색) →
// 배지/테이블 헤더 같은 인셋 요소(--contracts-inset). 순백 하나로 퉁치던 전 버전이
// "밋밋하다"는 피드백을 받아 나눴습니다.
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { AdminHeader } from '@/components/admin-header';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContractRow } from '@/components/contract-row';
import { ContractResultStatus } from '@/components/contract-result-status';
import { ContractListControls } from '@/components/contract-list-controls';
import { ContractQuickAdd } from '@/components/contract-quick-add';
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
import { formatDateKST, formatDateTimeKST } from '@/lib/format-date';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('ko-KR');

/** 한 화면에 그리는 최대 행 수 — 넘치면 잘렸다는 사실을 화면에 명시한다 (조용한 절삭 금지) */
const MAX_ROWS = 500;

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

/** 스탯 타일 — 라벨 + 값. 개별 카드로 떠 있어야 KPI 4개가 한 덩어리로 뭉개져 보이지 않는다. */
function StatTile({
  label,
  value,
  dot,
  tone,
}: {
  label: string;
  value: number;
  dot?: string;
  tone?: 'warning';
}) {
  return (
    <div className="card-surface px-5 py-4">
      <dt className="flex items-center gap-1.5">
        {dot && (
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: dot }}
          />
        )}
        {tone === 'warning' && (
          <span aria-hidden className="text-xs leading-none" style={{ color: 'var(--data-warning-ink)' }}>
            ▲
          </span>
        )}
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </dt>
      <dd className="mt-1.5 text-3xl font-semibold tracking-tight">{nf.format(value)}</dd>
    </div>
  );
}

/** 진행 상태 배지 — 점 + 라벨. 미분류는 중립 회색으로 다른 뜻(위험/경고)처럼 보이지 않게 한다. */
function StatusBadge({ status }: { status: string | null }) {
  const label = status ? contractStatusLabel(status) : '미분류';
  const dot = status ? contractStatusDot(status) : 'var(--muted-foreground)';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs text-neutral-700"
      style={{ backgroundColor: 'var(--contracts-inset)' }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
      {label}
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
  const query: ContractQuery = { q, type: activeType, status: activeStatus, sort, incomplete: onlyIncomplete, date: activeDate };

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

  // 날짜 검색 모드 — 계약 형태/진행 상태/검색어/정렬과는 독립된 별도 보기라 그 필터들과
  // 조합하지 않는다(ContractListControls 쪽에서 이 필터들을 조작하면 date 를 함께 지운다).
  // memoDate(실제 업무/미팅 날짜) 기준으로 모으되, 각 행에 기록 시각(createdAt)도 함께 보여준다.
  const dateMemos = activeDate
    ? await prisma.contractMemo.findMany({
        where: { memoDate: new Date(`${activeDate}T00:00:00.000Z`) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { contractedVendor: { select: { id: true, name: true } } },
      })
    : null;

  // incompleteCount 는 KPI 타일·완성도 미터에 항상 쓰이므로 날짜 검색 모드에서도 계산해야 한다 —
  // 업체 테이블(vendors)만 날짜 모드에서 안 쓰인다.
  const [vendors, incompleteCount] = await Promise.all([
    activeDate
      ? Promise.resolve([])
      : prisma.contractedVendor.findMany({
          where: listWhere,
          orderBy: sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' },
          take: MAX_ROWS,
          include: { memos: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } },
        }),
    prisma.contractedVendor.count({ where: { AND: [scopeWhere, INCOMPLETE_WHERE] } }),
  ]);

  // 각 칩 그룹의 "전체" 항목 — scopeTotal(검색어·정보미비만 반영) 을 그대로 쓰면 안 된다.
  // 다른 축(형태/상태)에 이미 필터가 걸려 있을 때, "전체"를 눌러도 실제로는 그 다른 축의
  // 필터는 유지된 채로 이 축만 풀리므로, 표시 숫자도 그 상태를 반영해야 한다 —
  // 정확히 typeCounts/statusCounts 는 이미 그렇게 계산돼 있으니(153-162행) 그 합을 쓴다.
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

  return (
    <>
      <AdminHeader />
      <main className="w-full px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--contracts-bg)' }}>
        <div className="animate-fade-up mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              계약 업체 DB{' '}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                {activeDate ? `${nf.format(dateMemos?.length ?? 0)}건` : `${nf.format(matchingTotal)}곳`}
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeDate
                ? '이 날짜에 남긴 메모를 업체 구분 없이 모아 보여줍니다.'
                : '구두·서면으로 계약한 업체 명단입니다. 정보를 아직 못 받았어도 먼저 등록해두고 나중에 채우세요.'}
            </p>
          </div>
          {/* 실제 이동이므로 <a> 로 두고 버튼 스타일만 입힌다.
              Button render={<Link/>} 는 Base UI 가 비-button 요소라고 경고한다. */}
          <Link href="/vendors" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            입점 업체 리스트
          </Link>
        </div>

        {/* 요약 — KPI 스탯 타일 4개(개별 카드) + 정보 완성도 미터(별도 카드) */}
        <div className="animate-fade-up mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4" style={{ animationDelay: '40ms' }}>
          {/* typeScopeTotal 을 쓴다 — 옆의 두 타일(계약서 작성/구두 계약만)이 진행 상태 필터를
              반영해 줄어들 수 있는데, "전체"가 그 둘의 합과 안 맞으면 산수가 깨져 보인다. */}
          <StatTile label="전체" value={typeScopeTotal} />
          <StatTile label="계약서 작성" value={typeCounts.get('written') ?? 0} dot="var(--data-contract-written)" />
          <StatTile label="구두 계약만" value={typeCounts.get('verbal') ?? 0} dot="var(--data-contract-verbal)" />
          <StatTile label="정보 미비" value={incompleteCount} tone="warning" />
        </div>

        {showMeter && (
          <div
            className="card-surface animate-fade-up mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
            style={{ animationDelay: '70ms' }}
          >
            <span className="text-xs text-muted-foreground">정보 완성도</span>
            <div className="min-w-40 flex-1">
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
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {completeLabel}% · 전화번호·주소까지 받은 곳 {nf.format(completeCount)} / {nf.format(scopeTotal)}
            </span>
          </div>
        )}

        <ContractQuickAdd />

        <ContractListControls query={query} typeChips={typeChips} statusChips={statusChips} />

        {activeDate ? (
          <>
            <p className="mx-1 mb-2 text-xs text-muted-foreground">
              {formatDateKST(`${activeDate}T00:00:00.000Z`)} 작업 내역 {nf.format(dateMemos?.length ?? 0)}건
            </p>
            {!dateMemos || dateMemos.length === 0 ? (
              <div className="animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-16 text-center">
                <p className="text-muted-foreground">이 날짜에 남긴 메모가 없습니다.</p>
              </div>
            ) : (
              <ul className="card-surface animate-fade-up overflow-hidden" style={{ animationDelay: '160ms' }}>
                {dateMemos.map((m, i) => (
                  <li
                    key={m.id}
                    className="animate-fade-up border-b border-black/[0.06] px-5 py-4 last:border-b-0"
                    style={{ animationDelay: `${180 + Math.min(i, 14) * 20}ms` }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-neutral-700"
                          style={{ backgroundColor: 'var(--contracts-inset)' }}
                        >
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: contractStatusDot(m.status) }} />
                          {contractStatusLabel(m.status)}
                        </span>
                        <Link href={`/contracts/${m.contractedVendor.id}`} className="text-sm font-semibold hover:underline">
                          {m.contractedVendor.name}
                        </Link>
                      </div>
                      <span className="text-xs text-neutral-400 tabular-nums">{formatDateTimeKST(m.createdAt)} 기록</span>
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap">{m.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <ContractResultStatus count={matchingTotal} filterDesc={filterDesc} truncated={vendors.length >= MAX_ROWS} />

            {vendors.length === 0 ? (
              <div className="animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-16 text-center">
                <p className="text-muted-foreground">
                  {filterDesc ? `${filterDesc} 조건에 해당하는 업체가 없습니다.` : '아직 등록된 계약 업체가 없습니다.'}
                </p>
                {!filterDesc && (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    위의 &lsquo;업체 빠르게 추가&rsquo;를 펼쳐 업체명과 담당자만으로 등록할 수 있습니다.
                  </p>
                )}
              </div>
            ) : (
              <div className="card-surface animate-fade-up overflow-hidden" style={{ animationDelay: '160ms' }}>
                <Table>
                  <TableHeader>
                    <TableRow style={{ backgroundColor: 'var(--contracts-inset)' }}>
                      <TableHead>업체명</TableHead>
                      <TableHead>계약 형태</TableHead>
                      <TableHead>전화번호</TableHead>
                      <TableHead>주소</TableHead>
                      <TableHead>DB담당자</TableHead>
                      <TableHead>진행 상태</TableHead>
                      <TableHead className="text-right">등록일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((v, i) => {
                      const incomplete = isInfoIncomplete(v);
                      const latestStatus = v.memos[0]?.status ?? null;
                      return (
                        <ContractRow
                          key={v.id}
                          id={v.id}
                          style={{
                            animationDelay: `${180 + Math.min(i, 14) * 25}ms`,
                            backgroundColor: i % 2 === 1 ? 'oklch(0.98 0.003 264)' : undefined,
                          }}
                        >
                          <TableCell>
                            {/* 실제 링크 — 키보드로 Tab+Enter 접근이 되고, 클릭도 이 앵커가 그대로 처리한다
                                (ContractRow 의 행 onClick 은 <a> 위 클릭은 건드리지 않고 비켜준다). */}
                            <Link
                              href={`/contracts/${v.id}`}
                              className="group/edit flex items-center gap-1.5 font-medium transition-colors hover:text-[var(--brand-to)]"
                            >
                              <span className="underline-offset-4 group-hover/edit:underline">{v.name}</span>
                              <span aria-hidden className="text-xs text-neutral-400 group-hover/edit:text-[var(--brand-to)]">
                                ›
                              </span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs text-neutral-700"
                              style={{ backgroundColor: 'var(--contracts-inset)' }}
                            >
                              <span
                                aria-hidden
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: contractTypeDot(v.contractType) }}
                              />
                              {contractTypeLabel(v.contractType)}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {v.phone?.trim() ? (
                              // stopPropagation 이 없어도 된다 — ContractRow 의 행 onClick 은
                              // el.closest('a') 로 <a> 위 클릭을 이미 비켜준다.
                              <a href={`tel:${v.phone.replace(/[^0-9+]/g, '')}`} className="hover:underline">
                                {v.phone}
                              </a>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--data-warning-ink)' }}>
                                미입력
                              </span>
                            )}
                          </TableCell>
                          {/* max-width 는 table-layout:auto 인 <td> 에서 무시되므로,
                              안쪽 블록 요소에 걸어야 긴 주소가 실제로 말줄임된다. */}
                          <TableCell className="text-muted-foreground">
                            {v.address?.trim() ? (
                              <span className="block max-w-64 truncate" title={v.address}>
                                {v.address}
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--data-warning-ink)' }}>
                                미입력
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{v.managerName || '-'}</TableCell>
                          <TableCell>
                            <StatusBadge status={latestStatus} />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums">
                            {formatDateTimeKST(v.createdAt)}
                            {incomplete && <span className="sr-only"> (정보 미비)</span>}
                          </TableCell>
                        </ContractRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {vendors.length >= MAX_ROWS && (
                  <p className="border-t px-4 py-3 text-xs" style={{ color: 'var(--data-warning-ink)' }}>
                    ▲ 최근 {nf.format(MAX_ROWS)}곳만 표시하고 있습니다 (조건에 맞는 업체는 {nf.format(matchingTotal)}곳).
                    검색어나 필터로 범위를 좁혀주세요.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
