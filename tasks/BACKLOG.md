# Implementation Backlog

## 2026-09-16 같은 PC Claude Code 공유 및 push 준비

- 사용자 동일 작업폴더/GitHub push 승인. 루트 CLAUDE.md 진입 안내 추가, 인수인계의 동기화 전 상태와 이후 확인 절차 분리. Windows 네트워크 공유·Cloudflare 배포는 수행하지 않음.
- 원격 저장소 PUBLIC 확인. 기존12커밋 및 현재 후보파일 키/토큰/개인키 패턴 확인, 실제 자격증명 발견 없음(휴리스틱 검사 한계 있음). 직원 private JSON·환경설정·EXE/빌드/실자료는 ignore 대상이며 추적 후보에 없음. 예제 환경파일 개인 메일을 admin@example.com으로 대체. 운영 식별자와 업무용 관리자 이메일은 접근권한을 제공하는 비밀키가 아니며 기존 서버설정/권한 코드로 유지.
- 미커밋 구현을 보존하는 인수인계 커밋으로 main fast-forward push 예정. 최종 원격 SHA는 push 후 직접 대조한다. 이 승인은 후속 배포/비용/데이터 삭제 승인으로 확대하지 않는다.

## 2026-09-16 Claude Code 인수인계

- `tasks/HANDOFF_CLAUDE_CODE.md`에 업무 목적/완료 기준/코드 위치/검증 범위/다음 순서/붙여넣기 지시 정리.
- GitHub main 실시간 `git ls-remote` 결과656124f2e49533571507191a157245e605abc8c2. 로컬 main33e3c06은12커밋 ahead, 문서 작성 전 status161항목. 최신 구현 다수 미커밋·미추적이므로 GitHub clone만으로 이어받기 불가. 이번 요청은 문서화만 수행, commit/push/배포/운영변경 없음.
- 독립 읽기검토로 직접 Google 호출 경로·모의시험 범위·과거 Sites/R2/설치형 기획과 현행 웹 우선의 차이 확인. 테스트 결과는 직전 개발 턴의787tests 기록이며 이번 문서화에서 재실행하지 않음.

## 2026-09-15 lint 복구 및 비교문맥 미완료 상태 일치

- main/33e3c06 기존 변경 보존. ai-integration 시험의 unbound-method 2건은 spyOn으로, gemini-outbound 익명 default export 경고는 명명 객체로 수정. 테스트/요청 기능 변경 없이 전체 lint PASS.
- 다음 단계 독립 검토에서 비교문맥이 빠져도 타깃 응답만 모두 있으면 ai.state=completed가 되는 모순 발견. 전체 완료 게이트는 원래 차단했으나 개별 상태는 불일치했다. gemini-review와 ai-progress가 contextComplete를 완료 조건으로 함께 사용하도록 수정(RUN-004/007, AI 미검수 보존).
- 부모 promptVersion 구버전/문맥 미기록/false도 자식에서 completed 또는 contextComplete=true로 승격하지 않음. 기존 원본·부모 실행 불변. 행·지침 미응답 안내는 실제 타깃 미완료일 때만 표시하고 문맥 누락 안내와 구분. 지침/산식/임계값/키/모델 변경 없음.
- 회귀 단언 추가 후 수정 전 8 failures 재현 → 수정 후 관련3 files/89 tests PASS. 전체75 files/787 tests PASS, npm run lint/typecheck/build:cloudflare PASS, 변경5파일 oxfmt PASS. git diff --check는 오류 없음(CRLF 변환 경고 별도). 독립 검토 2files/81tests PASS.
- 새 빌드로 node tools/smoke-review-compute.mjs --large-report PASS: 20,000행/200,000missing 조합 전체 대조, ZIP4,427,238bytes, 저장/재독2716ms, 해시·감사·원본·권한·저장거절 확인. 로컬 모의 Google 응답이며 실제 Gemini/Drive/브라우저/운영 메모리/배포는 미실행.
- 남은 다음 단계: 48KiB 초과 전체 교차비교는 현재 매 묶음 문맥 제한으로 미완료이며, 타깃 분할 전송만으로 완료되지 않는다. 승인된 비교 범위와 문맥 분할/누락 대조를 구현·검증한 후 실제 Gemini→보고서 저장 사이클 확인. 이번 변경은 거짓 완료 상태 방지이지 대규모 교차비교 구현 완료가 아님. FIN 근거 보존·ponytail 최소변경 적용.

## 2026-09-15 빌드된 Worker 대용량 보고서 저장 검증

- main/33e3c06 기반 기존 미커밋 작업 보존. 제품 코드·키·모델·운영 자료 변경 및 배포 없음. REP-001/002/003/004 관련 저장 검증 추가.
- `node tools/smoke-review-compute.mjs --large-report`: 실제 dist Worker→DO→DriveStorage→로컬 OAuth/Drive 모의응답→D1 경로 통과. 외부 네트워크 전부 로컬 처리, 알 수 없는 요청 차단. 합성 계정·세션·암호화 자격증명만 사용. 운영 빌드의 저장소가 google-drive 상수라 R2 바인딩 전환 시험은 무효였으며 최종 시험은 빌드 수정 없이 Drive 경로를 사용한다.
- 합성 20,000 원본 색인행×10지침=200,000 missing 조합을 저장된 XLSX에서 전체 고유 쌍과 대조: 누락/중복/대상외 없음. 마지막 실행 저장+재독+감사 대조2660ms, ZIP4,427,238bytes. 미검수 기록 시험이지 AI가 200,000건 검수했다는 뜻이 아님. 최소 행 fixture이며 실제 최대 입력/Worker 운영 메모리 한도 검증이 아님.
- 응답/저장 바이트 SHA256·size·DB stored 상태·감사 payload/실행ID 대조, 원본 JSON 불변, DO 재저장 동일키/해시 확인. Drive 메타데이터 변조409, viewer 저장403, 업로드거절401은 saved 없음·감사 증가 없음·reserved 상태 유지. 실제 Google OAuth 자격증명 유효성/온라인 Drive/실제 Gemini는 미검증.
- 기존 `node tools/smoke-review-compute.mjs` PASS. 관련 report-save/report-performance/completeness 3 files/36 tests PASS. 변경한 도구3개 oxlint/oxfmt PASS. 전체 lint는 기존 lib/review/ai-integration.test.ts:213,280 unbound-method 2 errors 및 workers/gemini-outbound.ts:63 warning으로 실패. 마지막 shell의 smoke 성공 exit와 분리해 실패로 기록한다. 이 턴은 테스트 도구만 변경했으며 새 빌드/전체시험 재실행은 하지 않음.
- 다음: 기존 lint 오류 정리,48KiB 초과 비교문맥의 검수 대상 누락 방지 설계 및 실제 Gemini→Drive 보고서 검증. 현재 전체검수/운영 검증 완료 아님. FIN 근거 보존과 최소변경 원칙으로 기존 테스트 도구를 확장함.

## 2026-09-15 대용량 보고서 메모리·긴 셀 보강

