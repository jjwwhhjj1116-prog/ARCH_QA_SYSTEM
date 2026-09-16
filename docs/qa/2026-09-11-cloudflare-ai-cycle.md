# 2026-09-11 Cloudflare 검수 후보 배포 및 운영 검증

## 2026-09-14 16:40 — 복원력 수정과 위치 거절 확인

- 배포 b49f17b2-f185-4e4f-9166-511e4c315c77. 503 확정응답 최대2회 backoff, 전체60초 제한. probe hard deadline 및 취소무시회귀 수정. 키/모델/원본/권한/지침/DO 불변.
- 전체727tests/tsc/build PASS. 변경4파일lint/format PASS. 독립읽기검수 Critical/High 없음. 재시도시점 낮은우선순위지적 수정 후40tests/build PASS.
- 실제 고정문장 probe는60초 TIMEOUT. 검수 run5c9de96d-e286-4f82-a6b5-ffd53999f0b0: Google USER_LOCATION_UNSUPPORTED, failed0/18. 기본후보3건 보존, 새보고서저장 없음. 이전성공이력 불변. 정상화 완료 아님.
- private Worker 실제 버전1e1ca2aa-6d01-4d75-8594-f7db72fc010a에 targeted placement aws:ap-northeast-2 적용(versions view --json). 서울인접 설정이 없어서 생긴 문제는 아님. 실제 egress국가/IP는 미측정. 과거503 전체원인으로 소급단정 금지.
- 공식문서: https://developers.cloudflare.com/workers/configuration/placement/ 는 지정cloud지역에 지연이 낮은 Cloudflare센터로 배치한다고 설명; 실제 AWS내 실행은 아님. https://ai.google.dev/gemini-api/docs/available-regions 는 한국을 지원지역으로 열거. 한국사용자 전체지원불가라는 뜻 아님.
- 현재 승인범위를 넘는 신규cloud서비스/결제/공개proxy 생성은 안함. 다음 의사결정은 웹/DB 유지 및 Gemini호출서비스 분리 승인. 기존DO 이전버전으로 무조건rollback 금지.

## 배포 식별

### 15:20 KST 후속 — 미평가 사유 보존, 503 재발

- 확정 결함: AI unable.reason을 버리고 응답 누락과 함께 공통 사유만 저장하던 경로 수정. 새 실행에서 원본 파일·시트·행 + 검증된 AI 판단 불가 사유를 coverage.reasons에 보존. 누락/지침 미전송/입력 미전송 구분. 기존 스키마와 평가수/partial 판정 유지. 과거 실행 복원·덮어쓰기 없음. RUN-007/AI-004 진단 개선.
- 배포 f70a60e0-19ce-49ca-97c2-e26d4b930903. 롤백 d1acb5ef-aa1d-4a34-b3e9-356602375243. 마이그레이션·키·모델 변경 없음. 관련41 tests/전체70파일721 tests/typecheck/build PASS. 독립 검수 차단 이슈 없음.
- Chrome 동일 합성자료/지침v1/3.7 재시험1회: ad4c4eef-5f48-4dc0-a055-c505734dbbc6, 15:20:45, Google503(GOOGLE_HTTP_RESPONSE), failed0/18. 새 AI 보고서 저장은 하지 않음. 이전 성공8/18 보고서 유지. 출력 스키마 제거가 503의 완전한 해결이라는 해석은 이번 재발로 지지되지 않음.
- 기존18행 중4행은 원문상 소계/공종구분이며 나머지6행의 과거 AI 판단 불가·응답 누락 구분은 저장 정보가 없어 확정 불가. 새 진단의 운영 unable 응답 확인은 이번503으로 미완료. 값/범위를 추정해 정상 처리하지 않음.
- 후속: Google503 간헐 재발의 요청/전달 경로 분리 검증. 무제한 재호출 금지. 관리자 지침 정식 활성화 보류. 최대60개 긴 사유의 Excel 한 셀32767자 제한 위험은 사유별 행 분리 회귀검사 필요(이번18행 보고서 검증과 별개). prettier 미설치/캐시 권한 오류로 포맷 명령 미실행; 타입/빌드/테스트는 통과.

