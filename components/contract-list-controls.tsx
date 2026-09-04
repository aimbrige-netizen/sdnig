'use client';

// 계약 업체 리스트 상단 필터 — 계약형태 칩, 검색, 정렬, "정보 미비만 보기" 토글.
//
// 필터를 전부 이 한 컴포넌트에 모아 둔 이유:
// 검색어는 300ms 디바운스 뒤 URL 에 반영되는데, 그 사이 사용자가 다른 필터를 누르면
// 대기 중이던 타이머가 "누르기 전"의 필터 상태로 URL 을 덮어써 방금 누른 필터가 사라진다.
// props(query)는 서버 응답이 커밋된 뒤에야 갱신되므로 useEffect 의존성만으로는 못 막는다
// (내비게이션이 진행 중인 수백 ms 동안 props 가 그대로라 cleanup 이 돌지 않는다).
// 그래서 모든 필터 조작을 navigate() 하나로 통과시켜 대기 타이머를 직접 취소하고,
// 그때 입력돼 있던 검색어를 같은 URL 에 함께 실어 보낸다.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NativeSelect } from '@/components/vendor-form/native-select';
import { buildContractsUrl, type ContractQuery, type ContractSort } from '@/lib/contract-query';
import { cn } from '@/lib/utils';

export interface ContractChip {
  code: string;
  label: string;
  dot: string;
  count: number;
}

interface ContractListControlsProps {
  query: ContractQuery;
  typeChips: ContractChip[];
  statusChips: ContractChip[];
}

function sigOf(q: ContractQuery): string {
  return JSON.stringify([q.q, q.type, q.status, q.sort, q.incomplete]);
}

