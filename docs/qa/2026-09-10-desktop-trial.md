# Desktop 0.1.2 — 관리자 지침 시험 UI

기준: main / HEAD 33e3c06b87a65a5207fa22cf3c21eb961373f1a0 + 기존 미커밋 변경.
이번 범위: desktop 지침 UI/테스트/스타일, 준비 매핑 개수/회귀, 버전 표시/패키징,
기존 합성 Electron smoke 확장, 기획·백로그 기록. 운영 웹/DB/Drive 변경 없음.

## 검증

- `npm test`: 64파일 / 573테스트 PASS (2026-09-10 09:14 KST).
- `npm run typecheck`: PASS.
- `npm run desktop:build`: PASS.
- 지침 UI 회귀 12개, 전송 계층 18개 포함.
- impeccable detector: 수정 UI 두 파일 결과 `[]`. 실제 화면 확인을 대체하지 않는다.
- 개발 Electron 합성 원본→매핑→기본검수→XLSX→지침 초안 저장/조회→무AI 시험→활성화 PASS.
- 원본 SHA 불변, 보고서 B2 근거·SHA 확인. 실제 승인 버튼 키보드 Enter 동작 확인.
- `output/playwright/desktop-mapping-8433d33c-8656-4777-b323-070162e2410e/`의
  매핑/지침 1440·1000 PNG 네 장을 열어 확인했다. 1000 화면의 긴 내용은 패널 스크롤 사용.
- sandbox Electron 실행은 시작 중 Playwright assertion으로 실패하여 승인된 실행 경로에서 재실행 PASS.

시험의 인증/서버 응답은 전부 모의이고, 유료 AI 호출 0, 운영 서버 쓰기 0.
확인된 것은 실제 앱 IPC/UI와 모의 서버 계약의 연결이다. 운영 권한/데이터 실증은 별도다.

## 패키지 및 독립 화면 검토

- `npm run desktop:package`: PASS. 기존 0.1.1 패키지는 보존했다.
- 파일: `desktop/release/CONCOST-QC-Internal-Preview-Setup-0.1.2.exe`, 111535511 bytes.
- SHA256: `2AC981636AE621E08ED6B1D169FA3EA3DDDD941B98DB7CC33842EFD131EDDD69`.
- Authenticode: `NotSigned`. 내부 시험용이며 설치 마법사 설치/제거는 미검증이다.
- 패키지의 `win-unpacked/CONCOST QC Studio.exe`로 동일 Electron smoke PASS.
  인증/서버는 모의이며 운영 쓰기 0, AI 호출 0이다.
- 패키지 화면 증거: `output/playwright/desktop-mapping-04a3072f-b0e7-4b63-b282-cee9151bbc81/`.
  매핑/지침 1440·1000 및 펼친 결과 1000 PNG 총 다섯 장을 직접 확인했다.
- 독립 UI 검토: 첫 검토의 1000px 결과 증거 부족을 재촬영으로 보완한 뒤 `ship`.
  중요 UI 결함 없음. 이번 관리자 지침 UI만의 판정이며 운영 배포/서버 검수 완료 승인이 아니다.

## 남은 범위 상세

신규 Drive 파일은 검사 대기이며 서버 검수용 승격은 미구현. 로컬 검수에서 관리자 지침
적용·AI 호출·Drive 보고서 동기화도 미구현. 설치 마법사 설치/제거, 서명, 자동 업데이트,
전체 키보드 흐름·200% 확대는 이번 시험 범위가 아니다. 내부 무서명 시험판만 제공한다.
수용 기준은 AI-001/SEC-003/UI-003·004 관련 부분 증거이며 전체 제품 GO가 아니다.