### 최종 후속 — 14:52 KST 실제 AI 응답 및 보고서 저장

- temperature 기본값 비교 run bc865258-430b-4083-b8d7-b482ca6b49cb(14:48:57)도 503/failed0/18. 이 변경만으로 해결되지 않음. 아래 '비교 실행 중'은 이전 시점 기록.
- 최신 배포 d1acb5ef-aa1d-4a34-b3e9-356602375243: Google generationConfig.responseSchema 제거. application/json MIME, 프롬프트 및 로컬 엄격 JSON/원본 행·근거 검증 유지. 동일 키/3.7/합성자료에서 실제 응답 수신. 이번 요청 조합에서 확인한 결과이며 Google 스키마 기능 전체 미지원으로 일반화하지 않음.
- run 9f8eb3f4-dee6-4937-9e33-5ca1c2cee789(14:52:10): AI partial8/18, 입력1809/출력2481토큰. 기본 후보3 + AI 후보1. AI가 CSV8행 D8의 10*3=30과 기재 수량31 불일치를 원본 근거와 함께 반환. 수량 자동 변경/승인 없음.
- 시험 Excel 보고서 저장 UI 및 D1 review.report.saved 읽기 전용 대조 성공. 7675bytes, SHA256 38054352bb91d2a37213ebdb4a860c7412a5bd1d78c01de53e8a375da8b7fa17, 판단0건. 실제 AI 포함 시험 보고서이며 전체 검수/정식 승인 보고서가 아님.
- 최종 전체70파일/720 tests PASS, typecheck/build PASS, 변경파일 oxlint 통과. Chrome 결과 탭 유지. 파일 다운로드 후 시각검증 미실행.
- 남은 범위: 10행 미평가 사유·범위 확인. 합성 초안v1 비활성 유지. 정식 활성 지침 사이클/대용량 XLSX/동시 직원 미검증. 관리자 생성진단 서버 반복호출 제한과 동의 취소·프로필 변경 회귀검사 보강 후속. 업무 원본·실패 이력·키·모델 보존.

### 2026-09-11 오후 — 공용 키 실제 생성 진단 및 확인창 수정

- 회사 키 저장/복호화/검수 경로 독립 재검수: 동일 subject/AAD, 동일 키·모델 전달. 키 원문 조회 없음.
- 확정 표시 결함 수정: 암호문 존재를 연결 성공으로 표현하지 않고 `키 저장됨 · 생성은 별도 확인`으로 표시. 저장과 실제 생성 확인 분리.
- 관리자 전용 POST `probe-generation`: 저장 버전 일치 확인, 고정 문장 1회/출력64토큰, 같은 regional binding, 임의 키·모델·프롬프트 불허, 원문·키 응답 금지, 자동 재시도 없음. 서버 측 반복 호출 간격 제한은 미구현.
- 7a9d96ae-c0e9-4f3d-91d0-8c8d97aa6e19 배포 후 실제 Chrome `짧은 문장 생성 시험` 성공. 새 공용 키/3.7로 실제 텍스트 수신. AI 산출서 검수 완료와 구분.
- 확인창의 반복 CDP focus 시간초과로 실행이 막혀 AI 실행 동의만 화면 내 안내/동의/취소로 교체. 비용·범위 안내, dirty/busy/profileId 검사 유지. 71959d60-c249-4db2-b4c5-b37038d03d84 배포. 실제 클릭→실행 도달 확인.
- 같은 키/3.7의 기존 검수 요청: run 8c80abb8-581e-4ae6-8ab5-ff7890f0d73f, 14:46:21 KST, 503 GOOGLE_HTTP_RESPONSE, AI failed0/18. 최소 요청 성공과 대비되나 단일 매개변수 원인 확정은 아님.
- Google 3.x 권장 기본값에 따라 temperature=0 강제를 제거한 비교 후보 9e472ead-e55f-4b53-b5ee-a0ca0a43912a 배포. 키·모델·규칙·원본 유지. 동일 합성자료 비교 실행 중.
- 검증: 생성진단 포함 전체720 tests PASS, typecheck/build PASS. 확인창 변경 관련10 tests/타입검사/빌드 PASS. temperature 기본값 회귀 포함34 tests/build PASS. 두 변경 독립 검수에서 차단 이슈 없음. 모든 mock PASS는 실제 AI 성공을 대신하지 않음.

