// 업체 등록 (기획서 10절)
import { AdminHeader } from '@/components/admin-header';
import { VendorForm } from '@/components/vendor-form/vendor-form';

export default function NewVendorPage() {
  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold tracking-tight">새 업체 등록</h1>
        <VendorForm />
      </main>
    </>
  );
}
