'use client';

// 계약 업체 목록의 한 행.
// 행 어디를 눌러도 상세 페이지로 이동한다 — 업체명 글자 위만 눌러야 이동하면 아무 반응이 없는
// 것처럼 느껴지기 때문. 전화걸기 링크 같은 자체 동작이 있는 요소는 그대로 두고 넘긴다.
import { useRouter } from 'next/navigation';
import { TableRow } from '@/components/ui/table';

interface ContractRowProps {
  id: number;
  style?: React.CSSProperties;
  children: React.ReactNode; // <TableCell> 들
}

export function ContractRow({ id, style, children }: ContractRowProps) {
  const router = useRouter();

  return (
    <TableRow
      className="animate-fade-up cursor-pointer"
      style={style}
      onClick={(e) => {
        // 링크(전화걸기 등)는 자체 동작이 있으므로 그쪽에 맡긴다.
        const el = e.target as HTMLElement;
        if (el.closest('a')) return;
        // 텍스트를 드래그해 복사하는 중이면 이동하지 않는다
        if (window.getSelection()?.toString()) return;
        router.push(`/contracts/${id}`);
      }}
    >
      {children}
    </TableRow>
  );
}
