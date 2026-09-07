'use client';
import { useCallback } from 'react';
import { viWorkflow } from './vi-workflow';

import { useWorkspacePreferences } from './workspace-preferences';

export const vietnamese: Record<string, string> = {
  ...viWorkflow,
  'FIN 검수 작업실 · v15 · 2026.09.07': 'Phòng kiểm tra FIN · v15 · 2026.09.07',
  '상단 실행 버튼으로 전체 자료를 확인하고 검수를 시작하세요. 검사하지 않은 항목은 정상으로 표시하지 않습니다.':
    'Nhấn nút phía trên để nhận diện toàn bộ tài liệu và bắt đầu kiểm tra. Mục chưa kiểm tra không được coi là bình thường.',
  '상세 산출서의 산식과 치수를 확인합니다. 근거가 부족한 항목은 정상으로 처리하지 않습니다.':
    'Kiểm tra công thức và kích thước trong bảng tính chi tiết. Mục thiếu căn cứ không được coi là bình thường.',
  '산출식·치수 검토와 원본 대조':
    'Kiểm tra công thức, kích thước và đối chiếu bản gốc',
  '산출식·치수 검토': 'Kiểm tra công thức và kích thước',
  '산식 구문·계산 가능성': 'Cú pháp và khả năng tính công thức',
  '수량 의미 확인': 'Xác nhận ý nghĩa khối lượng',
  '동별집계표 중복·공종 분산 후보':
    'Vật tư trùng hoặc phân tán công tác trong tổng hợp theo tòa',
  평가: 'Đã đánh giá',
  미평가: 'Chưa đánh giá',
  '개 시트': ' trang tính',
  행: ' dòng',
  '산식 문법·연산 확인 필요': 'Cần kiểm tra cú pháp và phép tính',
  '변수·참조 해석 필요 (미평가 예시)':
    'Cần giải nghĩa biến hoặc tham chiếu (ví dụ chưa đánh giá)',
  '계산값과 기재 물량 대조 필요':
    'Cần đối chiếu kết quả tính với khối lượng ghi trong bảng',
  '같은 표기 아이템이 여러 공종에 분산됨':
    'Vật tư cùng cách ghi nằm ở nhiều công tác',
  '같은 표기 아이템에 서로 다른 재료코드':
    'Vật tư cùng cách ghi có mã vật liệu khác nhau',
  '산식 결과 또는 문법을 확인해야 합니다.':
    'Cần kiểm tra kết quả hoặc cú pháp công thức.',
  '현재 파서가 이 식을 계산하지 못했습니다. FIN 원본 오류로 확정한 것이 아닙니다.':
    'Bộ đọc hiện tại chưa tính được công thức này. Chưa kết luận bản gốc FIN có lỗi.',
  '반올림·개소·환산 적용을 먼저 확인하세요. 확정 오류나 수정값이 아닙니다.':
    'Trước tiên hãy kiểm tra làm tròn, số vị trí và hệ số quy đổi. Đây chưa phải lỗi hoặc giá trị sửa đã xác nhận.',
  '개소·환산·반올림 기준이 확정되기 전에는 계산값과 기재 물량을 오류로 판정하지 않습니다.':
    'Chưa kết luận chênh lệch là lỗi khi chưa xác nhận số vị trí, quy đổi và làm tròn.',
  '빈 산식·숨김·소계·변수·참조·범위 제외를 정상으로 계산하지 않습니다. 해석 불가 예시는 파일당 최대 20건 표시합니다.':
    'Công thức trống, dòng ẩn, tổng phụ, biến, tham chiếu và mục ngoài phạm vi không được coi là bình thường. Hiển thị tối đa 20 ví dụ chưa phân tích được mỗi tệp.',
  '자료 확인 {current}/{total} · {filename}':
    'Đang nhận diện {current}/{total} · {filename}',
  '자료 처리 {current}/{total} · {filename}':
    'Đang xử lý {current}/{total} · {filename}',
  '{ready}/{total}개 시트 인식{remaining}':
    'Đã nhận diện {ready}/{total} trang tính{remaining}',
  ' · 나머지는 개별 확인 필요': ' · Các trang còn lại cần xác nhận',
  '참고자료 · 현재 자동검수 대상 외':
    'Tài liệu tham khảo · Ngoài phạm vi kiểm tra tự động',
  '읽기 실패 · {error}': 'Không đọc được · {error}',
  '다시 시도해 주세요.': 'Hãy thử lại.',
  '인식된 자료 구조 저장 중': 'Đang lưu cấu trúc đã nhận diện',
  '{count}개 시트의 열 연결을 함께 저장했습니다. 확인이 필요한 자료는 목록에 표시했습니다. 수량의 계산 의미까지 확인한 것은 아닙니다.':
    'Đã lưu ánh xạ của {count} trang tính. Tài liệu cần xác nhận được đánh dấu trong danh sách. Chưa xác nhận ý nghĩa tính toán của khối lượng.',
  '자동 확인을 마쳤습니다. 기존 열 연결은 유지했습니다. 확인 필요·읽기 실패 자료는 아래 목록에서 확인하세요.':
    'Đã nhận diện xong và giữ nguyên ánh xạ hiện có. Xem tài liệu cần xác nhận hoặc đọc thất bại trong danh sách dưới.',
  '제품 기본검사 완료 · {rows}행 · 검토 후보 {findings}건. 외부 AI 사용 0토큰. 미평가 사유와 원본 근거를 확인하세요.':
    'Đã hoàn tất kiểm tra cơ bản · {rows} dòng · {findings} mục cần xem xét. AI bên ngoài: 0 token. Hãy xem lý do chưa đánh giá và căn cứ gốc.',
  '{kind} 실행을 저장했습니다. {rows}행 · 검토 항목 {findings}건. 미평가 범위를 함께 확인하세요.':
    'Đã lưu lần chạy {kind}. {rows} dòng · {findings} mục cần xem xét. Hãy kiểm tra cả phạm vi chưa đánh giá.',
  '서버에 저장된 최근 실행을 열었습니다. 자료·지침 변경은 새 검수를 실행해야 반영됩니다.':
    'Đã mở lần chạy gần nhất đã lưu. Thay đổi tài liệu hoặc quy tắc chỉ có hiệu lực trong lần chạy mới.',
  '저장하지 않은 열 연결 변경을 버리고 자동 확인할까요?':
    'Bỏ thay đổi ánh xạ chưa lưu và tự động nhận diện?',
  '검수 근거 불러오는 중': 'Đang tải căn cứ kiểm tra',
  '전체 자료 확인 후 기본검사 시작':
    'Đang bắt đầu nhận diện tài liệu và kiểm tra cơ bản',
  '검토 후보 취합·보고서 근거 저장 중':
    'Đang tổng hợp mục cần xem xét và lưu căn cứ báo cáo',
  '검수 실행을 마치지 못했습니다.': 'Không thể hoàn tất lần kiểm tra.',
  '편집한 지침·매핑을 먼저 저장해 주세요. 이전 값으로 실행하지 않습니다.':
    'Hãy lưu quy tắc và ánh xạ đã sửa trước. Không chạy bằng giá trị cũ.',
  '지침 시험 검수 중': 'Đang chạy thử quy tắc',
  '저장된 원본 검수 중': 'Đang kiểm tra bản gốc đã lưu',
  '본문으로 건너뛰기': 'Chuyển đến nội dung chính',
  '주요 메뉴': 'Menu chính',
  '메뉴 열기': 'Mở menu',
  '메뉴 닫기': 'Đóng menu',
  프로젝트: 'Dự án',
  '새 프로젝트': 'Dự án mới',
  '새 프로젝트 등록': 'Tạo dự án mới',
  '프로젝트 목록': 'Danh sách dự án',
  '프로젝트 검색': 'Tìm dự án',
  '좌측 프로젝트 검색': 'Tìm dự án trong menu',
  '프로젝트명·발주처 검색': 'Tìm theo tên dự án hoặc chủ đầu tư',
  '현재 프로젝트': 'Dự án hiện tại',
  '프로젝트 선택': 'Chọn dự án',
  '프로젝트 다시 선택': 'Chọn lại dự án',
  프로젝트명: 'Tên dự án',
  발주처·고객사: 'Chủ đầu tư / Khách hàng',
  '(선택)': '(Không bắt buộc)',
  '프로젝트 만들기': 'Tạo dự án',
  '등록 중…': 'Đang tạo…',
  삭제: 'Xóa',
  '삭제 중': 'Đang xóa',
  '삭제 중…': 'Đang xóa…',
  취소: 'Hủy',
  '다시 시도': 'Thử lại',
  '검색 조건에 맞는 프로젝트가 없습니다.': 'Không có dự án phù hợp.',
  '프로젝트를 불러오는 중입니다.': 'Đang tải danh sách dự án.',
  '프로젝트를 불러오지 못했습니다.': 'Không thể tải danh sách dự án.',
  '프로젝트를 만들지 못했습니다.': 'Không thể tạo dự án.',
  '프로젝트를 삭제하지 못했습니다.': 'Không thể xóa dự án.',
  '승인 계정 전용': 'Chỉ tài khoản được cấp quyền',
  관리자: 'Quản trị viên',
  '프로젝트 책임자': 'Người phụ trách dự án',
  검수자: 'Người kiểm tra',
  승인자: 'Người phê duyệt',
  조회자: 'Chỉ xem',
  '로컬 검증 모드': 'Chế độ kiểm thử cục bộ',
  '인증을 우회한 개발 환경이며 운영 화면이 아닙니다.':
    'Môi trường phát triển bỏ qua xác thực, không phải hệ thống vận hành.',
  'ERP 연동 대기': 'Chờ kết nối ERP',
  설정: 'Cài đặt',
  로그아웃: 'Đăng xuất',
  '설정 메뉴': 'Menu cài đặt',
  '연동 및 상태': 'Kết nối và trạng thái',
  '연결 및 운영 설정': 'Cài đặt kết nối và vận hành',
  '검수 지침 관리 · 관리자': 'Quản lý quy tắc · Quản trị viên',
  '검수 지침 관리': 'Quản lý quy tắc kiểm tra',
  '서버 보안 설정': 'Bảo mật máy chủ',
  'Gemini API 연동': 'Kết nối API Gemini',
  '설정 완료': 'Đã cấu hình',
  '설정 오류': 'Lỗi cấu hình',
  미연결: 'Chưa kết nối',
  'N/A · 미등록': 'N/A · Chưa đăng ký',
  '서버 전용 · 화면 비노출': 'Chỉ trên máy chủ · Không hiển thị',
  '데이터 매핑 완료 전 미실행': 'Chưa chạy trước khi hoàn tất ánh xạ',
  '연결 확인 중…': 'Đang kiểm tra kết nối…',
  'Gemini 연결 시험': 'Kiểm tra kết nối Gemini',
  'Gemini 서버 설정을 확인하는 중…': 'Đang kiểm tra cấu hình Gemini…',
  'Gemini 설정을 확인하지 못했습니다.': 'Không thể kiểm tra cấu hình Gemini.',
  '서버에 비밀키와 허용 모델이 등록되어 있습니다.':
    'Máy chủ đã có khóa và mô hình được cho phép.',
  'Sites 서버 환경변수에 API 키를 등록해야 합니다.':
    'Cần cấu hình khóa API trên máy chủ Sites.',
  '허용 모델 또는 서버 환경변수 구성을 확인하세요.':
    'Kiểm tra mô hình và cấu hình máy chủ.',
  'Gemini 연결에 실패했습니다.': 'Kết nối Gemini thất bại.',
  'Mem0 공유 메모리': 'Bộ nhớ dùng chung Mem0',
  '조회 준비 완료': 'Sẵn sàng truy xuất',
  '키 미등록': 'Chưa cấu hình khóa',
  비활성: 'Đã vô hiệu hóa',
  '프로젝트 멤버만 · 읽기 전용': 'Chỉ thành viên dự án · Chỉ đọc',
  '원본·수식·수량 외부 전송 금지':
    'Không gửi bản gốc, công thức hoặc khối lượng ra ngoài',
  '공유 메모리 설정을 확인하지 못했습니다.':
    'Không thể kiểm tra bộ nhớ dùng chung.',
  '연동 및 정책 상태': 'Kết nối và chính sách',
  'N/A · 미구현': 'N/A · Chưa triển khai',
  '승인 계정 정책': 'Chính sách cấp quyền',
  '서버 적용': 'Đã áp dụng trên máy chủ',
  'ERP 프로젝트 연동': 'Kết nối dự án ERP',
  '검수 규칙 프로필': 'Bộ quy tắc kiểm tra',
  'Excel 출력 정책': 'Chính sách xuất Excel',
  '자료 등록': 'Đăng tải tài liệu',
  '현재 자료 저장 대상': 'Dự án lưu tài liệu',
  '등록할 팀 선택': 'Chọn nhóm để đăng tải',
  마감팀: 'Nhóm hoàn thiện',
  구조팀: 'Nhóm kết cấu',
  '이전 자료 기록': 'Hồ sơ tài liệu trước',
  '자료 기록': 'Hồ sơ tài liệu',
  'STEP 2 · AI 검수 시작': 'BƯỚC 2 · Bắt đầu kiểm tra AI',
  '저장된 자료로 AI 검수 단계로 이동하세요.':
    'Chuyển sang bước kiểm tra với tài liệu đã lưu.',
  '원본 자료를 저장하면 다음 단계로 이동할 수 있습니다.':
    'Lưu tài liệu gốc để chuyển sang bước tiếp theo.',
  '원본 저장 중': 'Đang lưu bản gốc',
  '선택 파일 저장': 'Lưu các tệp đã chọn',
  '산출서와 집계표 원본 등록':
    'Đăng tải bảng tính và bảng tổng hợp khối lượng gốc',
  'XLSX·CSV 원본을 수정하지 않고 해시와 계보를 저장합니다.':
    'Lưu mã băm và truy vết, không sửa bản gốc XLSX/CSV.',
  '자료 등록 방식': 'Cách đăng tải tài liệu',
  '추가 등록': 'Thêm tài liệu',
  '기존 자료 교체': 'Thay thế tài liệu hiện có',
  '기존 자료를 유지하고 선택한 파일을 추가합니다.':
    'Giữ tài liệu hiện có và thêm các tệp đã chọn.',
  '산출서와 집계표 선택': 'Chọn bảng tính và bảng tổng hợp',
  '복수 선택 가능 · 파일당 최대 20MB': 'Chọn nhiều tệp · Tối đa 20 MB/tệp',
  '검수 자료 체크리스트': 'Danh mục tài liệu kiểm tra',
  '누락 자료는 안내만 · 저장된 자료로 진행':
    'Chỉ thông báo tài liệu thiếu · Tiếp tục với tài liệu đã lưu',
  '공종별 산출서': 'Bảng tính khối lượng theo công tác',
  '집계표 종류와 용도': 'Loại và mục đích bảng tổng hợp',
  '미등록 · 해당 시 보완': 'Chưa đăng tải · Bổ sung nếu áp dụng',
  '저장하지 못한 파일': 'Tệp chưa lưu được',
  '실패 파일 다시 선택': 'Chọn lại tệp bị lỗi',
  '서버 저장 내역': 'Lịch sử lưu trên máy chủ',
  '등록된 자료 묶음': 'Các bộ tài liệu đã đăng tải',
  '저장 내역을 확인하는 중…': 'Đang kiểm tra lịch sử lưu…',
  '저장 내역 다시 불러오기': 'Tải lại lịch sử lưu',
  '저장 완료': 'Đã lưu',
  '저장 실패': 'Lưu thất bại',
  '저장 대기': 'Chờ lưu',
  '검사 대기': 'Chờ kiểm tra',
  차단: 'Bị chặn',
  '파일을 저장하지 못했습니다.': 'Không thể lưu tệp.',
  '서버 연결이 끊겼습니다. 이 파일만 다시 시도할 수 있습니다.':
    'Mất kết nối. Có thể thử lại riêng tệp này.',
  'AI 검수': 'Kiểm tra AI',
  '산출식 AI 검수': 'Kiểm tra công thức bằng AI',
  '중복 ITEM AI 검수': 'Kiểm tra vật tư trùng lặp bằng AI',
  '자료 자동 확인·저장': 'Nhận diện và lưu ánh xạ',
  '검수 실행': 'Chạy kiểm tra',
  '새로 확인': 'Tải lại',
  '자료 확인': 'Kiểm tra tài liệu',
  결과·보고서: 'Kết quả và báo cáo',
  미실행: 'Chưa chạy',
  '동별집계표가 중복 검수의 기준 자료입니다':
    'Bảng tổng hợp theo tòa nhà là cơ sở kiểm tra trùng lặp',
  '열 연결 저장': 'Lưu ánh xạ cột',
  '상세 산출서': 'Bảng tính khối lượng chi tiết',
  동별집계표: 'Bảng tổng hợp theo tòa nhà',
  '참고·기준 자료': 'Tài liệu tham khảo / Cơ sở',
  '머리글 행': 'Dòng tiêu đề',
  '없음 / 미확인': 'Không có / Chưa xác nhận',
  '지침 설정·시험': 'Cấu hình và chạy thử quy tắc',
  '정식 검수 실행': 'Chạy theo quy tắc đã duyệt',
  '지침 시험 실행': 'Chạy thử quy tắc',
  초안: 'Bản nháp',
  승인: 'Đã phê duyệt',
  '시험 결과': 'Kết quả chạy thử',
  '새 버전으로 초안 저장': 'Lưu bản nháp phiên bản mới',
  '이 지침 버전 활성화': 'Kích hoạt phiên bản quy tắc',
  '편집 중인 값이 아니라 이 저장 버전으로 실행됩니다.':
    'Sử dụng phiên bản đã lưu, không dùng giá trị đang chỉnh sửa.',
  '실행 이력': 'Lịch sử chạy',
  'Excel 보고서': 'Báo cáo Excel',
  '미평가 사유·검수 제한 · 반드시 확인':
    'Lý do chưa đánh giá và giới hạn · Cần xem kỹ',
  '중복·공종 분산 후보':
    'Vật tư có khả năng trùng lặp hoặc phân tán giữa các công tác',
  '품명·검토 내용 검색': 'Tìm vật tư hoặc nội dung kiểm tra',
  '원본 행': 'Dòng dữ liệu gốc',
  '판단 근거와 처리': 'Căn cứ đánh giá và xử lý',
  '사람의 확인': 'Xác nhận của người kiểm tra',
  '수정 필요': 'Cần sửa',
  '정상 항목': 'Đã xác nhận bình thường',
  보류: 'Tạm hoãn kết luận',
  미판단: 'Chưa kết luận',
  '확인 사유': 'Lý do xác nhận',
  '판단 저장': 'Lưu kết luận',
  '자동 수정하지 않습니다.': 'Không tự động sửa.',
  '전체 자료 확인 후 검수 시작': 'Nhận diện toàn bộ và bắt đầu kiểm tra',
  '중단된 검수 이어서 진행': 'Tiếp tục lần kiểm tra đang dở',
  '승인 지침으로 추가 검수': 'Kiểm tra thêm theo quy tắc đã duyệt',
  '검수 진행 상태': 'Tiến trình kiểm tra',
  '수량산출 분석표': 'Bảng phân tích khối lượng',
  '검수 진행 단계': 'Các bước kiểm tra',
  '준비 중': 'Đang phát triển',
  '자료 추가·수정본 등록': 'Thêm tài liệu / Bản sửa đổi',
  '마감팀 자료가 필요합니다': 'Cần tài liệu của nhóm hoàn thiện',
  '자료 등록으로 돌아가기': 'Quay lại đăng tải tài liệu',
  '마감팀 기록으로 전환': 'Chuyển sang hồ sơ hoàn thiện',
  시트: 'Trang tính',
  '자료 역할': 'Vai trò tài liệu',
  품명: 'Tên vật tư',
  규격: 'Quy cách',
  단위: 'Đơn vị',
  산출식: 'Công thức',
  물량: 'Khối lượng',
  공종: 'Công tác',
  부위: 'Bộ phận',
  재료코드: 'Mã vật tư',
  '동·층·실 범위': 'Tòa nhà / Tầng / Phòng',
  '확인할 치수': 'Kích thước cần kiểm tra',
  '동일 비교집단': 'Nhóm so sánh tương đương',
  '저장된 자료와 검수 이력 확인 중': 'Đang tải tài liệu và lịch sử kiểm tra',
  '서버 응답을 기다리고 있습니다.': 'Đang chờ phản hồi từ máy chủ.',
  '상단 실행 버튼을 누르면 자료 자동 확인 → 기본검사 → 결과 저장까지 진행합니다.':
    'Nhấn nút phía trên để nhận diện tài liệu → kiểm tra cơ bản → lưu kết quả.',
  '파일마다 열 연결을 저장할 필요가 없습니다. 표준 양식을 함께 인식하고, 계산하지 못한 산식·실패 파일·미확인 자료는 결과의 미평가 목록에 남깁니다.':
    'Không cần lưu ánh xạ từng tệp. Mẫu chuẩn được nhận diện cùng lúc; công thức chưa tính được và tệp lỗi được ghi rõ là chưa đánh giá.',
  '제품 기본검사는 관리자 지침 승인 없이 사용할 수 있습니다. 층고·소수점 등 현장 기준 검사는 관리자가 별도 지침을 확인한 뒤 추가합니다.':
    'Có thể chạy kiểm tra cơ bản mà không chờ duyệt quy tắc. Kiểm tra theo tiêu chí công trường cần quy tắc do quản trị viên xác nhận.',
};
export function translateUi(text: string, locale: 'ko' | 'vi'): string {
  return locale === 'vi'
    ? (vietnamese[text.replace(/\s+/gu, ' ').trim()] ?? text)
    : text;
}
export function useUiText() {
  const { locale } = useWorkspacePreferences();
  return useCallback(
    (text: string, values: Record<string, string | number> = {}) =>
      translateUi(text, locale).replace(
        /\{([a-z]+)\}/gu,
        (token, key: string) =>
          Object.hasOwn(values, key) ? String(values[key]) : token,
      ),
    [locale],
  );
}
export function UiText({ text }: { text: string }) {
  return useUiText()(text);
}
