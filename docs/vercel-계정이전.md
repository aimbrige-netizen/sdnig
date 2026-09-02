# Vercel만 회사 계정으로 옮기기

GitHub 저장소와 Supabase 프로젝트는 **건드리지 않는다.** 코드도 DB도 사진도 그대로 둔다.
Vercel 프로젝트만 회사 계정에서 새로 만들고, 개인 계정 것을 버린다.

Vercel 의 "프로젝트 이전(Transfer)" 기능은 쓰지 않는다. 그 기능은 양쪽 팀에 모두 소속돼야 하는데
회사 계정은 별도 로그인이고, 무료로는 팀을 만들 수 없어서 경로가 막힌다.
대신 **새로 만들어서 갈아끼운다.** Vercel 이 실제로 들고 있는 건 환경변수 7개와 프로젝트 이름뿐이다.

## 사전 확인 (완료)

| 항목 | 확인 결과 |
|---|---|
| 배포된 코드 | 커밋 `1b55d02` = GitHub `origin/main` — 드리프트 없음 |
| 저장소 | `rnjsxogud0614-collab/sdnig`, **public** → 어느 Vercel 계정이든 import 가능 |
| 도메인 | `sdnig.vercel.app` 하나. 커스텀 도메인 없음 |
| 환경변수 | 7개, 전부 production |
| Vercel Integration | 없음 (Supabase 는 환경변수로 직접 연결) |

---

## 환경변수 7개 — 어디서 가져오는가

| 변수 | 조달 방법 |
|---|---|
| `ADMIN_PASSWORD` | `1111` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jypyhiylzwhdkzicfrbi.supabase.co` |
| `SUPABASE_STORAGE_BUCKET` | `vendor-photos` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` 복사 |
| `MAINTENANCE_TOKEN` | 개인 Vercel 화면에서 값이 그대로 보인다(sensitive 아님). **아무 랜덤 문자열로 새로 만들어도 무방** — 고아 파일 정리 API 를 막는 용도뿐이라 기존 값과 같을 필요가 없다 |
| `DATABASE_URL` | DB 비밀번호 필요 → **1단계** |
| `DIRECT_URL` | DB 비밀번호 필요 → **1단계** |

---

## 1단계 — DB 비밀번호 재설정 (단독으로, 다른 날에)

**왜 필요한가:** `DATABASE_URL`/`DIRECT_URL` 안에 든 DB 비밀번호를 아무도 모른다.
Vercel 에 sensitive 로 저장돼 있어 되읽을 수 없다. 새 프로젝트에 넣을 값이 없으므로 재설정이 유일한 방법이다.

**이 단계가 이 계획에서 유일하게 사이트가 죽는 구간이다.** 재설정하는 순간 현재 배포의 DB 연결이 끊긴다.
복구까지 5~10분 걸리므로(빌드에 마이그레이션이 포함됨) 문의가 없는 시간대에 한다.
**2·3단계와 절대 같은 날에 하지 않는다.** 문제가 생겼을 때 원인을 구분할 수 없게 된다.

1. Supabase → Settings → Database → **Reset database password** → 새 비밀번호를 안전한 곳에 저장
2. 같은 화면의 **Connection string 을 통째로 복사**한다. `.env.example` 을 보고 손으로 조립하지 말 것 —
   풀러 호스트명(`aws-0`/`aws-1`, 리전 표기)은 프로젝트마다 다르고 시간이 지나며 바뀐다.
   - **Transaction pooler (포트 6543)** → `DATABASE_URL`. 끝에 `?pgbouncer=true` 가 붙어야 한다
   - **Direct / Session (포트 5432)** → `DIRECT_URL`
   - 둘을 바꿔 넣으면 마이그레이션이 실패한다
3. 개인 Vercel → sdnig → Settings → Environment Variables → 두 값을 갱신
4. Deployments → 최신 배포 → **Redeploy**
5. 사이트 확인: 로그인 → 업체 목록 → 사진 표시

여기서 멈춘다. 정상으로 돌아온 걸 확인하고 하루 넘긴다.

---

## 2단계 — 회사 계정에 새 프로젝트 만들기 (무중단)

이 단계 내내 기존 `sdnig.vercel.app` 은 그대로 살아 있다. 새 것이 확실히 되는 걸 본 뒤에 갈아끼운다.

1. 회사 계정으로 Vercel 로그인 → **Add New → Project**
2. 저장소 연결 — **아래 배포 방식 참고**
3. 프로젝트 이름은 일단 `sdnig-admin` 같은 **임시 이름**으로 둔다 (3단계에서 바꾼다)
4. 환경변수 7개를 **Production** 대상으로 입력
5. Deploy

### 배포 방식 두 가지

**A. GitHub 연결 (편하다)** — push 만으로 배포된다. 다만 Hobby 플랜에는 제약이 있다:
- Hobby 팀 프로젝트는 **GitHub 조직(Organization) 소유 저장소에 연결할 수 없다.**
  지금 저장소는 개인 계정 소유라 해당되지 않지만, 나중에 GitHub 를 회사 org 로 옮기면 그때 막힌다
- Hobby 는 private 저장소 협업을 지원하지 않는다. 지금은 public 이라 괜찮지만, private 으로 바꾸면 문제가 된다
- 커밋 작성자와 팀 소유자가 다르면 배포가 거부될 수 있다

