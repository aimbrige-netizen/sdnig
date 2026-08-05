'use client';

// 사진 업로드 UI (기획서 9절 — 대표사진 1장 필수, 갤러리/드레스 다중 업로드 + 정렬 + 드레스 라벨)
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PhotoRow } from './form-state';

// Vercel Serverless Function 요청 본문 제한(약 4.5MB)에 여유를 둔 안전선.
// 휴대폰 카메라 사진은 이 값을 쉽게 넘기므로 업로드 전에 브라우저에서 리사이즈/재인코딩한다.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 2000;

/** 큰 이미지를 캔버스로 리사이즈 + JPEG 재인코딩. GIF(애니메이션 가능성) · 이미지 아님 · 이미 작음 · 실패 시 원본 그대로 반환 */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size <= MAX_UPLOAD_BYTES) return file;

  try {
    // EXIF 방향 정보를 반영해야 휴대폰 세로사진이 눕지 않는다
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = 0.85;
    for (let attempt = 0; attempt < 5; attempt++) {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) break;
      if (blob.size <= MAX_UPLOAD_BYTES || quality <= 0.5) {
        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg' });
      }
      quality -= 0.15;
    }
  } catch {
    // 압축 실패 시 원본으로 업로드 시도 (실패하면 아래 uploadOne의 안내 메시지가 뜬다)
  }
  return file;
}

async function uploadOne(file: File): Promise<string> {
  const toUpload = await compressImageIfNeeded(file);
  const formData = new FormData();
  formData.append('file', toUpload);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (res.status === 413) {
    throw new Error(`파일이 너무 커서 업로드하지 못했습니다 (${file.name}). 사진 용량을 줄여서 다시 시도해주세요.`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? `업로드 실패 (${file.name})`);
  }
  return data.url as string;
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
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    if (uploading) return; // 업로드 중 재진입 방지
    if (!fileList || fileList.length === 0) return;
    const files = multiple ? Array.from(fileList) : [fileList[0]];
    setUploading(true);
    const urls: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        urls.push(await uploadOne(file));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    setUploading(false);
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
        <span className="text-muted-foreground">{compact ? '···' : '업로드 중...'}</span>
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
