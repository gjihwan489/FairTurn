# Privacy

FairTurn의 기본 원칙은 정확한 출발지와 귀가지를 다른 참여자에게 보내지 않는 것입니다.

## Implemented

- `ParticipantInput`의 정확 주소와 좌표는 추천 계산 입력에만 사용합니다.
- 그룹 공유 DTO는 `sanitizeSharedMeeting`을 통과합니다.
- 공유 후보에는 허브명, 권역, 부담 수치, 설명 fact만 포함합니다.
- 테스트는 `exactOrigin`, `returnCoordinate`, 원본 주소, `lat`, `lng`, `coordinate`가 공유 DTO에 없는지 확인합니다.
- 오류 메시지는 `maskSensitiveError`로 API 키와 좌표 형태를 마스킹합니다.
- 초대 토큰은 `createInviteToken`으로 난수 생성하고 `hashInviteToken`으로 저장할 수 있습니다.
- Fixture와 로컬 seed는 원본 개인 위치를 로그나 파일에 쓰지 않습니다.

## Database Protection

`private_locations`는 `meeting_participants`와 분리되어 있습니다. 운영 환경에서는 다음을 적용해야 합니다.

- 서버 전용 role 또는 엄격한 RLS
- 애플리케이션 수준 암호화
- 위치 삭제 요청 API
- 비회원 위치 삭제 보존기간 job
- 원본 좌표가 들어가지 않는 캐시 키

## Guest Data

비회원 참여자는 해당 모임에만 사용합니다. MVP UI에서는 브라우저 localStorage에 저장되며, 운영 DB에서는 retention policy와 만료 job으로 삭제합니다.
