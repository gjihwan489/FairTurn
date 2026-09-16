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
```

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
