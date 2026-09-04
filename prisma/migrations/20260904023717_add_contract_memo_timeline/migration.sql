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
--
-- "updatedAt"::date 로 그냥 자르면 안 된다 — updatedAt 은 타임존 없는 컬럼이지만 실제로는
-- UTC 시각이 그대로 들어있어서(이 앱이 UTC로 쓰고 읽는다), 그대로 자르면 UTC 기준 날짜가 된다.
-- 화면은 항상 KST(UTC+9)로 날짜를 보여주므로, UTC 15:00~23:59(KST 자정~오전 9시)에 마지막으로
-- 수정된 업체는 하루 이른 날짜로 이관되어 버린다 — AT TIME ZONE 으로 KST 벽시계 시각으로 바꾼
-- 뒤에 날짜만 취한다.
--
-- trim("memo") 도 그대로 쓰면 안 된다 — Postgres trim() 은 스페이스만 지우고 개행·탭은 남기는데,
-- 이 앱이 실제로 쓰는 검증(lib/contract-schema.ts, z.string().trim())은 JS String.trim() 이라
-- 개행·탭까지 전부 지운다. 두 기준이 다르면 개행/탭만 있던 옛 메모가 "빈 값이 아님"으로 오판돼
-- 내용 없는 메모 카드로 이관된다 — regexp_replace 로 JS trim() 과 같은 공백 문자 집합을 지운다.
INSERT INTO "contract_memos" ("contractedVendorId", "status", "memoDate", "content", "createdAt")
SELECT
  "id",
  'recontact',
  ((("updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::date),
  regexp_replace("memo", '^\s+|\s+$', '', 'g'),
  "updatedAt"
FROM "contracted_vendors"
WHERE "memo" IS NOT NULL AND regexp_replace("memo", '^\s+|\s+$', '', 'g') <> '';

-- AlterTable
ALTER TABLE "contracted_vendors" DROP COLUMN "memo";