- 20,000행×10지침=200,000 미기록 조합 합성 export 측정. 수정 전 로컬Node:2047ms,ZIP3,801,636bytes,확장XML83,770,227bytes,RSS90,693,632→514,187,264bytes. 기존 일괄 XML/ZIP 생성의 메모리 확대 확인.
- 범위 시트 행은 generator로 순차 생성, XML은약32KiB 단위로 기존 fflate ZipDeflate에 전달. 고정mtime/순서 유지. 수정 후 단독시험1830ms,ZIP4,430,426bytes,RSS90,578,944→170,622,976bytes. 압축크기는 증가, 확장내용은 모든200,000조합/20,000색인행 유지. RSS는 생성 전후이지 Worker peak가 아니며 해제·검증용unzip 피크도 별도다. 운영 메모리 안전성을 확정하지 않음.
- Excel32767자 제한(https://support.microsoft.com/en-us/excel/excel-specifications-and-limits): 초과 문자열은 5번째 긴 셀 원문 시트에 최대30000 UTF-16 단위 조각으로 보존하고 기존 셀에 시트/셀참조 표시. 서로게이트쌍 경계 보호, CR은XML문자참조로 보존. 기존 제어문자 제거 정책은 그대로이며 모든 제어문자/OOXML escape 리터럴의 완전보존은 별도 미검증.
- 한글/이모지/CRLF/특수문자 긴 사유를 독립Saxes XML읽기로 재조립해 동일성 확인. 입력파서8KiB 안전한도는 변경하지 않음. 동일입력 바이트동일/보고서저장 이력 회귀 통과. 새ZIP 인코딩으로 새 저장해시는 바뀔 수 있으나 과거보고서 삭제/덮어쓰기 없음.
- 전체75 files/784 tests PASS, typecheck/build:cloudflare PASS. 최종 시험용 XML읽기를 deprecated 옵션 없이 Saxes로 변경한 뒤 관련7 tests/typecheck/lint PASS. 로컬벤치마크만 수행, 실제 Excel 화면/운영 대용량/실제 Gemini 및 Drive 사이클/배포는 미실행.
- 다음: 운영 실행환경의 대용량 보고서 안전성 확인,48KiB 초과 비교집단 설계 및 실제AI검수-보고서 사이클. 신규의존성/키/모델/원본 변경 없음.

## 2026-09-15 보고서 누락·원본 위치 대조 — 로컬 저장 재독 검증

- 기존 3개 시트/열 순서 보존. 검수 결과 맨끝에 비교 대상 원본 위치 추가, 4번째 시트 원본 행 색인에 ID·파일·버전·해시·시트·행·셀·fieldRefs·제외 사유 기록. 같은 좌표를 행×지침마다 중복 확장하지 않음.
- 기존 AI ledger는 실패/중복/대상외 기록을 그대로 보존하며, 기대 행×활성지침에서 기록이 아예 없는 조합만 missing/처리 기록 없음·미검수로 추가. 요약의 부분검수 판정 유지, not_flagged를 정상으로 번역하지 않음. 원본 및 실행 JSON 불변.
- 실제 서비스 저장 경로의 모의 저장소 bytes를 readWorkbook으로 재독해 missing/failed/원본 위치/fieldRefs/비교대상 대조. 기존 보고서 저장키·과거판단 보존·권한취소·저장실패 회귀 유지. 전체74 files/782 tests, typecheck, build:cloudflare 및 변경파일 lint/format PASS. 초기 새 시험의 parser.rows.cells 접근 오류 수정 후 재실행 통과.
- 독립검토 반영: 전체200,000조합에 원본좌표를 복제하는 별도 시트는 만들지 않음. 여전히 대규모 보고서 CPU/메모리와 긴 집계 셀의 Excel 호환성은 추가검증 필요. 이번 저장소는 모의환경이며 실제 Drive/실제 Excel 화면/실제 Gemini 실행/운영 배포는 미실행.
- 다음: 대용량 보고서 및48KiB 초과 비교집단 설계, 승인된 실제 검수→보고서 사이클 검증. 현재 단계는 보고서 추적성 보강이지 전체검수 완료가 아님.

## 2026-09-15 분할 비교 문맥 전달 — 제한 내 구현 / 실제 AI 미검증

- 각 묶음 대상과 비교 문맥을 분리. 서버는 pending 대상 외에도 전체 동일 사례 스냅샷의 범위 적용 행을 contextRows로 전달한다. 대상 R별칭/비교 C별칭, 대상 최대60조합 및 전체48KiB UTF-8 상한 유지. 전체 문맥이 안 들어가거나 제외·미매핑·긴값이 있으면 contextComplete=false로 전체완료 차단. 큰 자료의 전역 비교를 완성한 것은 아님.
- ai.contextComplete를 실행 JSON에 보존, promptVersion fin-gemini-evidence-2-context. 구버전/부모 미완료 및 이전 issues는 계승. 기존 실행 불변. 완료 게이트는 문맥 전달 기록 true를 요구한다. 비교행 체크 응답 거절, 언급된 유효 별칭은 peerIds/원본 위치 근거로 연결, 존재하지 않는 별칭 근거는 unable 처리. 문맥 전달은 AI 정확도 증명이나 최종 승인 아님.
- 시험:65행 첫 대상60+문맥5/다음 대상5+문맥60;2만행 문맥은48KiB 이내에서 중단하고 미완료;부모false→자식true 오인 차단;제외/미매핑/긴값/중복문맥 차단;서버전체스냅샷 전달;허위별칭 unable. 실제 외부AI 아닌 응답 모의시험이다.
- 최종 74 files / 781 tests PASS, typecheck PASS(초기 boolean 추론 오류 수정 후), build:cloudflare PASS, 관련oxlint/format PASS, built Worker+DO/D1 로컬 smoke PASS. 독립검토의 허위별칭 문제 반영. 마이그레이션/새 의존성/운영배포/키·모델 변경 없음.
- 다음: 48KiB 초과 자료의 비교집단 설계 및 실제 Gemini 교차오류 탐지·보고서 대조. 운영 전체 사이클 미검증 상태 유지. 승인된 배포 전 현재 코드가 운영 반영됐다고 안내하지 말 것.

## 2026-09-15 누락 대조·반복 탐색 수정 — 로컬 검증 완료

- completeness.ts: 현재 대상 rowId × 활성 instructionId의 유일 기록을 검사. 원장 없음/누락/중복/대상 외 기록/미처리 상태는 전체 완료 차단. coverage는 원장으로 계산한 평가 수와 대조하며, 화면·보고서 평가 조합 수도 원장 기준. 중복 대상 식별자와 비정상 파일·시트 카운터 차단. 기존 실행을 변경하지 않음. 관련 기준 AI-003, UI-004, REP-002.
- server.ts: 부모의 pending rowId를 Set으로 한 번 만들고 원본 rows 순서로 선택. 기존 대상·지침·권한·이력 동작 보존. 화면 완료 판정은 run 변경 시 한 번만 계산(기존 렌더당 4회). 새 의존성/스키마/마이그레이션 없음.
- 검증: 전체 74 files / 772 tests PASS, typecheck PASS, build:cloudflare PASS. 변경 4개 코드파일 oxlint 및 oxfmt check PASS. 완료 게이트 27 tests에 20,000행 × 10지침(200,000기록) 합성 대조, 누락 상쇄용 중복, 실패/미전송/판단불가/제외와 완료 카운터 불일치 포함. 서버 이어가기 기존 회귀 통과. 독립 읽기 검토에서 제시한 중복 지침 카운터도 보강.
- 미완료: 분할 묶음 간 비교, 실제 Gemini 분할 실행·보고서 원본 대조. 전체 자료 검수 완료 또는 운영 오류 해결로 확대 보고하지 않음. 운영 미배포, 키·모델·원본 변경 없음.
- 다음: 분할 비교 문맥 및 미평가 처리 흐름 보강 후 승인된 배포와 실제 전체 사이클 검증. 롤백은 이번 코드 변경만 되돌리는 방식이며 기존 이력/DB 변경 없음.

## 2026-09-15 후속 검증 — 로컬 PASS / 전체 완료 기준 미통과

- 재실행: 74 files / 754 tests PASS, typecheck PASS, build:cloudflare PASS. 빌드 산출물의 로컬 workerd + SQLite DO/D1 smoke PASS: 상태 조회, 변경 입력 검증, 미인증·다른 프로젝트·교차 사이트 거절 확인. 외부 네트워크 차단 시험이며 실제 Google 호출/운영 검증이 아님.
- 확인된 보완점: completeness.ts는 sourceAudit와 coverage/ai 집계를 대조하지만 aiChecks의 실제 rowId·instructionId별 존재/중복/상태는 대조하지 않는다. 집계가 맞는 것만으로 원장 누락까지 검증했다고 주장할 수 없음. 완료 판정에 원장 대조 및 불일치 회귀 추가 필요.
- 대용량 합성 측정(Node 로컬, 1회): 20,000행 × 10지침 = 200,000기록. 현재 이어가기의 행별 some 탐색 5,676ms; 동일 pending 행 Set 조회 비교 12ms. 선택 결과 양쪽 20,000행 동일. 운영 Worker CPU 측정은 아니며 현재 코드 미변경.
- 분할 묶음 간 비교 미구현으로 전체 완료 차단 유지. 실제 Gemini 분할 실행·중단/재개·보고서 원본 대조는 미검증, 이번 검증에서 배포/키/모델/원본 변경 없음.
- 다음 시작: 원장 기반 완료 판정 보강 → pending 선택 반복 탐색 제거 → 중단/재개 회귀 → 운영 분할 검증. 전 지침·전 대상 처리 완료로 보고 금지.

## 2026-09-15 분할 이어가기 — 구현 및 로컬 검증

- AiCheck 원장: 원본 rowId·지침Id별 pending/suspected/not_flagged/unable/excluded/failed와 사유 저장. 60조합 뒤 대상을 버리지 않고 pending으로 보존.
- run.parentRunId로 저장된 이전 실행에서 미전송 행만 선택. 이전 판단결과·행상태 보존, 새 실행에 합산. 원본/매핑/지침/파일·시트목록/키 설정·모델이 다르면 차단. parent별 D1 claim으로 동시 중복 이어가기 방지. 불확실 호출 자동재시도 없음.
- UI 최초 동의 후 순차 최대10묶음/15초 간격. 매묶음 영구저장 후 다음 호출. 실패/사용자 중단/페이지 종료 시 다음 호출 중지. 나머지는 '미전송 다음 묶음 검수'로 이어가기. 기존15분10회 회사한도 유지. 미평가/제외를 평가성공으로 바꾸지 않음.
- 분할 묶음 간 AI 교차비교는 미구현이므로 해당 경우 전체완료를 보수적으로 차단한다. 공종간 중복 등 비교지침의 문맥분할 문제를 해결하기 전 전체정확도PASS 금지. 또한20,000행/24MiB 근거한도는 그대로이며 대용량 전체 처리는 추가작업.
- 회귀: 65행→60행평가+5행미전송→나머지5행만전송·65상태합산, 실패60/미전송5구분, 서버이어서미전송만호출·중복차단 통과. 이전 이력 불변 확인. 관련68 tests 및 추가서버8 tests PASS. 현재 운영미배포, 실제 Gemini 분할검수/화면자동진행은 미검증.
- 다음: 실제 UI 분할중단/재개 검증, 실패·판단불가 재검토 흐름 및 지침별 교차묶음 비교를 확정. 키/모델/유료등급 임의 변경 없음.
- 후속검증: 전체753 tests PASS, build:cloudflare PASS. 이후 호출전 journal.claim 실패시 해당 parent claim만 해제하는 보강 및 UI 순차회귀 추가. UI 실제15초 대기→이전runId로 다음묶음 자동요청/요청ID분리 회귀 포함 관련28 tests PASS, 최종typecheck PASS. 실Google·실브라우저 전체사이클과 운영배포는 미실행.

## 2026-09-15 전체 자료 완료 게이트 — 로컬 구현, 운영 미반영

- 사용자 완료 기준: 등록 자료의 검수 대상이 빠짐없이 처리되어야 전체 완료. 현재 case/실행 스냅샷 범위를 표시하고 다른 case·후속 업로드까지 완료로 확대하지 않는다.
- Run.sourceAudit에 현재 비대체 등록 목록(업로드 미완료 포함) 파일 수, 읽은 파일 수, 전체 워크북 시트 수, 매핑 처리 시트 수 및 누락 사유 저장. 미매핑 파일도 워크북 시트를 조사. 원본/기존 실행 수정 없음.
- completeness.ts를 화면·Excel 보고서가 공유. 인벤토리 없는 과거 실행, 누락 파일/시트, 미실행 지침, 부분/실패, 행·지침 조합 불일치는 전체 완료 차단. 제외 사유 승인/해소 체계가 없으므로 제외도 보수적으로 부분 검수 유지.
- 이 변경은 전체 완료 판정 1단계이며 AI 60조합 제한 이후 자동 분할·체크포인트·이어하기는 아직 미구현. 산출서 전체 실제 검수 완료로 보고 금지. 키/모델/요금제/배포 변경 없음.
- 관련31 tests PASS. 전체750 tests 중 권한취소 테스트1건이 새 인벤토리 읽기 batch에서 너무 일찍 취소되는 문제 확인: AI 후 최종저장 시점의 취소로 테스트 위치를 바로잡고 기존 권한/ready 복구 단언 유지, 해당9 tests PASS. 최종 전체 재검증 결과는 후속 기록.
- 다음: 전체 대상 행·지침별 상태 원장과 제한된 분할 실행/성공 묶음 저장·실패 재개를 구현하고, 누락 파일·다중시트·60조합 초과·중단 복구를 실제 흐름으로 검증. 무제한 병렬 호출 금지.
- 최종 로컬 재검증: 74 files/750 tests PASS, typecheck PASS, build:cloudflare PASS. 변경9파일 format PASS(시험파일1개 형식 수정 후 재확인). 운영 배포·실제 전체 AI 실행은 이번 단계에서 하지 않음.

## 2026-09-15 11:38 — 최종 배포 재검증 FAIL: Google 503 재발

- 사용자 재검증 요청으로 최종2ed9dc4b 배포를 Chrome 새로고침 후 동일 합성자료/회사키/gemini-3.7-flash로 1회 시험. 실행02b47d79-5f3c-4a9b-adf7-bb59bd14ff0e(11:37:35), failed0/18행. Google HTTP503/GOOGLE_HTTP_RESPONSE, 내장1초·2초 재시도2회도 실패. 직렬화/위치거절 오류는 이번 실행에서 관찰되지 않음. 단일503의 근본 원인 확정 못함.
- 실패·미평가를 포함한 보고서 저장 완료 UI 확인. 이전4b56dce3 성공응답 및 실패이력 유지. 정상AI검수보고서가 아니며 안정화 통과 불가. 키/모델/코드/배포/원본 변경 없음.
- main에서 workerd plainDTO smoke200 및 관련50 tests/4files PASS. 로컬PASS와 운영FAIL 구분. 실제 현장자료·보고서 파일내용은 미검증. 다음: 같은 입력의 성공/503 차이를 안전한 공급자 응답 진단으로 좁힐 것. 근거 없이 키재발급/유료서버/모델변경을 해결책으로 단정하지 말 것.

## 2026-09-15 11:18 — 직접 AI 호출 실응답 및 보고서 저장 확인

- 최종 경계보강 배포 2ed9dc4b-55bd-4b38-b54e-69b5975d72f1. build PASS, plain DTO workerd 합성 호출 200 ok:{} PASS. 실제 AI 호출은 직전6426c690에서 확인했으며 최종 헤더/null-body 보강 배포에서는 중복 과금 재실행하지 않음. 운영 임시 tail 종료.
- DO의 파싱·인증·중복방지·복구 저장은 유지하고, Google 생성만 최초 HTTP Worker의 RPC 콜백으로 실행. 별도 전달 Worker/self-binding 제거. 키·gemini-3.7-flash·원본·지침 활성화 상태 불변.
- self-binding 배포622d2e0b 시험4379ae02(11:00:48)는 위치 거절 실패. Request/Response 콜백 배포8e4719e2 시험148d1deb(11:07:07)는 네트워크 분류 실패. 진단배포d2cdc975 시험11:12:51에서 고정 안전 로그 QC_AI_RPC_FAILURE SERIALIZATION 확인. 원문 예외·키·자료 로그 없음.
- plain DTO 콜백 배포6426c690-e7c9-41d6-9a61-76604f3fe8e6 시험4b56dce3-98c1-4da9-b916-ed2800339f3d(11:15:57): 실제 Gemini 응답, partial 8/18행, 입력1809/출력2287토큰, AI후보1건+기본3건. 미평가10행=사전제외4행+산식없는집계5행+미확인변수H1행. 전체 정상/전체평가로 보고하지 않음.
- 동일 실행에서 보고서 저장 버튼 실행 후 화면 Excel 보고서 저장 완료 확인. 기존 실패 실행이력 유지. 합성자료만 사용, 실제 현장자료/계정/키 변경 없음.
- 전체734 tests/73 files 및 typecheck PASS. 독립검토24 tests PASS, 새Critical/High없음. 후속 경계 보강: 응답헤더3종만 전달,256KiB응답제한,204/205/304 null body,UTF8분할/초과취소 테스트. callback 자체60초, DO기존60초 유지. RPC원격 Abort 전파/브라우저종료시계속실행은 보장하지 않음.
- 다음: 동일 설정으로 실제 업무자료 검수 및 장기 반복 안정성 확인. 이번 합성 실행1회 성공은 공급자 장애 재발 방지 보장이 아님. 직원 권한·새파일등록·보고서 파일 내용 대조는 이번 턴에서 재실행하지 않음.

## 2026-09-15 10:45 — 직접 호출 배포 / 실제 시험 실패 구분

- 사용자 검증 승인 후 배포 efe3d333-5517-41d3-8949-37acd7ed3fe4 완료. 배포 출력 GEMINI_OUTBOUND binding 없음, 기존 DO/D1 유지.
- Chrome 로그인 세션 유지. 저장된 새 회사키/3.7 그대로 최소 생성 1회: HTTP200 / GENERATION_EMPTY / GOOGLE_HTTP_RESPONSE. 성공 본문은 없으므로 생성 성공 아님.
- 기존 합성 프로젝트 v1 시험 1회, 실행44818f64 (UI prefix), 10:45:46: AI failed0/18, GOOGLE_USER_LOCATION_UNSUPPORTED. 기본 후보3건/실행이력 저장. 원본/키/모델/지침활성화 불변, 성공보고서 저장 안함.
- main Worker probe와 기존 DO 검수의 실행 위치 차이가 남음. 실제 egress는 측정하지 않았으므로 특정 국가 단정 금지. 다음 수정은 DO의 영속 실행/중복방지 보존하면서 AI 생성 실행 위치를 main 호출과 일치시키는 최소경계 검토. Cloud Run 결제 증액을 필수라고 단정하지 않음. 200 empty 원인은 별도 확인(64토큰 한도만으로 단정 금지).

## 2026-09-15 — 사용자 요청: Gemini 직접 호출로 변경

- regional-fetch.ts의 GEMINI_OUTBOUND 서비스 바인딩 호출 제거. 기존 forwardGemini 보안 경계를 같은 런타임에서 실행하고 native fetch로 Google 직접 요청. export 이름은 기존 호출자 호환을 위해 유지. 공용/개인 설정 및 실제 검수에 공통 적용.
- wrangler.cloudflare.json services 제거, 클레임센터 참고와 같은 gcp:asia-northeast3 placement. 기존 DO/D1/마이그레이션/키/모델 유지. 별도 Worker 리소스 삭제 및 Google 결제 변경 없음.
- 관련 70 tests, 전체 729 tests/71 files 및 typecheck PASS. 독립 검수 22 tests PASS, 새 Critical/High 없음. 직접 본문/취소신호/키외 헤더 제거/응답 표식/다른 origin 차단 검증.
- 운영 배포 및 실제 생성 성공 미검증. 설정 probe는 main Worker, 실제 검수는 기존 DO에서 실행되므로 각각 재검증 필요. main placement 변경은 기존 DO 위치를 옮기지 않음. 다음: Cloudflare 빌드 확인 후 배포 및 두 실행 경로의 합성 시험.

## 2026-09-15 — 새 키 생성 실패 / 클레임센터 호출 비교

- Chrome 회사 API 화면에서 마지막 모델 접근 확인 09:46:36, gemini-3.7-flash 저장 확인. 고정 문장 생성 1회 결과 HTTP503 / AI_PROVIDER_UNAVAILABLE / GOOGLE_HTTP_RESPONSE. 키 원문 열람 없음, 원본 전송 없음. 키 교체로 복구되지 않음.
- 읽기 전용 참고 비교: ../claim-center-reference 76f42a7 및 ../claim-center-test-reference b3ec5b7(둘 다 08-31)에서는 Worker 직접 fetch, placement gcp:asia-northeast3. QC는 GEMINI_OUTBOUND 전달 Worker 및 aws:ap-northeast-2. 동일 Google v1beta generateContent 및 x-goog-api-key 사용. 참고 코드와 현재 클레임센터 운영 배포 일치 여부 미검증.
- AI_PROVIDER_UNAVAILABLE는 내부 포괄 오류 분류이며 Google 전체 장애 확정 근거가 아님. 지역 거절 1회와 반복503의 단일 원인도 미확정. 새 Cloud Run이 필수 해결책이라고 확정하지 않음.
- 다음: 현재 정상 클레임센터 배포의 호출 설정을 확인하고 동일 모델/최소 요청의 경로 대조로 원인 격리. 이번 조사에서 코드·배포·다른 프로젝트 설정 변경 없음.

## 2026-09-15 — 결제 연결 승인 후 Google 할당량으로 차단

- 사용자가 실제 결제 연결/API 활성화를 명시 승인하여 명령 실행. 이전 auto-review 차단과 달리 이번에는 Google이 FAILED_PRECONDITION / Cloud billing quota exceeded로 거절. 지정 결제 계정의 할당량 증액 URL 반환: https://support.google.com/code/contact/billing_quota_increase .
- 같은 QC quota project를 명시한 billing projects list 조회 성공: 기존 billingEnabled=true 프로젝트 5개. 이것만으로 계정 한도가 정확히 5개라고 단정하지 않음. 기존 프로젝트 결제 해제/변경 없음.
- 후속 run/cloudbuild/artifactregistry/secretmanager 활성화도 UREQ_PROJECT_BILLING_NOT_FOUND로 실패. 새 Cloud Run 생성/배포 및 실제 Gemini 정상화 미완료. 기존 CF 웹/DB/키/모델/자료 불변.
- 다음: Google 결제 프로젝트 할당량 증액 요청 또는 사용자가 지정한 기존 결제 프로젝트 사용 결정 필요. 다른 업무 프로젝트 임의 사용/결제 해제 금지. 재로그인이나 동일 결제 승인 반복 요청 불필요.

## 2026-09-15 — QC 전용 Google 프로젝트 생성 완료

- 사용자 신규프로젝트 생성승인 후 concost-qc-relay-20260915 (CONCOST QC Relay, number662262718701) 생성 완료. 계정 concost.dt@gmail.com.
- 새프로젝트 cloudbilling.googleapis.com 활성화. billing API 조회는 --billing-project=concost-qc-relay-20260915 지정필수(기본quota프로젝트681255809395 수정금지).
- billingEnabled=false. 사용가능한 기존결제계정1개(0146AA-41A35E-137912, OPEN=True) 조회. 결제계정연결 및 run/cloudbuild/artifactregistry/secretmanager 활성화 명령은 auto-review가 별도명시적 결제연결승인 부족으로 실행전거절. 우회/재실행금지; 사용자에게 실제비용발생가능성과 연결/API활성화 승인을 요청.
- Cloud Run 생성/배포/relay코드구현 미완료. 기존CF웹DB/키/모델/자료불변. 다음: 결제연결 명시승인→제한적API활성화→호출서버구현검증 및 서울배포.

## 2026-09-15 — 회사 계정 인증 완료 / 배포 프로젝트 확인 필요

- 사용자 완료 응답 후 session65700 정상종료. gcloud auth list에서 concost.dt@gmail.com ACTIVE 확인. 재로그인 요청하지 말 것.
- 같은 계정을 명시한 qc-studio-508006 describe는 PermissionDenied(or nonexistent). projects list도 정상조회했으나 해당ID 및 QC Studio 이름 없음. 계정인증 문제와 프로젝트권한 문제를 구분.
- 접근가능한 다른 업무프로젝트에 임의배포하거나 결제연결하지 않음. 신규QC전용프로젝트 생성 vs 기존QC프로젝트권한 확보 결정 필요. 호출서버 구현/새CloudRun배포는 아직 미완료. 운영CF/키/모델/자료불변.

## 2026-09-15 — 배포 인증 재확인

- gcloud auth list에는 jjwwhhjj1116@gmail.com만 있음. concost.dt@gmail.com을 명시한 QC 프로젝트 조회는 valid credentials 없음으로 실패. 회사계정 SDK 인증이 완료되지 않은 상태임.
- 이전 session56089는 소멸. `gcloud auth login concost.dt@gmail.com --brief`로 브라우저 인증 재개(session85488). 사용자가 회사계정으로 로그인·허용해야 함. 인증코드/비밀번호 공유 불필요.
- 새 호출서버 구현·배포 완료 아님. 기존 운영 배포·키·모델·자료 변경 없음.

## 2026-09-14 — Google Cloud 호출 분리 승인 / 인증 준비

- 사용자 "ㅇㅇ"로 웹·DB Cloudflare 유지, Gemini 호출만 Google Cloud 서울분리 및 신규서비스/결제연동 가능성 고지 후 진행 승인.
- 현재 CLI 계정 jjwwhhjj1116@gmail.com은 qc-studio-508006 프로젝트 조회권한 없음. 브라우저에서도 동일계정 Cloud Run API 활성화권한 없음 확인. 다른프로젝트로 임의배포하지 않음.
- Chrome 기존 concost.dt@gmail.com 세션으로 전환 가능 확인. SDK는 기존설치됨(추가설치안함). `gcloud auth login concost.dt@gmail.com --brief` 인증대기, 터미널session56089. 최초 no-launch-browser 시도는EOF종료되어재사용금지. 인증코드/토큰조회·출력금지.
- 사용자에게 열린 SDK로그인창의 회사계정 로그인·허용 요청. 현재 새Google서비스/결제/API활성화/Cloudflare수정배포 없음.
- 독립검수: 기존forwardGemini 경계재사용 후보. shared-bearer 앱인증이면 공개네트워크endpoint라도 미인증전달차단필수; min0/max1은절대비용상한아님. IAM/WIF와비교하여인증방식확정후구현. 다음시작: CLI인증완료확인→QC프로젝트/기존결제/권한확인→전달서버구현·경계테스트→배포→합성검수보고서검증.

## 2026-09-14 16:40 KST — 원인 분리 및 복원력 수정

- main/33e3c06 dirty 보존. 배포 b49f17b2-f185-4e4f-9166-511e4c315c77. Google 확정503만 최대2회 backoff, 총60초, 네트워크/timeout/다른HTTP/출력검증실패 재시도금지. probe는 단일생성/60초 hard deadline. 키·3.7모델/DO claim/원본/지침 보존.
- 전체727tests PASS, typecheck/build/변경4파일oxlint·oxfmt PASS. 독립검수 Critical/High 없음. 재시도기록 시점 수정후review40tests/build 재통과.
- 최소생성은 25초와 수정후60초 모두 TIMEOUT. 새trial 5c9de96d-e286-4f82-a6b5-ffd53999f0b0 (16:40:26)는 GOOGLE_USER_LOCATION_UNSUPPORTED, failed0/18. 이 실행은503backoff 대상이 아니며 추가호출 없음. 기본후보3건 유지. 새보고서 저장/지침활성화 안함.
- private1e1ca2aa versions view --json: placement_mode=targeted, aws:ap-northeast-2 적용 확인. 구성누락 아님. 이 위치오류가 과거모든503의 원인이었다는 증거는 없음. Gemini 정상화 미완료.
- NEXT: 사용자 승인 없이 다른클라우드/결제/공개proxy 만들지 않음. 웹·DB를Cloudflare에 유지하면서 호출경로를 지원지역 서비스로 분리할지 승인 필요. 무한유료재실행 금지.

## 2026-09-14 16:17 KST 재검증

- 관리자 Chrome 로그인 확인 후 동일 합성자료/초안v1/공용3.7으로1회 실행. d348d6f0-b8d2-4f70-905b-a53691e67162는 Google503(GOOGLE_HTTP_RESPONSE), AI failed0/18. 기본 후보3건 유지. 실패 포함 시험보고서7381bytes 저장 UI+D1감사 확인. 성공보고서 아님.
- 운영 f70a60e0 유지, 이번 코드/키/모델/배포 변경 없음. 관련50tests 재실행 PASS. 자동반복호출 없음. 다음 작업: 최소 생성과 검수 요청의 실패 재현 비교, 기존 성공 한 건으로 해결 선언 금지. 실제업무 프로젝트·지침활성화 변경 없음.

## 2026-09-11 15:20 KST 최신 시작점

- 미평가 unable 사유 유실 수정·배포 f70a60e0-19ce-49ca-97c2-e26d4b930903. 기존 coverage.reasons에 원본행/판단불가사유/응답누락 구분. 721tests/typecheck/build PASS.
- 동일3.7/합성v1 재시험 ad4c4eef-5f48-4dc0-a055-c505734dbbc6는 Google503 failed0/18 재발. 이전 성공8/18 보고서 보존, 새 AI 성공/새보고서 미완료. 스키마 제거만으로 완전 해결 주장 금지.
- NEXT: 간헐503 요청/전달경로 분리 검증→새 응답의 상세 미평가 사유 확인. 초안 비활성 유지. 긴 사유 보고서 한셀 상한 보강 필요. 상세QA 최상단 참조. 아래는 이전 이력.

## 2026-09-11 14:52 KST 이후 최신 시작점

- 공용 키 실제 생성 성공. 키·gemini-3.7-flash 유지. Google responseSchema 제거 후 run 9f8eb3f4-dee6-4937-9e33-5ca1c2cee789 실제 AI partial8/18, 입력1809/출력2481토큰, AI 불일치 후보1건 반환. 로컬 응답·근거 검증 유지. 최신 main 배포 d1acb5ef-aa1d-4a34-b3e9-356602375243.
- AI 포함 시험 XLSX 저장 UI+D1 감사 확인(7675bytes). 키 저장/생성 성공 표시 분리 및 AI 화면 내 동의 적용. 전체720 tests/typecheck/build PASS. 상세 docs/qa/2026-09-11-cloudflare-ai-cycle.md 최상단 참조.
- NEXT: 나머지10행 미평가 원인·범위 확인→합성 지침 정식 사이클 검증. 초안v1 비활성, 전체 검수 완료 아님. 대용량/동시 직원/보고서 시각검증 미실행. 기존 실패·원본 보존, 자동 재호출 금지. 아래는 이전 이력.

## 2026-09-11 13:23 KST 최신

- 사용자 요청으로 공용모델3.7-flash 변경·검증 저장 성공. 키유지. 실제trial765aae03도 Google503 failed0/18. 현재설정3.7유지. 이전3.8유지지시는 이 요청으로 변경됨. AI 성공미완료, 자동반복없음. 상세QA 최신3.7소절 참조.

## 2026-09-11 13:06 KST 시작점

- 최종: c88dd2b1 trial은 실제 Google503(GOOGLE_HTTP_RESPONSE), failed0/18. 사용자가3.8유지 지정(대체모델 금지). 실패 포함 시험XLSX7374bytes 저장+서버감사 확인. 실제AI성공/활성화/정식보고서는 미완료. 관련54tests PASS. 다음에는 중복재호출하지 말고 기존run부터확인.

- 실제 trial4a3571d8은 5xx failed0/18. 키·모델 변경없음. private1e1ca2aa/main0ec4f311에서 정확한 HTTP 상태+고정 응답출처 구분 배포(51tests/tsc/build PASS).
- 재시험 클릭 후 Chrome native confirm 제어시간초과. 사용자에게 확인 요청했으므로 중복 클릭하지 말고 결과부터 확인. 성공/새 보고서는 미완료. 상세QA 최신소절 우선.

## 2026-09-11 12:17 KST 최신 시작점

- 운영 웹64598c48 / private Gemini outbound2dbf4bca 배포. 같은 공용 키로 신규 공통 경로 모델 조회 성공. DO/recovery/원본 유지. 전체715 tests/typecheck/build/native binding smoke PASS.
- 현재 Chrome 합성 프로젝트의 지침 시험 native confirm을 도구가 처리하지 못해 사용자 확인 요청. 중복 실행하지 말고 최근 run부터 확인(현재 마지막 4c08e132 failed).
- NEXT: 실제 Gemini 시험 결과→성공한 합성 지침 활성화→정식 AI 검수→보고서 저장 검증. 연결 이력의 현재 상태 오표현 UI, 대용량/동시직원/전체파일 AI coverage는 남은 과제.
- 상세 docs/qa/2026-09-11-cloudflare-ai-cycle.md 최신 후속. 아래 내용은 이전 이력.

## 2026-09-11 운영 배포 및 실제 사이클 후속

- 최신 Worker `8696e5fc-6bb6-4af9-8021-c8b5e087fdd0`. 사용자 승인 배포. 실제 등록 원본 읽기에서 native fetch 수신 객체와 분할 업로드 해시 호환 오류 수정.
- 합성 CSV 2개 등록/읽기/수동 의미 연결/기본 시험/Excel 시험 보고서 Drive 저장 및 D1 감사기록 확인. 전체 674 tests PASS. 기존 업무 자료 보존.
- Gemini 시험 failed 0/18. 모델 목록 조회도 Google HTTP400 / AI_REQUEST_INVALID. AI 성공 및 정식 활성화 미완료. 추가 유료 재시도 없음.
- NEXT: 관리자 공용 키/Google 거절 해결 후 AI 시험→지침 활성화→정식 검수·보고서. 상세 docs/qa/2026-09-11-cloudflare-ai-cycle.md. 아래 미배포 기록은 이전 후보의 이력이며 최신 상태가 아님.

## 2026-09-11 current handoff: AI execution and storage recovery

- Implemented explicit Gemini primary action vs AI-free basic checks; accurate 60 row/instruction-pair limit. Pending response recovery UI invokes storage only.
- Existing project DO stores bounded immutable Run chunks before Drive write. Resume retains run identity and decisions; claimed/ready/completed states prevent silent paid retries. Limits: 4 pending / 1000 records, no automatic expiration or administration cleanup yet.
- Verified 657 tests, typecheck/lint/format/build; real local SQLite DO roundtrip smoke and browser menu→review→synthetic report-save. No real Gemini/Google Drive or deployment.
- NEXT: explicit candidate deployment approval, real provider/Drive/report cycle, large-file memory and recovery journal lifecycle. Details WEB_DESKTOP_PLAN section 24. Desktop paused.

## 2026-09-11 current handoff: report persistence candidate

- Implemented explicit report save API and UI with retry/error handling, content-addressed snapshot keys, permissions and completion audit. Download remains independent. See WEB_DESKTOP_PLAN section 23.
- Verified 646/646 tests, typecheck, changed-file lint/format, direct build and built Worker/DO/D1 smoke. Service-cycle test uses actual SQLite/state/parser and fake external AI/storage; not provider/browser E2E.
- NEXT: clarify primary basic-vs-AI execution, handle AI-success/storage-failure recovery, then authorized deployment and real company Gemini/Drive/report cycle. No production changes this turn; desktop remains paused.

## 2026-09-10 current handoff: web registration → review

- Local candidate: registered Drive original integrity/preflight, atomic preparation, private Durable Object review forwarding, STEP2 preparation/retry UI. Existing files preserved; no production deployment. Details: `docs/WEB_DESKTOP_PLAN.md` section 22 and ADR-012.
- Verified: 639 tests; final UI subset 29 tests; built Worker→DO→D1 smoke including authentication, project access and CSRF denial.
- NEXT: actual browser XLSX→preparation→admin instructions→company Gemini→report/Drive cycle; multiple-file failure recovery; large-file memory/free-tier runtime validation. Real provider cycle remains unverified. Desktop expansion paused; do not equate local test success with production completion.

## 2026-09-07 delivery slice (current)

- IMPLEMENTED: FIN source preview + confirmed mapping; versioned conditions/exceptions; arithmetic/decimal/range/summary-code candidates; frozen R2 evidence and D1 decisions; connected light workstation.
- VERIFIED: pure/parser/SQLite guards; standard check/build, clean D1 migration, production dependency audit; real local browser source→trial→formal→decision→reload; authenticated XLSX response. Four-viewport regression: 9 passed, 3 intentional mobile-only skips.
- RELEASE: Owner-private pilot publishing requested by user; deployment result is verified separately from local checks. Evidence and limits: `docs/CONCOST_QC_RELEASE_2026-09-07.md`.
- TODO / needs-domain-validation: actual FIN variable/formula-code resolution, merged hierarchical context, 20-rule coverage, configurable reference information, Gemini semantic/typo/multilingual candidates, cross-file quantities, revision matching, large-input async execution, final report approval and RC/masonry.

These slice statuses do not mark every historical acceptance item below complete.

Statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

Completion requires code, tests, acceptance evidence and updated docs—not implementation alone.

## Phase 0 — Discovery and contracts

| ID     | Task                                                                | Owner                                  | Depends              | Acceptance / output     | Status      |
| ------ | ------------------------------------------------------------------- | -------------------------------------- | -------------------- | ----------------------- | ----------- |
| P0-001 | Inspect instructions, git state, project root and user changes      | main + repo_mapper                     | —                    | repository map          | DONE        |
| P0-002 | Map package manager, scripts, app/server routes, tests and fixtures | repo_mapper                            | P0-001               | PLAT-004                | DONE        |
| P0-003 | Inspect `.openai/hosting.json` and existing Sites linkage           | repo_mapper + platform_architect       | P0-001               | PLAT-002                | DONE        |
| P0-004 | Verify Sites starter/runtime/build compatibility                    | platform_architect                     | P0-002               | PLAT-001                | DONE        |
| P0-005 | Verify D1/R2 binding names and local/test strategy                  | platform_architect                     | P0-003               | PLAT-003                | IN_PROGRESS |
| P0-006 | Verify identity/access/sign-in mechanism                            | platform_architect + security_reviewer | P0-004               | AUTH-001/002            | BLOCKED     |
| P0-007 | Verify upload/request/build/storage constraints                     | platform_architect                     | P0-004               | decision log            | DONE        |
| P0-008 | Decide parser library and restricted formula scope                  | main                                   | P0-002/P0-007        | parser ADR              | IN_PROGRESS |
| P0-009 | Decide decimal representation and unit table                        | main + review_engine consult           | P0-002               | ADR-003                 | DONE        |
| P0-010 | Freeze canonical row/value/lineage schema                           | main                                   | P0-008/P0-009        | NORM contracts          | DONE        |
| P0-011 | Freeze rule/result/finding/evidence/run contracts                   | main                                   | P0-010               | RUN/RULE/FIND contracts | DONE        |
| P0-012 | Freeze D1/R2 model and migration ownership                          | main + data_platform consult           | P0-005/P0-010/P0-011 | data contract           | DONE        |
| P0-013 | Freeze API/error/idempotency/concurrency contract                   | main                                   | P0-006/P0-012        | API contract            | DONE        |
| P0-014 | Decide request-bounded or resumable review execution                | main + platform_architect              | P0-007/P0-011        | ADR-004                 | DONE        |
| P0-015 | Decide report formats/PDF path and AI disabled boundary             | main                                   | P0-004/P0-007        | ADR-006/007             | DONE        |
| P0-016 | Verify ThreeUI MCP tool schema/entitlement or fallback              | main + platform_architect              | P0-004               | ADR-008/component log   | BLOCKED     |
| P0-017 | Map QA/security/a11y/performance tools and commands                 | qa_auditor                             | P0-002               | QA baseline             | DONE        |
| P0-018 | Publish file ownership table and Phase 1 batch                      | main                                   | P0-010..017          | orchestrator gate       | DONE        |

## Phase 1 — Secure vertical skeleton

| ID     | Task                                                         | Owner                          | Depends             | Acceptance / output | Status      |
| ------ | ------------------------------------------------------------ | ------------------------------ | ------------------- | ------------------- | ----------- |
| P1-001 | Establish typed environment/config and health diagnostics    | data_platform                  | P0-018              | PLAT-003/005        | IN_PROGRESS |
| P1-002 | Create baseline D1 migrations and migration tests            | data_platform                  | P0-012/P1-001       | REL-002             | DONE        |
| P1-003 | Implement verified actor resolver                            | data_platform                  | P0-006              | AUTH-001            | IN_PROGRESS |
| P1-004 | Implement project membership/role policy                     | data_platform                  | P1-002/P1-003       | AUTH-002..006       | IN_PROGRESS |
| P1-005 | Implement project/case repositories and application services | data_platform                  | P1-002/P1-004       | PROJ/CASE           | DONE        |
| P1-006 | Implement safe error envelope/correlation/log redaction      | data_platform                  | P1-001              | API/OBS             | DONE        |
| P1-007 | Implement append-only audit base                             | data_platform                  | P1-002/P1-006       | AUD-001/002         | DONE        |
| P1-008 | Implement R2 port/adapter contract with exact private keys   | data_platform                  | P0-005/P1-004       | AUTH-007            | IN_PROGRESS |
| P1-009 | Build Korean-first app shell and identity state              | frontend_ui                    | P0-013              | UI/A11Y             | DONE        |
| P1-010 | Build project dashboard/create/detail/case shell             | frontend_ui                    | P1-005 API contract | PROJ/CASE E2E       | DONE        |
| P1-011 | Implement loading/empty/error/unauthorized/conflict states   | frontend_ui                    | P1-009/P1-010       | UI-003              | IN_PROGRESS |
| P1-012 | Add project role/cross-project integration tests             | data_platform                  | P1-004/P1-005       | AUTH-003/004/005    | IN_PROGRESS |
| P1-013 | Add Phase 1 browser keyboard flow                            | frontend_ui                    | P1-010/P1-011       | A11Y-001            | DONE        |
| P1-014 | Security and QA audit integrated skeleton                    | security_reviewer + qa_auditor | P1-001..013         | Gate 1              | IN_PROGRESS |
| P1-015 | Main-agent integration checks and evidence                   | main                           | P1-014              | Gate 1 complete     | IN_PROGRESS |

## Phase 2 — Ingestion

| ID     | Task                                                         | Owner                                     | Depends              | Acceptance / output | Status      |
| ------ | ------------------------------------------------------------ | ----------------------------------------- | -------------------- | ------------------- | ----------- |
| P2-001 | Add source/upload/import/dataset migrations                  | data_platform                             | P1-015               | data model          | IN_PROGRESS |
| P2-002 | Implement upload intent/finalize/idempotency                 | data_platform                             | P2-001/P1-008        | FILE-001/007        | IN_PROGRESS |
| P2-003 | Implement signature/type/filename/size guards                | data_platform                             | P0-008/P2-002        | FILE-002/003        | IN_PROGRESS |
| P2-004 | Implement archive/sheet/row/column/cell safety limits        | data_platform                             | P2-003               | FILE-003/004        | IN_PROGRESS |
| P2-005 | Implement XLSX safe inspection                               | data_platform                             | P2-004               | IMP-001/003         | TODO        |
| P2-006 | Implement CSV encoding/delimiter inspection                  | data_platform                             | P2-003               | IMP-002             | TODO        |
| P2-007 | Implement mapping draft/proposal/confirm versions            | data_platform                             | P0-010/P2-005/P2-006 | MAP-001..003        | TODO        |
| P2-008 | Implement decimal/unit/text/floor normalization              | review_engine or assigned import owner    | P0-009/P0-010        | NORM-001..005       | TODO        |
| P2-009 | Implement canonical dataset persistence/checksum/diagnostics | data_platform                             | P2-007/P2-008        | NORM-006..008       | TODO        |
| P2-010 | Implement resumable import state/lease if required           | data_platform                             | P0-014/P2-009        | failure recovery    | TODO        |
| P2-011 | Create synthetic structure/semantic/security fixtures        | qa owner or assigned implementation owner | P0-017/P2-003        | fixture catalog     | IN_PROGRESS |
| P2-012 | Build upload and validation UI                               | frontend_ui                               | P2-002/P2-003 API    | FILE-009            | IN_PROGRESS |
| P2-013 | Build sheet inventory/preview UI                             | frontend_ui                               | P2-005/P2-006 API    | IMP UI              | TODO        |
| P2-014 | Build mapping/unit/floor/exclusion UI                        | frontend_ui                               | P2-007 API           | MAP-004             | TODO        |
| P2-015 | Build data-quality/diagnostic/skipped-rule UI                | frontend_ui                               | P2-009 API           | NORM-006/007        | TODO        |
| P2-016 | Add refresh/retry/conflict/browser ingestion tests           | frontend_ui + data_platform owned tests   | P2-012..015          | E2E                 | IN_PROGRESS |
| P2-017 | Hostile upload/security/performance audit                    | security_reviewer + qa_auditor            | P2-001..016          | Gate 2              | IN_PROGRESS |
| P2-018 | Main integration and Gate 2 evidence                         | main                                      | P2-017               | Gate 2 complete     | IN_PROGRESS |

## Phase 3 — Deterministic FIN MVP

| ID     | Task                                                    | Owner                                   | Depends                | Acceptance / output   | Status |
| ------ | ------------------------------------------------------- | --------------------------------------- | ---------------------- | --------------------- | ------ |
| P3-001 | Implement review profile/rule registry and eligibility  | review_engine                           | P0-011/P2-018          | RULE-001/002          | TODO   |
| P3-002 | Implement restricted formula parser/evaluator           | review_engine                           | P0-008/P2-008          | RULE-003              | TODO   |
| P3-003 | Implement tolerance/evidence/finding fingerprint core   | review_engine                           | P3-001/P2-008          | RULE-004/005/FIND-001 | TODO   |
| P3-004 | Implement COM data/unit/value/duplicate/subtotal rules  | review_engine                           | P3-001..003            | common rules          | TODO   |
| P3-005 | Implement FIN-CALC-001 and FIN-SUM-002                  | review_engine                           | P3-002..004            | FIN-001/002           | TODO   |
| P3-006 | Implement FIN exact duplicate/unit/rounding rules       | review_engine                           | P3-003/P3-004          | FIN-003               | TODO   |
| P3-007 | Add clean/boundary/missing/mixed-unit/repeat tests      | review_engine                           | P3-004..006            | RUN-009/RULE          | TODO   |
| P3-008 | Add review run/rule result/finding/evidence migrations  | data_platform                           | P0-012/P3-003 contract | RUN/FIND storage      | TODO   |
| P3-009 | Implement run create/stage/idempotency/immutability     | data_platform                           | P0-014/P3-008          | RUN-001..005/007/008  | TODO   |
| P3-010 | Implement finding list/detail/state/events/comments     | data_platform                           | P3-008/P3-009          | FIND-001/003/005/010  | TODO   |
| P3-011 | Implement adjustment overlay and rerun snapshot         | data_platform                           | P2-009/P3-009          | ADJ/CMP-001           | TODO   |
| P3-012 | Build review configuration/progress UI                  | frontend_ui                             | P3-009 API             | RUN-004/008           | TODO   |
| P3-013 | Build results/findings/evidence/history UI              | frontend_ui                             | P3-010 API             | FIND-002..004         | TODO   |
| P3-014 | Build disposition/comment/adjustment UI                 | frontend_ui                             | P3-010/P3-011 API      | FIND/ADJ              | TODO   |
| P3-015 | Add end-to-end FIN review/rerun/refresh/conflict flow   | frontend_ui + data_platform owned tests | P3-012..014            | Gate 3 E2E            | TODO   |
| P3-016 | Domain evidence review and deterministic checksum audit | qa_auditor                              | P3-001..015            | Gate 3                | TODO   |
| P3-017 | Security review of findings/state/adjustment auth       | security_reviewer                       | P3-008..015            | Gate 3 SEC            | TODO   |
| P3-018 | Main integration and Gate 3 evidence                    | main                                    | P3-016/P3-017          | Gate 3 complete       | TODO   |

## Phase 4 — Statistics, RC and comparison

| ID     | Task                                                     | Owner                  | Depends         | Acceptance / output | Status |
| ------ | -------------------------------------------------------- | ---------------------- | --------------- | ------------------- | ------ |
| P4-001 | Implement robust cohort/MAD/IQR primitives               | review_engine          | P3-018          | statistical core    | TODO   |
| P4-002 | Implement FIN alias fragmentation policy                 | review_engine          | P4-001          | FIN-004             | TODO   |
| P4-003 | Implement FIN outlier/typical-floor rules                | review_engine          | P4-001          | FIN-005/006         | TODO   |
| P4-004 | Implement FIN completeness/GFA/basis/reference guards    | review_engine          | P4-001          | FIN-007..010        | TODO   |
| P4-005 | Implement RC profile prerequisites and unit classes      | review_engine          | P3-003/P4-001   | RC-008/010          | TODO   |
| P4-006 | Implement RC concrete/formwork/rebar rules               | review_engine          | P4-005          | RC-001..003         | TODO   |
| P4-007 | Implement RC member/duplicate/floor/missing/ratio rules  | review_engine          | P4-005/P4-001   | RC-004..009         | TODO   |
| P4-008 | Add RC/statistical domain fixtures and performance tests | review_engine          | P4-001..007     | RULE/RC             | TODO   |
| P4-009 | Add baselines/cohorts/config/profile-version persistence | data_platform          | P4-001 contract | config storage      | TODO   |
| P4-010 | Implement cross-run continuity/comparison API            | data_platform          | P3-009/P3-010   | CMP-002/003         | TODO   |
| P4-011 | Build cohort/baseline/profile config UI                  | frontend_ui            | P4-009 API      | FIN/RC config       | TODO   |
| P4-012 | Build RC prerequisite/not-evaluated and result views     | frontend_ui            | P4-005..010 API | RC-010              | TODO   |
| P4-013 | Build run comparison UI                                  | frontend_ui            | P4-010 API      | CMP-002/003         | TODO   |
| P4-014 | Domain reviewer sign-off workflow/evidence               | main + domain reviewer | P4-002..008     | domain validation   | TODO   |
| P4-015 | Statistical/RC QA and L-dataset performance audit        | qa_auditor             | P4-001..013     | Gate 4              | TODO   |
| P4-016 | Main integration and Gate 4 evidence                     | main                   | P4-014/P4-015   | Gate 4 complete     | TODO   |

## Phase 5 — Contextual assistance, reports and audit

| ID     | Task                                                       | Owner                                     | Depends              | Acceptance / output | Status |
| ------ | ---------------------------------------------------------- | ----------------------------------------- | -------------------- | ------------------- | ------ |
| P5-001 | Define minimized contextual request/output schemas         | review_engine + main contract             | P4-016               | AI-002/003          | TODO   |
| P5-002 | Implement output/reference validation and Level C assembly | review_engine                             | P5-001               | AI-003/005          | TODO   |
| P5-003 | Implement AI-disabled adapter and provider boundary        | data_platform                             | P5-001               | AI-001/006          | TODO   |
| P5-004 | Persist AI assessment provenance/limitations safely        | data_platform                             | P5-002/P5-003        | AI-004              | TODO   |
| P5-005 | Add malicious/malformed/timeout AI tests                   | review_engine + data_platform owned tests | P5-002..004          | AI P0               | TODO   |
| P5-006 | Add report/approval/audit migrations                       | data_platform                             | P3-008/P4-016        | report model        | TODO   |
| P5-007 | Implement XLSX export with formula-injection defense       | data_platform                             | P5-006               | REP-003/004         | TODO   |
| P5-008 | Implement printable HTML and verified PDF decision         | data_platform                             | P0-015/P5-006        | REP-004/005         | TODO   |
| P5-009 | Implement private artifact/checksum/download               | data_platform                             | P1-008/P5-007/P5-008 | REP-004/006         | TODO   |
| P5-010 | Implement report approval/self-approval/supersession       | data_platform                             | P5-006/P5-009        | REP-006/007         | TODO   |
| P5-011 | Implement audit query/export/admin basics                  | data_platform                             | P1-007/P5-006        | AUD-003             | TODO   |
| P5-012 | Build Level C labels/limitations/error UI                  | frontend_ui                               | P5-002..004 API      | AI UI               | TODO   |
| P5-013 | Build report preview/generate/approval UI                  | frontend_ui                               | P5-007..010 API      | REP UI              | TODO   |
| P5-014 | Build audit/admin UI                                       | frontend_ui                               | P5-011 API           | AUD UI              | TODO   |
| P5-015 | Security audit AI/report/XSS/injection/download/approval   | security_reviewer                         | P5-001..014          | Gate 5 SEC          | TODO   |
| P5-016 | QA audit AI-disabled/failure/report fixtures               | qa_auditor                                | P5-001..014          | Gate 5 QA           | TODO   |
| P5-017 | Main integration and Gate 5 evidence                       | main                                      | P5-015/P5-016        | Gate 5 complete     | TODO   |

## Phase 6 — Hardening and ThreeUI

| ID     | Task                                                           | Owner                                         | Depends       | Acceptance / output   | Status |
| ------ | -------------------------------------------------------------- | --------------------------------------------- | ------------- | --------------------- | ------ |
| P6-001 | Complete full keyboard/screen-reader/zoom/contrast audit fixes | frontend_ui                                   | P5-017        | A11Y P0/P1            | TODO   |
| P6-002 | Complete required viewport/error/long-Korean visual fixes      | frontend_ui                                   | P5-017        | UI-001..005           | TODO   |
| P6-003 | Establish performance baselines/budgets and fix regressions    | main + implementation owner                   | P5-017        | PERF-001/002          | TODO   |
| P6-004 | Research up to three ThreeUI candidates                        | platform_architect or read-only catalog agent | P0-016/P6-003 | component scorecards  | TODO   |
| P6-005 | Approve ThreeUI candidate or Community/no-enhancement fallback | main                                          | P6-004        | ADR/component log     | TODO   |
| P6-006 | Implement approved lazy wrapper/fallback only                  | frontend_ui                                   | P6-005        | PERF-003/004/A11Y-004 | TODO   |
| P6-007 | Verify ThreeUI license/network/privacy/cleanup/performance     | security_reviewer + qa_auditor                | P6-006        | ThreeUI gate          | TODO   |
| P6-008 | Complete retention/deletion/reconciliation tests/runbooks      | data_platform                                 | P5-017        | RET/SEC-004           | TODO   |
| P6-009 | Complete operations/admin diagnostics and failure injection    | data_platform                                 | P5-017        | OBS/reliability       | TODO   |
| P6-010 | Full security regression and threat-model closeout             | security_reviewer                             | P6-001..009   | SEC P0                | TODO   |
| P6-011 | Full QA/acceptance/performance/visual evidence                 | qa_auditor                                    | P6-001..010   | REL-001               | TODO   |
| P6-012 | Main fixes/integration and saved-candidate readiness           | main                                          | P6-011        | Gate 6                | TODO   |

## Phase 7 — Candidate and release

| ID     | Task                                                          | Owner                  | Depends   | Acceptance / output | Status      |
| ------ | ------------------------------------------------------------- | ---------------------- | --------- | ------------------- | ----------- |
| P7-001 | Verify exact commit, clean source, migrations and QA manifest | main                   | P6-012    | release source      | TODO        |
| P7-002 | Release-manager read-only audit                               | release_manager        | P7-001    | GO/NO-GO            | TODO        |
| P7-003 | Resolve NO-GO findings and re-run evidence                    | assigned owner + main  | P7-002    | checklist pass      | TODO        |
| P7-004 | Save Sites candidate without production deployment            | main                   | P7-002 GO | PLAT-006/REL-003    | DONE        |
| P7-005 | Review candidate source/migrations/access/core smoke          | main + qa_auditor      | P7-004    | candidate evidence  | DONE        |
| P7-006 | Present candidate, risks, audience and rollback to user       | main                   | P7-005    | approval request    | DONE        |
| P7-007 | Obtain explicit deployment and audience approval              | user                   | P7-006    | REL-004             | DONE        |
| P7-008 | Deploy only approved saved version                            | main                   | P7-007    | production URL      | DONE        |
| P7-009 | Verify intended and unauthorized visitor behavior             | main + qa_auditor      | P7-008    | REL-005             | IN_PROGRESS |
| P7-010 | Inspect production health and finalize release evidence       | main + release_manager | P7-009    | release complete    | IN_PROGRESS |

## Critical path

### 2026-09-09 신규 전환 기획 — 웹 + Windows

2026-09-10 우선순위 변경: 사용자 요청으로 웹 자료등록·검수 완성을 우선한다.
설치형 확장은 보류. 현재 시작점은 `docs/WEB_DESKTOP_PLAN.md` 20절.
실제 웹 CSV/XLSX 원본 저장 확인, 보관 대상 오류 안내·패키지 비JSON 응답 처리 수정,
66파일/615테스트 PASS. 수정본 미배포. uploaded→안전 검사→검수 연결과 16파일 실증은 미완료.

현재 인수인계와 다음 시작점은 `docs/WEB_DESKTOP_PLAN.md` 10~11절을 따른다.
기존 Phase 상태를 데스크톱 완료 상태로 재사용하지 않는다.

- WD-01: 기획 후 일반 기준 우선 진행 승인. 건설사별 기준서는 후속 확장으로 분리.
- WD-02/03: IN_PROGRESS — 관리자/직원 실제 로그인·합성 일반검수·XLSX 출력·로그아웃 2사이클 PASS. UI 경합 12개 회귀 포함. 전체 권한·대형파일·복구 게이트는 별도.
- WD-04: IN_PROGRESS — 수동 열·자료종류·산식값 의미 매핑과 SHA 검증, 미확정 편집 차단, 합성 원본→매핑→B2 근거→XLSX 통합 통과. 로컬 매핑은 세션 한정이며 영구 저장·대형 실자료는 미검증.
- WD-05: IN_PROGRESS — 관리자 지침 복사·신규 초안 및 시험/상세/활성화 화면 연결(0.1.2). 무AI 시험, 평가 실적·버전 충돌·중복 요청 방지, 미저장 초안/응답 유실/권한·프로젝트 전환 회귀 검증. 운영 서버 사이클·신규 Drive 자료 검사 완료 전환·로컬 엔진의 지침 적용은 미완료. 조건/예외는 원 버전 보존, 데스크톱 편집 미지원. 기획서 15절 참조.
- WD-06: TODO — 건설사별 기준서/회사 AI. 일반 기본검수 완료와 구분.
- WD-07: IN_PROGRESS — 등록 원본 선택 UI·인증 IPC·PC 작업 프로세스 연결, 합성 서버 실제 Electron 가져오기→매핑→기본검수→XLSX PASS. 실인증 다운로드·서버 승격·AI/Drive 결과 동기화 미완료. 기획서 17절, qa/2026-09-10-registration-bridge.md 참조. 새 Setup 교체 없음.
- WD-08: IN_PROGRESS — 내부 무서명 NSIS 생성과 asar 허용목록·SHA 검증. 설치/제거·서명·업데이트 미검증. 에이전트별 관리표는 기획서 12절.
- 관리자 수정 가능한 일반 검수 조건·예외 요구는 유지한다. 건설사 기준서는 일반 기능 완료의 선행 조건이 아니다.
- 기존 운영 웹과 데이터는 유지·미배포. 다음 시작은 WEB_DESKTOP_PLAN.md 16절. Setup 클릭 무반응 원인 미확정, 설치 내부 앱 실행만 확인.

```text
P0 contracts
 -> P1 auth/data shell
 -> P2 canonical ingestion
 -> P3 deterministic FIN vertical slice
 -> P4 statistical/RC
 -> P5 reports/contextual
 -> P6 hardening
 -> P7 saved candidate -> explicit approval -> deploy
```

ThreeUI and AI are not on the critical path.

## 2026-09-15 Gemini 실제 오류 본문 대조

- 진단 배포 `4adc2e39-5b1c-4b73-bae8-0e73dbc73370`: 알려진 오류 사유를 고정 문구로 보존. 원문 키/프롬프트는 노출하지 않음. 키·모델·호출 경로 변경 없음.
- 합성 시험 `64867c82-611c-45b1-90c3-3e28d40ddb2c` (13:07:19 KST): Gemini 3.7 Flash failed 0/18, GOOGLE_HIGH_DEMAND. Google 오류 본문에 높은 수요/과부하 표현 확인. 503 재시도 1초/2초 기록. 429 한도 초과로 분류하지 않음.
- 이어서 동일 저장 키/모델의 관리자 `짧은 문장 생성 시험` 1회 성공. 키 등록/인증 전체 불능 아님. 최소 요청은 DO 검수 경로·JSON 출력 조건을 사용하지 않으므로 완전 동등 비교는 아님.
- 참고 Claim 코드와 URL/키 헤더/JSON 출력/8192 출력 토큰/설정 지역 동일. 시간 제한·RPC·응답 검증 차이 존재. 표기 차이를 원인으로 단정하지 않음. 참고 코드와 현재 Claim 운영 버전 일치 여부 미검증.
- 진단 회귀 50개 PASS; 타입 검사·Cloudflare 빌드 PASS. 실제 검수는 실패이며 완료로 전환하지 않음. 다음: 동일 키·모델을 보존한 제한된 대조시험으로 입력/출력 조건 영향과 일시 과부하 분리. 운영 자료·지침 활성화·키 변경 없음.

## Current execution note — 2026-09-01

- The statuses above separate local code completion from remote platform verification.
- P0-005 Cloudflare Sites/D1/R2 provisioning is complete for an owner-only diagnostic environment. P1-008 remains `IN_PROGRESS` until hosted identity and multi-account isolation are attacked end-to-end.
- P1-002 is complete only for the initial migration on a clean local database plus idempotent reapplication; release upgrade/recovery fixtures remain a later hardening requirement.
- P1-005, P1-009, P1-010 and P1-013 are complete for the project/review-case slice, not for ingestion or the review engine.
- P1-012 still needs the complete production role matrix even though project-scoped case denial is covered locally.
- The Phase 1 operational product gate remains **NO-GO**. The owner-only deployment is approved only for UI and synthetic diagnostics while Phase 2 ingestion and Phase 3 deterministic review continue.
- Phase 2A now has additive ingestion migrations, package-intent API, bounded byte upload, structural XLSX/CSV preflight, exact private R2 storage and a basic multi-file upload UI.
- The current byte request performs authorized storage and D1 completion against one inspected snapshot. Orphan reconciliation, expired cleanup, status refresh, semantic workbook inspection, project identity verification, mapping and canonical normalization remain incomplete.
- The Phase 2 gate remains **NO-GO** until those missing boundaries and Phase 2 evidence are completed; P2-001..004, P2-012 and P2-016 therefore remain `IN_PROGRESS`.
