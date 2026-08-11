import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { listAllObjects, collectBucketPaths, deleteObjectPaths } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 일회성 정리 도구 — 어느 업체도 참조하지 않는 Storage 파일(고아 파일)을 찾아 지운다.
 *
 * 사진은 파일을 고르는 즉시 업로드되기 때문에, 업체를 저장하지 않고 창을 닫으면
 * DB 에는 기록이 없고 파일만 남는다. 예전에는 업체/사진을 지워도 파일이 남았다.
 * 그렇게 쌓인 파일을 정리하기 위한 관리자 전용 경로다.
 *
 * 파일 삭제는 되돌릴 수 없으므로 로그인(proxy) 위에 별도 비밀값을 하나 더 요구한다.
 * MAINTENANCE_TOKEN 환경변수가 없으면 이 경로는 아예 동작하지 않는다.
 *
 *   GET    ?token=...            지울 대상 미리보기 (아무것도 지우지 않음)
 *   DELETE ?token=...&confirm=1  실제 삭제
 */

/** 방금 업로드한 사진이 아직 저장 전일 수 있으므로 이 시간 안에 만들어진 파일은 건드리지 않는다 */
const GRACE_MINUTES = 10;

function authorize(request: Request): NextResponse | null {
  const expected = process.env.MAINTENANCE_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: '정리 기능이 꺼져 있습니다.' }, { status: 404 });
  }
  const token = new URL(request.url).searchParams.get('token') ?? '';
  // 길이가 다르면 timingSafeEqual 이 예외를 던지므로 먼저 확인한다
  if (token.length !== expected.length || token !== expected) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }
  return null;
}

/**
 * DB 의 모든 업체가 참조 중인 파일 경로 집합.
 *
 * 사진 URL 이 들어가는 자리가 한 곳이 아니다 — photos(대표/갤러리/드레스)뿐 아니라
 * products[].photos(상품사진)에도 들어가고, 업종별 필드(categoryData)가 늘어나면
 * 또 생길 수 있다. 필드를 하나씩 열거하면 빠뜨린 곳의 사진이 "아무도 안 쓰는 파일"로
 * 분류돼 지워진다. 그래서 필드를 특정하지 않고 업체 레코드 전체를 문자열로 훑어
 * 이 버킷의 URL 을 모두 찾아낸다.
 */
async function referencedPaths(): Promise<Set<string>> {
  const vendors = await prisma.vendor.findMany();
  return collectBucketPaths(vendors);
}

async function survey() {
  const [objects, referenced] = await Promise.all([listAllObjects(), referencedPaths()]);
  const cutoff = Date.now() - GRACE_MINUTES * 60 * 1000;

  const orphans: typeof objects = [];
  let recentlyUploaded = 0;

  for (const o of objects) {
    if (referenced.has(o.path)) continue;
    const created = o.createdAt ? Date.parse(o.createdAt) : 0;
    if (created && created > cutoff) {
      recentlyUploaded += 1; // 아직 저장 중일 수 있어 제외
      continue;
    }
    orphans.push(o);
  }

  const bytes = (list: { size: number }[]) => list.reduce((sum, o) => sum + o.size, 0);
  return {
    총파일: objects.length,
    총용량MB: +(bytes(objects) / 1024 / 1024).toFixed(2),
    사용중: referenced.size,
    고아파일: orphans.length,
    고아용량MB: +(bytes(orphans) / 1024 / 1024).toFixed(2),
    최근업로드제외: recentlyUploaded,
    orphans,
  };
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  try {
    const result = await survey();
    return NextResponse.json({
      ok: true,
      mode: 'preview',
      ...result,
      목록: result.orphans.slice(0, 200).map((o) => `${o.path} (${Math.round(o.size / 1024)}KB)`),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '조회 실패' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  if (new URL(request.url).searchParams.get('confirm') !== '1') {
    return NextResponse.json({ error: 'confirm=1 이 필요합니다.' }, { status: 400 });
  }

  try {
    const result = await survey();
    const removed = await deleteObjectPaths(result.orphans.map((o) => o.path));
    return NextResponse.json({
      ok: true,
      mode: 'deleted',
      삭제한파일: removed.length,
      확보한용량MB: result.고아용량MB,
      남은파일: result.총파일 - removed.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '삭제 실패' }, { status: 500 });
  }
}
