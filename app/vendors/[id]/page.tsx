// 업체 수정 (기획서 10절)
import { notFound } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { VendorForm } from '@/components/vendor-form/vendor-form';
import type { VendorDTO } from '@/components/vendor-form/form-state';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const vendor = await prisma.vendor.findUnique({ where: { id: numId } });
  if (!vendor) notFound();

  const dto: VendorDTO = {
    id: vendor.id,
    category: vendor.category,
    name: vendor.name,
    contact: vendor.contact,
    businessHoursStart: vendor.businessHoursStart,
    businessHoursEnd: vendor.businessHoursEnd,
    region: vendor.region,
    address: vendor.address,
    products: vendor.products,
    description: vendor.description,
    styleMoods: vendor.styleMoods,
    options: vendor.options,
    sdingBenefit: vendor.sdingBenefit,
    categoryData: vendor.categoryData,
    photos: vendor.photos,
  };

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold tracking-tight">업체 수정</h1>
        <VendorForm vendor={dto} />
      </main>
    </>
  );
}
