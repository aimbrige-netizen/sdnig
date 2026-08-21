// 로컬 개발용 업로드 파일 서빙 (Supabase Storage 미설정 시에만 사용)
// public/ 폴더는 빌드 이후 추가된 파일을 프로덕션 모드에서 서빙하지 않으므로
// .uploads/ 폴더의 파일을 이 라우트가 직접 반환합니다.
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { LOCAL_UPLOAD_ROOT } from '@/lib/storage';

export const runtime = 'nodejs';

// 업로드가 받는 형식(lib/constants.ts 의 UPLOAD_MIME_TYPES)과 짝이 맞아야 한다.
// 한쪽만 늘리면 저장은 되는데 서빙이 400 으로 막혀 재생·표시가 전부 실패한다.
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.qt': 'video/quicktime',
  '.webm': 'video/webm',
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;

  const filePath = path.join(LOCAL_UPLOAD_ROOT, ...segments);
  // 경로 탈출 방지
  if (!path.resolve(filePath).startsWith(path.resolve(LOCAL_UPLOAD_ROOT) + path.sep)) {
    return NextResponse.json({ error: '잘못된 경로입니다.' }, { status: 400 });
  }

  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    return NextResponse.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });
  }

  try {
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }
}
