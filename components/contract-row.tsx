'use client';

// 계약 업체 목록의 한 행.
// 행 어디를 눌러도 상세 페이지로 이동한다 — 업체명 글자 위만 눌러야 이동하면 아무 반응이 없는
// 것처럼 느껴지기 때문. 전화걸기 링크 같은 자체 동작이 있는 요소는 그대로 두고 넘긴다.
import { useRouter } from 'next/navigation';
import { TableRow } from '@/components/ui/table';

interface ContractRowProps {
  id: number;
  children: React.ReactNode; // <TableCell> 들
}

export function ContractRow({ id, children }: ContractRowProps) {
  const router = useRouter();

  return (
    // 행마다 등장 애니메이션을 시차로 넣던 걸 걷어냈다 — 수십 줄이 순차로 밀려 들어오면
    // 스캔을 시작하기까지 기다려야 해서, 목록에서는 그게 그냥 지연으로 느껴진다.
    <TableRow className="cursor-pointer"
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
