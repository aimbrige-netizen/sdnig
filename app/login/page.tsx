'use client';

// 로그인 (기획서 10절 — 비밀번호 입력 필드 1개 + 확인 버튼, 아이디 없음)
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error ?? '로그인에 실패했습니다.');
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* 배경 장식 — 은은한 브랜드 그라데이션 블러 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: 'linear-gradient(135deg, var(--brand-from), var(--brand-to))' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-[12%] h-72 w-72 rounded-full opacity-15 blur-3xl"
        style={{ background: 'linear-gradient(135deg, var(--brand-to), var(--brand-from))' }}
      />

      <Card className="animate-fade-up w-full max-w-sm rounded-2xl shadow-lift">
        <CardHeader className="text-center">
          <div aria-hidden className="bg-brand-gradient mx-auto mb-2 h-9 w-9 rounded-xl shadow-sm" />
          <CardTitle className="text-xl font-bold tracking-tight">스딩 B2B 업체 관리</CardTitle>
          <CardDescription>비밀번호를 입력해주세요</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              aria-label="비밀번호"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || password.length === 0}>
              {loading ? '확인 중...' : '확인'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