### 2026-09-11 13:23 KST — 사용자 지정 Gemini 3.7 시험

사용자의 `3.7 flash로 해봐`에 따라 기존 공용 키는 그대로 두고 UI에서 모델 목록 조회→gemini-3.7-flash 선택→연결 확인 및 저장 성공(13:21:56)을 확인했다. 같은 합성자료/지침 v1로 실제 trial `765aae03-c848-4d0f-8d4f-1f8b84b47b14`(13:22:30) 실행: AI failed0/18, 토큰N/A, `503, GOOGLE_HTTP_RESPONSE`. 3.8에만 국한된 실패로 단정할 수 없다. 공용 모델은 사용자 요청대로3.7로 남기며 키교체/코드배포/자동 반복 호출 없음. 실패 포함 보고서 저장 검증을 진행. AI 성공·정식검수 완료는 아님.

- 사용자 승인: "ㅇㅇ 배포해서 검증 진행해".
- 대상: https://concost-qc-studio.jjwwhhjj1116.workers.dev/
- HEAD: `33e3c06b87a65a5207fa22cf3c21eb961373f1a0`, main. 기존 미커밋 145개 항목을 포함한 검증 후보이며 HEAD 단독 산출물이 아님.
- 배포 전 `dist/server/index.js` SHA256: `8CDA661440A6600224F38E40AC3056FD4A0E6C022F94D9CBDE72620683098F36`.
- 배포 명령: `wrangler deploy --config dist/server/wrangler.json`.
- 운영 버전: `c6f1f03e-ffb1-45d8-bffb-c399a88c2927`, 2026-09-11T01:52:56.432Z, 100% 재조회 확인.
- 직전 버전: `7062a9a0-65cf-408f-8c83-1859265c1b51`.
- 기존 D1/Google Drive/회원 인증/접근 범위 유지. SQLite `QuantityInspectionObject` 바인딩 및 `quantity-inspection-v1` 추가. 유료 플랜 변경 없음.
- 운영 D1 migration list: 미적용 없음. 이번 D1 migration 실행 없음.

## 검증 경계

- 이전 후보: 657 unit/integration tests, typecheck/build, 실제 로컬 SQLite DO smoke PASS. 이것은 운영 Google API 성공 증거가 아님.
- 독립 읽기 전용 후보 검수: 신규 Critical/High 없음. 전체 제품 릴리스 체크리스트 완료 선언이 아님.
- 운영 비로그인 session/projects/drive/review: 모두 401 AUTHENTICATION_REQUIRED. privacy/terms: 200.
- 실제 Chrome 사용자 관리자 로그인: 유종욱 계정, 홈 및 프로젝트 생성 진입 확인.
- 새 검증 전용 프로젝트: `운영 AI 검증 2026-09-11 · 합성자료`. 기존 업무 프로젝트 수정/삭제 없음.
- 합성 CSV 2개로 원본 등록부터 실제 provider/보고서까지 검증 진행 중. 결과는 후속 항목에 기록.

## 최신 후속: 2026-09-11 12:17 KST — AI 전송 경로 수정 배포

### 13:06 KST 재개 — 실제 5xx 확인, 원인 분리 보강

