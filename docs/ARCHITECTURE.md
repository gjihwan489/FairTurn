# Architecture

FairTurn은 Next.js App Router 기반의 풀스택 TypeScript 앱입니다.

## Layers

| Layer | Files | Role |
| --- | --- | --- |
| UI | `src/app/fairturn-app.tsx`, `src/app/globals.css` | 블랙 테마, 친구/그룹/모임/투표/장부 화면 |
| API | `src/app/api/*/route.ts` | 추천 계산, Provider 상태, 공유 DTO, 장소 후보 |
| Domain | `src/domain/*.ts` | 부담 계산, 누적 공평성, 후보 점수, 상태 머신, 개인정보 |
| Providers | `src/providers/*.ts` | Transit/Place Provider 인터페이스와 Fixture/live adapter |
| Data | `db/migrations/001_initial.sql`, `src/domain/hubs.ts` | PostgreSQL/PostGIS 스키마와 MVP 허브 레지스트리 |
| Tests | `tests/**` | 단위, 통합, E2E smoke |

## Meeting State

정상 흐름:

```text
draft -> collecting -> calculating -> voting -> region_locked -> venue_voting -> confirmed -> completed
```

예외:

```text
cancelled, calculation_failed, expired
```

서버 도메인 함수 `assertTransition`이 허용되지 않은 전이를 거부합니다.

## Recommendation Pipeline

1. 참여자 수, 위치, 조건 검증
2. 참여자 출발 좌표로 지리적 중심 계산
3. 중심은 API 호출 축소용으로만 사용
4. 최대 50개 허브 후보 선택
5. 참여자×허브 경로 행렬 계산
6. 필수 조건 위반 후보 제외
7. 상위 후보 정밀 점수 계산
8. 균형/놀기/귀가/빠른 이동 유형 중복 제거
9. 설명 fact와 누락 데이터 저장

## Data Persistence

MVP UI는 브라우저 localStorage로 새로고침 후 상태를 보존합니다. 운영 데이터 모델은 PostgreSQL/PostGIS migration으로 정의되어 있으며, 정확 위치는 `private_locations` 테이블로 분리되어 서버 권한 또는 RLS 보호를 전제로 합니다.

## Observability

현재 구현/문서화된 항목:

- Provider 상태 API
- provider mode, configured, reachable, dataReady, warning
- 계산 revision
- 후보 confidence, warnings, missing
- 민감정보 마스킹 유틸

운영 확장:

- 요청 ID middleware
- Provider 성공률/지연시간
- 캐시 적중률
- 후보 계산 소요시간
- 민감정보 제거 구조화 로그
