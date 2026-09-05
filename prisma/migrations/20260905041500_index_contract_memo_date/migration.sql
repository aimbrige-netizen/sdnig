-- 목록 화면의 캘린더(한 장 = 42일치), 어제·오늘 활동 요약, 날짜 보기가 전부
-- memoDate 범위로 조회한다. 기존 인덱스는 (contractedVendorId, createdAt) 뿐이라
-- 이 조회들은 매번 풀스캔이었다.
--
-- CONCURRENTLY 를 쓰지 않는 이유: Prisma 마이그레이션은 트랜잭션 안에서 실행되는데
-- CREATE INDEX CONCURRENTLY 는 트랜잭션 안에서 못 돈다. 이 테이블은 규모가 작아
-- 짧은 쓰기 잠금으로 충분하다.
CREATE INDEX "contract_memos_memoDate_idx" ON "contract_memos"("memoDate");
