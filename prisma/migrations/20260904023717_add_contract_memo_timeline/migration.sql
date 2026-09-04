-- CreateTable
CREATE TABLE "contract_memos" (
    "id" SERIAL NOT NULL,
    "contractedVendorId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "memoDate" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_memos_contractedVendorId_createdAt_idx" ON "contract_memos"("contractedVendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "contract_memos" ADD CONSTRAINT "contract_memos_contractedVendorId_fkey" FOREIGN KEY ("contractedVendorId") REFERENCES "contracted_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- contracted_vendors 와 동일한 안전장치: Supabase는 public 스키마 테이블을 PostgREST로 자동 노출하므로
-- RLS를 켜 anon/authenticated 키로는 접근이 전부 차단되게 한다.
-- 이 앱(Prisma, 테이블 소유자 계정 직결)은 영향을 받지 않는다.
ALTER TABLE "contract_memos" ENABLE ROW LEVEL SECURITY;

-- 기존 자유 기록 메모를 새 타임라인의 첫 기록으로 옮긴다 (데이터 유실 방지).
-- status 는 이 개념이 생기기 전에 쓰인 메모라 어느 단계인지 알 수 없으므로,
-- 가장 안전한 기본값인 '재컨텍요망(recontact)' 으로 둔다 — 담당자가 다시 확인해야 할 항목으로
-- 남겨 묻히지 않게 한다. 날짜는 마지막으로 수정된 시점을 그대로 쓴다.
INSERT INTO "contract_memos" ("contractedVendorId", "status", "memoDate", "content", "createdAt")
SELECT "id", 'recontact', "updatedAt"::date, trim("memo"), "updatedAt"
FROM "contracted_vendors"
WHERE "memo" IS NOT NULL AND trim("memo") <> '';

-- AlterTable
ALTER TABLE "contracted_vendors" DROP COLUMN "memo";