**B. CLI 배포 (확실하다)** — 지금까지 써온 방식 그대로다. Git 연결 제약을 전부 우회한다.
```bash
npx vercel login          # 회사 계정으로 로그인
npx vercel link           # 새 프로젝트에 연결
npx vercel --prod
```
A 가 막히면 B 로 간다. B 는 지금 동작이 증명된 경로다.

### 검증 — 이게 이 계획에서 제일 중요하다

**"사이트가 뜨니까 됐다"는 통하지 않는다.** 코드에 폴백 기본값이 실제 운영값과 같게 박혀 있어서,
환경변수 2개가 통째로 없어도 사이트가 완전히 정상으로 보인다.

```
lib/auth.ts:10      process.env.ADMIN_PASSWORD || '1111'
lib/storage.ts:8    process.env.SUPABASE_STORAGE_BUCKET || 'vendor-photos'
```

그래서 다음 세 가지를 각각 확인한다.

1. **키 이름 세기** — Settings → Environment Variables 에서 7개가 실제로 목록에 있는지 눈으로 센다.
   특히 `ADMIN_PASSWORD` 와 `SUPABASE_STORAGE_BUCKET` 은 기능 테스트로 절대 잡히지 않으니 이름을 개별 확인한다
2. **사진이 실제로 렌더되는지** — 임시 주소 접속 → 업체 상세 → F12 → Network 탭에서
   `/_next/image?...` 요청이 **200** 인지 본다. **400 이면** 원인은 DB 도 Storage 도 아니고
   빌드 시점의 `NEXT_PUBLIC_SUPABASE_URL` 이다 (`next.config.ts:11` 이 값이 없으면 조용히 빈 배열을 반환해서
   빌드는 성공하고 사진만 전부 깨진다)
3. **업로드 한 장** — 사진 1장 올려보고 지운다. `SUPABASE_SERVICE_ROLE_KEY` 는 이걸로만 검증된다

---

## 3단계 — 주소 갈아끼우기 (선택)

새 주소를 그냥 쓸 거면 이 단계는 건너뛴다. `sdnig.vercel.app` 을 지키고 싶을 때만 한다.

`.vercel.app` 주소는 프로젝트 이름에서 나오고 **전역 선착순**이라, 같은 이름을 두 프로젝트가 동시에 가질 수 없다.
그래서 옛것에서 이름을 뗀 뒤 새것에 붙인다. **두 작업을 연달아, 쉬지 않고 한다.**

1. 개인 Vercel → sdnig → Settings → General → Project Name 을 `sdnig-old` 로 변경
2. **즉시** 회사 Vercel → 새 프로젝트 → Project Name 을 `sdnig` 로 변경
3. `https://sdnig.vercel.app` 접속 확인
4. 2번이 "이름을 쓸 수 없다"고 거부하면 1번을 되돌리고(다시 `sdnig`) 잠시 뒤 재시도한다

이름을 뗀 직후 잠깐 무주공산이 되므로 이 사이가 짧을수록 좋다. 두 브라우저 탭을 미리 각각 열어두고 진행한다.

---

## 4단계 — 정리

1. 며칠 지켜본 뒤 개인 계정의 `sdnig-old` 프로젝트 삭제
2. 로컬 작업 디렉터리 재연결
   ```bash
   rm -rf .vercel && npx vercel link
   ```
   `.vercel/project.json` 의 `orgId` 가 개인 팀을 가리키고 있어서 그대로 두면 옛 프로젝트로 배포된다
3. 개인 계정에서 발급한 배포 토큰이 있으면 폐기

---

## 알아둘 것

**빌드가 운영 DB 를 건드린다.** `package.json` 의 `"build": "prisma migrate deploy && next build"` 라서,
새 프로젝트의 첫 빌드도 `next build` 전에 같은 Supabase DB 에 마이그레이션을 적용한다.
지금 마이그레이션 5개는 모두 적용이 끝나 있어 실제로는 아무것도 하지 않고 지나간다(no-op).
다만 "새 Vercel 프로젝트니까 DB 와 무관하다"는 생각은 틀렸다 — 새것도 옛것도 **같은 DB 하나**를 본다.
그래서 2단계 동안 두 프로젝트가 동시에 같은 DB 를 바라보는 상태가 되는데, 읽기·쓰기 모두 정상 동작한다.

**되돌리기.** 3단계 전까지는 모두 되돌릴 수 있다 — 기존 사이트를 그대로 두고 새것만 만드는 것이기 때문이다.
되돌릴 수 없는 유일한 것은 1단계의 DB 비밀번호 재설정인데, 이것도 다시 재설정하면 된다.

**Hobby 플랜 제약은 그대로다.** 회사 계정도 Hobby 이므로 비상업적·개인 용도 제한은 지금과 동일하게 적용된다.
바뀌는 것은 계정 주체이지 플랜이 아니다.

**GitHub·Supabase 는 여전히 개인 소유다.** 이번 작업은 Vercel 만 옮긴다.
나중에 GitHub 를 회사 조직으로 옮기면 Hobby 의 "조직 저장소 연결 불가" 제약에 걸리므로,
그때는 CLI 배포로 가거나 Pro 를 검토해야 한다.
