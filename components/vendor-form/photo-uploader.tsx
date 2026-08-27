'use client';

// 사진·영상 업로드 UI
// (기획서 9절 — 대표사진 1장 필수, 갤러리/드레스 다중 업로드 + 정렬 + 드레스 라벨,
//  영상(DVD) 업종은 샘플 영상 업로드)
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_UPLOAD_BYTES, VIDEO_MIME_TYPES, isVideoMime } from '@/lib/constants';
import type { PhotoRow } from './form-state';
import { PhotoThumb } from './photo-thumb';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
// 'video/*' 를 함께 넣는다 — 휴대폰 파일선택기가 구체적 MIME 목록만으로는 영상을 회색 처리하는
// 경우가 있어서, 넓은 패턴을 같이 줘야 갤러리에서 영상이 선택 가능해진다.
const VIDEO_ACCEPT = ['video/*', ...VIDEO_MIME_TYPES].join(',');
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|qt)$/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;
/** 한 번에 고를 수 있는 개수 — 실수로 폴더째 넣어 무료 용량을 통째로 태우는 것을 막는다 */
const MAX_FILES_PER_DROP = 30;
/** 한 번에 올릴 수 있는 총 용량. 개수만 막으면 30 × 50MB = 1.5GB 로 무료 저장 한도를 한 번에 넘긴다 */
const MAX_BYTES_PER_DROP = 300 * 1024 * 1024;

/**
 * 업로드가 진행 중인지 폼 전체에 알리기 위한 통로.
 *
 * 업로드 상태는 Dropzone 안에만 있었기 때문에, 50MB 영상이 올라가는 도중에도 [저장] 버튼이
 * 눌렸다. 그러면 아직 URL 이 없는 영상은 저장 내용에서 빠지고, 파일만 저장소에 남아 나중에
 * 고아로 지워진다 — 사용자 눈에는 "올렸는데 사라졌다" 로 보인다.
 * Dropzone 이 시작·종료 시점에 카운터를 올리고 내려서 폼이 저장을 막을 수 있게 한다.
 */
export const UploadBusyContext = createContext<((delta: number) => void) | null>(null);

/** 업로드 중 브라우저를 닫거나 새로고침하면 전송 중인 파일이 사라지므로 확인을 받는다 */
export function useWarnBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}

/** 사람이 읽는 용량 표기 */
function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * 파일이 영상인지 판정한다.
 *
 * 일부 안드로이드 기기·브라우저는 File.type 을 빈 문자열로 준다. MIME 만 보고 막으면
 * 멀쩡한 영상이 "영상 파일만 올릴 수 있습니다" 로 거부되므로, 비어 있을 때는 확장자로 판단한다.
 */
function looksLikeVideo(file: File): boolean {
  if (file.type) return isVideoMime(file.type) || file.type.startsWith('video/');
  return VIDEO_EXT_RE.test(file.name);
}

function looksLikeImage(file: File): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXT_RE.test(file.name);
}

/**
 * 고르자마자 걸러낼 수 있는 문제를 미리 확인한다.
 * 50MB 짜리를 다 올려보고 나서 거절당하면 시간만 버리므로, 서버에 묻기 전에 여기서 막는다.
 */
function preflight(file: File, accept: 'image' | 'video'): string | null {
  if (accept === 'video' && !looksLikeVideo(file)) {
    return `${file.name}: 영상 파일만 올릴 수 있습니다 (mp4, mov, webm).`;
  }
  if (accept === 'image' && !looksLikeImage(file)) {
    return looksLikeVideo(file)
      ? `${file.name}: 사진 자리입니다. 영상은 [샘플 영상] 항목에 올려주세요.`
      : `${file.name}: 사진 파일만 올릴 수 있습니다 (jpg, png, webp, gif, avif).`;
  }
  if (file.size === 0) return `${file.name}: 빈 파일입니다.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} (${humanSize(file.size)}) 은 너무 큽니다. 한 개당 ${MAX_MB}MB 까지 올릴 수 있습니다.`;
  }
  return null;
}

