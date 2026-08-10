// 스딩 로고 둘레를 빛이 도는 로딩 표시.
// 서버 컴포넌트에서도 쓸 수 있게 클라이언트 훅을 쓰지 않습니다.
import { cn } from '@/lib/utils';

const SIZES = {
  sm: { box: 40, logo: 'h-3.5' },
  md: { box: 64, logo: 'h-5' },
  lg: { box: 92, logo: 'h-7' },
} as const;

interface BrandLoaderProps {
  size?: keyof typeof SIZES;
  /** 진행 상황 문구 — 스크린리더에도 그대로 전달됩니다 */
  label?: string;
  className?: string;
}

export function BrandLoader({ size = 'md', label = '불러오는 중', className }: BrandLoaderProps) {
  const s = SIZES[size];
  return (
    <div className={cn('flex flex-col items-center gap-3', className)} role="status" aria-live="polite">
      <div className="relative grid place-items-center" style={{ width: s.box, height: s.box }}>
        {/* 회전하는 빛 링 */}
        <div className="brand-ring absolute inset-0" />
        {/* 링 안쪽 은은한 바탕 */}
        <div className="absolute inset-[6px] rounded-full bg-white" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" aria-hidden className={cn('relative w-auto', s.logo)} />
      </div>
      {/* 문구가 있으면 그대로 읽히고, 없으면(인라인 소형) 최소한의 상태만 알린다 */}
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : <span className="sr-only">처리 중</span>}
    </div>
  );
}

/** 화면 전체를 덮는 로딩 오버레이 — 저장처럼 결과를 기다려야 하는 동작에 사용 */
export function BrandLoaderOverlay({ label = '저장 중' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-white/70 backdrop-blur-sm">
      <BrandLoader size="lg" label={label} />
    </div>
  );
}
