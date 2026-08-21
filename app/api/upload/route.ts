import { NextResponse } from 'next/server';
import { uploadImage } from '@/lib/storage';
import { isAllowedUpload } from '@/lib/constants';

export const runtime = 'nodejs';

// 로컬 개발용 폴백 경로. 배포 환경에서는 /api/upload-url 로 발급받아 브라우저가
// Storage 에 직접 올리므로 이 경로를 타지 않는다(그쪽이 Vercel 본문 4.5MB 제한을 피한다).
// 이 경로는 요청 본문을 통째로 메모리에 올린다. 실측해보면 약 10MB 를 넘는 순간
// 프레임워크 단에서 500 이 나가고 본문조차 남지 않는다(9MB 성공 / 12MB 실패).
// 상한을 MAX_UPLOAD_BYTES(50MB)로 두면 "받겠다고 해놓고 못 받는" 경로가 되므로,
// 실제로 감당 가능한 값으로 낮추고 안내를 준다. 큰 파일은 Supabase 를 설정해
// 브라우저에서 Storage 로 직접 올리는 경로를 쓰면 된다.
const LOCAL_MAX_BYTES = 9 * 1024 * 1024;

// 사진·영상 업로드 (기획서 9절) — 업로드 후 반환된 URL을 photos 배열에 추가
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    // 본문이 한도를 넘거나 잘리면 여기서 던진다 — 빈 500 대신 원인을 알려준다
    return NextResponse.json(
      {
        error: `업로드에 실패했습니다. 로컬 개발 환경에서는 파일 하나가 ${Math.round(
          LOCAL_MAX_BYTES / 1024 / 1024
        )}MB 를 넘으면 받을 수 없습니다. 큰 파일을 다루려면 Supabase Storage 환경변수를 설정해주세요.`,
      },
      { status: 413 }
    );
  }
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
  }
  if (!isAllowedUpload(file.name, file.type)) {
    return NextResponse.json(
      { error: '이미지(jpg, png, webp, gif, avif) 또는 영상(mp4, mov, webm) 파일만 올릴 수 있습니다.' },
      { status: 400 }
    );
  }
  if (file.size > LOCAL_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `로컬 개발 환경에서는 파일 하나가 ${Math.round(
          LOCAL_MAX_BYTES / 1024 / 1024
        )}MB 까지만 가능합니다. (Supabase Storage 를 설정하면 50MB 까지)`,
      },
      { status: 400 }
    );
  }

  try {
    const { url } = await uploadImage(file);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const message = e instanceof Error ? e.message : '업로드에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
