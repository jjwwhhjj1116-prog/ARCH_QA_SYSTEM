# QC Google OAuth 연결 설정

설정 하단 고정 배포: `e5e8ca36-6d01-4c92-a63a-3aad961eade5`.
전체 check (43 files / 318 tests) 및 Cloudflare build 통과.
로컬 데스크톱/360px 모바일에서 사용자프로필 위 설정 배치와 실제 진입 확인.
Google Console 설정은 사용자가 안내대로 변경해야 하며 이번 배포로 바뀌지 않는다.

## 이번 오류

사용자 스크린샷의 오류는 `400 redirect_uri_mismatch`이다. 테스트 사용자
누락 오류가 아니다. 스크린샷에는 concost.dt@gmail.com이 이미 등록되어 있다.
QC는 `lib/files/drive-settings.ts`에서 아래 주소를 만들지만 Google 클라이언트
스크린샷은 `/api/google/oauth...` 경로를 등록하고 있다.

Google 인증 플랫폼 → 클라이언트 → QC에 입력한 동일 클라이언트 →
승인된 리디렉션 URI → URI 추가:

```text
https://concost-qc-studio.jjwwhhjj1116.workers.dev/api/settings/drive/callback
```

기존 주소는 삭제할 필요 없다. 새 주소를 저장한 후 QC 설정에서 새 연결을
시작한다. 이전 Google 오류 URL에는 만료되는 상태가 포함될 수 있어 재사용하지 않는다.
승인된 JavaScript 원본은 이 서버 방식 OAuth의 redirect 등록을 대체하지 않는다.

## 브랜딩

- 앱 이름: CONCOST QC 스튜디오
- 사용자 지원 이메일 / 개발자 연락처: concost.dt@gmail.com
- 현재 테스트용 애플리케이션 홈페이지: https://concost-qc-studio.jjwwhhjj1116.workers.dev/
- 승인된 도메인: 스크린샷에 저장된 jjwwhhjj1116.workers.dev 유지.
  con-cost.com 등록만으로 QC callback이 승인되는 것은 아니다.
- 개인정보처리방침: https://concost-qc-studio.jjwwhhjj1116.workers.dev/privacy
- 서비스 약관: https://concost-qc-studio.jjwwhhjj1116.workers.dev/terms

외부 테스트 단계의 연결 문제를 해결하려고 앱을 무조건 게시하지 않는다.
정식 게시/브랜딩 검증에는 소유권을 확인한 도메인, 로그인만 보여주는 것이
아닌 앱 소개 홈페이지, 실제 데이터 처리방침과 약관 페이지가 필요하다.
공개 정책 페이지는 사용자의 후속 요청으로 추가했다. 정식 운영 전 법인 정보,
구체적 보존 기간 및 국외 처리 고지의 회사 운영 기준을 확인해야 한다.

Drive scope는 현재 `https://www.googleapis.com/auth/drive.file` 유지한다.
전체 Drive 접근권한으로 확대할 이유가 없다. 테스트 모드 Drive 승인은
7일 뒤 만료될 수 있어 장기 운영 전 게시/검증 준비가 필요하다.

## 출처

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://support.google.com/cloud/answer/15549049?hl=en
- https://support.google.com/cloud/answer/15549945?hl=en

Google Console 변경이나 실제 OAuth 동의 완료를 대신 수행한 기록은 아니다.
