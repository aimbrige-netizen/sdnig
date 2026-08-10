// 계약 업체 DB — 구두/서면 계약만 맺고 상세 정보를 아직 못 받은 업체 명단.
// 정식 입점 업체(/vendors)와 달리 업체명·전화번호·주소·DB담당자 + 메모만 받고,
// 계약서를 쓴 곳과 구두로만 한 곳을 구분해 관리합니다.
//
// 요약부는 차트가 아니라 KPI 스탯 타일 + 미터입니다(dataviz: "몇 개의 헤드라인 숫자" → KPI row,
// "한계 대비 비율 하나" → 미터). 색은 계약 형태를 가르는 점(mark)과 경고 상태에만 쓰고,
// 숫자·라벨은 항상 잉크 색을 유지합니다.
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { AdminHeader } from '@/components/admin-header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CONTRACTS_HEADING_ID, ContractDetailDialog } from '@/components/contract-detail-dialog';
import { ContractResultStatus } from '@/components/contract-result-status';
import { ContractListControls } from '@/components/contract-list-controls';
import { ContractQuickAdd } from '@/components/contract-quick-add';
import { CONTRACT_TYPES, contractTypeDot, contractTypeLabel, isInfoIncomplete } from '@/lib/contract-constants';
import { type ContractQuery, type ContractSort } from '@/lib/contract-query';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('ko-KR');

/** 한 화면에 그리는 최대 행 수 — 넘치면 잘렸다는 사실을 화면에 명시한다 (조용한 절삭 금지) */
const MAX_ROWS = 500;

/** 비율 표시 — 전부 채워졌을 때만 100%. 99.6% 를 반올림해 "100% · 249/250" 처럼 모순되게 쓰지 않는다. */
function pctText(part: number, total: number): string {
  if (total <= 0) return '0';
  if (part >= total) return '100';
  return String(Math.min(99, Math.floor((part / total) * 100)));
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\. /g, '.')
    .replace(/\.$/, '');
}

/** 전화번호·주소 중 하나라도 비어 있는 상태 (Prisma where 절) */
const INCOMPLETE_WHERE: Prisma.ContractedVendorWhereInput = {
  OR: [{ phone: null }, { phone: '' }, { address: null }, { address: '' }],
};

