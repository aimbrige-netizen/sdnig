// 업체 리스트 (기획서 10절 — 업종 필터 14개+전체, 썸네일/업체명/업종/지역 표시)
// + 지역(시/도-구/군) 필터, 최신순/이름순 정렬, 카드/리스트 보기 전환, 등록일 표시
import Image from 'next/image';
import Link from 'next/link';
import { AdminHeader } from '@/components/admin-header';
import { Button } from '@/components/ui/button';
import { VendorListControls, type VendorSort, type VendorView } from '@/components/vendor-list-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CATEGORIES, categoryLabel, type VendorPhoto } from '@/lib/constants';
import { SIDO_LIST, gugunsOf, joinRegion } from '@/lib/regions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function mainPhotoUrl(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null;
  const main = (photos as VendorPhoto[]).find((p) => p?.type === 'main');
  return main?.url ?? null;
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

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sido?: string; gugun?: string; sort?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const activeCategory = CATEGORIES.some((c) => c.code === sp.category) ? sp.category : undefined;
  const activeSido = SIDO_LIST.includes(sp.sido ?? '') ? sp.sido! : '';
  const activeGugun = activeSido && gugunsOf(activeSido).includes(sp.gugun ?? '') ? sp.gugun! : '';
  const sort: VendorSort = sp.sort === 'name' ? 'name' : 'latest';
  const view: VendorView = sp.view === 'list' ? 'list' : 'card';

  const regionWhere = activeSido
    ? { region: activeGugun ? joinRegion(activeSido, activeGugun) : { startsWith: activeSido } }
    : {};

  // 검색어: 업체명·연락처·주소·지역 중 아무 곳이나 포함되면 매칭
  const searchWhere = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { contact: { contains: q } },
          { address: { contains: q, mode: 'insensitive' as const } },
          { region: { contains: q } },
        ],
      }
    : {};

  // 업체 목록과 업종별 개수(현재 지역/검색 필터 기준)를 함께 조회
  const [vendors, categoryCounts] = await Promise.all([
    prisma.vendor.findMany({
      where: {
        ...(activeCategory ? { category: activeCategory } : {}),
        ...regionWhere,
        ...searchWhere,
      },
      orderBy: sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        category: true,
        region: true,
        contact: true,
        photos: true,
        createdAt: true,
      },
    }),
    prisma.vendor.groupBy({
      by: ['category'],
      _count: { _all: true },
      where: { ...regionWhere, ...searchWhere },
    }),
  ]);

  const countByCategory = new Map(categoryCounts.map((c) => [c.category, c._count._all]));
  const totalCount = categoryCounts.reduce((sum, c) => sum + c._count._all, 0);

  const filters = [{ code: '', label: '전체' }, ...CATEGORIES];

  // 업종 칩 링크 — 검색/지역/정렬/보기 상태를 유지한 채 업종만 교체
  function chipHref(code: string): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (code) params.set('category', code);
    if (activeSido) params.set('sido', activeSido);
    if (activeGugun) params.set('gugun', activeGugun);
    if (sort !== 'latest') params.set('sort', sort);
    if (view !== 'card') params.set('view', view);
    const qs = params.toString();
    return qs ? `/vendors?${qs}` : '/vendors';
  }

  const filterDesc = [
    q ? `"${q}" 검색` : '',
    activeSido ? joinRegion(activeSido, activeGugun) : '',
    activeCategory ? categoryLabel(activeCategory) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">
            업체 리스트 <span className="ml-1 text-sm font-normal text-muted-foreground">{vendors.length}개</span>
          </h1>
          <Button render={<Link href="/vendors/new" />}>새 업체 등록</Button>
        </div>

        {/* 업종 필터 (기획서 요구: 업종별로 나눠서 보기 편하게) */}
        <div className="mb-3 flex flex-wrap gap-2">
          {filters.map((f) => {
            const isActive = (f.code || undefined) === activeCategory;
            const count = f.code ? (countByCategory.get(f.code) ?? 0) : totalCount;
            return (
              <Link
                key={f.code || 'all'}
                href={chipHref(f.code)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-all duration-200 ${
                  isActive
                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                    : 'border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:text-neutral-900 hover:shadow-soft'
                }`}
              >
                {f.label}
                <span className="ml-1 text-xs tabular-nums text-neutral-400">{count}</span>
              </Link>
            );
          })}
        </div>

        {/* 검색 · 지역 필터 · 정렬 · 보기 전환 */}
        <VendorListControls
          q={q}
          category={activeCategory}
          sido={activeSido}
          gugun={activeGugun}
          sort={sort}
          view={view}
        />

        {vendors.length === 0 ? (
          <div className="animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-20 text-center text-muted-foreground">
            {filterDesc ? `${filterDesc} 조건에 등록된 업체가 없습니다.` : '등록된 업체가 없습니다.'}
            <div className="mt-3">
              <Button render={<Link href="/vendors/new" />} variant="outline" size="sm">
                새 업체 등록하기
              </Button>
            </div>
          </div>
        ) : view === 'list' ? (
          <div className="card-surface animate-fade-up overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">사진</TableHead>
                  <TableHead>업체명</TableHead>
                  <TableHead>업종</TableHead>
                  <TableHead>지역</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead className="text-right">등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor) => {
                  const thumb = mainPhotoUrl(vendor.photos);
                  return (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <div className="relative h-10 w-10 overflow-hidden rounded-md bg-neutral-100">
                          {thumb ? (
                            <Image
                              src={thumb}
                              alt={vendor.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                              없음
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/vendors/${vendor.id}`} className="font-medium hover:underline">
                          {vendor.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                          {categoryLabel(vendor.category)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{vendor.region || '지역 미입력'}</TableCell>
                      <TableCell className="text-muted-foreground">{vendor.contact || '-'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(vendor.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ul className="animate-fade-up grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((vendor) => {
              const thumb = mainPhotoUrl(vendor.photos);
              return (
                <li key={vendor.id}>
                  <Link
                    href={`/vendors/${vendor.id}`}
                    className="card-surface flex gap-3 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-neutral-100">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt={vendor.name}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                          사진 없음
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{vendor.name}</span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        <span className="mr-2 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                          {categoryLabel(vendor.category)}
                        </span>
                        {vendor.region || '지역 미입력'}
                      </div>
                      {vendor.contact && (
                        <div className="mt-1 truncate text-sm text-muted-foreground">{vendor.contact}</div>
                      )}
                      <div className="mt-1 text-xs text-neutral-400">등록 {formatDate(vendor.createdAt)}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