최종 13:09 KST 확인: run `c88dd2b1-b539-451e-8239-4b1aae540709`(13:06:33)은 `503, GOOGLE_HTTP_RESPONSE`, AI failed0/18. 내부 Worker가 실제 Google HTTP 응답을 받았음이 확인됐다. Google 측 요청 처리 불가이며 키 무효나 회사 모델 미등록으로 설명하지 않는다. 사용자가 **3.8 유지**를 명시해 다른 모델 변경/자동 재호출은 하지 않는다. 이 실행의 실패·미평가 포함 시험 보고서는 UI 저장 성공 + D1 review.report.saved 감사기록 확인: 7374bytes, SHA256 `823d58b74e11d77921f1562dc8045f2d02aa9fe403a89044c567bf91adc1d2e0`, 판단0건. AI 성공 보고서는 아니다. provenance 비노출 추가검사 포함 관련54 tests PASS. 다음 단계는 3.8 서비스 정상 응답 후 동일 합성 시험→지침 활성화→정식 검수/보고서이며 현재 초안 유지. 전체파일/대용량/동시직원 검증은 여전히 미실행.

- 확인창 처리 후 실제 trial `4a3571d8-95f4-4827-9da9-fa4ce28b49e2` (13:01:08 KST) 저장. AI failed 0/18, 토큰 N/A, HTTP 5xx 안내. 연결 성공이나 보고서 완료로 취급하지 않음.
- Google 응답과 내부 연결의 5xx를 구분하려고 outbound가 실제 HTTP 응답에만 고정 provenance 헤더를 덧붙이고 검수 실패에 숫자 상태+allowlist marker만 기록하도록 수정. 임의 헤더·원문·키는 기록하지 않음.
- 배포: private `1e1ca2aa-6d01-4d75-8594-f7db72fc010a`, main `0ec4f311-447c-44c0-abdb-5c55b8f1ea8d`. 관련51 tests/typecheck/build PASS. 원본/DO/기존 실패 실행/키/모델 보존.
- 동일 합성 지침 재시험 1회 클릭 후 native confirm에서 도구 시간초과. 사용자에게 이번 확인창 처리 요청. 추가 클릭/자동 재호출은 하지 않음. 다음 시작점: 최근 run의 실제 HTTP 숫자와 GOOGLE_HTTP_RESPONSE 여부 확인. 실제 성공한 AI/정식 보고서는 아직 미완료.
- 독립 코드·공식 문서 대조에서 responseSchema+3.8 사용 자체 미지원 근거 없음. temperature=0은 Google3.x 기본값 권고와 다르지만 이번 5xx의 확정 원인은 아님. 모델/생성 설정 임의 변경하지 않음.

- 저장된 공용 키의 모델 조회 HTTP400을 안전한 고정 코드로 분류: `GOOGLE_USER_LOCATION_UNSUPPORTED`. 진단 배포 `ae0cc0ef-8fab-4e32-a043-51dff88433e0`에서 확인. 키 오류로 단정하지 않는다.
- 메인 Worker 서울 인접 placement 배포 `943b8513-4515-4b25-947c-0576ecc0b355` 후 같은 공용 키로 모델 목록 조회 성공(실제 `gemini-3.8-flash` 포함). 키 교체 없음.
- 기존 프로젝트 DO에서 실행된 11:59 시험 `4c08e132-f3c1-47cf-a4a0-a753353728d1`은 여전히 HTTP400/AI failed/0 of 18. DO 자체의 상세 원인은 그 실행에 저장되지 않았다. 메인 placement는 기존 DO를 이동시키지 않는다.
- 수정: 설정/검수가 동일한 private HTTP Service Binding `GEMINI_OUTBOUND`를 사용한다. Google 모델 API만 허용, 64KiB 전송 상한, 쿠키·Authorization 미전달, redirect/retry 금지. DO ID/namespace/recovery/기존 데이터는 유지.
- 내부 Worker `concost-qc-gemini-outbound` 버전 `2dbf4bca-36c0-4e07-93ee-0ebfd937f6f5`: workers_dev=false, preview_urls=false, 공개 route 없음, 저장소/로그 없음, Seoul-near placement. 요금제 변경 없음.
- 최신 운영 웹 버전 `64598c48-3d15-42e6-aaa0-322fafa8df3e`, built index SHA256 `DCE925FF6711F6B31D7BB9D887685C2A6CA1BC6238C0696D71E95BB6C2A2478A`. 기존 사용자 승인 범위의 배포.
- 검증: 전체 70 files/715 tests PASS, typecheck PASS, build:cloudflare PASS. 변경파일 lint 오류0/anonymous default export 경고1. built Worker/DO/D1 권한 smoke PASS. 독립 감사의 실제 workerd 2-Worker binding→native fetch 합성 smoke PASS(실제 Google 호출 아님).
- 최신 웹을 Chrome에서 다시 열고 관리자 모델 조회 성공. 신규 private 경로에서 같은 공용 키가 실제 Google 모델 목록을 받았다.
- 합성 프로젝트 지침 시험 실행 1회 클릭 후 native confirm에서 제어 도구 `Emulation.setFocusEmulationEnabled` 시간초과. 사용자에게 확인창 처리를 요청했고 중복 클릭/유료 재호출 없음. 읽기 전용 D1 확인상 새 완료 run 없음(최신 4c08e132). 다음 단계는 확인창 처리 후 실제 run 확인, AI 성공 시 합성 지침 활성화/정식 실행/보고서 저장. 현재 AI 성공과 새 보고서 완료는 미검증이다.
- 과거 failed 실행/실패 포함 보고서를 성공으로 변경하지 않았다. 저장된 설정의 과거 확인 표시를 현재 연결처럼 보여주는 UI 잔여 결함은 별도 미수정.

