import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { contractPayloadSchema } from '@/lib/contract-schema';

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const numId = Number(id);
  return Number.isInteger(numId) && numId > 0 ? numId : null;
}

// 계약 업체 수정
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context.params);
  if (!id) return NextResponse.json({ error: '잘못된 업체 ID입니다.' }, { status: 400 });

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
  try {
    await prisma.contractedVendor.update({
      where: { id },
      data: {
        name: data.name,
        contractType: data.contractType,
        phone: data.phone,
        address: data.address,
        managerName: data.managerName,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 업체입니다.' }, { status: 404 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, id });
}

// 계약 업체 삭제
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context.params);
  if (!id) return NextResponse.json({ error: '잘못된 업체 ID입니다.' }, { status: 400 });

  try {
    await prisma.contractedVendor.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 업체입니다.' }, { status: 404 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
