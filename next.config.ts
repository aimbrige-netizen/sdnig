import type { NextConfig } from 'next';

// 업로드한 사진은 원본 그대로 보관한다(장당 3~5MB). 그걸 목록의 40px 타일이나 64px 썸네일에
// 그대로 내려받으면 사진 52장짜리 업체 화면이 25MB 를 받는다. next/image 로 감싸면 화면에
// 필요한 크기만큼만 WebP 로 변환해 내려준다 — 원본은 저장소에 그대로 두고 표시만 가벼워진다.
//
// Supabase 프로젝트 주소는 환경변수에서 가져온다. 하드코딩하면 프로젝트를 옮길 때 사진이
// 통째로 안 보이게 된다.
function supabaseImagePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const { protocol, hostname } = new URL(raw);
    return [
      {
        protocol: protocol.replace(':', '') as 'http' | 'https',
        hostname,
        pathname: '/storage/v1/object/public/**',
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...supabaseImagePattern(),
      // 영상 링크의 유튜브 썸네일
      { protocol: 'https', hostname: 'img.youtube.com', pathname: '/vi/**' },
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
    ],
    // 화면에서 쓰는 타일 크기들 — 이 목록에 있는 값으로만 변환본이 만들어진다
    imageSizes: [40, 64, 80, 96, 128, 160, 256, 384],
  },
};

export default nextConfig;