/**
 * PUT 한 건을 보내면서 전송 진행률을 알려준다.
 *
 * fetch 는 업로드 진행 상황을 알려주지 못한다. 사진은 순식간이라 상관없었지만 영상은 수십 MB 라
 * 퍼센트가 없으면 멈춘 것처럼 보인다. 그래서 이 구간만 XMLHttpRequest 를 쓴다.
 */
function putWithProgress(
  url: string,
  body: FormData,
  onProgress?: (fraction: number) => void,
  register?: (abort: () => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    // 타임아웃이 없으면 끊긴 회선에서 요청이 영원히 매달려 업로드 영역이 잠긴 채로 남는다.
    // 50MB 를 아주 느린 회선으로 올리는 경우까지 감안해 넉넉히 잡는다.
    xhr.timeout = 10 * 60 * 1000;
    register?.(() => xhr.abort());
    xhr.upload.onprogress = (e) => {
      // e.total 은 파일이 아니라 멀티파트 본문 크기다. 파일 바이트와 섞으면 100% 에 먼저
      // 도달하므로, 이 요청 안에서의 비율(0~1)로만 넘긴다.
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        // Supabase 가 돌려준 사유를 살려야 "재시도하면 되는 실패"와 아닌 것을 구분할 수 있다
        let detail = `HTTP ${xhr.status}`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
          if (parsed?.message || parsed?.error) detail = String(parsed.message ?? parsed.error);
        } catch { /* 본문이 JSON 이 아니면 상태 코드만 */ }
        reject(new UploadError(detail, xhr.status));
      }
    };
    xhr.onerror = () => reject(new UploadError('네트워크 연결이 끊겼습니다', 0));
    xhr.ontimeout = () => reject(new UploadError('시간이 너무 오래 걸려 중단했습니다', 0));
    xhr.onabort = () => reject(new UploadError('취소됨', -1));
    xhr.send(body);
  });
}

class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
  get canceled() {
    return this.status === -1;
  }
}

async function uploadOne(
  file: File,
  onProgress?: (fraction: number) => void,
  register?: (abort: () => void) => void
): Promise<string> {
  const ticket = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  const issued = await ticket.json().catch(() => null);
  if (!ticket.ok) {
    throw new Error(issued?.error ?? `업로드 실패 (${file.name})`);
  }

  // Supabase 미설정(로컬 개발) — 기존 서버 경유 업로드로 폴백
  if (issued?.mode !== 'direct') {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) {
      throw new Error(data?.error ?? `업로드 실패 (${file.name})`);
    }
    onProgress?.(1);
    return data.url as string;
  }

  // 브라우저 → Supabase Storage 직접 업로드 (supabase-js 없이, 발급받은 URL만 사용)
  const body = new FormData();
  // 파일명이 UUID 라 같은 주소의 내용이 바뀌는 일이 없다. 1시간(기본값)으로 두면 50MB 영상을
  // 한 시간마다 다시 내려받게 되는데, 무료 플랜의 월 전송량이 5GB 라 금방 소진된다.
  body.append('cacheControl', '31536000');
  body.append('', file);
  try {
    await putWithProgress(issued.signedUrl, body, onProgress, register);
  } catch (e) {
    if (e instanceof UploadError && e.canceled) throw e;
    const why = e instanceof Error ? e.message : '알 수 없는 오류';
    throw new Error(`업로드 실패 (${file.name}) — ${why}`);
  }
  return issued.publicUrl as string;
}

interface DropzoneProps {
  multiple?: boolean;
  onUploaded: (urls: string[]) => void;
  children?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  /** 작은 정사각형 타일용 — 기본 padding(p-6) 대신 여백 없이 채움 */
  compact?: boolean;
  /** 받을 파일 종류. 'video' 면 영상만 고를 수 있고 동시 업로드 수를 줄인다. */
  kind?: 'image' | 'video';
}

