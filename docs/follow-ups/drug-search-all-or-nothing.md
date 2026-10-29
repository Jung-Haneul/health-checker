# 한 키워드의 약 조회가 실패하면 다른 키워드로 찾은 약도 모두 사라진다

**Symptom**: `drugKeywords`가 둘 이상일 때 한 키워드의 e약은요 호출만 실패해도 결과 카드의 약 목록이 비고 "약국에서 상담하세요"만 나온다.

**Observed evidence**: 코드 리뷰(`code-review low`)에서 `features/consult/consult.ts`의 `findDrugs`가 `Promise.all`을 쓰고 catch에서 `[]`를 돌려주는 것을 확인했다. 실제 실패 재현은 하지 않았다.

**Suspected cause**: `Promise.all`이 하나라도 reject되면 전체가 reject된다.

**What was tried**: 수정하지 않았다. 스펙 인수 기준 5(약을 못 찾으면 안내)는 지금도 만족한다.

**Proposed next step**: `findDrugs`를 `Promise.allSettled`로 바꿔 성공한 키워드의 약만 모으고, 모두 실패했을 때만 빈 목록을 돌려준다.
