# AI 최종 응답 처리 경로

확인일: 2026년 11월 5일.

## 추가한 정보

Cafe24 공식 API는 Chat Completions 응답의 `extra_fields.routing_info`에 `provider`와 `resolved_model_used`를 제공한다. 서비스는 여기에서 길이·형식을 확인한 식별자 두 개만 읽고, 채택한 최종 응답의 진단 정보에 연결한다. 누락·이상 값은 null로 두며 모델의 제작사 이름으로 처리 업체를 추정하지 않는다.

`llm_requests.provider`는 기존처럼 라우터인 `cafe24`를 뜻한다. 새 `routing_provider`는 응답이 알려준 공급자 코드, `resolved_model`은 해당 응답의 실제 모델 식별자다. 과거 행은 소급해서 추정·채우지 않는다. 이 변경은 기존 진단 기록의 필드만 추가하며 보존·백업 설정을 변경하지 않는다. 운영자 요청에 따라 보존 관련 추가 점검은 진행하지 않는다.

## 조회

```sh
sudo docker exec saju-backend node server/ai-routing-report.mjs
```

개발 DB는 환경에 `DATABASE_URL`을 설정하고 `npm run report:ai-routing`으로 확인한다. 결과는 공급자·모델·상태별 운영 기록 건수다. 계정·세션·상담 식별자와 본문을 조회 결과에 넣지 않는다. 공개 조회 API는 추가하지 않는다. 조회 오류를 미확인·0건으로 바꾸지 않고 실패로 종료한다.

## 해석의 한계

- 마지막 응답에 대한 메타데이터다. 응답 형식 재생성, 이어쓰기, 키 재시도와 Router 내부 폴백 과정에서 사용된 모든 업체의 목록이 아니다. 이 정보만으로 전체 외부 수신자를 확정하면 안 된다.
- null에는 과거 행, 메타데이터가 없는 응답, 외부 호출 없는 안전 안내·기본 응답 등이 섞일 수 있다. null을 ‘Cafe24 이외 외부 전송 없음’으로 해석하지 않는다.
- 공급자 코드는 법인명·처리 국가·저장 위치·위수탁·학습 조건을 증명하지 않는다. 코드와 실제 계약·국외 이전 고지는 별도로 대조해야 한다.
- 원래 응답의 임의 `extra_fields`, 프롬프트, 인증값과 오류 전문은 새 메타데이터에 저장하거나 콘솔에 출력하지 않는다. 식별자 형식 검사 자체가 일반 개인정보 탐지·익명화 기능인 것은 아니다.
- 운영 설정의 2026-11-05 조회에서는 상담이 `cafe24/auto`, 판독이 `google/gemini-2.5-flash`였다. 이는 요청 모델 설정일 뿐 모든 실제 처리 공급자가 Google이라는 증거가 아니다. 실제 고객 상담을 새로 전송해 시험하지 않는다.

공식 근거: [Cafe24 개발 문서 — Chat Completions와 응답 라우팅 정보](https://llm-router.cafe24.com/docs#chat-completions), [서비스 처리 흐름](https://help.cafe24.com/docs/ai/cafe24-llm-router/service-introduction/). 공개 문서 확인은 개별 계약 확인이나 운영 계정의 프라이버시 설정 검증을 대신하지 않는다.
