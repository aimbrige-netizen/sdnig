// 라우트 전환 중 즉시 보여주는 화면.
// 이 파일이 없으면 Next 는 서버 응답이 올 때까지 이전 화면에 머물러 "먹통"처럼 느껴진다.
import { AdminHeader } from '@/components/admin-header';
import { BrandLoader } from '@/components/brand-loader';

export default function Loading() {
  return (
    <>
      <AdminHeader />
      <main className="mx-auto grid max-w-6xl place-items-center px-4 py-32">
        <BrandLoader size="lg" label="업체 등록 화면 준비 중" />
      </main>
    </>
  );
}
