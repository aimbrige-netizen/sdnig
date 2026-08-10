// 라우트 전환 중 즉시 보여주는 화면.
// 이 파일이 없으면 Next 는 서버 응답이 올 때까지 이전 화면에 머물러 "먹통"처럼 느껴진다.
// 최상위 경계라 어느 페이지로 이동하든 여기가 뜨므로 문구는 일반적으로 둔다.
import { AdminHeader } from '@/components/admin-header';
import { BrandLoader } from '@/components/brand-loader';

export default function Loading() {
  return (
    <>
      <AdminHeader />
      <main className="mx-auto grid max-w-6xl place-items-center px-4 py-32">
        <BrandLoader size="lg" label="불러오는 중" />
      </main>
    </>
  );
}
