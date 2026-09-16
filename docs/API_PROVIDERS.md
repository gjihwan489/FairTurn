# API Providers

## Transit

`TransitRoutingProvider`는 다음 인터페이스를 따릅니다.

```ts
interface TransitRoutingProvider {
  getRoute(input: TransitRouteInput): Promise<TransitRouteResult>;
  getRouteMatrix?(input: TransitMatrixInput): Promise<TransitMatrixResult>;
  getStatus(): Promise<ProviderStatus>;
}
```

구현:

- `FixtureTransitProvider`: 테스트와 데모용 정적 추정 Provider
- `ODsayTransitProvider`: 서버 전용 API 키 기반 live adapter 확장 지점

ODsay 공식 문서는 대중교통 길찾기와 실시간 도착정보 등을 제공합니다. 다만 ODsay 공식 커뮤니티 답변에 따르면 일반 대중교통 길찾기 결과는 시간표 기반 길찾기가 아니라 소요시간·이동거리 등 정적 기반 정보이며, 출발시간 기준 대기시간 포함 결과를 제공하지 않습니다. 따라서 FairTurn은 ODsay 결과를 실시간 경로라고 표시하지 않고 `정적 경로 추정`으로 라벨링해야 합니다.

References:

- https://lab.odsay.com/guide/releaseReference
- https://lab.odsay.com/community/boardView?seq=706

## Place and Geocoding

Kakao Local API는 주소 검색, 좌표 변환, 좌표 기반 행정구역, 키워드 장소 검색, 카테고리 장소 검색을 제공합니다. FairTurn은 외부 장소 ID와 상세 페이지 URL을 유지하되, 약관상 영구 저장이 제한될 수 있는 원본 응답은 저장하지 않는 정책을 사용합니다.

References:

- https://developers.kakao.com/docs/ko/local/dev-guide

## Provider Status

`/api/provider-status`는 다음을 반환합니다.

- 환경변수 설정 여부
- 연결 가능 여부
- 데이터 준비 여부
- 캐시 사용 여부
- 마지막 성공시각
- warning

비밀키는 절대 반환하지 않습니다.

## Fixture Policy

Fixture는 프로덕션 결과처럼 조용히 사용하지 않습니다. API 응답과 UI 모두 `데모 데이터`를 표시합니다.
