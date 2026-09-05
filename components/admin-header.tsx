'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: '대시보드' },
  { href: '/vendors', label: '업체 리스트' },
  { href: '/contracts', label: '계약 업체 DB' },
] as const;

export function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // 좁은 화면에서는 메뉴가 가로로 넘쳐 현재 페이지 항목이 잘릴 수 있어,
  // 진입 시 활성 항목이 보이도록 스크롤합니다.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-shell items-center justify-between gap-3 px-4">
        {/* 메뉴가 늘어나도 좁은 화면에서 글자가 세로로 쪼개지지 않도록,
            로고/버튼은 고정 폭을 지키고 메뉴만 가로 스크롤되게 합니다. */}
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Sding" className="h-6 w-auto" />
            <span className="hidden text-sm font-medium text-neutral-500 sm:inline">B2B 업체 관리</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const isActive =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  /* 현재 페이지를 가리키는 링크는 프리페치하지 않는다.
                     저장(서버 액션)으로 갱신된 화면을, 뒤늦게 도착한 "저장 전" 프리페치
                     응답이 덮어써 목록이 갱신되지 않는 문제가 있었다. */
                  prefetch={isActive ? false : undefined}
                  ref={isActive ? activeRef : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-all duration-200',
                    isActive
                      ? 'bg-neutral-900 font-medium text-white shadow-sm'
                      : 'text-neutral-500 hover:bg-neutral-900/5 hover:text-neutral-900'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="shrink-0">
          로그아웃
        </Button>
      </div>
    </header>
  );
}
