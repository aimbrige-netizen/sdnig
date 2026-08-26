'use client';

// 영상 링크 입력 (영상/DVD 업종)
//
// 파일 업로드는 Supabase 무료 플랜의 파일당 50MB 한도에 걸리고 저장 용량·전송량도 먹는다.
// 업체가 이미 유튜브 등에 올려둔 샘플 영상이 있으면 주소만 저장하는 편이 제약이 없다.

import Image from 'next/image';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseVideoLink } from '@/lib/video-links';
import type { PhotoRow } from './form-state';

interface VideoLinkFieldProps {
  links: PhotoRow[];
  /** 항상 최신 상태(prev) 기준으로 갱신 */
  onUpdate: (updater: (prev: PhotoRow[]) => PhotoRow[]) => void;
}

export function VideoLinkField({ links, onUpdate }: VideoLinkFieldProps) {
  const urlId = useId();
  const titleId = useId();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const preview = parseVideoLink(url);

  function add() {
    const parsed = parseVideoLink(url);
    if (!parsed) {
      setError('영상 주소를 확인해주세요. 유튜브·비메오·네이버TV 주소를 붙여넣으면 됩니다.');
      return;
    }
    if (links.some((l) => l.url === parsed.url)) {
      setError('이미 추가된 영상입니다.');
      return;
    }
    onUpdate((prev) => [...prev, { url: parsed.url, label: title.trim() }]);
    setUrl('');
    setTitle('');
    setError(null);
  }

  function move(index: number, delta: number) {
    onUpdate((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    requestAnimationFrame(() => {
      const to = index + delta;
      const dir = delta < 0 ? 'up' : 'down';
      const primary = document.querySelector<HTMLButtonElement>(`[data-link-move="${dir}-${to}"]`);
      if (primary && !primary.disabled) {
        primary.focus();
        return;
      }
      const other = dir === 'up' ? 'down' : 'up';
      document.querySelector<HTMLButtonElement>(`[data-link-move="${other}-${to}"]`)?.focus();
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <label htmlFor={urlId} className="mb-1 block text-xs text-muted-foreground">
              영상 주소
            </label>
            <Input
              id={urlId}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="https://youtu.be/... 또는 https://vimeo.com/..."
            />
          </div>
          <div className="min-w-0 flex-1 sm:max-w-[220px]">
            <label htmlFor={titleId} className="mb-1 block text-xs text-muted-foreground">
              영상 제목 (선택)
            </label>
            <Input
              id={titleId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="예: 본식 하이라이트"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={add} disabled={!url.trim()}>
              추가
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {!error && url.trim() && preview && (
          <p className="mt-2 text-xs text-muted-foreground">
            {preview.label}
            {preview.id ? ` 영상으로 인식했습니다 (${preview.id})` : ' 주소로 저장됩니다'}
          </p>
        )}
        {!error && url.trim() && !preview && (
          <p className="mt-2 text-xs text-muted-foreground">주소 형식을 확인하는 중…</p>
        )}
      </div>

      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((link, i) => {
            const parsed = parseVideoLink(link.url);
            const name = link.label.trim() || `영상 링크 ${i + 1}`;
            return (
              <li
                key={link.url}
                className="flex flex-col gap-3 rounded-lg border bg-white p-2 sm:flex-row sm:items-center"
              >
                <div className="relative flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border bg-neutral-100 sm:w-40">
                  {parsed?.thumbnail ? (
                    <Image src={parsed.thumbnail} alt="" fill sizes="160px" className="object-cover" />
                  ) : (
                    <span className="px-2 text-center text-xs text-muted-foreground">
                      {parsed?.label ?? '링크'}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Input
                    value={link.label}
                    aria-label={`${i + 1}번째 영상 링크 제목`}
                    onChange={(e) => {
                      const label = e.target.value;
                      onUpdate((prev) => prev.map((l, idx) => (idx === i ? { ...l, label } : l)));
                    }}
                    placeholder="영상 제목 (예: 본식 하이라이트)"
                  />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs text-muted-foreground underline underline-offset-2"
                  >
                    {link.url}
                  </a>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-link-move={`up-${i}`}
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
                    data-link-move={`down-${i}`}
                    onClick={() => move(i, 1)}
                    disabled={i === links.length - 1}
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
