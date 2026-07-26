'use client';

// 업체 리스트 상단 컨트롤 — 검색, 지역(시/도-구/군) 필터, 정렬, 카드/리스트 보기 전환
// 현재 필터 상태를 props로 받아 URL 쿼리로 반영합니다 (서버 컴포넌트가 다시 조회).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NativeSelect } from '@/components/vendor-form/native-select';
import { SIDO_LIST, gugunsOf } from '@/lib/regions';
import { cn } from '@/lib/utils';

export type VendorSort = 'latest' | 'name';
export type VendorView = 'card' | 'list';

interface VendorListControlsProps {
  q: string;
  category?: string;
  sido: string;
  gugun: string;
  sort: VendorSort;
  view: VendorView;
}

export function VendorListControls({ q, category, sido, gugun, sort, view }: VendorListControlsProps) {
  const router = useRouter();
  const [text, setText] = useState(q);

  // 칩 클릭 등 외부 요인으로 URL의 q가 바뀌면 입력값 동기화
  useEffect(() => {
    setText(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function buildUrl(changes: Partial<Record<'q' | 'sido' | 'gugun' | 'sort' | 'view', string>>) {
    const next = { q, category: category ?? '', sido, gugun, sort, view, ...changes };
    const params = new URLSearchParams();
    if (next.q.trim()) params.set('q', next.q.trim());
    if (next.category) params.set('category', next.category);
    if (next.sido) params.set('sido', next.sido);
    if (next.sido && next.gugun) params.set('gugun', next.gugun);
    if (next.sort !== 'latest') params.set('sort', next.sort);
    if (next.view !== 'card') params.set('view', next.view);
    const qs = params.toString();
    return qs ? `/vendors?${qs}` : '/vendors';
  }

  function update(changes: Partial<Record<'sido' | 'gugun' | 'sort' | 'view', string>>) {
    router.push(buildUrl(changes));
  }

  // 검색어는 입력을 멈추면 300ms 후 자동 반영 (히스토리 오염 방지를 위해 replace)
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => router.replace(buildUrl({ q: text })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const guguns = gugunsOf(sido);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <div className="relative">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') router.replace(buildUrl({ q: text }));
          }}
          placeholder="업체명·연락처·주소 검색"
          aria-label="업체 검색"
          className={cn(
            'h-9 w-56 rounded-md border border-input bg-white pl-3 pr-8 text-sm shadow-xs transition-colors',
            'placeholder:text-neutral-400',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
          )}
        />
        {text && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setText('');
              router.replace(buildUrl({ q: '' }));
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-neutral-400 hover:text-neutral-700"
          >
            ×
          </button>
        )}
      </div>
      <NativeSelect
        aria-label="시/도 필터"
        placeholder="지역 전체"
        options={SIDO_LIST.map((s) => ({ value: s, label: s }))}
        value={sido}
        onChange={(e) => update({ sido: e.target.value, gugun: '' })}
      />
      <NativeSelect
        aria-label="구/군 필터"
        placeholder="구/군 전체"
        options={guguns.map((g) => ({ value: g, label: g }))}
        value={gugun}
        onChange={(e) => update({ gugun: e.target.value })}
        disabled={!sido || guguns.length === 0}
      />
      <NativeSelect
        aria-label="정렬"
        options={[
          { value: 'latest', label: '최신순' },
          { value: 'name', label: '이름순' },
        ]}
        value={sort}
        onChange={(e) => update({ sort: e.target.value })}
      />
      <div className="ml-auto flex overflow-hidden rounded-full border border-input shadow-xs" role="group" aria-label="보기 방식">
        {(
          [
            { code: 'card', label: '카드' },
            { code: 'list', label: '리스트' },
          ] as const
        ).map((v) => (
          <button
            key={v.code}
            type="button"
            onClick={() => update({ view: v.code })}
            aria-pressed={view === v.code}
            className={cn(
              'h-9 px-3.5 text-sm transition-all duration-200',
              view === v.code
                ? 'bg-neutral-900 font-medium text-white'
                : 'bg-white text-neutral-600 hover:bg-neutral-900/5 hover:text-neutral-900'
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