function Dropzone({ multiple, onUploaded, children, className, ariaLabel, compact, kind = 'image' }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; percent: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const abortsRef = useRef<Set<() => void>>(new Set());
  const canceledRef = useRef(false);
  const bumpBusy = useContext(UploadBusyContext);
  const isVideoZone = kind === 'video';

  async function handleFiles(fileList: FileList | null) {
    if (uploading) return; // 업로드 중 재진입 방지
    if (!fileList || fileList.length === 0) return;
    let picked = multiple ? Array.from(fileList) : [fileList[0]];

    const notices: string[] = [];
    if (picked.length > MAX_FILES_PER_DROP) {
      notices.push(
        `한 번에 ${MAX_FILES_PER_DROP}개까지 올릴 수 있습니다. 앞의 ${MAX_FILES_PER_DROP}개만 올리고 나머지 ${picked.length - MAX_FILES_PER_DROP}개는 제외했습니다.`
      );
      picked = picked.slice(0, MAX_FILES_PER_DROP);
    }

    // 올리기 전에 거를 수 있는 건 여기서 거른다 (드래그로는 accept 를 우회할 수 있다)
    let running = 0;
    const files = picked.filter((f) => {
      const problem = preflight(f, kind);
      if (problem) {
        notices.push(problem);
        return false;
      }
      if (running + f.size > MAX_BYTES_PER_DROP) {
        notices.push(
          `${f.name}: 한 번에 올릴 수 있는 총 용량(${Math.round(MAX_BYTES_PER_DROP / 1024 / 1024)}MB)을 넘어 제외했습니다. 나눠서 올려주세요.`
        );
        return false;
      }
      running += f.size;
      return true;
    });

    // 거절된 파일은 이 시점에 이미 확정이다. 업로드가 다 끝난 뒤에 알리면 몇 분 전 얘기를
    // 뒤늦게 하는 꼴이 되므로, 통과한 파일이 있든 없든 여기서 바로 알린다.
    if (notices.length > 0) alert(notices.join('\n'));
    if (files.length === 0) return;

    canceledRef.current = false;
    abortsRef.current.clear();
    setUploading(true);
    bumpBusy?.(1);
    setProgress({ done: 0, total: files.length, percent: 0 });

    // 한 개씩 순서대로 올리면 개수만큼 대기 시간이 곱해진다(10장이면 10배).
    // 동시에 올리되, 휴대폰 회선이 감당하도록 개수를 제한한다. 영상은 한 개가 수십 MB 라
    // 4개를 동시에 밀어넣으면 회선을 다 먹고 오히려 느려져서 2개로 낮춘다.
    const CONCURRENCY = isVideoZone ? 2 : 4;
    const results: (string | null)[] = new Array(files.length).fill(null);
    const errors: string[] = [];
    // 파일별 전송 비율(0~1). 크기로 가중해 큰 파일이 진행률을 지배하도록 한다.
    const fractions = new Array(files.length).fill(0);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let next = 0;
    let done = 0;

    const report = () => {
      const sent = files.reduce((acc, f, i) => acc + f.size * fractions[i], 0);
      setProgress({
        done,
        total: files.length,
        percent: totalBytes > 0 ? Math.min(100, Math.floor((sent / totalBytes) * 100)) : 0,
      });
    };

    async function worker() {
      while (true) {
        const i = next++;
        if (i >= files.length || canceledRef.current) return;
        let abort: (() => void) | null = null;
        try {
          results[i] = await uploadOne(
            files[i],
            (fraction) => {
              fractions[i] = fraction;
              report();
            },
            (fn) => {
              abort = fn;
              abortsRef.current.add(fn);
            }
          );
          fractions[i] = 1;
        } catch (e) {
          fractions[i] = 1; // 실패해도 진행률이 멈춰 보이지 않도록
          const canceled = e instanceof UploadError && e.canceled;
          if (!canceled) errors.push(e instanceof Error ? e.message : String(e));
        } finally {
          if (abort) abortsRef.current.delete(abort);
          done += 1;
          report();
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    setUploading(false);
    bumpBusy?.(-1);
    setProgress(null);
    abortsRef.current.clear();
    // 고른 순서를 유지해서 넘긴다 (동시에 올려도 순서가 뒤섞이지 않도록)
    const urls = results.filter((u): u is string => u !== null);
    if (urls.length > 0) onUploaded(urls);
    if (canceledRef.current) {
      canceledRef.current = false;
      return; // 사용자가 직접 멈춘 것이므로 오류로 알리지 않는다
    }
    if (errors.length > 0) alert(errors.join('\n'));
  }

  function cancelAll() {
    canceledRef.current = true;
    for (const abort of abortsRef.current) abort();
    abortsRef.current.clear();
  }

  function statusText() {
    if (compact) return '···';
    if (!progress) return '업로드 중...';
    const many = progress.total > 1 ? ` ${progress.done}/${progress.total}` : '';
    return `업로드 중...${many} ${progress.percent}%`;
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? (isVideoZone ? `영상 업로드, 개당 최대 ${MAX_MB}MB` : '사진 업로드')}
        aria-disabled={uploading}
        aria-busy={uploading}
        onClick={() => {
          if (!uploading) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); // Space 로 페이지가 스크롤되는 것을 막는다
            if (!uploading) inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex items-center justify-center rounded-lg border-2 border-dashed text-center text-sm transition-colors ${
          compact ? 'p-1' : 'p-6'
        } ${
          uploading
            ? 'cursor-progress border-neutral-300 bg-neutral-50'
            : dragOver
              ? 'cursor-pointer border-neutral-900 bg-neutral-100'
              : 'cursor-pointer border-neutral-300 bg-white hover:bg-neutral-50'
        } ${className ?? ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={isVideoZone ? VIDEO_ACCEPT : 'image/*'}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {uploading ? (
          <span className="text-muted-foreground">{statusText()}</span>
        ) : (
          (children ?? (
            <span className="text-muted-foreground">
              {isVideoZone
                ? `클릭 또는 드래그하여 영상 업로드 (개당 최대 ${MAX_MB}MB)`
                : '클릭 또는 드래그하여 사진 업로드'}
            </span>
          ))
        )}
      </div>

      {/* 진행률은 매 틱 갱신돼 스크린리더가 숫자만 계속 읽게 되므로 라이브 리전에서 제외하고,
          시작/종료만 한 번씩 알린다 */}
      <p className="sr-only" role="status" aria-live="polite">
        {uploading ? `업로드를 시작했습니다. 총 ${progress?.total ?? 1}개.` : ''}
      </p>

      {/* 업로드 중에는 폼 저장이 잠기므로, 작은 타일(상품사진)에도 빠져나갈 수단이 있어야 한다 */}
      {uploading && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width] duration-200"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          {compact && <span className="text-[11px] text-muted-foreground">{progress?.percent ?? 0}%</span>}
          <Button type="button" variant="outline" size="sm" onClick={cancelAll}>
            취소
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- 대표사진 (1장 필수) ----
interface MainPhotoFieldProps {
  value: string | null;
  onChange: (url: string | null) => void;
  downloadName?: string;
}

export function MainPhotoField({ value, onChange, downloadName }: MainPhotoFieldProps) {
  return (
    <div className="flex items-start gap-4">
      {value ? (
        <div className="relative">
          <PhotoThumb
            url={value}
            alt="대표사진"
            sizes="160px"
            className="h-40 w-40 rounded-lg border"
            downloadName={downloadName}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute -right-2 -top-2 h-6 w-6 rounded-full p-0"
            onClick={() => onChange(null)}
            title="대표사진 삭제"
          >
            ✕
          </Button>
        </div>
      ) : null}
      <Dropzone multiple={false} onUploaded={(urls) => onChange(urls[0])} className="h-40 w-40">
        <span className="text-muted-foreground">{value ? '사진 교체' : '대표사진 업로드 (필수)'}</span>
      </Dropzone>
    </div>
  );
}

// ---- 상품사진 (선택, 상품별로 여러 장) ----
interface ProductPhotosFieldProps {
  photos: string[];
  /** 항상 최신 상태(prev) 기준으로 갱신 — 업로드가 느릴 때 그 사이 다른 삭제/추가로
   * 바뀐 사진 배열을 업로드 시작 시점의 낡은 배열로 덮어쓰는 것을 방지 (PhotoListField와 동일 패턴) */
  onUpdate: (updater: (prev: string[]) => string[]) => void;
}

export function ProductPhotosField({ photos, onUpdate }: ProductPhotosFieldProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {photos.map((url, i) => (
        <div key={`${url}-${i}`} className="relative h-14 w-14 shrink-0">
          <PhotoThumb url={url} alt={`상품사진 ${i + 1}`} sizes="64px" className="h-full w-full rounded-md border" />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full p-0"
            onClick={() => onUpdate((prev) => prev.filter((_, idx) => idx !== i))}
            title="상품사진 삭제"
          >
            ✕
          </Button>
        </div>
      ))}
      <Dropzone
        multiple
        compact
        ariaLabel="상품사진 추가"
        onUploaded={(urls) => onUpdate((prev) => [...prev, ...urls])}
        className="h-14 w-14 shrink-0"
      >
        <span className="text-lg leading-none text-muted-foreground">＋</span>
      </Dropzone>
    </div>
  );
}

// ---- 다중 사진 리스트 (갤러리 / 드레스) ----
interface PhotoListFieldProps {
  photos: PhotoRow[];
  /** 원본을 받을 때 붙일 이름의 앞부분 (예: '더그레이스 웨딩홀-갤러리') */
  downloadPrefix?: string;
  /** 항상 최신 상태(prev) 기준으로 갱신 — 업로드가 느릴 때 낡은 배열로 덮어쓰는 것을 방지 */
  onUpdate: (updater: (prev: PhotoRow[]) => PhotoRow[]) => void;
  withLabel?: boolean; // 드레스: 장별 라벨(드레스명/라인) 입력
  labelPlaceholder?: string;
}

export function PhotoListField({ photos, onUpdate, withLabel, labelPlaceholder, downloadPrefix }: PhotoListFieldProps) {
  function move(index: number, delta: number) {
    onUpdate((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <Dropzone
        multiple
        onUploaded={(urls) => onUpdate((prev) => [...prev, ...urls.map((url) => ({ url, label: '' }))])}
      />
      {photos.length > 0 && (
        <ul className="space-y-2">
          {photos.map((photo, i) => (
            <li key={photo.url} className="flex items-center gap-3 rounded-lg border bg-white p-2">
              <PhotoThumb
                url={photo.url}
                alt={photo.label || `사진 ${i + 1}`}
                sizes="64px"
                className="h-16 w-16 shrink-0 rounded-md border"
                downloadName={`${downloadPrefix ?? '사진'} ${i + 1}${photo.label.trim() ? ` ${photo.label.trim()}` : ''}`}
              />
              <div className="min-w-0 flex-1">
                {withLabel ? (
                  <Input
                    value={photo.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      onUpdate((prev) => prev.map((p, idx) => (idx === i ? { ...p, label } : p)));
                    }}
                    placeholder={labelPlaceholder ?? '라벨 입력'}
                  />
                ) : (
                  <span className="block truncate text-xs text-muted-foreground">{photo.url}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => move(i, -1)} disabled={i === 0} title="위로">
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => move(i, 1)}
                  disabled={i === photos.length - 1}
                  title="아래로"
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onUpdate((prev) => prev.filter((_, idx) => idx !== i))}
                  title="삭제"
                >
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- 영상 (영상/DVD 업종) ----

/**
 * 영상 미리보기 한 칸.
 *
 * 크롬은 .mov(video/quicktime) 컨테이너를 재생하지 못한다(사파리는 됨). 아이폰에서 찍은
 * 영상을 그대로 올리면 여기서 검은 화면만 나와 "업로드가 실패했나?" 로 오해하기 쉽다.
 * 파일 자체는 정상 저장돼 있으므로, 재생이 안 되면 그 사실과 새 탭에서 열어보는 길을 안내한다.
 */
function VideoThumb({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const isMov = /\.mov(\?|$)/i.test(url);

  if (failed) {
    return (
      <div className="flex h-24 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-md border bg-neutral-50 p-2 text-center sm:w-40">
        <span className="text-[11px] leading-tight text-muted-foreground">
          {isMov ? '이 브라우저는 .mov 미리보기를 지원하지 않습니다' : '미리보기를 열지 못했습니다'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {isMov ? '파일은 정상 저장됨' : '파일은 저장됐지만 이 브라우저가 코덱을 지원하지 않습니다'}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          새 탭에서 열기
        </a>
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
      className="h-24 w-full shrink-0 rounded-md border bg-black object-contain sm:w-40"
    />
  );
}

interface VideoListFieldProps {
  videos: PhotoRow[];
  /** 항상 최신 상태(prev) 기준으로 갱신 — 업로드가 느릴 때 낡은 배열로 덮어쓰는 것을 방지 */
  onUpdate: (updater: (prev: PhotoRow[]) => PhotoRow[]) => void;
}

/**
 * 샘플 영상 목록. 사진과 달리 미리보기를 <video> 로 띄우고, 라벨(영상 제목)을 받는다.
 * 파일이 커서 자동재생은 하지 않고 controls 만 붙인다 (preload="metadata" 로 첫 프레임만 받음).
 */
export function VideoListField({ videos, onUpdate }: VideoListFieldProps) {
  function move(index: number, delta: number) {
    onUpdate((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    // 순서를 바꾸면 버튼이 다시 그려지며 포커스가 body 로 날아간다.
    // 키보드로 연속해서 옮길 수 있도록 옮겨간 자리의 같은 버튼으로 포커스를 되돌린다.
    requestAnimationFrame(() => {
      const to = index + delta;
      const dir = delta < 0 ? 'up' : 'down';
      // 맨 위·맨 아래로 옮기면 같은 방향 버튼이 비활성이라 focus() 가 먹지 않고 포커스가
      // body 로 날아간다. 그럴 때는 반대 방향 버튼으로 보낸다.
      const primary = document.querySelector<HTMLButtonElement>(`[data-video-move="${dir}-${to}"]`);
      if (primary && !primary.disabled) {
        primary.focus();
        return;
      }
      const other = dir === 'up' ? 'down' : 'up';
      document.querySelector<HTMLButtonElement>(`[data-video-move="${other}-${to}"]`)?.focus();
    });
  }

  return (
    <div className="space-y-3">
      <Dropzone
        multiple
        kind="video"
        onUploaded={(urls) => onUpdate((prev) => [...prev, ...urls.map((url) => ({ url, label: '' }))])}
      />
      {videos.length > 0 && (
        <ul className="space-y-2">
          {videos.map((video, i) => {
            const name = video.label.trim() || `영상 ${i + 1}`;
            return (
              <li
                // key 에 인덱스를 섞으면 순서를 바꿀 때마다 <video> 가 새로 마운트돼
                // 재생이 끊기고 50MB 를 다시 받는다. URL 은 UUID 라 그 자체로 고유하다.
                key={video.url}
                className="flex flex-col gap-3 rounded-lg border bg-white p-2 sm:flex-row sm:items-center"
              >
                <VideoThumb url={video.url} />
                <div className="min-w-0 flex-1">
                  <Input
                    value={video.label}
                    aria-label={`${i + 1}번째 영상 제목`}
                    onChange={(e) => {
                      const label = e.target.value;
                      onUpdate((prev) => prev.map((v, idx) => (idx === i ? { ...v, label } : v)));
                    }}
                    placeholder="영상 제목 (예: 본식 하이라이트)"
                  />
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{video.url}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-video-move={`up-${i}`}
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`${name} 위로 이동`}
                  >
                    <span aria-hidden="true">↑</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-video-move={`down-${i}`}
                    onClick={() => move(i, 1)}
                    disabled={i === videos.length - 1}
                    aria-label={`${name} 아래로 이동`}
                  >
                    <span aria-hidden="true">↓</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    aria-label={`${name} 삭제`}
                    onClick={() => {
                      if (!confirm(`"${name}" 을(를) 목록에서 뺄까요?`)) return;
                      onUpdate((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                  >
                    <span aria-hidden="true">✕</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
