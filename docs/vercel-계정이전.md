# Vercel 계정 이전 체크리스트 (개인 → 회사)

지금 sdnig 는 개인 Hobby 계정(`taehyeungs-projects`)에 올라가 있고, 비용도 개인이 부담하고 있다.
이걸 회사 Vercel 팀으로 통째로 옮기는 절차다.

- 프로젝트: `sdnig` / `prj_nyia86ZnmOFw2x4XFdXrhhOhLefj`
- 현재 소속: `team_NwvApEkfBQULVxjN4dU7Tue0` (개인 Hobby)
- 도메인: `sdnig.vercel.app` (커스텀 도메인 없음)
- 배포 방식: Git 연결 없음, CLI(`vercel --prod`) 로만 배포
- 환경변수: 7개 (전부 production)

> 참고: Vercel Hobby 플랜은 약관상 **비상업·개인 용도 전용**이다.
> 회사 업무용 어드민은 Pro 이상이 필요하므로, 이 이전은 비용 문제이기도 하지만 약관상으로도 맞는 방향이다.

---

## 0. 시작 전 — 값 확보 (제일 중요)

이전하면 환경변수는 **복사되어 따라온다**(Vercel 공식 문서 기준, 예외는 `vercel.json` 의 `env`/`build.env` 뿐인데
이 프로젝트 `vercel.json` 에는 `regions` 만 있으므로 해당 없음).

그래도 7개 중 6개가 `sensitive` 타입이라 **화면에서도 CLI 로도 값을 다시 볼 수 없다.**
만에 하나 안 넘어갔을 때를 대비해, 각 값의 출처를 정리해두면 전부 복구 가능하다.

| 환경변수 | 타입 | 복구 방법 |
|---|---|---|
| `ADMIN_PASSWORD` | sensitive | 알고 있음 → `1111` |
| `NEXT_PUBLIC_SUPABASE_URL` | sensitive | `https://jypyhiylzwhdkzicfrbi.supabase.co` |
| `SUPABASE_STORAGE_BUCKET` | sensitive | `vendor-photos` |
| `SUPABASE_SERVICE_ROLE_KEY` | sensitive | Supabase → Settings → API → `service_role` 다시 복사 |
| `MAINTENANCE_TOKEN` | encrypted | Vercel 화면에서 값이 그대로 보임 (sensitive 아님) |
| `DATABASE_URL` | sensitive | **DB 비밀번호를 모름** → 아래 참고 |
| `DIRECT_URL` | sensitive | **DB 비밀번호를 모름** → 아래 참고 |

### DB 비밀번호 (유일하게 손에 없는 값)

Supabase DB 비밀번호는 저장해둔 게 없다. 다만 **재설정하면 되므로 영구 손실은 아니다.**
Supabase → Settings → Database → *Reset database password* 로 새로 발급받고, 아래 형식으로 다시 만들면 된다.

```
DATABASE_URL = postgresql://postgres.jypyhiylzwhdkzicfrbi:<새비번>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL   = postgresql://postgres.jypyhiylzwhdkzicfrbi:<새비번>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

**권장(보험):** 이전을 시작하기 *전에* 비밀번호를 미리 재설정하고, 그 값으로 현재 프로젝트의
`DATABASE_URL`/`DIRECT_URL` 을 갱신 → 재배포 → 사이트 정상 확인까지 해둔다.
그러면 이전 결과가 어떻든 모든 값을 손에 쥔 상태가 된다.
(비밀번호를 바꾸는 순간 기존 연결이 끊기므로, 반드시 Vercel 환경변수 갱신 + 재배포를 같이 해야 한다.)

---

## A. 회사 계정 쪽에서 먼저 할 일 (여기가 안 되면 이전 자체를 시작할 수 없음)

Vercel 이전은 **한 사람이 보내는 쪽과 받는 쪽 양쪽에 모두 소속돼 있어야** 실행된다.
개인 계정 → 다른 사람의 개인 계정으로는 못 옮긴다. 반드시 회사 **팀(Team)** 이 있어야 한다.

1. **회사 Vercel 팀 생성** — 회사 이메일 계정으로 로그인 → Create Team
2. **Pro 플랜 전환** — 협업(멤버 초대)은 Pro 이상 전용. 계정당 1회 **14일 무료 트라이얼**이 있으니 먼저 써봐도 된다.
3. **결제수단 등록** — 유효한 결제수단이 없으면 이전 후 서비스가 중단될 수 있다고 Vercel 문서가 명시한다. **이전 전에 반드시 등록.**
4. **나를 팀 멤버로 초대** — Settings → Members → Invite (`rnjsxogud2165@gmail.com`, 지금 Vercel 로그인 계정)
   - 역할은 **Member 이상**이면 충분 (Owner 아니어도 됨)
   - 초대 메일 수락까지 완료
5. **회사 팀에 `sdnig` 라는 이름의 프로젝트가 없는지 확인**
   - 있으면 이전할 때 이름을 반드시 바꿔야 하고, 그러면 **`sdnig.vercel.app` 주소가 달라진다.**
   - 없으면 이름 그대로 유지되고 주소도 그대로다.
6. (선택) 세금계산서가 필요하면 Settings → Billing 에 회사 사업자 정보 입력

---

## B. 내 계정(개인) 쪽에서 할 일

1. `0단계` 의 값 확보 / DB 비밀번호 보험 조치 완료
2. **회사 팀 초대 수락** (A-4)
3. 배포 중이면 끝날 때까지 대기 — 이전 중에는 새 배포를 만들 수 없다
4. 현재 사이트가 정상인지 확인해 기준점을 잡아둔다
   - `https://sdnig.vercel.app` 로그인 → 업체 목록 / 계약 목록 / 사진 표시
   - 업체 수, 사진 몇 장 정도는 눈으로 기억해둔다 (이전 후 비교용)

