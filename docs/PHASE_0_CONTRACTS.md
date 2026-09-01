# Phase 0 계약 동결

상태: **로컬 구현 승인 / 클라우드·배포 미승인**

## 기술 경계

| 영역          | 결정                                    | 현재 검증 상태                                 |
| ------------- | --------------------------------------- | ---------------------------------------------- |
| 런타임        | OpenAI Sites 공식 Vinext scaffold + npm | 로컬 build 확인                                |
| 관계형 데이터 | D1, binding `DB`                        | 로컬 포트만 구성; 실제 계정 연결 대기          |
| 파일 바이트   | R2, binding `FILES`                     | 포트만 구성; 실제 계정 연결 대기               |
| 인증          | ChatGPT workspace headers               | production fail-closed; local mock은 개발 전용 |
| 인가          | 서버 역할·프로젝트 membership 검사      | Phase 1 구현·시험 대상                         |
| 정밀수치      | `decimal.js`, 문자열 직렬화             | Phase 1 계약 시험 대상                         |
| 입력검증      | `zod`, API 경계 검증                    | Phase 1 구현                                   |
| 실행          | 재개 가능한 idempotent stage/chunk      | Phase 2부터 적용                               |
| 보고          | XLSX + 인쇄용 HTML                      | PDF는 별도 범위                                |
| AI            | 기본 비활성, Level C 전용 포트          | 공급자·전송 없음                               |
| ThreeUI       | 현재 MCP 미노출                         | 핵심 기능과 분리, Phase 6 재검토               |

## 첫 수직 슬라이스

`인증된 사용자 → 프로젝트 생성 → 멤버십 자동 연결 → 프로젝트 목록 조회 → 검수 케이스 상태 확인 → 감사 이벤트 기록`

이 슬라이스는 화면 데모가 아니라 API·도메인·저장소 포트를 통과해야 한다. 로컬 mock 인증은 production에서 동작하면 실패다.

## 불변식

- 클라이언트가 보낸 actor/role/project ownership을 신뢰하지 않는다.
- 조회와 쓰기 모두 project membership을 검사한다.
- 원본/파생 파일은 동일 레코드를 덮어쓰지 않는다.
- Level A/B/C, 확정성, 심각도, 상태는 각각 다른 필드다.
- 감사 이벤트는 append-only이며 actor·action·target·time·request id를 가진다.
- 자기승인은 기본 금지다.
- AI 비활성 상태에서도 A/B 검수와 보고가 가능해야 한다.

## 보류·검증 필요

- 실제 Sites workspace header 이름 및 운영 환경 전달 방식
- 실제 D1/R2 리소스 ID, 지역·보존·삭제 정책
- 업로드 최대 크기와 스트리밍 동작의 플랫폼 한계
- ThreeUI MCP 계정 권한과 실효성
- 조직 승인 전 외부 AI 공급자 사용 금지
