# 스딩(SDING) B2B 웨딩업체 데이터 수집 도구

스딩 앱에 입점할 B2B 웨딩업체 정보를 임시로 모아두는 팀 내부용 어드민입니다.
상세 스펙은 [PLANNING.md](./PLANNING.md) 참고.

- **로그인**: 비밀번호 1개 (`ADMIN_PASSWORD` 환경변수, 기본값 `1111`)
- **업체 리스트**: 업종 필터 14개 + 전체, 지역(시/도-구/군) 필터, 최신순/이름순 정렬, 카드/리스트 보기 전환, 등록일 표시
- **업체 등록/수정**: [공통정보] [업종별 정보] [사진관리] 3개 탭, 업종별 필드 동적 렌더링
  (영상(DVD) 업종에서는 세 번째 탭이 [사진·영상 관리])
- **사진**: 대표사진 1장 필수 + 갤러리 다중 업로드 + 드레스 업종은 장별 라벨
- **영상**: 영상(DVD) 업종은 샘플 영상 업로드 (제목·순서 지정, 개당 최대 50MB)

## 기술 스택

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Prisma 6 + PostgreSQL (Supabase)
- Supabase Storage (사진·영상) — 미설정 시 로컬 `.uploads/` 폴백
- 인증: `proxy.ts`(구 middleware)에서 쿠키 확인

## 로컬 개발

Node.js 20.9 이상이 필요합니다 (22 권장).

### 배포 환경 값을 그대로 쓰기 (가장 간단)

```bash
npm install
npx vercel login
npx vercel link                  # 기존 sdnig 프로젝트에 연결
npx vercel env pull .env.local   # 환경변수 6개가 자동으로 채워짐
npm run dev                      # http://localhost:3000
```

**주의**: 이 방식은 운영 DB·운영 Storage에 그대로 연결됩니다. 로컬 화면에서 업체를
삭제하면 실제로 삭제되고, 사진 파일까지 함께 지워집니다.

### 완전히 분리된 개발 환경

로컬 PostgreSQL을 쓰고 Supabase 변수를 비워두면 운영 데이터와 격리됩니다.

```bash
npm install
cp .env.example .env
# .env 에서 DATABASE_URL/DIRECT_URL 을 로컬 주소로 바꾸고
# NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 비워둡니다
npx prisma migrate dev           # 테이블 생성
npm run dev
```

Supabase 환경변수가 없으면 사진·영상은 프로젝트의 `.uploads/` 폴더에 저장되고
`/uploads/...` 라우트가 서빙합니다(개발용). 배포 환경에서는 Supabase Storage가 필요합니다.

