// 계약업체 화면 (/vendors · 기획서 10절 — 업종 필터 전체+업종별, 썸네일/업체명/업종/지역 표시)
// + 지역(시/도-구/군) 필터, 최신순/이름순 정렬, 카드/리스트 보기 전환, 등록일 표시
import Image from 'next/image';
import Link from 'next/link';
import { AdminHeader } from '@/components/admin-header';
import { buttonVariants } from '@/components/ui/button';
import { VendorListControls, type VendorSort, type VendorView } from '@/components/vendor-list-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CATEGORIES, categoryLabel, type VendorPhoto } from '@/lib/constants';
import { SIDO_LIST, gugunsOf, joinRegion } from '@/lib/regions';
import { addMonths, formatMonthLabel, monthOf, parseMonthParam } from '@/lib/contract-activity';
import { kstDayStartUTC, todayKST } from '@/lib/format-date';
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

/** 담당자별 등록 수 표. 월별·누적 두 군데가 같은 모양이라야 눈이 옮겨가기 쉽다. */
function AuthorTable({
  rows,
  total,
  caption,
}: {
  rows: { name: string; count: number }[];
  total: number;
  caption: string;
}) {
  return (
    <table className="w-full">
      {/* 한 화면에 표가 여럿이라 각자 이름이 있어야 스크린리더에서 구분된다 */}
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map((a) => (
          <tr key={a.name || '__none__'} className="border-b border-black/[0.05] last:border-b-0">
            <td className="max-w-0 truncate py-2 pr-2 text-sm" title={a.name || '작성자 미입력'}>
              {a.name || <span className="text-neutral-500">미입력</span>}
            </td>
            <td className="w-16 py-2 text-right tabular-nums">
              {/* 0 은 옅게 — 실적이 있는 숫자가 먼저 눈에 들어와야 한다 */}
              <span className={a.count === 0 ? 'text-[15px] text-neutral-300' : 'text-base font-semibold'}>
                {a.count}
              </span>
              <span className="sr-only">개</span>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-black/[0.08]">
          <td className="py-2 pr-2 text-sm font-medium">합계</td>
          <td className="py-2 text-right text-base font-semibold tabular-nums">
            {total}
            <span className="sr-only">개</span>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** 자유 입력 필드라 같은 사람이 공백만 다르게 들어올 수 있다 — 한 줄로 합친다. */
function mergeAuthors(rows: { authorName: string | null; _count: { _all: number } }[]) {
  return rows
    .map((a) => ({ name: a.authorName?.trim() || '', count: a._count._all }))
    .reduce<{ name: string; count: number }[]>((acc, cur) => {
      const hit = acc.find((x) => x.name === cur.name);
      if (hit) hit.count += cur.count;
      else acc.push({ ...cur });
      return acc;
    }, []);
}

/** 많이 넣은 사람부터, 동점이면 이름순이라 순서가 요청마다 흔들리지 않는다.
 *  작성자가 빈 건("미입력")은 맨 아래로 — 사람 이름 사이에 끼면 헷갈리고,
 *  그 자체가 "채워야 할 것"이라 따로 보이는 편이 낫다. */
function sortAuthors<T extends { name: string; count: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!a.name !== !b.name) return a.name ? -1 : 1;
    return b.count - a.count || a.name.localeCompare(b.name, 'ko');
  });
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; category?: string; sido?: string; gugun?: string;
    sort?: string; view?: string; m?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const activeCategory = CATEGORIES.some((c) => c.code === sp.category) ? sp.category : undefined;
  const activeSido = SIDO_LIST.includes(sp.sido ?? '') ? sp.sido! : '';
  const activeGugun = activeSido && gugunsOf(activeSido).includes(sp.gugun ?? '') ? sp.gugun! : '';
  const sort: VendorSort = sp.sort === 'name' ? 'name' : 'latest';
  const view: VendorView = sp.view === 'list' ? 'list' : 'card';
  // 월별 등록 실적이 보고 있는 달. 이번 달이 기본이라 주소에는 남기지 않는다
  // (monthParam 이 빈 문자열이면 "기본 상태" — 아래 링크들이 이 규칙을 그대로 따른다).
  const thisMonth = monthOf(todayKST());
  const rawMonth = parseMonthParam(sp.m ?? '') ?? '';
  // ?m= 로 이번 달이 대놓고 들어와도 빈 값으로 접는다. 이걸 안 하면 아래 두 URL 빌더가
  // 서로 다른 판정을 해서(한쪽은 "기본값이니 빼자", 한쪽은 "값이 있으니 싣자")
  // 칩을 누를 때와 검색할 때 주소가 갈린다.
  const monthParam = rawMonth === thisMonth ? '' : rawMonth;
  const activeMonth = monthParam || thisMonth;

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
  const [vendors, categoryCounts, authorCounts, monthAuthorCounts] = await Promise.all([
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
        authorName: true,
        photos: true,
        createdAt: true,
      },
    }),
    prisma.vendor.groupBy({
      by: ['category'],
      _count: { _all: true },
      where: { ...regionWhere, ...searchWhere },
    }),
    // 작성자별 등록 수 — 일부러 필터(업종·지역·검색)를 걸지 않는다.
    // "지금까지 누가 몇 개 넣었나"는 누적 실적이라, 업종 칩을 눌렀다고 줄어들면 안 된다.
    // 그래서 화면에도 "전체 등록 기준"이라고 못박아 둔다.
    prisma.vendor.groupBy({ by: ['authorName'], _count: { _all: true } }),
    // 그 달에 등록한 건수. createdAt 은 진짜 타임스탬프라 KST 하루가 시작되는 순간으로
    // 구간을 잡아야 한다 — UTC 자정으로 자르면 한국 시간 0~9시 등록분이 앞 달로 밀린다.
    prisma.vendor.groupBy({
      by: ['authorName'],
      _count: { _all: true },
      where: {
        createdAt: {
          gte: kstDayStartUTC(`${activeMonth}-01`),
          lt: kstDayStartUTC(`${addMonths(activeMonth, 1)}-01`),
        },
      },
    }),
  ]);

  const countByCategory = new Map(categoryCounts.map((c) => [c.category, c._count._all]));
  const totalCount = categoryCounts.reduce((sum, c) => sum + c._count._all, 0);

  // 누적과 월별이 서로 다른 규칙으로 세면 두 표의 숫자가 안 맞는다 — 규칙을 함수로 묶어 공유한다.
  const byAuthor = sortAuthors(mergeAuthors(authorCounts));
  const authorTotal = byAuthor.reduce((sum, a) => sum + a.count, 0);

  // 이 달 등록 수. 이 달에 한 건도 안 넣은 사람도 0 으로 자리를 지킨다 —
  // 명단에서 사라지면 "아무것도 안 했다"는 사실 자체가 안 보인다.
  // 다만 "미입력"은 사람이 아니라 빈 칸이라, 그 달에 없으면 굳이 0 으로 남기지 않는다.
  const monthByName = new Map(mergeAuthors(monthAuthorCounts).map((a) => [a.name, a.count]));
  const byAuthorMonth = sortAuthors(
    byAuthor
      .map((a) => ({ name: a.name, count: monthByName.get(a.name) ?? 0 }))
      .filter((a) => a.name !== '' || a.count > 0),
  );
  const monthTotal = byAuthorMonth.reduce((sum, a) => sum + a.count, 0);

  const filters = [{ code: '', label: '전체' }, ...CATEGORIES];

  // 화면 상태를 그대로 둔 채 한 가지만 바꾸는 링크. 업종 칩과 달 넘기기가 같은 함수를
  // 쓰는 이유는, 한쪽만 파라미터를 빠뜨리면 누를 때마다 다른 설정이 슬그머니 풀리기 때문이다.
  function vendorsHref(over: { category?: string; month?: string } = {}): string {
    const category = over.category ?? activeCategory ?? '';
    const month = over.month ?? activeMonth;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (activeSido) params.set('sido', activeSido);
    if (activeGugun) params.set('gugun', activeGugun);
    if (sort !== 'latest') params.set('sort', sort);
    if (view !== 'card') params.set('view', view);
    if (month !== thisMonth) params.set('m', month);
    const qs = params.toString();
    return qs ? `/vendors?${qs}` : '/vendors';
  }
  const chipHref = (code: string) => vendorsHref({ category: code });

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
      <main className="mx-auto max-w-shell px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">
            계약업체 <span className="ml-1 text-sm font-normal text-muted-foreground">{vendors.length}개</span>
          </h1>
          {/* 실제 이동이므로 <a> 로 두고 버튼 스타일만 입힌다.
              Button render={<Link/>} 는 Base UI 가 비-button 요소라고 경고한다. */}
          <Link href="/vendors/new" className={buttonVariants()}>
            새 업체 등록
          </Link>
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
          month={monthParam}
        />

        {/* 목록 | 작성자별 집계. 좁은 화면에서는 레일이 목록 아래로 내려간다.
            업종 칩과 검색줄은 그리드 밖(전체 폭)에 둔다 — 칩이 많아 좁은 칸에 넣으면 줄이 늘어난다. */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            {vendors.length === 0 ? (
              <div className="animate-fade-up rounded-2xl border border-dashed border-black/15 bg-white py-20 text-center text-muted-foreground">
                {filterDesc ? `${filterDesc} 조건에 등록된 업체가 없습니다.` : '등록된 업체가 없습니다.'}
                <div className="mt-3">
                  <Link href="/vendors/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    새 업체 등록하기
                  </Link>
                </div>
              </div>
            ) : view === 'list' ? (
              <div className="card-surface animate-fade-up overflow-hidden">
                <Table>
                  {/* 이 화면에도 표가 둘(업체 목록 + 담당자별 등록 수)이라 각자 이름이 필요하다 */}
                  <caption className="sr-only">계약업체 목록 — 업종·지역·연락처·작성자</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">사진</TableHead>
                      <TableHead>업체명</TableHead>
                      <TableHead>업종</TableHead>
                      <TableHead>지역</TableHead>
                      <TableHead>연락처</TableHead>
                      <TableHead>작성자</TableHead>
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
                          {/* 누가 이 업체 정보를 넣었는지 — 나중에 물어볼 사람이 누구인지가 목록에서 바로 보여야 한다 */}
                          <TableCell>
                            {vendor.authorName?.trim() ? (
                              vendor.authorName
                            ) : (
                              <span className="text-xs text-neutral-500">미입력</span>
                            )}
                          </TableCell>
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
                          <div className="mt-1 text-xs text-neutral-500">
                            등록 {formatDate(vendor.createdAt)}
                            {vendor.authorName?.trim() && <> · 작성자 {vendor.authorName}</>}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 담당자별 등록 실적 — 헤더가 56px 스티키라 그 아래에 붙인다 */}
          <aside className="animate-fade-up space-y-4 lg:sticky lg:top-[4.5rem]">
            {/* 월별이 먼저. "이번 달 누가 몇 개 넣었나"가 매일 보는 숫자고,
                누적은 그 아래에서 확인하면 된다. */}
            <section className="card-surface px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  담당자별 {Number(activeMonth.slice(5))}월 등록{' '}
                  {/* 해가 넘어갔을 때만 연도를 붙인다 — 평소엔 "9월"로 충분하고,
                      늘 "2026년 9월"이라고 쓰면 좁은 레일에서 줄이 넘어간다. */}
                  <span className="text-xs font-normal text-neutral-600">
                    {activeMonth.slice(0, 4) !== thisMonth.slice(0, 4)
                      ? `${Number(activeMonth.slice(0, 4))}년 · 등록일 기준`
                      : '등록일 기준'}
                  </span>
                </h2>
                {/* 달 넘기기 — 디비관리 달력과 같은 조작이라 따로 배울 게 없다 */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <Link
                    href={vendorsHref({ month: addMonths(activeMonth, -1) })}
                    aria-label="이전 달"
                    className="grid size-6 place-items-center rounded text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900"
                  >
                    &lsaquo;
                  </Link>
                  <Link
                    href={vendorsHref({ month: addMonths(activeMonth, 1) })}
                    aria-label="다음 달"
                    className="grid size-6 place-items-center rounded text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900"
                  >
                    &rsaquo;
                  </Link>
                </div>
              </div>
              {/* 빈 경우가 두 가지다. 하나로 묶으면 바로 아래 누적 카드가 "미입력 3"을
                  보여주는데 이쪽은 "아직 등록된 업체가 없습니다"라고 하는, 같은 화면에서
                  서로 반박하는 상태가 나온다(작성자가 전부 비어 있고 그 달 등록이 없을 때). */}
              {byAuthor.length === 0 ? (
                <p className="py-2 text-[13px] text-neutral-600">아직 등록된 업체가 없습니다.</p>
              ) : byAuthorMonth.length === 0 ? (
                <p className="py-2 text-[13px] text-neutral-600">이 달에 등록한 업체가 없습니다.</p>
              ) : (
                <AuthorTable
                  rows={byAuthorMonth}
                  total={monthTotal}
                  caption={`담당자별 ${formatMonthLabel(activeMonth)} 등록한 업체 수`}
                />
              )}
            </section>

            <section className="card-surface px-4 py-3">
              <h2 className="mb-1.5 text-sm font-semibold">
                담당자별 등록 수{' '}
                <span className="text-xs font-normal text-neutral-600">전체 등록 기준</span>
              </h2>
              {byAuthor.length === 0 ? (
                <p className="py-2 text-[13px] text-neutral-600">아직 등록된 업체가 없습니다.</p>
              ) : (
                <AuthorTable
                  rows={byAuthor}
                  total={authorTotal}
                  caption="담당자별 등록한 업체 수 (전체 기준)"
                />
              )}
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
