import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { vendorPayloadSchema } from '@/lib/vendor-schema';
import { collectBucketPaths, deleteObjectPaths } from '@/lib/storage';

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const numId = Number(id);
  return Number.isInteger(numId) && numId > 0 ? numId : null;
}

/**
 * 사진 파일 정리 — 실패해도 업체 삭제/수정 자체는 성공으로 둔다.
 * (파일이 남는 것보다 업체 작업이 실패하는 쪽이 사용자에게 더 나쁘다.
 *  남은 파일은 /api/maintenance/orphans 로 나중에 정리할 수 있다.)
 */
async function cleanUpFiles(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await deleteObjectPaths(paths);
  } catch (e) {
    console.error('[vendors] 사진 파일 정리 실패:', e);
  }
}

// 업체 수정
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context.params);
  if (!id) return NextResponse.json({ error: '잘못된 업체 ID입니다.' }, { status: 400 });

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
  // 수정 전 사진 목록을 미리 확보해 둔다 — 저장 후 빠진 사진의 파일을 지우기 위해서다.
  // (폼에서 X 를 누른 시점이 아니라 저장이 확정된 뒤에 지워야 취소가 가능하다)
  const before = await prisma.vendor.findUnique({ where: { id } });

  try {
    await prisma.vendor.update({
      where: { id },
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
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 업체입니다.' }, { status: 404 });
    }
    throw e;
  }

  // 저장이 끝난 뒤, 이번 수정으로 빠진 사진 파일을 정리한다.
  // 사진 URL 은 photos 말고 products[].photos 등에도 들어가므로 레코드 전체를 훑는다.
  const kept = collectBucketPaths(data);
  const removed = [...collectBucketPaths(before)].filter((p) => !kept.has(p));
  await cleanUpFiles(removed);

  return NextResponse.json({ ok: true, id });
}

// 업체 삭제
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await parseId(context.params);
  if (!id) return NextResponse.json({ error: '잘못된 업체 ID입니다.' }, { status: 400 });

  // 삭제되면 읽을 수 없으므로 지우기 전에 레코드 전체를 확보한다
  const target = await prisma.vendor.findUnique({ where: { id } });

  try {
    await prisma.vendor.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: '존재하지 않는 업체입니다.' }, { status: 404 });
    }
    throw e;
  }

  // 업체가 사라졌으니 그 업체 사진도 저장소에서 지운다 (남으면 용량만 차지한다)
  await cleanUpFiles([...collectBucketPaths(target)]);

  return NextResponse.json({ ok: true });
}
