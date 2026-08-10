'use client';

// 계약 업체 입력 필드 묶음 — 빠른 등록 폼과 수정 다이얼로그가 같은 필드를 공유합니다.
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/vendor-form/native-select';
import { CONTRACT_TYPES, type ContractType } from '@/lib/contract-constants';
import { cn } from '@/lib/utils';

export interface ContractFormState {
  name: string;
  contractType: ContractType;
  phone: string;
  address: string;
  managerName: string;
  memo: string;
}

export function emptyContractForm(): ContractFormState {
  return { name: '', contractType: 'verbal', phone: '', address: '', managerName: '', memo: '' };
}

export function serializeContract(state: ContractFormState) {
  return {
    name: state.name,
    contractType: state.contractType,
    phone: state.phone,
    address: state.address,
    managerName: state.managerName,
    memo: state.memo,
  };
}

/** zod 이슈 경로 → 한글 필드명 (에러 요약 표시용) */
export const CONTRACT_FIELD_LABELS: Record<string, string> = {
  name: '업체명',
  contractType: '계약 형태',
  phone: '전화번호',
  address: '주소',
  managerName: 'DB담당자',
  memo: '메모',
};

// htmlFor/id 로 라벨과 입력을 반드시 연결한다. 연결이 없으면 스크린리더가 칸 이름을 못 읽고,
// 라벨을 클릭해도 포커스가 가지 않는다. 필수 표시도 별표(시각) + aria-required(보조기기) 양쪽으로 준다.
function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden>
          *
        </span>
      )}
    </Label>
  );
}

interface ContractFieldsProps {
  state: ContractFormState;
  patch: (partial: Partial<ContractFormState>) => void;
  /** 빠른 등록 폼에서 Enter 로 바로 저장 */
  onEnter?: () => void;
  /** 업체명 입력창 ref — 저장 후 다음 입력을 위해 포커스를 되돌립니다 */
  nameRef?: React.Ref<HTMLInputElement>;
  /** 저장 중 입력 잠금 — 응답이 도착하면 폼을 비우므로, 그 사이 입력한 내용이 사라지는 것을 막습니다 */
  disabled?: boolean;
  className?: string;
}

export function ContractFields({ state, patch, onEnter, nameRef, disabled, className }: ContractFieldsProps) {
  // 이 컴포넌트는 빠른등록 폼과 수정 다이얼로그에서 동시에 렌더될 수 있으므로 id 가 겹치면 안 된다
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;

  const handleKeyDown = onEnter
    ? (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter();
        }
      }
    : undefined;

  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6', className)}>
      <div className="space-y-1 lg:col-span-2">
        <FieldLabel htmlFor={id('name')} required>
          업체명
        </FieldLabel>
        <Input
          id={id('name')}
          aria-required
          ref={nameRef}
          value={state.name}
          onChange={(e) => patch({ name: e.target.value })}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="예: 더그레이스 웨딩홀"
        />
      </div>

      <div className="space-y-1">
        <FieldLabel htmlFor={id('type')} required>
          계약 형태
        </FieldLabel>
        <NativeSelect
          id={id('type')}
          aria-required
          value={state.contractType}
          onChange={(e) => patch({ contractType: e.target.value as ContractType })}
          options={CONTRACT_TYPES.map((t) => ({ value: t.code, label: t.label }))}
          disabled={disabled}
          className="w-full"
        />
      </div>

      <div className="space-y-1">
        <FieldLabel htmlFor={id('phone')}>전화번호</FieldLabel>
        <Input
          id={id('phone')}
          type="tel"
          value={state.phone}
          onChange={(e) => patch({ phone: e.target.value })}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="나중에 입력 가능"
        />
      </div>

      <div className="space-y-1">
        <FieldLabel htmlFor={id('address')}>주소</FieldLabel>
        <Input
          id={id('address')}
          value={state.address}
          onChange={(e) => patch({ address: e.target.value })}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="나중에 입력 가능"
        />
      </div>

      <div className="space-y-1">
        <FieldLabel htmlFor={id('manager')} required>
          DB담당자
        </FieldLabel>
        <Input
          id={id('manager')}
          aria-required
          value={state.managerName}
          onChange={(e) => patch({ managerName: e.target.value })}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="예: 홍길동"
        />
      </div>

      {/* 메모는 길어질 수 있어 한 줄을 통째로 쓴다.
          Enter 로 저장하지 않고 줄바꿈이 되도록 onKeyDown 을 붙이지 않는다. */}
      <div className="space-y-1 col-span-full">
        <FieldLabel htmlFor={id('memo')}>메모</FieldLabel>
        <Textarea
          id={id('memo')}
          rows={2}
          value={state.memo}
          onChange={(e) => patch({ memo: e.target.value })}
          disabled={disabled}
          placeholder="구두 계약 조건, 진행 상황 등 자유롭게 (선택)"
          className="min-h-16"
        />
      </div>
    </div>
  );
}
