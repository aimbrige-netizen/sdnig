-- 메모의 "날짜" 칸을 다음 연락 예정일로 분리합니다.
--
-- 원래 memoDate 는 메모를 남길 때마다 고르는 날짜였는데, 한 칸이 서로 반대되는 두 뜻을
-- 겸하고 있었습니다 — 미팅완료·계약완료에서는 "언제 했다"(과거), 미팅예정·재컨텍요망·
-- 장기가망에서는 "언제 할 거다"(미래). 그런데 달력과 어제/오늘 요약은 이걸 전부 "그 날
-- 활동"으로 세어서, 아직 하지도 않은 미팅이 이번 달 활동 건수에 섞여 들어갔습니다.
--
-- 이제 둘을 나눕니다:
--   활동 날짜 = createdAt      (자동, 사용자에게 묻지 않음)
--   예정일    = nextContactAt  (선택 입력, 비워둘 수 있음)

ALTER TABLE "contract_memos" ADD COLUMN "nextContactAt" DATE;

-- 기존 데이터 이관 — 적을 당시 기준으로 "미래"였던 날짜만 진짜 예정일이었습니다.
-- (입력칸 기본값이 오늘이라, 그냥 두고 저장한 메모는 memoDate = 작성일이고 예정이 아닙니다.)
-- createdAt 은 timestamp without time zone 에 UTC 로 들어 있어 KST 로 옮겨 비교합니다.
UPDATE "contract_memos"
SET "nextContactAt" = "memoDate"
WHERE "memoDate" > (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')::date;

-- memoDate 는 지우지 않습니다 — 운영 DB에 백업이 없어, 위 판정이 틀렸을 때 원본을 대조할
-- 방법이 이 컬럼뿐입니다. 새 메모는 이 칸을 채우지 않으므로 NOT NULL 제약만 풉니다.
-- (Prisma 스키마에는 남겨둡니다. 빼버리면 다음 migrate dev 가 DROP COLUMN 을 만들어냅니다.)
ALTER TABLE "contract_memos" ALTER COLUMN "memoDate" DROP NOT NULL;

-- 활동 조회가 memoDate 에서 createdAt 으로 옮겨갑니다. 기존 인덱스는
-- (contractedVendorId, createdAt) 이라 선행 컬럼이 달라 createdAt 단독 범위 스캔에 못 씁니다.
CREATE INDEX "contract_memos_createdAt_idx" ON "contract_memos"("createdAt");
CREATE INDEX "contract_memos_nextContactAt_idx" ON "contract_memos"("nextContactAt");

-- memoDate 인덱스는 이제 어떤 쿼리도 쓰지 않습니다. 인덱스는 데이터가 아니라 언제든 다시
-- 만들 수 있으므로 지웁니다(위 UPDATE 가 이미 끝난 뒤라 이관에도 영향이 없습니다).
DROP INDEX "contract_memos_memoDate_idx";
