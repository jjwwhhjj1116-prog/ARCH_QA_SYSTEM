# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

OpenAI Sites/Vinext, React 19, TypeScript, Tailwind CSS, shadcn primitives, Cloudflare D1/R2 ports. Cloudflare provisioning and deployment are explicitly deferred; local implementation and verification come first.

## Users

- 적산 실무자: FIN·RC 산출서와 집계표를 등록하고 검수 근거를 확인·보정한다.
- 검수자: 결정론·통계·AI 보조 결과의 근거와 한계를 확인하고 처리한다.
- 승인자: 차단 조건과 감사 이력을 확인한 뒤 최종 보고서를 승인하거나 반려한다.
- 관리자: 구성원·규칙 프로필·보존 정책을 관리하되 승인된 실행 결과를 조용히 변경할 수 없다.

## Product Purpose

FIN 및 RC 산출서·집계표를 교차 검증하는 상위 검수 계층이다. 사용자가 원본 계보, 매핑, 계산 근거, 예외와 미검증 범위를 잃지 않은 채 프로젝트 단위로 검토하고 승인 가능한 보고서를 만들도록 한다.

## Positioning

AI가 숫자나 오류를 임의 확정하지 않는다. 결정론 규칙(Level A), 통계 검토(Level B), 문맥 제안(Level C)을 분리하고 모든 판단을 원본 셀 계보·버전·사람의 결정에 묶는다.

## Operating Context

한국어 중심 사내 업무 웹앱이다. 사용자는 여러 Excel/PDF 산출서와 집계표를 프로젝트 단위로 취합하며, 대용량 표·긴 한국어 라벨·키보드 탐색·감사 추적이 일상적인 사용 조건이다.

## Capabilities and Constraints

- 원본 파일은 덮어쓰지 않고 불변 버전으로 취급한다.
- 조적은 지정된 검수·통계 범위에서 전면 제외하고 제외 근거만 감사한다.
- 부위가 다르면 동일 아이템으로 묶지 않는다.
- Level C는 검토 후보일 뿐 확정·종결·승인 권한이 없다.
- 프로젝트 경계·역할·자기승인 금지는 서버에서 강제한다.
- D1은 관계형 메타데이터, R2는 원본/산출물 바이트를 담당한다.
- 실제 Cloudflare 연결, 외부 AI 공급자, 배포와 공개 범위는 별도 승인 전까지 비활성이다.

## Brand Commitments

제품명은 `FIN & RC Review Studio`. 기존 CON COST의 짙은 작업 내비게이션과 주황색 행동 강조를 유지한다. 아이콘만 있는 탐색은 금지하고 한국어 텍스트 메뉴를 항상 제공한다. 화면 문구에서는 “FIN 자료” 대신 “산출서와 집계표”를 사용한다.

## Evidence on Hand

- `docs/00_MASTER_PRD.md`~`docs/13_OBSERVABILITY_AND_OPERATIONS.md`
- 실제 FIN 산출서/집계표 매핑 및 과거 데스크톱 구현의 검증 이력
- 사용자가 제공한 데스크톱 UI 스크린샷과 좌측 텍스트 내비게이션 수정 요구
- GitHub 원격 저장소 `jjwwhhjj1116-prog/ARCH_QA_SYSTEM`

## Product Principles

1. 확정 가능한 것과 검토가 필요한 것을 섞지 않는다.
2. 계산 결과보다 원본 계보와 재현성을 먼저 보존한다.
3. 차단 사유와 다음 행동을 한 화면에서 설명한다.
4. 자동화는 사람의 검토·승인 책임을 대체하지 않는다.
5. 배포보다 로컬 검증과 공격 테스트를 먼저 끝낸다.

## Accessibility & Inclusion

WCAG 2.2 AA를 목표로 한다. 200% 확대, 키보드 완결성, 가시적 포커스, 4.5:1 본문 대비, 색상 외 상태 표현, 긴 한국어 및 탭형 숫자 정렬을 필수로 한다.
