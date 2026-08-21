import { NextResponse } from 'next/server';
import { uploadImage } from '@/lib/storage';
import { MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES } from '@/lib/constants';

export const runtime = 'nodejs';

// 로컬 개발용 폴백 경로. 배포 환경에서는 /api/upload-url 로 발급받아 브라우저가
// Storage 에 직접 올리므로 이 경로를 타지 않는다(그쪽이 Vercel 본문 4.5MB 제한을 피한다).
const ALLOWED_TYPES = UPLOAD_MIME_TYPES as readonly string[];

// 사진·영상 업로드 (기획서 9절) — 업로드 후 반환된 URL을 photos 배열에 추가
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: '이미지(jpg, png, webp, gif, avif) 또는 영상(mp4, mov, webm) 파일만 올릴 수 있습니다.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: '파일 하나는 50MB 까지 올릴 수 있습니다.' }, { status: 400 });
  }

  try {
    const { url } = await uploadImage(file);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const message = e instanceof Error ? e.message : '업로드에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