## 실제 운영 검증 후속 결과 (이전 이력)

- 최신 배포: `8696e5fc-6bb6-4af9-8021-c8b5e087fdd0`. 빌드 SHA256 `BC408C50463C9DB78438B86A94EB6AF296F994B3CF1E791B0AABC78965EE32DC`.
- 원본 등록: 합성 CSV 2개(984/344 bytes) Google Drive 등록 완료. 기존 업무 자료 변경·삭제 및 원본 재업로드 없음.
- 운영 오류 수정 1: 클래스 멤버로 호출한 native fetch가 workerd에서 Illegal invocation 발생. 로컬 변수 호출로 수정. 실제 workerd 회귀 smoke PASS. 중간 배포 `01c15ca0-dcbd-4a2b-a733-251de0dd4961`.
- 운영 오류 수정 2: 분할 업로드의 Google sha256Checksum과 기존 다운로드의 appProperties.sha256 요구 불일치. 하나 이상 필수, 존재하는 모든 해시 일치 및 본문 해시 검사 유지. 중간 배포 `157e9c4d-9fa0-41c7-a82b-e65345b39aa8`에서 원본 읽기 정상 확인.
- 두 CSV를 원본과 대조하여 각 1개 시트 연결 저장. 비표준 합성 자료는 자동 인식 완료가 아니며 수동 의미 확인을 수행했다. 치수 단위·비교집단 확정은 하지 않아 해당 검사는 미평가 유지.
- 검증 전용 지침 v1 초안 저장 및 기본 시험: 18행, 검토 후보 3건. 산식 10*3 vs 물량31 불일치, H*10 해석 불가, 집계표 공종 분산 후보. 지침은 실제 현장 기준이 아니며 활성화하지 못한 초안이다.
- AI 시험 run `6209eff5-7c04-4232-9fd9-5273703e9f22`: gemini-3.8-flash, failed, 0/18 평가, 토큰 N/A. 성공으로 처리하지 않았다. 설정에서 모델 목록 조회도 Google HTTP400 / AI_REQUEST_INVALID 반환. 키 오류/모델 미지원 중 어느 것인지 단정 불가. 원문·키 노출 없음. 추가 유료 호출 중단.
- 위 실패·미평가 포함 Excel 시험 보고서 저장 UI 성공. D1 review.report.saved 감사 기록 확인: 7318 bytes, SHA256 `87ec5907b2795a4010c1835856a9670e448deae2c261f5264ab2f3860aa6a73e`, 판단0건. 완성된 AI 검수 보고서로 표현하지 않는다.
- AI 실패 안내를 HTTP상태·네트워크·시간·응답검증별 안전한 고정 문구로 구분하여 최신 배포. 과거 실패 이력은 변경하지 않음.
- 최종 전체 674/674 tests PASS, build:cloudflare PASS. 관련 원본 저장·읽기 116 tests 독립 재실행 PASS. 에이전트 변경파일 typecheck/lint/format PASS.
- 남은 작업: 관리자 공용 키/Google 요청 거부 해결 → 가능한 모델 조회 → AI 지침 시험 성공 → 시험 지침 활성화 → 정식 Gemini 검수 및 보고서 재검증. 대용량/동시 직원/Excel 다운로드 내용 시각 검증은 미실행.