/** 스탯 타일 — 라벨 + 값. 큰 단독 숫자라 tabular-nums 를 쓰지 않습니다(비례 숫자). */
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
    <div className="px-5 py-4">
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
      <dd className="mt-1 text-3xl font-semibold tracking-tight">{nf.format(value)}</dd>
    </div>
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
  const sort: ContractSort = first(sp.sort) === 'name' ? 'name' : 'latest';
  const onlyIncomplete = first(sp.incomplete) === '1';
  const query: ContractQuery = { q, type: activeType, sort, incomplete: onlyIncomplete };

  // 검색어: 업체명·전화번호·주소·담당자·메모 중 아무 곳이나 포함되면 매칭
  const searchOr: Prisma.ContractedVendorWhereInput = {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { address: { contains: q, mode: 'insensitive' } },
      { managerName: { contains: q, mode: 'insensitive' } },
      { memo: { contains: q, mode: 'insensitive' } },
    ],
  };

  // OR 를 쓰는 조건이 여럿이라 객체 스프레드로 합치면 서로 덮어쓴다 → AND 배열로 합칩니다.
  const listWhere: Prisma.ContractedVendorWhereInput = {
    AND: [
      ...(activeType ? [{ contractType: activeType }] : []),
      ...(q ? [searchOr] : []),
      ...(onlyIncomplete ? [INCOMPLETE_WHERE] : []),
    ],
  };
  // 요약·칩 카운트의 기준 범위 — 계약 형태(칩)만 뺀 나머지 조건은 그대로 적용한다.
  // 칩을 눌러도 숫자가 흔들리지 않으면서, 칩 숫자가 곧 클릭했을 때 보게 될 건수가 된다.
  // ('정보 미비만 보기'는 칩 링크에도 유지되므로 여기서 빼면 숫자와 실제 목록이 어긋난다)
  const scopeWhere: Prisma.ContractedVendorWhereInput = {
    AND: [...(q ? [searchOr] : []), ...(onlyIncomplete ? [INCOMPLETE_WHERE] : [])],
  };

  const [vendors, typeCounts, incompleteCount] = await Promise.all([
    prisma.contractedVendor.findMany({
      where: listWhere,
      orderBy: sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' },
      take: MAX_ROWS,
    }),
    prisma.contractedVendor.groupBy({
      by: ['contractType'],
      _count: { _all: true },
      where: scopeWhere,
    }),
    prisma.contractedVendor.count({ where: { AND: [scopeWhere, INCOMPLETE_WHERE] } }),
  ]);

  const countByType = new Map(typeCounts.map((t) => [t.contractType, t._count._all]));
  const scopeTotal = typeCounts.reduce((sum, t) => sum + t._count._all, 0);
  const completeCount = scopeTotal - incompleteCount;
  const completePct = scopeTotal > 0 ? (completeCount / scopeTotal) * 100 : 0;
  const completeLabel = pctText(completeCount, scopeTotal);
  // 현재 조건(계약 형태 칩 포함)에 실제로 맞는 총 건수 — 표시 상한에 걸려도 진짜 숫자를 보여준다
  const matchingTotal = activeType ? (countByType.get(activeType) ?? 0) : scopeTotal;
  // '정보 미비만 보기' 상태에서는 완성도가 정의상 0% 라 아무 정보도 주지 못하므로 감춘다
  const showMeter = !onlyIncomplete;

  // 칩 카운트는 서버에서 계산해 넘긴다 (필터 조작은 클라이언트 컨트롤이 일괄 처리)
  const chips = [
    { code: '', label: '전체', dot: '', count: scopeTotal },
    ...CONTRACT_TYPES.map((t) => ({
      code: t.code as string,
      label: t.label,
      dot: t.dotVar,
      count: countByType.get(t.code) ?? 0,
    })),
  ];

  const filterDesc = [q ? `"${q}" 검색` : '', activeType ? contractTypeLabel(activeType) : '', onlyIncomplete ? '정보 미비' : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="animate-fade-up mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id={CONTRACTS_HEADING_ID} tabIndex={-1} className="text-xl font-bold tracking-tight outline-none">
              계약 업체 DB{' '}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{nf.format(matchingTotal)}곳</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              구두·서면으로 계약한 업체 명단입니다. 정보를 아직 못 받았어도 먼저 등록해두고 나중에 채우세요.
            </p>
          </div>
          <Button render={<Link href="/vendors" />} variant="outline" size="sm">
            입점 업체 리스트
          </Button>
        </div>

        {/* 요약 — KPI 스탯 타일 4개 + 정보 완성도 미터 */}
        <section className="card-surface animate-fade-up mb-4 overflow-hidden" style={{ animationDelay: '40ms' }}>
          <dl className="grid grid-cols-2 divide-x divide-y divide-black/[0.06] sm:grid-cols-4 sm:divide-y-0">
            <StatTile label="전체" value={scopeTotal} />
            <StatTile
              label="계약서 작성"
              value={countByType.get('written') ?? 0}
              dot="var(--data-contract-written)"
            />
            <StatTile label="구두 계약만" value={countByType.get('verbal') ?? 0} dot="var(--data-contract-verbal)" />
            <StatTile label="정보 미비" value={incompleteCount} tone="warning" />
          </dl>

          {showMeter && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3.5">
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
        </section>

        <ContractQuickAdd />

        <ContractListControls query={query} chips={chips} />
        <ContractResultStatus
          count={matchingTotal}
          filterDesc={filterDesc}
          truncated={vendors.length >= MAX_ROWS}
        />

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
                <TableRow>
                  <TableHead>업체명</TableHead>
                  <TableHead>계약 형태</TableHead>
                  <TableHead>전화번호</TableHead>
                  <TableHead>주소</TableHead>
                  <TableHead>DB담당자</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="text-right">등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v, i) => {
                  const incomplete = isInfoIncomplete(v);
                  return (
                    <TableRow
                      key={v.id}
                      className="animate-fade-up"
                      style={{ animationDelay: `${180 + Math.min(i, 14) * 25}ms` }}
                    >
                      <TableCell>
                        <ContractDetailDialog vendor={{ ...v, createdAt: v.createdAt.toISOString() }}>
                          <button
                            type="button"
                            className="group/edit flex items-center gap-1.5 rounded text-left font-medium transition-colors hover:text-[var(--brand-to)]"
                            title="눌러서 상세 보기"
                          >
                            <span className="underline-offset-4 group-hover/edit:underline">{v.name}</span>
                            <span
                              aria-hidden
                              className="text-xs text-neutral-500 transition-colors group-hover/edit:text-[var(--brand-to)]"
                            >
                              ✎
                            </span>
                            <span className="sr-only">상세 보기</span>
                          </button>
                        </ContractDetailDialog>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
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
                      {/* 주소와 같은 이유로 안쪽 블록 요소에 max-width 를 건다.
                          전체 내용은 title 로 확인할 수 있게 한다. */}
                      <TableCell className="text-muted-foreground">
                        {v.memo?.trim() ? (
                          <span className="block max-w-72 truncate" title={v.memo}>
                            {v.memo}
                          </span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {formatDate(v.createdAt)}
                        {incomplete && <span className="sr-only"> (정보 미비)</span>}
                      </TableCell>
                    </TableRow>
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
      </main>
    </>
  );
}
