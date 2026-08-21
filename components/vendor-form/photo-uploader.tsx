'use client';

// 사진·영상 업로드 UI
// (기획서 9절 — 대표사진 1장 필수, 갤러리/드레스 다중 업로드 + 정렬 + 드레스 라벨,
//  영상(DVD) 업종은 샘플 영상 업로드)
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_UPLOAD_BYTES, VIDEO_MIME_TYPES, isVideoMime } from '@/lib/constants';
import type { PhotoRow } from './form-state';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
const VIDEO_ACCEPT = VIDEO_MIME_TYPES.join(',');

/** 사람이 읽는 용량 표기 */
function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * 고르자마자 걸러낼 수 있는 문제를 미리 확인한다.
 * 50MB 짜리를 다 올려보고 나서 거절당하면 시간만 버리므로, 서버에 묻기 전에 여기서 막는다.
 */
function preflight(file: File, accept: 'image' | 'video'): string | null {
  const isVideo = isVideoMime(file.type);
  if (accept === 'video' && !isVideo) {
    return `${file.name}: 영상 파일만 올릴 수 있습니다 (mp4, mov, webm).`;
  }
  if (accept === 'image' && isVideo) {
    return `${file.name}: 사진 파일만 올릴 수 있습니다. 영상은 영상 항목에 올려주세요.`;
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
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(body);
  });
}

/**
 * 파일 1개를 올리고 저장된 URL을 돌려준다.
 *
 * 원본 그대로 보관한다. 나중에 앱 화면에서 크게 보여줘야 하는데 한 번 줄여서 올리면 되돌릴
 * 방법이 없기 때문이다. (표시용 축소본이 필요해지면 보관된 원본에서 언제든 만들 수 있다.)
 *
 * 원본을 보관하려면 서버를 거치면 안 된다. Vercel 함수는 요청 본문이 약 4.5MB 로 제한돼
 * 그보다 큰 파일은 업로드 자체가 실패하고, 통과하더라도 같은 파일이 브라우저→함수→Storage 로
 * 두 번 이동해 그만큼 느려진다. 영상은 수십 MB 라 이 경로가 특히 중요하다.
 */