## 새 공용 키 재시험 확인 — 2026-09-11 후속

- 사용자 새 키 저장 확인 시각 13:33:18 KST. 키 원문 조회·출력 없음. 모델 gemini-3.7-flash 유지.
- 기존 Chrome 탭 제어가 끊겨 같은 Chrome 새 탭으로 로그인 세션을 유지한 채 실제 저장된 시험 결과를 조회했다. 확인창 없음. 중복 생성 요청 없음.
- 새 키 저장 이후 실행 `b690808c-0212-4216-9b4b-58dd622dd7e7`, 14:05:28 KST: gemini-3.7-flash, failed, AI 0/18행, 토큰 N/A. 펼친 미평가 사유에서 `503, GOOGLE_HTTP_RESPONSE` 확인.
- 키 교체만으로 문제가 해결되지 않았음. 이것만으로 Google 전체 장애 또는 모든 키/계정 제한 부재를 단정하지 않는다. 최소 생성 요청과 실제 검수 본문 비교는 아직 미실행.
- 이번 확인에서는 코드 변경/배포/지침 활성화/새 보고서 저장 없음. AI 성공 보고서 미완료. 원본·기존 실행 이력 보존.

## 2026-09-15 지침별 정확도 검증 기준

검증 대상은 합성자료 v1 초안의 숫자 산식 불일치·미확인 변수·음수 공제·소계/단위 예외 지침이다. 운영 지침 활성화 및 실제 고객 자료 변경 없이 시험한다. 행 번호는 헤더 포함이다. 아래 표는 기대 결과이며 AI 실행 성공을 뜻하지 않는다.

| 원본 | 행 | 기대 결과 |
|---|---|---|
| FIN_검수_합성산출서.csv | 2~6 | 10*3*2=60. 산식 불일치 후보 없음 |
| 동일 | 7 | 100*3*2=600. 산식 오류 아님. 치수 10배는 별도 비교집단 지침·매핑 필요 |
| 동일 | 8 | 10*3=30, 기재31 M2. AI 불일치 후보와 원본 근거 필요 |
| 동일 | 9 | H*10. H를 역산하지 않고 근거 부족/미평가 |
| 동일 | 10 | -2*5=-10. 음수라는 이유의 지적 금지 |
| 동일 | 11 | 소계1001. 집계 범위 없이 합계 오류 확정 금지 |
| FIN_검수_동별집계표.csv | 3/6 | 기본 엔진의 동일 벽/M2 공종분산 후보. 현재 산식 AI 지침의 탐지 정답에는 포함하지 않음 |
| 동일 | 7/8 | 다른 단위 M 또는 다른 부위 천장. 벽/M2와 무조건 비교 금지 |
| 동일 | 2/5/9 | 공종 구분 또는 소계. 제외/문맥 보존 |

