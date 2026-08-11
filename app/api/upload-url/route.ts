import { NextResponse } from 'next/server';
import { createDirectUploadUrl } from '@/lib/storage';

export const runtime = 'nodejs';

// Supabase 무료 플랜의 파일 1개 최대 크기. 휴대폰 원본 사진(보통 3~15MB)은 여유롭게 들어간다.
const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/**
 * 브라우저가 Supabase Storage 로 사진을 직접 올릴 수 있는 1회용 URL을 발급한다.
 * (인증은 proxy.ts 가 /api/* 전체에 걸어둔다)
 *
 * 파일 자체는 이 함수를 거치지 않으므로 Vercel 요청 본문 4.5MB 제한과 무관하고,
 * 사진이 브라우저에서 Storage 로 한 번만 이동한다.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const type = typeof body?.type === 'string' ? body.type : '';
  const size = typeof body?.size === 'number' ? body.size : -1;

  if (!name) {
    return NextResponse.json({ error: '파일 이름이 없습니다.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: '이미지 파일(jpg, png, webp, gif, avif)만 업로드할 수 있습니다.' },
      { status: 400 }
    );
  }
  if (size <= 0 || size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 50MB 이하여야 합니다.' }, { status: 400 });
  }

  try {
    const issued = await createDirectUploadUrl(name);
    // Supabase 미설정(로컬 개발) — 호출부가 기존 /api/upload 로 폴백한다
    if (!issued) return NextResponse.json({ ok: true, mode: 'proxy' });
    return NextResponse.json({ ok: true, mode: 'direct', ...issued });
  } catch (e) {
    const message = e instanceof Error ? e.message : '업로드 URL 발급에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
