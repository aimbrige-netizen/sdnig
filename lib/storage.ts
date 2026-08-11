// 사진 업로드 저장소 (기획서 9절)
// - Supabase Storage 환경변수가 설정되어 있으면 Supabase에 업로드하고 public URL을 반환
// - 없으면 로컬 개발용 폴백으로 public/uploads 폴더에 저장 (배포 환경에서는 Supabase 필수)
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-photos';

/** 로컬 개발용 업로드 폴더 (Supabase 미설정 시) */
export const LOCAL_UPLOAD_ROOT = path.join(process.cwd(), '.uploads');

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function safeFileName(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
  return `${crypto.randomUUID()}${ext}`;
}

function datedDir(): string {
  const now = new Date();
  return `vendors/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 브라우저가 Supabase Storage 로 직접 올릴 수 있는 1회용 업로드 URL을 발급한다 (2시간 유효).
 *
 * 사진을 서버(=Vercel 함수)를 거쳐 올리면 같은 파일이 두 번 이동하고(브라우저→함수→Storage),
 * Vercel 요청 본문 4.5MB 제한에 걸려 원본 사진이 아예 업로드되지 않는다. 직접 올리면
 * 한 번만 이동하므로 더 빠르고, 원본 크기 그대로 보관할 수 있다.
 *
 * Supabase 미설정(로컬 개발)이면 null 을 반환하고, 호출부가 기존 /api/upload 경로로 폴백한다.
 */
export function createDirectUploadUrl(
  originalName: string
): Promise<{ signedUrl: string; publicUrl: string } | null> {
  const supabase = supabaseAdmin();
  if (!supabase) return Promise.resolve(null);

  const objectPath = `${datedDir()}/${safeFileName(originalName)}`;
  return supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(objectPath)
    .then(({ data, error }) => {
      if (error || !data) {
        throw new Error(`업로드 URL 발급 실패: ${error?.message ?? '알 수 없는 오류'}`);
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      return { signedUrl: data.signedUrl, publicUrl: pub.publicUrl };
    });
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  const fileName = safeFileName(file.name);
  const dir = datedDir();
  const buffer = Buffer.from(await file.arrayBuffer());

  const supabase = supabaseAdmin();
  if (supabase) {
    const objectPath = `${dir}/${fileName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) {
      throw new Error(`Supabase Storage 업로드 실패: ${error.message}`);
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    return { url: data.publicUrl };
  }

  // ---- 로컬 개발용 폴백 (Supabase 미설정) ----
  // .uploads/ 폴더에 저장하고 app/uploads/[...path]/route.ts 가 서빙합니다.
  // (public/ 폴더는 빌드 이후 추가된 파일을 프로덕션 모드에서 서빙하지 않음)
  if (process.env.VERCEL) {
    throw new Error(
      'Supabase Storage 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.'
    );
  }
  const localDir = path.join(LOCAL_UPLOAD_ROOT, dir);
  await mkdir(localDir, { recursive: true });
  await writeFile(path.join(localDir, fileName), buffer);
  return { url: `/uploads/${dir}/${fileName}` };
}
