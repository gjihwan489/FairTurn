# FairTurn

FairTurn은 “이번 한 번의 중간”이 아니라 여러 번의 약속에서 이동 부담을 번갈아 공평하게 만드는 약속 장소 결정 서비스입니다.

핵심 차별점은 누적 공평성 장부, 왕복 부담, 실제 모임 허브 기반 후보, 설명 가능한 추천입니다. 생성형 AI나 LLM API는 추천 핵심 경로에 사용하지 않습니다.

## 현재 구현된 기능

- 친구 추가, `친구 1` 자동 이름, 이름 변경, 순서 변경, 활성 목록 제거
- `localAlias`와 초대 수락 후 `displayName` 분리
- 그룹 생성과 그룹별 누적 공평성 장부
- 모임 생성, 참여자별 비공개 위치·조건 입력, 비회원 참여자 추가
- 추천 입력 변경 시 revision 증가와 후보·투표·장소 파생 상태 초기화
- 수도권 주요 `MeetingHub` 후보 구조
- Fixture Transit Provider와 ODsay/Kakao Provider 교체 인터페이스
- 참여자×허브 경로 행렬 기반 후보 계산
- 필수 조건 필터와 최소 완화안
- 개인 부담, 현재 공평성, 누적 공평성, 상권 매력도 점수
- 균형 1위, 놀기 1위, 귀가 1위, 빠른 이동 후보 중복 제거
- 지역 투표, revision 검증, 동률 처리
- 지역 확정 후 Fixture 장소 추천과 장소 확정
- 참석자 기준 모임 완료와 중복 완료 방지, 비회원 장부 저장 기본 제외
- 그룹 공유 DTO에서 정확한 주소·좌표 제거
- Provider/API 상태 화면
- 단순 설치형 PWA manifest와 명시적 데모 데이터 표시

## 아직 구현되지 않은 부분

- Supabase Auth, RLS, 실제 공동 계정 투표 저장소 연결
- UI 상태의 운영 DB 저장. 현재 데모 UI는 브라우저 localStorage를 사용합니다.
- ODsay/Kakao live Provider 실제 호출. 현재 서버 인터페이스와 Fixture Provider만 동작합니다.
- 서비스 워커 기반 완전 오프라인 추천. 오프라인에서는 서버 추천·장소 API가 실행되지 않습니다.
- 운영 Redis rate limit 저장소. 현재 rate limiter는 단일 인스턴스 개발·데모용 인메모리 구현입니다.

## Local Setup

```bash
npm install
npm run dev
```

앱은 기본적으로 `http://localhost:3000`에서 실행됩니다.

## Database

운영 DB는 PostgreSQL + PostGIS를 기준으로 설계했습니다. 마이그레이션 SQL은 `db/migrations/001_initial.sql`에 있습니다.

```bash
npm run db:migrate
npm run db:seed
```

`DATABASE_URL`이 없으면 `db:migrate`는 SQL 구조 검증만 수행하고 실제 DB 연결은 열지 않습니다. 배포 환경에서는 `db/migrations/*.sql`을 Supabase, Neon, RDS 등 PostgreSQL migration runner로 적용하세요.

`002_fix_group_members_nullable_key.sql`은 이미 `001_initial.sql`을 적용한 환경을 위한 안전한 후속 migration입니다. 신규 환경은 수정된 `001_initial.sql`만으로도 같은 구조를 얻습니다. 복구가 필요하면 migration 전 DB snapshot으로 되돌린 뒤 재적용하세요.

## Validation

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

`npm run smoke`는 타입체크와 핵심 테스트를 연속 실행합니다.

## External API Keys

`.env.example`에 필요한 변수 이름만 있습니다. 실제 키는 커밋하지 마세요.

- `ODSAY_API_KEY`: 서버 전용 ODsay 대중교통 API 키
- `KAKAO_REST_API_KEY`: 서버 전용 Kakao Local REST API 키
- `NEXT_PUBLIC_KAKAO_MAP_KEY`: 공식 권장 방식으로 도메인 제한을 건 공개 지도 SDK 키
- `DATABASE_URL`: PostgreSQL/PostGIS 연결 문자열
- `FAIRTURN_PROVIDER_MODE`: `fixture` 또는 `live`
- `FAIRTURN_ENABLE_LIVE_PROVIDERS`: live Provider 활성화 플래그
- `FAIRTURN_RATE_LIMIT_WINDOW_MS`, `FAIRTURN_RATE_LIMIT_MAX`: 개발·데모용 인메모리 rate limit
- `FAIRTURN_INVITE_TOKEN_SECRET`: 운영에서는 필수. 개발 기본 secret은 production에서 거부됩니다.

## Demo Mode

외부 키가 없어도 Fixture Provider로 전체 흐름을 검증할 수 있습니다. Fixture 결과는 화면과 API 경고에 `데모 데이터`로 표시되며, 실시간 대기시간·막차·혼잡·정확한 계단 데이터처럼 확인되지 않은 값은 `unknown`으로 남깁니다. 운영 모드 설정만으로 live Provider가 완성되는 것은 아니며, 실제 ODsay/Kakao 어댑터 연결이 추가로 필요합니다.

## Known Limits

- 현재 live ODsay/Kakao 호출은 서버 전용 인터페이스와 상태 API까지만 구현되어 있습니다.
- Fixture 경로는 정적 추정이며 실제 대중교통 결과가 아닙니다.
- PostgreSQL 스키마와 migration은 준비되어 있지만 로컬 UI MVP는 브라우저 localStorage로 상태를 보존합니다.
- 설치형 PWA manifest는 제공하지만 서비스 워커 캐시는 없습니다.
- 실시간 혼잡도, 정밀 계단/경사, 코스 자동 구성은 P2 확장점으로 문서화했습니다.

## Deployment

Next.js 런타임이 가능한 Vercel, Node 서버, 컨테이너 환경에 데모 배포할 수 있습니다. 실서비스 배포 전에는 Supabase Auth/RLS 또는 동등한 인증, PostgreSQL/PostGIS 연결, Redis 호환 rate limit 저장소, 실제 Provider 어댑터, 비밀키 교체가 필요합니다.
