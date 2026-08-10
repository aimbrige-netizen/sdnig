'use client';

// 계약 업체 목록의 한 행.
// 행 어디를 눌러도 상세 모달이 열린다 — 업체명 글자 위만 눌러야 열리면 아무 반응이 없는
// 것처럼 느껴지기 때문. 전화번호 링크 같은 자체 동작이 있는 요소는 그대로 두고 넘긴다.
import { useState } from 'react';
import { TableRow } from '@/components/ui/table';
import { ContractDetailDialog, type ContractDTO } from './contract-detail-dialog';

interface ContractRowProps {
  vendor: ContractDTO;
  style?: React.CSSProperties;
  children: React.ReactNode; // <TableCell> 들
}

export function ContractRow({ vendor, style, children }: ContractRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        className="animate-fade-up cursor-pointer"
        style={style}
        onClick={(e) => {
          // 링크(전화걸기 등)는 자체 동작이 있으므로 그쪽에 맡긴다.
          // 업체명 버튼은 자체 동작이 없고 키보드 접근용이라, 클릭이 여기로 올라와 함께 열린다.
          const el = e.target as HTMLElement;
          if (el.closest('a')) return;
          // 텍스트를 드래그해 복사하는 중이면 열지 않는다
          if (window.getSelection()?.toString()) return;
          setOpen(true);
        }}
      >
        {children}
      </TableRow>
      <ContractDetailDialog vendor={vendor} open={open} onOpenChange={setOpen} />
    </>
  );
}
