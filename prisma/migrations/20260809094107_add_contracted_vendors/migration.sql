-- CreateTable
CREATE TABLE "contracted_vendors" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "managerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracted_vendors_pkey" PRIMARY KEY ("id")
);

-- vendors 와 동일한 안전장치: Supabase는 public 스키마 테이블을 PostgREST로 자동 노출하므로
-- RLS를 켜 anon/authenticated 키로는 접근이 전부 차단되게 한다.
-- 이 앱(Prisma, 테이블 소유자 계정 직결)은 영향을 받지 않는다.
ALTER TABLE "contracted_vendors" ENABLE ROW LEVEL SECURITY;
