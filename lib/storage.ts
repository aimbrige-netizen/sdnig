// 사진·영상 저장소 (기획서 9절)
// - Supabase Storage 환경변수가 설정되어 있으면 Supabase에 업로드하고 public URL을 반환
// - 없으면 로컬 개발용 폴백으로 .uploads/ 폴더에 저장 (배포 환경에서는 Supabase 필수)
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

/** MIME 타입 → 확장자 (파일명에 확장자가 없을 때의 폴백) */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/x-m4v': '.m4v',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

/**
 * 저장될 파일명을 만든다. 이름은 UUID 로 바꾸고 확장자만 남긴다.
 *
 * 확장자가 없거나 이상하면 MIME 으로 보완한다. 예전에는 무조건 '.jpg' 로 떨어져서
 * 확장자 없는 영상이 .jpg 로 저장됐고, 그러면 서빙 시 content-type 이 image/jpeg 가 돼
 * 재생되지 않는다.
 */
function safeFileName(original: string, mimeType?: string): string {
  const raw = path.extname(original).toLowerCase().replace(/[^a-z0-9.]/g, '');
  // 확장자가 지나치게 길면(위조·비정상) 신뢰하지 않는다
  const ext = raw.length > 1 && raw.length <= 6 ? raw : (mimeType && EXT_BY_MIME[mimeType]) || '.bin';
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
  if (!objectPath) return null;
  try {
    return decodeURIComponent(objectPath);
  } catch {
    // '%' 가 섞인 잘못된 URL 이면 decodeURIComponent 가 던진다. 여기서 막지 않으면
    // 업체 삭제와 고아 파일 정리가 통째로 500 이 되어 영영 복구되지 않는다.
    return objectPath;
  }
}

/**
 * 임의의 값(객체·배열·문자열)을 재귀적으로 훑어 이 버킷의 파일 경로를 모두 모은다.
 *
 * 사진 URL 이 들어가는 자리가 한 곳이 아니다 — photos(대표/갤러리/드레스) 외에
 * products[].photos(상품사진)에도 들어가고, 업종별 필드가 늘어나면 또 생길 수 있다.
 * 필드를 하나씩 열거하면 빠뜨린 자리의 사진을 "아무도 안 쓰는 파일"로 오인해 지우게 되므로
 * 자리를 특정하지 않고 전체를 훑는다.
 */
export function collectBucketPaths(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const p = objectPathFromUrl(value);
    if (p) into.add(p);
  } else if (Array.isArray(value)) {
    for (const v of value) collectBucketPaths(v, into);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectBucketPaths(v, into);
  }
  return into;
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
  originalName: string,
  mimeType?: string
): Promise<{ signedUrl: string; publicUrl: string } | null> {
  const supabase = supabaseAdmin();
  if (!supabase) return Promise.resolve(null);

  const objectPath = `${datedDir()}/${safeFileName(originalName, mimeType)}`;
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
  const fileName = safeFileName(file.name, file.type);
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
