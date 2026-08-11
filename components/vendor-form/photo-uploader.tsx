'use client';

// 사진 업로드 UI (기획서 9절 — 대표사진 1장 필수, 갤러리/드레스 다중 업로드 + 정렬 + 드레스 라벨)
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PhotoRow } from './form-state';

/**
 * 사진 1장을 올리고 저장된 URL을 돌려준다.
 *
 * 사진은 원본 그대로 보관한다. 나중에 앱 화면에서 크게 보여줘야 하는데, 한 번 줄여서 올리면
 * 원본을 되찾을 방법이 없기 때문이다. (화면 표시용 축소본이 필요해지면 보관된 원본에서
 * 언제든 만들 수 있다.)
 *
 * 원본을 보관하려면 서버를 거치면 안 된다. Vercel 함수는 요청 본문이 약 4.5MB 로 제한돼
 * 그보다 큰 사진은 업로드 자체가 실패하고, 통과하더라도 같은 파일이 브라우저→함수→Storage 로
 * 두 번 이동해 그만큼 느려진다. 그래서 서버에서는 1회용 업로드 URL만 받고, 파일은 브라우저에서
 * Supabase Storage 로 곧장 올린다.
 */
async function uploadOne(file: File): Promise<string> {
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
    return data.url as string;
  }

  // 브라우저 → Supabase Storage 직접 업로드 (supabase-js 없이, 발급받은 URL만 사용)
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);
  const put = await fetch(issued.signedUrl, { method: 'PUT', body, headers: { 'x-upsert': 'false' } });
  if (!put.ok) {
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
}

function Dropzone({ multiple, onUploaded, children, className, ariaLabel, compact }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (uploading) return; // 업로드 중 재진입 방지
    if (!fileList || fileList.length === 0) return;
    const files = multiple ? Array.from(fileList) : [fileList[0]];
    setUploading(true);
    setProgress({ done: 0, total: files.length });

    // 한 장씩 순서대로 올리면 사진 수만큼 대기 시간이 곱해진다(10장이면 10배).
    // 동시에 올리되, 휴대폰 회선이나 서버가 감당하도록 동시 개수는 제한한다.
    const CONCURRENCY = 4;
    const results: (string | null)[] = new Array(files.length).fill(null);
    const errors: string[] = [];
    let next = 0;
    let done = 0;

    async function worker() {
      while (true) {
        const i = next++;
        if (i >= files.length) return;
        try {
          results[i] = await uploadOne(files[i]);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        } finally {
          done += 1;
          setProgress({ done, total: files.length });
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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
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
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {uploading ? (
        <span className="text-muted-foreground">
          {compact
            ? '···'
            : progress && progress.total > 1
              ? `업로드 중... ${progress.done}/${progress.total}`
              : '업로드 중...'}
        </span>
      ) : (
        (children ?? <span className="text-muted-foreground">클릭 또는 드래그하여 사진 업로드</span>)
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
