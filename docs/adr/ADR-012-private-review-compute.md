# ADR-012 — 무료 플랜 검수 실행 경계

2026-09-10. 상태: 로컬 구현·검증 중, 운영 배포 승인 전.

등록은 ADR-011의 Drive 분할 전송을 유지한다. 등록된 원본을 변경하거나 다시
업로드하지 않는다. 일반 Worker의 CPU 한도와 분리하기 위해 direct Cloudflare
대상에만 SQLite Durable Object를 동일 Worker의 비공개 검수 실행 경계로 추가한다.
기존 Sites 대상은 변경하지 않는다. 별도 유료 플랜이나 외부 서버를 신청하지 않는다.

공식 근거: https://developers.cloudflare.com/durable-objects/platform/pricing/
및 https://developers.cloudflare.com/durable-objects/platform/limits/ . Free에서
SQLite DO를 지원하며 기본 CPU 한도는 요청당 30초다. 무료 요청·실행시간 한도는
남으며 실제 계정/실자료 검증 전 무과금·무제한·성능 보장을 하지 않는다.

인증된 기존 검수 API를 DO에 전달하고 DO 안에서도 세션과 프로젝트 권한을 다시
검증한다. 클라이언트가 지정한 actor/role을 신뢰하지 않는다. 인스턴스에 사용자
정보를 보관하지 않는다. 검수 엔진·근거·지침·AI 제한은 기존 코드를 재사용한다.

원본 준비는 파일별 실제 SHA-256 대조와 기존 XLSX/CSV 안전검사를 통과한 경우만
허용한다. D1 트랜잭션 안에서 권한·원본 버전·교체/제외·Drive 연결과 해시를 다시
확인하고 기존 Drive 객체를 참조해 stored/finalized로 전환한다. 검사 실패 시 등록
원본은 유지하며 정상 검수로 표시하지 않는다. 매핑·AI 실행·보고서 완료와 구분한다.

배포 전: 합성 성공/악성/권한 변경/중복 준비/Drive 재사용 회귀, 실제 Worker 빌드와
named export, 로컬 DO 실행 및 전체 검수 흐름 검증이 필요하다. 메모리 한도는
별도이며 압축 파일 크기만으로 안전하다고 판단하지 않는다. 배포와 DO namespace
생성은 별도 승인 후 진행한다. 되돌릴 때 namespace/등록 파일을 삭제하지 않는다.