## 환경변수 (.env)

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Supabase Transaction pooler 주소 (포트 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Supabase Direct 주소 (포트 5432, 마이그레이션용) |
| `ADMIN_PASSWORD` | 로그인 비밀번호 (기본 1111) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 (서버 전용, 비공개) |
| `SUPABASE_STORAGE_BUCKET` | 사진·영상 버킷 이름 (기본 `vendor-photos`, **public 버킷**으로 생성) |
| `MAINTENANCE_TOKEN` | (선택) 고아 파일 정리 경로의 추가 비밀값. 없으면 그 경로는 404 |

## 사진·영상 업로드

파일은 서버를 거치지 않고 **브라우저에서 Supabase Storage로 직접** 올라갑니다.
`/api/upload-url` 이 1회용 서명 URL(2시간 유효)만 발급하고, 파일 자체는 그 URL로 곧장
전송됩니다. 서버를 경유하면 Vercel 함수의 요청 본문 제한(약 4.5MB)에 걸려 원본 사진과
영상을 올릴 수 없고, 같은 파일이 두 번 이동해 느려집니다.

- **압축하지 않고 원본 그대로 보관**합니다. 표시용 축소본이 필요해지면 원본에서 만들 수 있지만,
  줄여서 올리면 되돌릴 수 없기 때문입니다.
- **파일 1개 최대 50MB** (`MAX_UPLOAD_BYTES`). Supabase 무료 플랜의 파일당 상한이며,
  프로덕션에서 실측한 값입니다 — 52,428,800바이트는 성공, 52,428,801바이트는
  `The object exceeded the maximum allowed size` 로 거부됩니다. 플랜을 올리면 확장 가능하며
  그때 이 상수도 함께 올려야 합니다.
- 허용 형식: 이미지 `jpeg/png/webp/gif/avif`, 영상 `mp4/quicktime(mov)/webm/x-m4v`
- 동시 업로드는 사진 4개, 영상 2개(파일이 커서 회선을 다 먹지 않도록)
- 크롬은 `.mov` 컨테이너를 재생하지 못합니다(사파리는 가능). 저장은 정상이며 미리보기만
  대체 안내로 바뀝니다.

### 파일 정리

업체를 삭제하거나 사진·영상을 뺀 채 저장하면 Storage 파일도 함께 삭제됩니다.
사진 URL은 `photos` 뿐 아니라 `products[].photos` 등 여러 자리에 들어가므로,
필드를 열거하지 않고 레코드 전체를 훑는 `collectBucketPaths()` 로 찾습니다.

파일은 고르는 즉시 업로드되므로, 저장하지 않고 나가면 DB에 기록 없는 파일이 남습니다.
`/api/maintenance/orphans` 가 버킷 전체와 DB 참조를 대조해 그런 파일만 정리합니다
(GET = 미리보기, DELETE + `confirm=1` = 실제 삭제). 로그인 위에 `MAINTENANCE_TOKEN`
환경변수를 하나 더 요구하며, 그 값이 없으면 경로 자체가 404입니다.

## 배포 (Vercel)

`npm run build`가 `prisma migrate deploy && next build`로 구성되어 있어서,
Vercel이 빌드할 때 테이블 생성/마이그레이션까지 자동으로 실행됩니다.
터미널에서 따로 마이그레이션 명령을 실행할 필요가 없습니다.

1. Vercel에서 이 저장소 import (저장소 루트가 프로젝트 루트입니다)
2. 위 환경변수 등록
3. Supabase Storage에 `vendor-photos` **public 버킷** 생성
4. **Deploy** 클릭 — 빌드 로그에 마이그레이션 적용 결과가 표시됩니다

`vercel.json` 에서 함수 리전을 `icn1`(서울)로 고정합니다. Supabase 프로젝트가
`ap-northeast-2`(서울)에 있어서, 기본값인 미국 리전을 쓰면 업로드마다 태평양을
왕복해 사진 1장당 1.4~2.4초가 더 걸립니다.

## 폴더 구조

```
app/
  login/                # 비밀번호 로그인
  vendors/              # 리스트(업종 필터) / new 등록 / [id] 수정
  contracts/            # 계약 업체 DB (구두/서면 계약 명단)
  api/                  # auth, vendors CRUD, upload, upload-url, maintenance
  uploads/[...path]/    # 로컬 폴백 사진 서빙 (Supabase 미설정 시)
components/
  vendor-form/          # 3탭 폼, 업종별 동적 필드, 사진 업로더 등
  ui/                   # shadcn/ui
lib/
  constants.ts          # 카테고리 14종 코드 상수
  category-fields.ts    # 업종별 전용 필드 정의 (폼+검증의 단일 소스)
  category-schema.ts    # 필드 정의 → zod 스키마 생성
  vendor-schema.ts      # 업체 페이로드 zod 검증 (클라·서버 공용)
  regions.ts            # 시/도-구/군 지역 데이터
  storage.ts            # Supabase Storage 서명 업로드 URL 발급 / 파일 삭제 / 로컬 폴백
prisma/
  schema.prisma         # vendors, contracted_vendors
proxy.ts                # 비밀번호 쿠키 체크 (구 middleware)
```
