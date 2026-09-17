# Deployment

## Required Runtime

- Node.js 22 이상 권장
- PostgreSQL 15+ with PostGIS
- Redis 호환 캐시 권장
- ODsay API key
- Kakao REST API key
- 공개 지도 SDK key는 도메인 제한 필수

## Steps

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. PostgreSQL에 `db/migrations/*.sql` 적용
6. `npm run build`
7. 환경변수 설정
8. 배포

## Environment

```bash
DATABASE_URL=
ODSAY_API_KEY=
KAKAO_REST_API_KEY=
NEXT_PUBLIC_KAKAO_MAP_KEY=
FAIRTURN_PROVIDER_MODE=live
FAIRTURN_ENABLE_LIVE_PROVIDERS=true
FAIRTURN_INVITE_TOKEN_SECRET=
FAIRTURN_LOCATION_ENCRYPTION_KEY=
FAIRTURN_RATE_LIMIT_WINDOW_MS=60000
FAIRTURN_RATE_LIMIT_MAX=60
```

`FAIRTURN_INVITE_TOKEN_SECRET`은 production에서 필수입니다. 개발 기본 secret은 production에서 거부됩니다.

## Migration Notes

- 신규 DB에는 `001_initial.sql`부터 순서대로 적용합니다.
- 이미 초기 스키마를 적용한 DB는 `002_fix_group_members_nullable_key.sql`을 추가 적용해 `group_members`의 nullable 복합 PK 문제를 수정합니다.
- migration 전 snapshot 또는 managed backup을 생성하세요.
- 이 저장소의 `npm run db:migrate`는 `DATABASE_URL`이 없을 때 SQL 구조만 검증합니다. 운영 DB에는 배포 환경의 migration runner로 적용하세요.

## Rate Limit

현재 API rate limiter는 `FAIRTURN_RATE_LIMIT_WINDOW_MS`와 `FAIRTURN_RATE_LIMIT_MAX`를 사용하는 인메모리 구현입니다. 단일 Node 인스턴스 개발·데모에는 충분하지만, 서버리스·다중 인스턴스 운영에서는 Redis 호환 저장소로 교체해야 합니다. `x-forwarded-for`는 배포 프록시 신뢰 경계가 정해진 뒤에만 신뢰하세요.

## PWA Scope

manifest와 설치 아이콘은 제공하지만 서비스 워커 캐시는 없습니다. 따라서 현재 범위는 “설치형 PWA”이며 완전 오프라인 앱이 아닙니다. 오프라인 상태에서는 서버 추천과 장소 추천 API가 실행되지 않습니다.

## Caching

권장 캐시 키는 원본 좌표를 평문으로 넣지 않습니다.

- 주소 검색: 정규화 주소 hash
- 경로: 좌표 bucket hash + 허브 + 이동수단 + 시간대 + provider + 옵션
- 허브 POI: hub id + category + radius
- Provider 상태: provider id

## Operations

운영 로그에는 다음만 남깁니다.

- request id
- provider name
- latency
- status
- calculation revision
- failure reason code

원본 주소와 좌표는 로그·분석 이벤트·오류 응답에 포함하지 않습니다.
