'use client';

// 계약 업체 리스트 상단 컨트롤 — 검색, 정렬, "정보 미비만 보기" 토글.
// 필터는 리스트 위 한 줄에 모아 두고, 상태는 URL 쿼리로 반영합니다 (서버 컴포넌트가 다시 조회).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NativeSelect } from '@/components/vendor-form/native-select';
import { buildContractsUrl, type ContractQuery, type ContractSort } from '@/lib/contract-query';
import { cn } from '@/lib/utils';

export function ContractListControls({ query }: { query: ContractQuery }) {
  const router = useRouter();
  const [text, setText] = useState(query.q);
  // 우리가 방금 URL로 밀어넣었고 아직 반영을 기다리는 검색어.
  // "내가 보낸 것이 돌아온 것"과 "밖에서 URL이 바뀐 것"을 구분하는 용도다.
  // 값이 아니라 '대기 중인지'로 구분해야, 뒤로/앞으로가기로 예전과 같은 검색어에
  // 다시 도달했을 때도 입력창이 제대로 따라간다.
  const [pendingSend, setPendingSend] = useState<string | null>(null);
  const [syncedQ, setSyncedQ] = useState(query.q);

  // 칩 클릭·뒤로가기 등 외부 요인으로 URL의 q가 바뀐 경우에만 입력값을 맞춘다.
  // (effect 가 아니라 렌더 중 조정 — React 권장 패턴이라 불필요한 연쇄 렌더가 없다)
  if (query.q !== syncedQ) {
    setSyncedQ(query.q);
    if (pendingSend !== null && query.q === pendingSend) {
      // 내가 보낸 값이 그대로 돌아왔다 — 그 사이 더 친 글자를 덮어쓰지 않는다
      setPendingSend(null);
    } else {
      setPendingSend(null);
      setText(query.q);
    }
  }

  function submit(value: string) {
    setPendingSend(value.trim());
    router.replace(buildContractsUrl(query, { q: value }));
  }

  // 검색어는 입력을 멈추면 300ms 후 자동 반영 (히스토리 오염 방지를 위해 replace)
  //
  // 의존성에 query 의 각 필드를 모두 넣어야 한다. [text] 만 두면 대기 중인 타이머가
  // 타이머를 걸던 시점의 낡은 query 를 그대로 들고 있다가, 그 사이 사용자가 누른
  // 정렬/칩/정보미비 토글을 300ms 뒤에 조용히 되돌려버린다.
  useEffect(() => {
    if (text.trim() === query.q) return;
    const t = setTimeout(() => submit(text), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, query.q, query.type, query.sort, query.incomplete]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(text);
          }}
          placeholder="업체명·전화번호·주소·담당자 검색"
          aria-label="계약 업체 검색"
          className={cn(
            // no-native-clear: Safari 기본 취소 버튼이 커스텀 × 와 겹쳐 보이는 것을 막는다 (globals.css)
            'no-native-clear h-9 w-64 rounded-md border border-input bg-white pl-3 pr-9 text-sm shadow-xs transition-colors',
            'placeholder:text-neutral-500',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
          )}
        />
        {text && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setText('');
              submit('');
            }}
            // 글리프 하나만 두면 터치 타깃이 8×20px 밖에 안 된다 — 최소 24×24 확보
            className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900"
          >
            ×
          </button>
        )}
      </div>

      <NativeSelect
        aria-label="정렬"
        options={[
          { value: 'latest', label: '최신순' },
          { value: 'name', label: '이름순' },
        ]}
        value={query.sort}
        onChange={(e) => router.push(buildContractsUrl(query, { sort: e.target.value as ContractSort }))}
      />

      <button
        type="button"
        aria-pressed={query.incomplete}
        onClick={() => router.push(buildContractsUrl(query, { incomplete: !query.incomplete }))}
        className={cn(
          'h-9 rounded-full border px-3.5 text-sm transition-all duration-200',
          query.incomplete
            ? 'border-transparent bg-[var(--data-warning-ink)] font-medium text-white shadow-sm'
            : 'border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:text-neutral-900 hover:shadow-soft'
        )}
      >
        정보 미비만 보기
      </button>
    </div>
  );
}
