// 비밀번호 쿠키 체크 (기획서 11절의 middleware 역할 — Next.js 16에서는 proxy로 명칭 변경)
// 쿠키가 없거나 잘못되면 /login 으로 리다이렉트합니다.
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, isValidAuthToken } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (await isValidAuthToken(token)) {
    return NextResponse.next();
  }

  // API 요청은 리다이렉트 대신 401 JSON 응답
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // API는 확장자 예외 없이 항상 인증 검사.
    // 아래 페이지용 패턴의 이미지 확장자 예외는 "확장자로 끝나는 모든 경로"에 걸리기 때문에
    // /api/contracts/1.png 같은 요청이 인증을 건너뛰고 라우트 핸들러까지 도달할 수 있다.
    '/api/((?!auth/login).*)',
    // 페이지: 로그인 화면·정적 자산·로컬 업로드 파일은 인증 제외
    '/((?!login|api/|uploads/|_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)',
  ],
};
