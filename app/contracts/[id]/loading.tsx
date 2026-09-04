// 라우트 전환 중 즉시 보여주는 화면.
// 이 파일이 없으면 Next 는 서버 응답이 올 때까지 이전 화면에 머물러 "먹통"처럼 느껴진다.
import { AdminHeader } from '@/components/admin-header';
import { BrandLoader } from '@/components/brand-loader';

export default function Loading() {
  return (
    <>
      <AdminHeader />
      <main
        className="grid min-h-[80vh] w-full place-items-center px-4 py-32"
        style={{ backgroundColor: 'var(--contracts-bg)' }}
      >
        <BrandLoader size="lg" label="계약 업체 정보 불러오는 중" />
      </main>
    </>
  );
}
