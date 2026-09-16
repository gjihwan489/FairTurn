# Research Decisions

| 자료명 | 핵심 아이디어 | 채택 | 변형 | 제외 | 이유 | 실제 구현 파일 |
| --- | --- | --- | --- | --- | --- | --- |
| 다사용자 공평성을 고려한 약속 지점 및 선호도 기반 코스 추천 애플리케이션의 설계와 구현 | 실제 이동시간, 다목적 최적화, 공평성, 코스 추천 | 실제 이동시간·공평성·선호 점수 | FairTurn은 누적 공평성, 귀가 부담, 허브 기반 추천, 데이터 신뢰도를 추가 | 논문 구조의 코스 추천 전체 복제 | 서비스 차별점은 여러 번의 모임과 왕복 부담 | `src/domain/scoring.ts`, `src/domain/recommendation.ts` |
| 모바일 환경에서의 사용자 위치를 기반으로 한 약속장소·시간 추천 시스템 설계 | 최대 이동시간, 후보 영역, 친구 선호 | 최대 이동시간과 후보 축소 | 직선거리 중심 영역은 API 후보 축소에만 사용 | 연령·성별 기반 추천, 멀리 있는 친구 자동 제외 | 개인정보·공정성 요구와 맞지 않음 | `src/domain/recommendation.ts` |
| 교통카드 빅데이터 기반의 서울 버스 교통망 시간거리 접근성 산출 | 거리보다 시간 기반 접근성, 시간거리 중심성 | 시간 기반 접근성 | 전체 정류장 Floyd APSP 대신 참여자×허브 행렬과 캐시 | 전체 네트워크 APSP | 최대 8명, 50허브 MVP에서 과도함 | `src/providers/transit.ts` |
| 특허 10-1816215 상권 정보 제공 장치 및 방법 | 업종 분포, 유동 인구, 교통 접근성 | HubQuality 구조 | 부천·광명·성남은 coverage/confidence 낮춤 | 부동산 시세, 소득 추정, 창업 성공 예측 | 만남 장소 추천에 직접 필요하지 않음 | `src/domain/hubs.ts`, `src/domain/scoring.ts` |
| 고도를 고려한 정밀도 높은 운동거리 측정시스템, 특허 10-2650127 | 고도와 경사 고려 | 보행 경사 부담 개념 | 3D 거리 대신 slopeRisk 부담 항목으로 사용 | 운동거리 정밀 계산 | FairTurn은 이동 부담 서비스 | `src/domain/scoring.ts` |
| 실시간 대중교통 모니터링 시스템 구현 | 혼잡도가 체감 이동 부담에 영향 | crowding burden 개념 | live data 없으면 unknown | 자체 센서, CCTV, YOLO 승객 검출 | MVP 범위를 벗어남 | `src/domain/types.ts`, `src/domain/scoring.ts` |
| Meta Pseudo Count | 영상 기반 군중 밀도 추정 | 미채택 | 없음 | MVP 제외 | 제품 핵심과 직접 관련 낮음 | 문서화 |
| EcoRide | 무인 단거리 교통 인프라 | 미채택 | 없음 | MVP 제외 | 소프트웨어 약속 장소 결정 범위 밖 | 문서화 |

References:

- DBpia: https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE12577807
- KoreaScience: https://koreascience.kr/article/CFKO200921868484667.page?lang=ko
- KCI: https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002070414