- AI 후보와 기본검사 후보는 별도 집계한다. 기본검사 3건을 AI 탐지 실적으로 바꾸지 않는다.
- 집계표 M2 수량만 합하면404. M 수량22까지 더해426이라며 소계 누락을 지적하면 단위 혼합 오탐이다.
- 검증 게이트: 지침 내 의도된 불일치 탐지, 정상 산식/공제 오탐 없음, H 미추정, 원본 행 근거 일치. 단일 오류 표본 통과를 일반 현장 정확도100%로 표현하지 않는다.
- 로컬 gemini-review/ai-integration 46개 테스트 통과. 모의 응답 검사이며 실제 모델 정확도 증거와 구분한다.
- 신규 실제 시험 `16288cfa-145b-47d3-94fb-791e42f255b1` 2026-09-15 13:21:35 KST: AI failed 0/18, GOOGLE_HIGH_DEMAND. 기본 후보3건을 AI 탐지로 세지 않았다. 반복 검증 미통과.
- 기존 실제 응답 `4b56dce3-98c1-4da9-b916-ed2800339f3d` 11:15:57 KST를 이번에 UI에서 재열람하여 원본/지침과 대조: AI C 후보1건은 합성산출서8행이고 설명은 10*3=30 vs 물량31. formula/quantity 근거가 원본과 일치. H가 있는9행은 미확인 변수로 unable. 음수공제와 정상 산식에 추가 AI 후보 없음. 이는 저장된 과거 실행의 검증이며 신규 시험 성공이 아니다.
- 현재 지침 범위의 의도된 오류1건 탐지 사례 확인. 표본이1건이고 현재 재실행이 실패하므로 전체 정확도·재현성 PASS 불가. AI의 개별 not_flagged 이유는 현재 화면에서 제공되지 않으므로 후보 부재만으로 모든 행의 판단 품질을 증명하지 않는다. 다음은 작은 묶음 실제 응답 확보와 정상/예외별 결과 보존 검증이다.

## 복구 및 남은 위험

### 추가 자체 검수: 연결 표시와 실제 요청 구분

- 2026-09-11 후속 사용자 요청으로 main/33e3c06 및 미커밋 상태 재확인. 독립 읽기 전용 감사와 주 검수 결과 일치.
- 확인 결함 P2: personal-settings.ts의 configured는 encrypted_key 존재만 뜻하지만 personal-ai-settings.tsx가 이를 현재 연결 확인됨으로 표시한다. 실패 후 GET 새로 확인은 Google을 호출하지 않고 오류 UI를 지운 뒤 과거 상태를 재표시한다. 이전 키 보존은 맞지만 현재 연결 상태 표현은 잘못이다.
- companySettings→personalSettings(COMPANY_AI_SUBJECT)→decryptKey 및 검수 getCompanyGeminiConfig 경로는 동일 subject/AAD를 사용한다. 다른 키로 바뀌는 코드 결함은 확인하지 못했다. 운영 키 원문을 읽거나 출력하지 않았다.
- 연결 검사는 models.get GET, 목록은 models.list GET, 검수는 generateContent POST이다. 모델명/키 전달 헤더와 공식 REST 경로를 대조했으며 목록 실패에는 검수 프롬프트·responseSchema가 전송되지 않는다. 따라서 generateContent 본문만으로 모델 목록 HTTP400까지 설명할 수 없다.
- 참고: https://ai.google.dev/api/models 및 https://ai.google.dev/gemini-api/docs/api-key (2026-09-11 확인). 공식 키 전환 안내만으로 이 계정의 실제 원인을 단정하지 않는다.
- 재실행: gemini-config, personal-ai-settings UI, company route, gemini-review, ai-integration 다섯 테스트 파일 71/71 PASS. 모의 공급자 테스트이며 실제 Google 연결 성공 증거가 아니다. 실패→GET 재진입 표시 회귀 테스트가 누락돼 있다.
- 이 추가 감사에서 코드 수정/배포/키 교체/유료 재호출 없음. 우선 수정 대상: 저장 상태와 현재 연결 확인 상태 분리. Google HTTP400 세부 원인은 여전히 미확정.

- DO 도입 전 버전으로 단순 rollback하지 않는다. namespace/class 및 claimed/ready/completed 기록을 보존한다. 미완료 요청 확인 후 호환 수정 배포 우선.
- AI는 최대 60 행·지침 쌍/48KiB 제한이며 전체 대용량 파일 검수 완료를 의미하지 않는다.
- 복구 이력 한도: 프로젝트별 미완료 4개, 전체 1000개. 자동 정리 미구현. 응답 수신 후 checkpoint 이전 프로세스 종료는 불확실 상태이며 자동 유료 재호출하지 않는다.
- 대용량 XLSX/다중 직원 동시처리/실제 provider 장애 주입은 미검증.
