// 홈 대시보드 — 수집 진행률 (통합 / 웨딩·혼수 그룹별 / 그룹별 지역 진행률)
// 목표치는 lib/dashboard-targets.ts (전국 웨딩업체·혼수업체 파악 엑셀 기반 정적 데이터).
// 앱의 14개 업종 전부가 두 그룹 중 하나에 배정되어 있어(기타/제외 카테고리 없음),
// 등록된 업체는 목표 수치 유무와 무관하게 항상 해당 그룹·지역 집계에 반영된다.
import Link from 'next/link';
import { AdminHeader } from '@/components/admin-header';
import { Button } from '@/components/ui/button';
import { TARGET_GROUPS, type TargetGroup } from '@/lib/dashboard-targets';
import { SIDO_LIST, splitRegion } from '@/lib/regions';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('ko-KR');

function pctOf(registered: number, target: number): number {
  return target > 0 ? (registered / target) * 100 : 0;
}

function pctLabel(p: number): string {
  return `${p >= 99.95 ? Math.round(p) : p.toFixed(1)}%`;
}

function Meter({ value, thick }: { value: number; thick?: boolean }) {
  return (
    <div className={`${thick ? 'h-3' : 'h-2'} w-full overflow-hidden rounded-full bg-neutral-900/[0.06]`}>
      <div
        className="h-full rounded-full bg-brand-gradient transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

interface GroupStats {
  group: TargetGroup;
  target: number;
  registered: number;
  categories: { code: string; label: string; target: number; registered: number }[];
  regions: { sido: string; target: number; registered: number }[]; // target 내림차순
  unregioned: number; // 지역 미입력/파싱 불가 등록 건수
}

export default async function DashboardPage() {
  // 모든 업종이 두 그룹 중 하나에 속하므로 필터 없이 전체 업체를 집계한다.
  const rows = await prisma.vendor.findMany({ select: { category: true, region: true } });

  // 등록 수 집계: 업종별 / 업종×시도별
  const regByCat = new Map<string, number>();
  const regByCatSido = new Map<string, Map<string, number>>();
  for (const row of rows) {
    regByCat.set(row.category, (regByCat.get(row.category) ?? 0) + 1);
    const { sido } = splitRegion(row.region);
    const key = SIDO_LIST.includes(sido) ? sido : '';
    let m = regByCatSido.get(row.category);
    if (!m) regByCatSido.set(row.category, (m = new Map()));
    m.set(key, (m.get(key) ?? 0) + 1);
  }

  const groupStats: GroupStats[] = TARGET_GROUPS.map((group) => {
    const categories = group.categories.map((c) => ({
      code: c.code,
      label: c.label,
      target: c.total,
      registered: regByCat.get(c.code) ?? 0,
    }));
    const regions = SIDO_LIST.map((sido) => ({
      sido,
      target: group.categories.reduce((sum, c) => sum + (c.bySido[sido] ?? 0), 0),
      registered: group.categories.reduce(
        (sum, c) => sum + (regByCatSido.get(c.code)?.get(sido) ?? 0),
        0
      ),
    }))
      .filter((r) => r.target > 0 || r.registered > 0)
      .sort((a, b) => b.target - a.target);
    const unregioned = group.categories.reduce(
      (sum, c) => sum + (regByCatSido.get(c.code)?.get('') ?? 0),
      0
    );
    return {
      group,
      target: categories.reduce((s, c) => s + c.target, 0),
      registered: categories.reduce((s, c) => s + c.registered, 0),
      categories,
      regions,
      unregioned,
    };
  });

  const totalTarget = groupStats.reduce((s, g) => s + g.target, 0);
  const totalRegistered = groupStats.reduce((s, g) => s + g.registered, 0);
  const totalPct = pctOf(totalRegistered, totalTarget);
  const noTargetCategoryCount = groupStats.reduce(
    (s, g) => s + g.categories.filter((c) => c.target === 0).length,
    0
  );

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">수집 현황 대시보드</h1>
          <Button render={<Link href="/vendors" />} variant="outline" size="sm">
            업체 리스트 보기
          </Button>
        </div>

        {/* 통합 진행률 */}
        <section className="card-surface animate-fade-up mb-4 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">통합 진행률</h2>
            <div className="text-sm text-muted-foreground tabular-nums">
              목표 {nf.format(totalTarget)}곳
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-brand-gradient text-5xl font-bold tabular-nums tracking-tight">
              {pctLabel(totalPct)}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {nf.format(totalRegistered)} / {nf.format(totalTarget)} 등록
            </span>
          </div>
          <div className="mt-4">
            <Meter value={totalPct} thick />
          </div>
          {noTargetCategoryCount > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              14개 업종 중 {noTargetCategoryCount}개는 아직 목표 수치가 없어 등록 건수만 집계됩니다 (아래 업종별
              내역에 &quot;목표 미설정&quot;으로 표시). 모든 업종의 등록은 이 통합 진행률에 빠짐없이 포함됩니다.
            </p>
          )}
        </section>

        {/* 그룹별 진행률 (웨딩업체 / 혼수업체) — 각 그룹에 속한 업종 전부(목표 미설정 포함) 표시 */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {groupStats.map(({ group, target, registered, categories }, gi) => {
            const p = pctOf(registered, target);
            return (
              <section
                key={group.key}
                className="card-surface animate-fade-up p-6"
                style={{ animationDelay: `${60 + gi * 50}ms` }}
              >
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold">{group.label} 진행률</h2>
                  <span className="text-2xl font-bold tabular-nums">{pctLabel(p)}</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {nf.format(registered)} / {nf.format(target)} 등록
                </div>
                <div className="mt-3">
                  <Meter value={p} thick />
                </div>
                <ul className="mt-4 space-y-3 border-t pt-4">
                  {categories.map((c) => {
                    const cp = pctOf(c.registered, c.target);
                    return (
                      <li key={c.code}>
                        <Link
                          href={`/vendors?category=${c.code}`}
                          className="block rounded-md transition-colors hover:bg-neutral-900/[0.03]"
                        >
                          <div className="mb-1 flex items-baseline justify-between text-sm">
                            <span>{c.label}</span>
                            {c.target > 0 ? (
                              <span className="text-muted-foreground tabular-nums">
                                {nf.format(c.registered)} / {nf.format(c.target)} · {pctLabel(cp)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground tabular-nums">
                                {nf.format(c.registered)}건 · 목표 미설정
                              </span>
                            )}
                          </div>
                          {c.target > 0 && <Meter value={cp} />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {/* 그룹별 지역 진행률 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {groupStats.map(({ group, regions, unregioned }, gi) => (
            <section
              key={group.key}
              className="card-surface animate-fade-up p-6"
              style={{ animationDelay: `${150 + gi * 50}ms` }}
            >
              <h2 className="mb-4 font-semibold">{group.label} 지역별 진행률</h2>
              <ul className="space-y-2.5">
                {regions.map((r) => {
                  const rp = pctOf(r.registered, r.target);
                  return (
                    <li key={r.sido} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-sm">{r.sido}</span>
                      <div className="min-w-0 flex-1">
                        {r.target > 0 ? (
                          <Meter value={rp} />
                        ) : (
                          <div className="h-2 w-full rounded-full border border-dashed border-neutral-300" />
                        )}
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {r.target > 0
                          ? `${nf.format(r.registered)}/${nf.format(r.target)} · ${pctLabel(rp)}`
                          : `${nf.format(r.registered)}건 · 목표 미설정`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {unregioned > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  지역 미입력 등록 {nf.format(unregioned)}건은 지역별 집계에서 제외됩니다.
                </p>
              )}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
