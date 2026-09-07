'use client';

// 삭제 알림 — 화면에 박아두지 않고 잠깐 떴다 사라진다.
//
// 지운 직후 한 번만 알리면 되는 내용이다. 그런데 본문 맨 위 배너로 두니
// (1) 목록 전체가 아래로 밀리고 (2) 주소에 ?deleted= 가 남아 새로고침이나
// 뒤로가기 때마다 같은 문구가 되살아났다. 그래서 흐름 밖에 띄우고, 몇 초 뒤
// 스스로 사라지고, 주소에서 파라미터도 바로 지운다.
import { useEffect, useState } from 'react';

/** 화면에 머무는 시간 — 한 문장 읽기엔 충분하고 방해는 안 될 만큼. */
const SHOW_MS = 4500;

export function DeleteToast({ vendorName, token }: { vendorName: string; token: string }) {
  // token 은 "삭제 한 건"을 가리키는 값(지운 업체 id). 이름만으로 판단하면
  // 같은 이름을 연달아 지웠을 때 prop 이 안 변해 두 번째 알림이 안 뜬다.
  const [shown, setShown] = useState({ name: '', token: '' });
  const [seen, setSeen] = useState('');
  const [closed, setClosed] = useState('');

  // 렌더 도중 상태 조정. useEffect 로 미루면 알림이 없는 프레임이 한 번 그려진다.
  if (token !== seen) {
    setSeen(token);
    if (token && vendorName) setShown({ name: vendorName, token });
  }

  const visible = shown.token !== '' && closed !== shown.token;

  // 주소에서 알림용 파라미터를 지운다. 문구는 위에서 state 로 붙잡아 뒀으니
  // 파라미터가 사라져도 토스트는 그대로 남는다.
  //
  // router.replace 가 아니라 history.replaceState 를 쓰는 이유: 이 화면은 서버에서
  // 집계 쿼리를 여럿 돌리는데, 주소만 정리하려고 그걸 통째로 다시 부를 이유가 없다.
  // 네이티브 history 조작은 Next 라우터와 동기화된다(문서 "Shallow routing on the client").
  useEffect(() => {
    if (!shown.token) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('deleted') && !params.has('did')) return;
    params.delete('deleted');
    params.delete('did');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [shown.token]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setClosed(shown.token), SHOW_MS);
    return () => clearTimeout(timer);
  }, [visible, shown.token]);

  return (
    // 알림 영역(role="status")은 늘 DOM 에 있고 안쪽 내용만 바뀐다. 영역째로 새로
    // 붙이면 스크린리더가 읽어주지 않는 경우가 있다.
    // fixed 라 본문 흐름 밖이고, 아래 가운데라 헤더 메뉴나 표 머리말을 가리지 않는다.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      {visible && (
        <div
          className="animate-fade-up shadow-lift pointer-events-auto flex max-w-[40rem] items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm break-keep"
          style={{ borderColor: 'var(--data-warning-ink)', color: 'var(--data-warning-ink)' }}
        >
          <span className="min-w-0">
            &lsquo;{shown.name}&rsquo; 을(를) 삭제했습니다. 남아 있던 메모도 함께 지워졌습니다.
          </span>
          <button
            type="button"
            onClick={() => setClosed(shown.token)}
            aria-label="알림 닫기"
            className="-my-1 -mr-1.5 shrink-0 rounded px-1.5 py-1 leading-none text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900"
          >
            &#10005;
          </button>
        </div>
      )}
    </div>
  );
}
