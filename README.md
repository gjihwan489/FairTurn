# FairTurn

FairTurn은 “이번 한 번의 중간”이 아니라 여러 번의 약속에서 이동 부담을 번갈아 공평하게 만드는 약속 장소 결정 서비스입니다.

핵심 차별점은 누적 공평성 장부, 왕복 부담, 실제 모임 허브 기반 후보, 설명 가능한 추천입니다. 생성형 AI나 LLM API는 추천 핵심 경로에 사용하지 않습니다.

## Features

- 친구 추가, `친구 1` 자동 이름, 이름 변경, 순서 변경, 활성 목록 제거
- `localAlias`와 초대 수락 후 `displayName` 분리
- 그룹 생성과 그룹별 누적 공평성 장부
- 모임 생성, 참여자별 비공개 위치·조건 입력, 비회원 참여자 추가
- 수도권 주요 `MeetingHub` 후보 구조
- Fixture Transit Provider와 ODsay/Kakao Provider 교체 인터페이스
- 참여자×허브 경로 행렬 기반 후보 계산
- 필수 조건 필터와 최소 완화안
- 개인 부담, 현재 공평성, 누적 공평성, 상권 매력도 점수
- 균형 1위, 놀기 1위, 귀가 1위, 빠른 이동 후보 중복 제거
- 지역 투표, revision 검증, 동률 처리
- 지역 확정 후 Fixture 장소 추천과 장소 확정
- 모임 완료 후 누적 장부 반영
- 그룹 공유 DTO에서 정확한 주소·좌표 제거
- Provider/API 상태 화면
- 반응형 PWA UI와 명시적 데모 데이터 표시

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

`DATABASE_URL`이 없으면 `db:migrate`는 SQL 구조 검증만 수행하고 실제 DB 연결은 열지 않습니다. 배포 환경에서는 같은 SQL을 Supabase, Neon, RDS 등 PostgreSQL migration runner로 적용하세요.

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

## Demo Mode

외부 키가 없어도 Fixture Provider로 전체 흐름을 검증할 수 있습니다. Fixture 결과는 화면과 API 경고에 `데모 데이터`로 표시되며, 실시간 대기시간·막차·혼잡·정확한 계단 데이터처럼 확인되지 않은 값은 `unknown`으로 남깁니다.

## Known Limits

- 현재 live ODsay/Kakao 호출은 서버 전용 인터페이스와 상태 API까지만 구현되어 있습니다.
- Fixture 경로는 정적 추정이며 실제 대중교통 결과가 아닙니다.
- PostgreSQL 스키마와 migration은 준비되어 있지만 로컬 UI MVP는 브라우저 localStorage로 상태를 보존합니다.
- 실시간 혼잡도, 정밀 계단/경사, 코스 자동 구성은 P2 확장점으로 문서화했습니다.

## Deployment

Next.js 런타임이 가능한 Vercel, Node 서버, 컨테이너 환경에 배포할 수 있습니다. production에서는 `FAIRTURN_PROVIDER_MODE=live`, 서버 API 키, PostgreSQL/PostGIS, 캐시(Redis 호환)를 구성하세요.
