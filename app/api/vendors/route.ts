import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { vendorPayloadSchema } from '@/lib/vendor-schema';

// 업체 등록
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const parsed = vendorPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값을 확인해주세요.', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const vendor = await prisma.vendor.create({
    data: {
      category: data.category,
      name: data.name,
      authorName: data.authorName,
      contact: data.contact,
      businessHoursStart: data.businessHoursStart,
      businessHoursEnd: data.businessHoursEnd,
      region: data.region,
      address: data.address,
      products: data.products as Prisma.InputJsonValue,
      description: data.description,
      styleMoods: data.styleMoods,
      options: data.options as Prisma.InputJsonValue,
      sdingBenefit: data.sdingBenefit,
      categoryData: data.categoryData as Prisma.InputJsonValue,
      photos: data.photos as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, id: vendor.id }, { status: 201 });
}