/** 칩 한 줄 — 계약 형태·진행 상태 두 그룹이 같은 모양·같은 클릭 규칙을 공유한다 */
function ChipRow({
  label,
  chips,
  activeCode,
  queryKey,
  effective,
  text,
  navigate,
}: {
  label: string;
  chips: ContractChip[];
  activeCode: string;
  queryKey: 'type' | 'status';
  effective: ContractQuery;
  text: string;
  navigate: (changes: Partial<ContractQuery>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const isActive = c.code === activeCode;
          return (
            <Link
              key={c.code || 'all'}
              href={buildContractsUrl(effective, { q: text, [queryKey]: c.code })}
              prefetch={false}
              aria-current={isActive ? 'true' : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // 새 탭 등은 기본 동작
                e.preventDefault();
                navigate({ [queryKey]: c.code });
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-all duration-200',
                isActive
                  ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                  : 'border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:text-neutral-900 hover:shadow-soft'
              )}
            >
              {c.dot && <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: c.dot }} />}
              {c.label}
              <span className={cn('text-xs tabular-nums', isActive ? 'text-white/75' : 'text-neutral-500')}>
                {c.count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ContractListControls({ query, typeChips, statusChips }: ContractListControlsProps) {
  const router = useRouter();
  const [text, setText] = useState(query.q);
  // 사용자가 마지막으로 "요청한" 필터 상태. 서버 응답이 커밋되기 전까지 props(query)는
  // 옛 값이라, 그 사이의 조작은 이 intent 위에 쌓아야 서로를 덮어쓰지 않는다.
  // (null = 서버와 동기화된 상태)
  const [intent, setIntent] = useState<ContractQuery | null>(null);
  const [syncedSig, setSyncedSig] = useState(() => sigOf(query));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 화면과 다음 내비게이션의 기준 — 서버가 아직 못 따라왔으면 사용자의 의도를 우선한다.
  // (덤으로 느린 응답에서도 칩·정렬·토글이 즉시 반응하는 낙관적 UI가 된다)
  const effective = intent ?? query;

  // 서버 상태가 실제로 바뀌었을 때만 조정 (effect 가 아니라 렌더 중 조정 — React 권장 패턴)
  const querySig = sigOf(query);
  if (querySig !== syncedSig) {
    setSyncedSig(querySig);
    if (intent && sigOf(intent) === querySig) {
      setIntent(null); // 우리가 보낸 것이 그대로 도착 — 입력창은 건드리지 않는다
    } else {
      // 뒤로/앞으로가기 등 외부 요인 → 서버 상태를 따른다
      setIntent(null);
      setText(query.q);
    }
  }

  function cancelPending() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function go(changes: Partial<ContractQuery>, replace: boolean) {
    cancelPending();
    const next: ContractQuery = { ...effective, ...changes };
    setIntent(next);
    const url = buildContractsUrl(next, {});
    if (replace) router.replace(url);
    else router.push(url);
  }

  /** 검색어만 반영 (히스토리 오염 방지를 위해 replace) */
  const submitSearch = (value: string) => go({ q: value.trim() }, true);

  /** 칩·정렬·토글 — 대기 중인 검색 디바운스를 취소하고 현재 검색어를 함께 실어 보낸다 */
  const navigate = (changes: Partial<ContractQuery>) => go({ q: text.trim(), ...changes }, false);

  // 검색어는 입력을 멈추면 300ms 후 자동 반영
  useEffect(() => {
    if (text.trim() === effective.q) return;
    timerRef.current = setTimeout(() => submitSearch(text), 300);
    return cancelPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, effective.q]);

  return (
    <div className="mb-4 space-y-3">
      {/* 계약 형태·진행 상태 칩 두 줄 — Link 지만 클릭은 navigate() 로 가로채 대기 중인 검색을 함께 정리한다.
          (href 는 그대로 두어 새 탭 열기·주소 복사 같은 기본 동작을 유지)
          prefetch={false} 인 이유: 이 칩들은 현재 페이지와 같은 경로(/contracts)를 가리켜,
          프리페치 응답이 저장 직후 갱신된 목록을 "저장 전" 스냅샷으로 덮어쓴다.
          클릭은 어차피 onClick 이 가로채므로 프리페치의 이점도 없다.
          두 그룹은 서로 다른 쿼리 키(type/status)를 써서 동시에 켤 수 있다 — 형태를 고르면서
          동시에 진행 상태로도 좁힐 수 있다. */}
      <div className="animate-fade-up space-y-2" style={{ animationDelay: '120ms' }}>
        <ChipRow
          label="계약 형태"
          chips={typeChips}
          activeCode={effective.type}
          queryKey="type"
          effective={effective}
          text={text}
          navigate={navigate}
        />
        <ChipRow
          label="진행 상태"
          chips={statusChips}
          activeCode={effective.status}
          queryKey="status"
          effective={effective}
          text={text}
          navigate={navigate}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch(text);
            }}
            placeholder="업체명·전화번호·주소·담당자·메모 검색"
            aria-label="계약 업체 검색"
            className={cn(
              // no-native-clear: Safari 기본 취소 버튼이 커스텀 × 와 겹쳐 보이는 것을 막는다 (globals.css)
              'no-native-clear h-9 w-72 rounded-md border border-input bg-white pl-3 pr-9 text-sm shadow-xs transition-colors',
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
                submitSearch('');
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
          value={effective.sort}
          onChange={(e) => navigate({ sort: e.target.value as ContractSort })}
        />

        <button
          type="button"
          aria-pressed={effective.incomplete}
          onClick={() => navigate({ incomplete: !effective.incomplete })}
          className={cn(
            'h-9 rounded-full border px-3.5 text-sm transition-all duration-200',
            effective.incomplete
              ? 'border-transparent bg-[var(--data-warning-ink)] font-medium text-white shadow-sm'
              : 'border-black/10 bg-white text-neutral-600 hover:border-black/20 hover:text-neutral-900 hover:shadow-soft'
          )}
        >
          정보 미비만 보기
        </button>
      </div>
    </div>
  );
}
