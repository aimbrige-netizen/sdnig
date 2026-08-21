import { NextResponse } from 'next/server';
import { createDirectUploadUrl } from '@/lib/storage';
import { MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES, isVideoMime } from '@/lib/constants';

export const runtime = 'nodejs';

/**
 * 브라우저가 Supabase Storage 로 사진·영상을 직접 올릴 수 있는 1회용 URL을 발급한다.
 * (인증은 proxy.ts 가 /api/* 전체에 걸어둔다)
 *
 * 파일 자체는 이 함수를 거치지 않으므로 Vercel 요청 본문 4.5MB 제한과 무관하고,
 * 파일이 브라우저에서 Storage 로 한 번만 이동한다. 영상은 수십 MB 라 이 경로가 필수다.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const type = typeof body?.type === 'string' ? body.type : '';
  const size = typeof body?.size === 'number' ? body.size : -1;

  if (!name) {
    return NextResponse.json({ error: '파일 이름이 없습니다.' }, { status: 400 });
  }
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { error: '이미지(jpg, png, webp, gif, avif) 또는 영상(mp4, mov, webm) 파일만 올릴 수 있습니다.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: '파일 크기를 확인할 수 없습니다.' }, { status: 400 });
  }
  if (size > MAX_UPLOAD_BYTES) {
    const kind = isVideoMime(type) ? '영상' : '사진';
    const limitMb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
    // 소수점 첫째 자리에서 반올림하면 50.02MB 가 "50.0MB" 로 보여 "50MB 까지인데 50.0MB 는
    // 왜 안 되냐" 가 된다. 한도를 넘긴 파일은 항상 올림해서 표시한다.
    const overMb = (Math.ceil((size / 1024 / 1024) * 10) / 10).toFixed(1);
    return NextResponse.json(
      { error: `${kind} 한 개는 ${limitMb}MB 까지 올릴 수 있습니다. (선택한 파일 약 ${overMb}MB)` },
      { status: 400 }
    );
  }

  try {
    const issued = await createDirectUploadUrl(name, type);
    // Supabase 미설정(로컬 개발) — 호출부가 기존 /api/upload 로 폴백한다
    if (!issued) return NextResponse.json({ ok: true, mode: 'proxy' });
    return NextResponse.json({ ok: true, mode: 'direct', ...issued });
  } catch (e) {
    const message = e instanceof Error ? e.message : '업로드 URL 발급에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
