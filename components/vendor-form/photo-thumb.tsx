'use client';

// 사진 썸네일 + 원본 크게보기
//
// 사진은 원본 그대로 보관하므로 장당 3~5MB 다. 그걸 40~160px 타일에 그대로 내려받으면
// 사진 52장짜리 업체 화면이 25MB 를 받는다. next/image 로 감싸면 화면에 필요한 크기만큼만
// 변환해 받는다 — 저장소의 원본은 그대로다.
//
// 대신 작게만 보이면 사진을 확인할 수가 없어서, 눌러서 크게 보는 화면을 함께 둔다.
// 크게보기는 넓은 화면용 변환본을 쓰고(빠르게 뜬다), 손대지 않은 진짜 원본은 링크로 연다.

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { downloadFile } from '@/lib/download';

interface PhotoThumbProps {
  url: string;
  alt: string;
  /** 타일의 CSS 크기 — next/image 에 어느 정도 크기가 필요한지 알려준다 */
  sizes: string;
  className?: string;
  /** 원본을 받을 때 붙일 파일 이름 (확장자 제외). 없으면 alt 를 쓴다 */
  downloadName?: string;
}

/** 눌러서 크게 볼 수 있는 썸네일 */
export function PhotoThumb({ url, alt, sizes, className, downloadName }: PhotoThumbProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${alt} 크게 보기`}
        className={`group relative block overflow-hidden ${className ?? ''}`}
      >
        <Image src={url} alt={alt} fill sizes={sizes} className="object-cover" />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white"
        >
          <span className="text-xs font-medium">크게 보기</span>
        </span>
      </button>
      {open && (
        <PhotoViewer url={url} alt={alt} downloadName={downloadName ?? alt} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

interface PhotoViewerProps {
  url: string;
  alt: string;
  downloadName: string;
  onClose: () => void;
}

function PhotoViewer({ url, alt, downloadName, onClose }: PhotoViewerProps) {
  const [saving, setSaving] = useState(false);

  // 크게보기가 떠 있는 동안 뒤 배경이 스크롤되면 위치를 잃는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} 원본 보기`}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <span className="min-w-0 truncate text-sm text-white/80">{alt}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSaving(true);
              downloadFile(url, downloadName).finally(() => setSaving(false));
            }}
            disabled={saving}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-60"
          >
            {saving ? '내려받는 중...' : '원본 다운로드'}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-md border border-white/30 px-3 py-1.5 text-xs text-white hover:bg-white/10"
          >
            새 탭에서 열기
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md border border-white/30 px-3 py-1.5 text-xs text-white hover:bg-white/10"
          >
            닫기 (Esc)
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1" onClick={onClose}>
        <Image
          src={url}
          alt={alt}
          fill
          sizes="100vw"
          className="object-contain"
          // 크게보기는 처음부터 보이는 화면이라 미루지 않는다
          priority
        />
      </div>

      <p className="shrink-0 pt-3 text-center text-xs text-white/50">
        화면을 누르거나 Esc 로 닫습니다. [원본 다운로드] 는 올릴 때 그대로인 원본 파일을 저장합니다.
      </p>
    </div>
  );
}
