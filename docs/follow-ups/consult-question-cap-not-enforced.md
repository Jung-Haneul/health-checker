# 질문 5회 상한을 모델 지시에만 의존한다

**Symptom**: 질문을 5번 한 뒤에도 모델이 `question`을 또 돌려주면 서버가 그대로 통과시켜 상담이 상한을 넘겨 이어진다.

**Observed evidence**: 코드 리뷰에서 `features/consult/consult.ts`가 `question` 응답을 횟수와 무관하게 전달하는 것을 확인했다. 지시 문구가 무시된 실제 사례는 아직 관찰하지 못했다.

**Suspected cause**: 상한을 시스템 프롬프트에만 적고 서버에서 강제하지 않는다. 사용하는 모델이 가벼워 지시를 어길 수 있다.

**What was tried**: `questionsAsked >= 5`이면 프롬프트에 "질문하지 말고 result나 urgent를 고르세요"를 덧붙였다. 서버 측 강제는 하지 않았다.

**Proposed next step**: `consultTurn`에서 상한을 넘긴 `question`이 오면 한 번 더 분석기를 부르거나 가장 유력한 원인으로 `result`를 강제하도록 하고 테스트를 추가한다.
