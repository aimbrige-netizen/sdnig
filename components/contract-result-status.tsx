'use client';

// 목록 결과 건수를 소리로도 알려주는 라이브 리전.
// 검색·정렬·필터는 URL 만 바꾸고 표를 갈아끼우므로, 검색창에 포커스를 둔 사용자는
// 몇 건이 남았는지(심지어 0건인지) 알 수 없다. 삭제 후 건수 변화도 여기서 함께 전달된다.
//
// 클라이언트 컴포넌트여야 하는 이유: 라이브 리전은 이미 DOM 에 있던 요소의 내용이
// "바뀔 때" 읽힌다. 서버 렌더마다 새로 마운트되면 읽히지 않는다.
interface ContractResultStatusProps {
  count: number;
  /** 적용 중인 필터 요약 (없으면 빈 문자열) */
  filterDesc: string;
  /** 표시 상한에 걸려 잘렸는지 */
  truncated: boolean;
}

export function ContractResultStatus({ count, filterDesc, truncated }: ContractResultStatusProps) {
  const message =
    count === 0
      ? filterDesc
        ? `${filterDesc} 조건에 해당하는 업체가 없습니다.`
        : '등록된 업체가 없습니다.'
      : `${filterDesc ? `${filterDesc} · ` : ''}${count.toLocaleString('ko-KR')}곳${
          truncated ? ' (일부만 표시 중)' : ''
        }`;

  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}
