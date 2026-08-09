import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { contractPayloadSchema } from '@/lib/contract-schema';

// 계약 업체 등록
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const parsed = contractPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값을 확인해주세요.', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const created = await prisma.contractedVendor.create({
    data: {
      name: data.name,
      contractType: data.contractType,
      phone: data.phone,
      address: data.address,
      managerName: data.managerName,
    },
  });

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