---

## C. 이전 실행 (개인 계정에서, 10초 ~ 10분)

1. Vercel 대시보드 → 개인 계정(`taehyeungs-projects`) → **sdnig** 프로젝트
2. **Settings → General → 페이지 맨 아래 "Transfer Project"**
3. 받는 팀으로 **회사 팀** 선택
4. 마법사 마지막 확인 화면에서 **넘어갈 도메인·환경변수 목록이 나온다. 여기서 반드시 확인:**
   - `sdnig.vercel.app` 이 목록에 있는가
   - 환경변수가 **7개 전부** 있는가 (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `ADMIN_PASSWORD`, `MAINTENANCE_TOKEN`)
   - 프로젝트 이름을 바꾸라고 요구하면 → 회사 팀에 같은 이름이 이미 있는 것. **일단 취소**하고 A-5 를 정리한 뒤 다시 시작한다.
5. Transfer 실행 — 별도 수락 단계 없이 바로 진행되고, 끝나면 회사 팀의 프로젝트 화면으로 넘어간다

**이전 중에는:** 서비스는 계속 뜬다(무중단). 다만 새 배포 / 설정 변경 / 프로젝트 삭제가 안 된다.

---

## D. 이전 직후 확인 (회사 계정에서)

1. **사이트 동작 확인** — `https://sdnig.vercel.app` 접속 → `1111` 로 로그인
   - 업체 목록이 뜨는가 (DB 연결 = `DATABASE_URL` 정상)
   - 사진이 보이는가 (Storage = `NEXT_PUBLIC_SUPABASE_URL`, 버킷 정상)
   - 업체 하나 열어서 사진 업로드가 되는가 (`SUPABASE_SERVICE_ROLE_KEY` 정상)
   - 여기까지 되면 환경변수가 제대로 넘어온 것이다
2. **환경변수 7개 확인** — Settings → Environment Variables 에 7개가 다 있는지
   - 빠진 게 있으면 `0단계` 표를 보고 다시 넣고 재배포
3. **재배포 한 번** — 이전 자체는 배포를 다시 하지 않으므로, 새 팀에서 배포가 정상인지 한 번 돌려본다

---

## E. 이전 후 정리 (배포 경로 복구)

이전하면 프로젝트의 소속 팀이 바뀌므로 **지금 쓰던 CLI 배포 경로가 끊긴다.**

- 로컬 `.vercel/project.json` 의 `orgId` 가 옛날 값이 된다 → `vercel link` 로 다시 연결
- 지금 쓰는 배포 토큰은 개인 팀 스코프라 회사 팀에서는 동작하지 않는다 → 회사 팀에서 새로 발급

**근본 해결책 — GitHub 연결을 권장한다.**
지금은 Git 연결 없이 CLI 로만 배포하는 구조라, 계정이 바뀔 때마다 토큰·링크를 다시 맞춰야 한다.
회사 팀에서 이 저장소를 연결해두면 push 만으로 배포되고, 토큰 관리가 아예 필요 없어진다.
Settings → Git → Connect Git Repository.

---

## F. 알아둘 것

**따라오는 것:** 환경변수, 도메인·별칭, 배포 이력, 빌드, 프로젝트 설정, Function Region(`icn1`), 보안 설정, Cron

**안 따라오는 것:** 사용량 통계(0으로 리셋), 런타임·빌드 로그, 모니터링 데이터, Integrations
→ sdnig 는 Integration 을 쓰지 않고 로그도 안 보므로 실질적인 손실 없음

**Supabase 는 이번 이전과 무관하다.** DB·사진은 Supabase 계정에 그대로 있고 Vercel 은 환경변수로만 연결된다.
Supabase 도 회사 계정으로 옮기려면 별도 작업이다.

**되돌리기:** 전용 취소 버튼은 없지만, 반대 방향으로 다시 이전하면 원위치시킬 수 있다.

### 비용 (Hobby $0 → Pro)

- 고정비 **$20/월** — 배포 가능 좌석 1개 + 사용량 크레딧 $20 포함
- 좌석 추가 시 1명당 $20/월. 단 **읽기 전용(Viewer) 좌석은 무료** — 화면만 보는 동료는 무료로 넣으면 된다
- Hobby 의 무료 한도(Active CPU 4시간, 메모리 360 GB-hrs, 이미지 변환 5,000회)는 **사라지고**, 첫 단위부터 $20 크레딧에서 차감된다.
  이 규모면 크레딧 안에서 끝날 가능성이 높지만, **첫 달 Usage 탭에서 실측을 꼭 확인할 것**
- 서울 리전(`icn1`) 유지는 문제없다. Hobby 는 단일 리전, Pro 는 5개까지라 제약이 오히려 완화된다.
  최저가 리전 대비 컴퓨트가 약 32% 비싸지만 이 규모에서는 월 $1~2 수준이고, Supabase 가 서울이라 지연 이득이 더 크다
- 전환 후 **Settings → Spend Management 로 지출 상한 알림**을 걸어둘 것 (기본값 $200 은 이 규모에 너무 높다)
