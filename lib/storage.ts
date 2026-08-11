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
 * 공개 URL에서 버킷 내부 경로를 뽑아낸다.
 * `https://<ref>.supabase.co/storage/v1/object/public/<버킷>/vendors/2026/08/xxx.jpg`
 *   → `vendors/2026/08/xxx.jpg`
 *
 * 이 버킷의 공개 URL이 아니면(로컬 개발용 `/uploads/...` 등) null 을 돌려준다.
 */
export function objectPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const objectPath = url.slice(at + marker.length).split('?')[0];
  return objectPath ? decodeURIComponent(objectPath) : null;
}

/**
 * 사진 URL 목록에 해당하는 Storage 파일을 지운다.
 *
 * 업체나 사진을 지워도 파일이 남아 있으면 앱 어디에서도 안 보이는 채로 용량만 차지한다.
 * 이 버킷의 파일이 아닌 URL(로컬 개발 경로 등)은 조용히 건너뛴다.
 * 삭제 실패가 업체 삭제/수정 자체를 막으면 안 되므로 예외는 삼키고 개수만 돌려준다.
 */
export async function deleteImages(urls: string[]): Promise<number> {
  const supabase = supabaseAdmin();
  if (!supabase) return 0;

  const paths = [...new Set(urls.map(objectPathFromUrl).filter((p): p is string => p !== null))];
  if (paths.length === 0) return 0;

  try {
    const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      console.error('[storage] 사진 삭제 실패:', error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (e) {
    console.error('[storage] 사진 삭제 중 오류:', e);
    return 0;
  }
}

export interface StoredObject {
  path: string;
  size: number;
  createdAt: string;
}

/** 버킷 안의 모든 파일을 재귀적으로 나열한다 (고아 파일 정리용). */
export async function listAllObjects(prefix = ''): Promise<StoredObject[]> {
  const supabase = supabaseAdmin();
  if (!supabase) return [];

  const out: StoredObject[] = [];
  const PAGE = 100;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`목록 조회 실패(${prefix || '/'}): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // id 가 없는 항목은 파일이 아니라 하위 폴더다
      if (entry.id) {
        out.push({
          path: full,
          size: (entry.metadata?.size as number | undefined) ?? 0,
          createdAt: entry.created_at ?? '',
        });
      } else {
        out.push(...(await listAllObjects(full)));
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return out;
}

/** 버킷 내부 경로 목록을 직접 지운다 (고아 파일 정리용). */
export async function deleteObjectPaths(paths: string[]): Promise<string[]> {
  const supabase = supabaseAdmin();
  if (!supabase || paths.length === 0) return [];

  const removed: string[] = [];
  // Storage API 한 번에 너무 많이 보내지 않도록 나눠서 삭제
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(BUCKET).remove(chunk);
    if (error) throw new Error(`삭제 실패: ${error.message}`);
    removed.push(...(data ?? []).map((d) => d.name));
  }
  return removed;
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