async function uploadOne(file: File, onProgress?: (loaded: number, total: number) => void): Promise<string> {
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
    onProgress?.(file.size, file.size);
    return data.url as string;
  }

  // 브라우저 → Supabase Storage 직접 업로드 (supabase-js 없이, 발급받은 URL만 사용)
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);
  try {
    await putWithProgress(issued.signedUrl, body, onProgress);
  } catch {
    throw new Error(`업로드 실패 (${file.name}) — 잠시 후 다시 시도해주세요.`);
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
  const isVideoZone = kind === 'video';

  async function handleFiles(fileList: FileList | null) {
    if (uploading) return; // 업로드 중 재진입 방지
    if (!fileList || fileList.length === 0) return;
    const picked = multiple ? Array.from(fileList) : [fileList[0]];

    // 올리기 전에 거를 수 있는 건 여기서 거른다 (드래그로는 accept 를 우회할 수 있다)
    const rejected: string[] = [];
    const files = picked.filter((f) => {
      const problem = preflight(f, kind);
      if (problem) rejected.push(problem);
      return !problem;
    });
    if (files.length === 0) {
      if (rejected.length > 0) alert(rejected.join('\n'));
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: files.length, percent: 0 });

    // 한 개씩 순서대로 올리면 개수만큼 대기 시간이 곱해진다(10장이면 10배).
    // 동시에 올리되, 휴대폰 회선이 감당하도록 개수를 제한한다. 영상은 한 개가 수십 MB 라
    // 4개를 동시에 밀어넣으면 회선을 다 먹고 오히려 느려져서 2개로 낮춘다.
    const CONCURRENCY = isVideoZone ? 2 : 4;
    const results: (string | null)[] = new Array(files.length).fill(null);
    const errors: string[] = [...rejected];
    const sentPerFile = new Array(files.length).fill(0);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let next = 0;
    let done = 0;

    const report = () => {
      const sent = sentPerFile.reduce((a: number, b: number) => a + b, 0);
      setProgress({
        done,
        total: files.length,
        percent: totalBytes > 0 ? Math.min(100, Math.round((sent / totalBytes) * 100)) : 0,
      });
    };

    async function worker() {
      while (true) {
        const i = next++;
        if (i >= files.length) return;
        try {
          results[i] = await uploadOne(files[i], (loaded) => {
            sentPerFile[i] = loaded;
            report();
          });
          sentPerFile[i] = files[i].size;
        } catch (e) {
          sentPerFile[i] = files[i].size; // 실패해도 진행률이 멈춰 보이지 않도록
          errors.push(e instanceof Error ? e.message : String(e));
        } finally {
          done += 1;
          report();
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

    setUploading(false);
    setProgress(null);
    // 고른 순서를 유지해서 넘긴다 (동시에 올려도 순서가 뒤섞이지 않도록)
    const urls = results.filter((u): u is string => u !== null);
    if (urls.length > 0) onUploaded(urls);
    if (errors.length > 0) alert(errors.join('\n'));
  }

  function statusText() {
    if (compact) return '···';
    if (!progress) return '업로드 중...';
    const many = progress.total > 1 ? ` ${progress.done}/${progress.total}` : '';
    return `업로드 중...${many} ${progress.percent}%`;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-busy={uploading}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-center text-sm transition-colors ${
        compact ? 'p-1' : 'p-6'
      } ${dragOver ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-300 bg-white hover:bg-neutral-50'} ${className ?? ''}`}
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
        <span className="text-muted-foreground" role="status">
          {statusText()}
        </span>
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
  );
}

// ---- 대표사진 (1장 필수) ----
interface MainPhotoFieldProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

export function MainPhotoField({ value, onChange }: MainPhotoFieldProps) {
  return (
    <div className="flex items-start gap-4">
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="대표사진" className="h-40 w-40 rounded-lg border object-cover" />
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`상품사진 ${i + 1}`} className="h-full w-full rounded-md border object-cover" />
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
  /** 항상 최신 상태(prev) 기준으로 갱신 — 업로드가 느릴 때 낡은 배열로 덮어쓰는 것을 방지 */
  onUpdate: (updater: (prev: PhotoRow[]) => PhotoRow[]) => void;
  withLabel?: boolean; // 드레스: 장별 라벨(드레스명/라인) 입력
  labelPlaceholder?: string;
}

export function PhotoListField({ photos, onUpdate, withLabel, labelPlaceholder }: PhotoListFieldProps) {
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
            <li key={`${photo.url}-${i}`} className="flex items-center gap-3 rounded-lg border bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.label || `사진 ${i + 1}`} className="h-16 w-16 rounded-md border object-cover" />
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
      <div className="flex h-24 w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-md border bg-neutral-50 p-2 text-center">
        <span className="text-[11px] leading-tight text-muted-foreground">
          {isMov ? '이 브라우저는 .mov 미리보기를 지원하지 않습니다' : '미리보기를 지원하지 않는 형식입니다'}
        </span>
        <span className="text-[11px] text-muted-foreground">파일은 정상 저장됨</span>
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
      className="h-24 w-40 shrink-0 rounded-md border bg-black object-contain"
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
  }

  return (
    <div className="space-y-3">
      <Dropzone
        multiple
        kind="video"
        ariaLabel="영상 업로드"
        onUploaded={(urls) => onUpdate((prev) => [...prev, ...urls.map((url) => ({ url, label: '' }))])}
      />
      {videos.length > 0 && (
        <ul className="space-y-2">
          {videos.map((video, i) => (
            <li key={`${video.url}-${i}`} className="flex items-center gap-3 rounded-lg border bg-white p-2">
              <VideoThumb url={video.url} />
              <div className="min-w-0 flex-1">
                <Input
                  value={video.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    onUpdate((prev) => prev.map((v, idx) => (idx === i ? { ...v, label } : v)));
                  }}
                  placeholder="영상 제목 (예: 본식 하이라이트)"
                />
                <span className="mt-1 block truncate text-xs text-muted-foreground">{video.url}</span>
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
                  disabled={i === videos.length - 1}
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
