// 로컬 개발용 업로드 파일 서빙 (Supabase Storage 미설정 시에만 사용)
// public/ 폴더는 빌드 이후 추가된 파일을 프로덕션 모드에서 서빙하지 않으므로
// .uploads/ 폴더의 파일을 이 라우트가 직접 반환합니다.
import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
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

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
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

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    // 브라우저는 <video> 를 재생·탐색할 때 Range 요청을 쓴다. 이 헤더가 없으면 영상이
    // 아예 재생되지 않거나 중간으로 건너뛸 수 없다.
    'Accept-Ranges': 'bytes',
  };

  // ?download=<파일명> — Supabase Storage 와 같은 규약. 저장된 이름은 UUID 라
  // 그대로 받으면 어느 업체 사진인지 알 수 없어서, 받을 때 이름을 붙여준다.
  const wanted = new URL(request.url).searchParams.get('download');
  if (wanted !== null) {
    const name = wanted.trim() || path.basename(filePath);
    // 한글 파일명은 헤더에 그대로 못 넣는다. filename* (RFC 5987) 만 보내면 이를 읽지 못하는
    // 브라우저가 "download" 라는 이름으로 저장하므로, 인코딩된 filename= 도 함께 보낸다
    // (Supabase Storage 도 같은 방식으로 내려준다).
    // filename= 에는 ASCII 만 넣을 수 있다(따옴표·역슬래시도 escape). 한글 이름은
    // filename* (RFC 5987) 로 전달하고, filename= 에는 알아볼 수 있는 대체 이름을 둔다.
    // 비ASCII 를 걷어내면 "- 2.jpg" 같은 알아볼 수 없는 이름이 남을 수 있어, 글자가
    // 거의 안 남으면 차라리 무난한 기본 이름을 쓴다
    const stripped = name.replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').replace(/\s+/g, ' ').trim();
    const ascii = /[A-Za-z0-9]{2,}/.test(stripped) ? stripped : `photo${path.extname(filePath) || '.jpg'}`;
    baseHeaders['Content-Disposition'] =
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }

  const range = request.headers.get('range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    // 'bytes=-500' 은 마지막 500바이트를 뜻한다
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end = m[1] === '' ? size - 1 : m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const data = await readFile(filePath);
    const slice = new Uint8Array(data.subarray(start, end + 1));
    return new NextResponse(slice, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(slice.byteLength),
      },
    });
  }

  try {
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: { ...baseHeaders, 'Content-Length': String(size) },
    });
  } catch {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }
}
