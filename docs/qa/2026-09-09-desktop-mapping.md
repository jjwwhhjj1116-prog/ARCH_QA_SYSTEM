# Desktop 0.1.1 — 수동 매핑·관리자 지침 초안

저장소 main / 기반 HEAD `33e3c06b87a65a5207fa22cf3c21eb961373f1a0`.
기존 dirty 변경 보존, 새 커밋/운영 배포 없음. 정식 출시 NO-GO 유지.

## 구현·검증 범위

- 원본 미리보기, 자료 종류/헤더/열 의미/산식 결과값 의미 수동 매핑.
- 원본 SHA 변경 및 잘못된 시트/열/중복/필수 열 누락 차단. 미확인 자료 미평가.
- 매핑/검수는 Worker에서 수행, 기존 회원·프로젝트 권한 전후 확인 유지.
- 초안은 프로젝트별 기존 서버 API 재사용. 기존 조건/예외/수치 기준 보존.
- 지침 저장 중 로그인 전환/로그아웃 시 매 요청 전 계정·epoch 재확인.
- 원본/보고서 덮어쓰기 방지 유지. 로컬 임시 매핑이며 영구 저장 아님.

## 실행 증거

`npm test`: 최종 64파일 553테스트 통과(다중 원본 미리보기 합계 한도 회귀 포함).
최종 화면 수정 뒤 `npx vitest run desktop`: 6파일 51테스트 통과.
`npm run typecheck`, 범위 oxlint, `npm run desktop:build` 통과.

`node tools/smoke-desktop-mapping.mjs` 실제 Electron에서:

- 모의 회원 인증, 모의 서버 응답, 합성 CSV만 사용. 운영 통신/변경 0, AI 호출 0.
- 미지 양식 → 수동 A/B/C/D 열 지정 → 미확정 검수 차단 → 확정 → BASIC-SYNTAX/B2 근거 → XLSX PASS.
- 관리자 새 지침 초안 저장 → 목록 재조회 → 같은 항목 복원 PASS.
- 로그아웃 후 패널/출력 차단, 원본 SHA 불변 PASS.
- OS 열기/저장 대화상자는 합성 경로 반환으로 대체. 실제 설치 마법사·Excel UI 미검증.
- 출력 XLSX ZIP 재열기에서 BASIC-SYNTAX, 원본 SHA 확인.
- 스크린샷: `output/playwright/desktop-mapping-f4e1ad1d-9b4d-4060-a715-dbe8ebe82b96/` 1440/1000 창 매핑·관리자 화면.

초기 검증에서 select의 input/change 순서가 불필요한 초안 확인창을 여는 오류를 발견,
버전 선택 input을 작성값 변경에서 제외하고 native 순서 회귀를 추가했다.
독립 UI 검수는 두 메뉴 동시 선택 P2를 지적했고, 관리자 화면에서 이전 메뉴 선택을
보관·복원하는 방식으로 수정했다. 최종 4개 스크린샷 재검수에서 해당 P2 resolved / 해당 결함 기준 ship.
1000px 매핑 폼의 긴 내부 스크롤은 비차단 개선사항.

## 최종 패키지

- `desktop/release/CONCOST-QC-Internal-Preview-Setup-0.1.1.exe`, 111,532,601 bytes.
- SHA-256 `c9496ce63bb5db007c59e01c4961b917e392ced1030113074e230011f299a261`.
- Authenticode `NotSigned`; 이전 0.1.0 Setup 보존.
- main/worker가 공유하는 contracts chunk도 패키지 허용목록에 포함하고 실제 포함 파일 SHA 검증.
- `desktop/release/package-manifest.json`의 모든 파일과 최종 build 바이트 일치 확인.
- 최종 패키지 EXE를 `tools/smoke-desktop-mapping.mjs`의 선택 executable 인자로 실행, 동일 합성 흐름 PASS.
- 최종 증거 `output/playwright/desktop-mapping-26b4d843-1d34-4388-adbf-1851b4c4752e/`:
  매핑·관리자 화면 1440/1000px, `manual-analysis.xlsx`. 운영 인증/서버/AI는 모의 처리.
- Setup 마법사 설치·제거는 실행하지 않았다. EXE 통합 통과와 설치 완료를 구분한다.

## 수용 기준·잔여

MAP-002/IMP-003/FILE-004/AUTH-004/005/RUN-008: 해당 로컬 slice 자동·모의 통합 검증.
MAP-003: 실행 스냅샷 보존만 해당; 세션 이후 수동 매핑 복원/영구 버전 저장 미구현.
관리자 조건/예외 직접 편집, 서버 자료등록·시험·승인, 회사 AI·Drive 동기화는 다음 단계.
실제 운영 초안 저장은 실행하지 않았음. 200% 확대·키보드 전체 여정·실제 대형자료 미검증.
설치파일은 무서명 내부 시험용이며 자동업데이트·설치/제거 완료를 의미하지 않음.
# 후속 검증: 지침 시험 전송 계층 (2026-09-09 17:13 KST)

main / HEAD `33e3c06b87a65a5207fa22cf3c21eb961373f1a0` 위 미커밋 변경.
이번 추가 수정: desktop/main.mjs, main.test.ts, instructions.mjs,
instructions.test.ts 및 기존 기획서/백로그/결정 기록. 기존 사용자 변경 보존.

- 기존 API를 통한 trial/trial-detail/approve, 시험은 includeAi=false 고정.
- 케이스/지침 ID·버전·스냅샷 불일치, 비시험 결과, 평가 0건, AI 지침 미평가,
  미확정 매핑, 권한 및 오래된 버전 차단. 서버가 최종 승인 권한을 재검증한다.
- 동일 앱의 지침 변경 동시 요청 차단. 전송 실패 또는 비정상 JSON 응답은
  성공 처리하지 않으며 자동 재시도 없음. 처리 여부는 서버 이력으로 확인해야 한다.
- `npm test`: 64파일 / 566테스트 PASS (17:11:12 실행).
- `npm run typecheck`, `npm run desktop:build`: 최종 소스 PASS.
- 수정한 네 코드/테스트 파일 scoped oxlint PASS.
- 최초 prettier 시도는 미설치 도구 다운로드 캐시 권한 오류. 새 의존성 추가 없이
  저장소의 oxfmt로 메인 두 파일 정리 완료; 에이전트도 소유 파일 oxfmt 적용.

수용 기준: AI-001, SEC-003, UI-004의 전송 경계 관련 합성 회귀 증거만 추가.
UI/E2E/전체 릴리스 통과를 의미하지 않는다. 새 화면 버튼, 실제 서버 지침 변경,
Drive 업로드, 유료 AI 실행, 새 Setup 패키징/배포는 수행하지 않았다.
기존 0.1.1 설치본은 이번 소스 변경을 포함하지 않는다.

다음: ADR-011 inspection_pending 자료의 안전한 검사 완료 전환·서버 매핑 저장,
관리자 시험/활성화 화면, 이후 회사 AI 및 Drive 보고서 통합 시험.
