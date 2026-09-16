# Fairness Algorithm

FairTurn의 점수는 높을수록 좋은 후보, 개인 부담은 높을수록 힘든 경로입니다.

## Personal Burden

각 구성요소는 0~100으로 정규화합니다.

```text
개인 부담 =
이동시간 45%
+ 환승 부담 15%
+ 도보 부담 10%
+ 교통비 부담 5%
+ 귀가·막차 위험 15%
+ 혼잡·경사·계단 부담 10%
```

핵심 이동시간이 없으면 해당 경로는 유효 추천으로 사용하지 않습니다. 나머지 항목이 `unknown`이면 사용 가능한 가중치만 다시 정규화합니다. 실제 숫자 `0`은 `unknown`과 다르게 known 값으로 계산합니다.

## Hard Constraints

최대 이동시간, 환승, 도보, 교통비, 막차 여유, 엘리베이터 조건은 점수 계산 전 위반 여부를 확인합니다. 모두를 만족하는 후보가 없으면 사람을 제외하지 않고 후보별 위반 벡터의 총 초과량이 가장 작은 최소 완화안을 제시합니다.

## Ledger

그룹별 참여자 장부는 다음 식으로 갱신합니다.

```text
newLedger_i = 0.85 * oldLedger_i + currentBurden_i - groupMeanBurden
```

양수는 최근 평균보다 더 많이 이동한 부담, 음수는 상대적으로 편한 부담입니다. 후보 평가 때는 실제 반영 전에 provisional ledger를 계산해 누적 균형 점수에 넣습니다.

## Final Score

```text
Efficiency = 100 - 평균 개인 부담
WorstPersonProtection = 100 - 가장 높은 개인 부담
CurrentFairness = 100 - normalize(개인 부담 표준편차)
CumulativeBalance = 100 - normalize(후보 선택 후 누적 장부 표준편차)

FinalScore =
Efficiency 30%
+ WorstPersonProtection 20%
+ CumulativeBalance 25%
+ HubQuality 15%
+ GroupPreferenceFit 10%
- ExcessiveCrowdingPenalty
```

표준편차 정규화 기본 상한은 30점입니다.

## Candidate Types

- `balanced`: 최종 점수 1위
- `play`: 상권 매력도 + 그룹 선호 적합도 1위
- `return_safe`: 가장 힘든 사람 보호 + 누적 균형이 좋은 후보
- `fast`: 평균 이동시간 최단

같은 허브가 여러 유형에서 1위면 중복 카드를 만들지 않고 하나의 카드에 여러 배지를 붙입니다.
