'use client';
import { useEffect, useState } from 'react';
import { KeyRound, Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { PersonalAiStatus } from '@/lib/server/ai/personal-settings';
import { useWorkspacePreferences } from './workspace-preferences';

export function PersonalAiSettings({ isAdmin }: { isAdmin: boolean }) {
  const { locale } = useWorkspacePreferences();
  const t = (ko: string, vi: string) => (locale === 'vi' ? vi : ko);
  const [status, setStatus] = useState<PersonalAiStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-3.8-flash');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState('GET');
  const dirty =
    Boolean(apiKey) || Boolean(status?.configured && model !== status.model);

  async function request(method = 'GET') {
    setOperation(method);
    setBusy(true);
    setFields({});
    setError(false);
    setMessage('');
    try {
      const response = await fetch('/api/settings/ai/personal', {
        method,
        cache: 'no-store',
        ...(method === 'GET'
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(
                method === 'DELETE'
                  ? { version: status?.version, confirm: true }
                  : {
                      version: status?.version,
                      model,
                      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                    },
              ),
            }),
      });
      const body = (await response.json()) as {
        data: PersonalAiStatus;
        error?: { message: string; fields?: Record<string, string> };
      };
      if (body.error?.fields) setFields(body.error.fields);
      if (!response.ok || body.error)
        throw new Error(
          body.error?.message ??
            t('설정을 처리하지 못했습니다.', 'Không thể xử lý cài đặt.'),
        );
      setStatus(body.data);
      setModel(body.data.model ?? 'gemini-3.8-flash');
      setConfirm(false);
      if (method !== 'GET') setApiKey('');
      setMessage(
        method === 'PUT'
          ? t(
              '연결 확인 및 저장 완료. 인증과 모델 접근 권한을 확인했습니다.',
              'Đã xác thực kết nối và lưu. Quyền truy cập mô hình đã được kiểm tra.',
            )
          : method === 'DELETE'
            ? t(
                '개인 API 연결을 해제했습니다. 원본과 검수 결과는 유지됩니다.',
                'Đã ngắt API cá nhân. Dữ liệu gốc và kết quả được giữ nguyên.',
              )
            : '',
      );
    } catch (caught) {
      setError(true);
      setMessage(
        caught instanceof Error
          ? caught.message
          : t(
              '연결 오류입니다. 다시 시도해 주세요.',
              'Lỗi kết nối. Vui lòng thử lại.',
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/settings/ai/personal', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          data: PersonalAiStatus;
          error?: { message: string };
        };
        if (!response.ok || body.error)
          throw new Error(
            body.error?.message ??
              '설정을 불러오지 못했습니다. / Không tải được cài đặt.',
          );
        if (controller.signal.aborted) return;
        setStatus(body.data);
        setModel(body.data.model ?? 'gemini-3.8-flash');
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(true);
          setMessage(
            caught instanceof Error
              ? caught.message
              : '설정을 다시 확인해 주세요. / Vui lòng tải lại.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <div className="settings-workspace">
      <header className="qc-settings-heading">
        <div>
          <h1>{t('설정', 'Cài đặt')}</h1>
          <p>
            {t(
              '내 API 연결과 작업 환경을 관리합니다.',
              'Quản lý API cá nhân và môi trường làm việc.',
            )}
          </p>
        </div>
        <span
          className="qc-settings-security"
          data-ready={Boolean(status?.storageReady)}
        >
          <ShieldCheck aria-hidden="true" />
          {status?.storageReady
            ? t('암호화 저장 준비됨', 'Sẵn sàng lưu mã hóa')
            : busy
              ? t('저장소 확인 중', 'Đang kiểm tra kho lưu')
              : t('저장소 설정 필요', 'Cần cấu hình kho lưu')}
        </span>
      </header>
      <section
        className="settings-card personal-ai-settings"
        aria-labelledby="personal-ai-title"
      >
        <div className="panel-heading">
          <div>
            <h2 id="personal-ai-title">
              <KeyRound aria-hidden="true" />{' '}
              {t('개인 Gemini API 연결', 'Kết nối Gemini API cá nhân')}
            </h2>
            <p>
              {t(
                '본인 계정에 사용할 API 키를 입력하고 연결하세요.',
                'Nhập khóa API để sử dụng cho tài khoản của bạn.',
              )}
            </p>
          </div>
          <span
            className={`qc-connection-state ${error ? 'is-error' : dirty ? 'is-dirty' : status?.configured ? 'is-connected' : ''}`}
          >
            {busy
              ? t('확인 중', 'Đang kiểm tra')
              : error
                ? t('확인 필요 · 저장 실패', 'Cần kiểm tra · Chưa lưu')
                : dirty
                  ? t('변경사항 미저장', 'Thay đổi chưa lưu')
                  : status?.configured
                    ? t('연결 확인됨', 'Đã xác thực')
                    : t('연결 전', 'Chưa kết nối')}
          </span>
        </div>
        <div className="qc-connection-summary">
          <div>
            <span>{t('적용 범위', 'Phạm vi')}</span>
            <strong>{t('내 계정 전용', 'Chỉ tài khoản của tôi')}</strong>
          </div>
          <div>
            <span>{t('저장된 모델', 'Mô hình đã lưu')}</span>
            <strong>
              {status?.model ?? t('아직 저장하지 않음', 'Chưa lưu')}
            </strong>
          </div>
          <div>
            <span>{t('검사 방식', 'Cách kiểm tra')}</span>
            <strong>
              {t('인증·모델 접근 확인', 'Xác thực quyền truy cập')}
            </strong>
          </div>
        </div>
        <div className="qc-connection-layout">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void request('PUT');
            }}
          >
            <fieldset disabled={busy}>
              <label htmlFor="personal-gemini-key">
                {t('Gemini API 키', 'Khóa Gemini API')}
              </label>
              <input
                id="personal-gemini-key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={apiKey}
                minLength={20}
                maxLength={512}
                required={!status?.configured}
                onChange={(event) => setApiKey(event.target.value)}
                aria-describedby="personal-key-help personal-key-error"
                aria-invalid={Boolean(fields.apiKey)}
                placeholder={
                  status?.configured
                    ? t(
                        '변경할 때만 새 키 입력',
                        'Chỉ nhập khóa mới khi thay đổi',
                      )
                    : t('API 키를 붙여넣으세요', 'Dán khóa API của bạn')
                }
              />
              <span id="personal-key-error" className="qc-field-error">
                {fields.apiKey
                  ? t(
                      fields.apiKey,
                      'Khóa phải có 20–512 ký tự, không chứa khoảng trắng hoặc xuống dòng. Hỗ trợ AQ.',
                    )
                  : ''}
              </span>
              <p id="personal-key-help">
                {t(
                  'AQ. 형식 지원 · 최대 512자. 모델만 바꿀 때는 키를 비워 두세요.',
                  'Hỗ trợ AQ. · Tối đa 512 ký tự. Để trống khi chỉ đổi mô hình.',
                )}
              </p>
              <label htmlFor="personal-gemini-model">
                {t('사용할 모델', 'Mô hình sử dụng')}
              </label>
              <select
                id="personal-gemini-model"
                value={model}
                aria-invalid={Boolean(fields.model)}
                aria-describedby="personal-model-error"
                onChange={(event) => setModel(event.target.value)}
              >
                {(
                  status?.availableModels ?? [
                    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
                  ]
                ).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span id="personal-model-error" className="qc-field-error">
                {fields.model
                  ? t(
                      fields.model,
                      'Tải lại cài đặt rồi chọn mô hình được hỗ trợ.',
                    )
                  : ''}
              </span>
              <div className="personal-settings-actions">
                <button
                  type="submit"
                  className="primary-action"
                  disabled={
                    !status?.storageReady ||
                    (!status.configured && !apiKey.trim())
                  }
                >
                  <Link2 aria-hidden="true" />
                  {busy
                    ? operation === 'GET'
                      ? t('설정 불러오는 중…', 'Đang tải cài đặt…')
                      : t('연결 확인 중…', 'Đang kiểm tra…')
                    : t('연결 확인 후 저장', 'Kiểm tra kết nối và lưu')}
                </button>
                <button type="button" onClick={() => void request()}>
                  <RefreshCw aria-hidden="true" />
                  {t('새로 확인', 'Tải lại')}
                </button>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('Google에서 API 키 발급', 'Tạo khóa API tại Google')}
                </a>
              </div>
            </fieldset>
          </form>
          <aside className="qc-connection-guide">
            <h3>{t('처음 연결하시나요?', 'Kết nối lần đầu?')}</h3>
            <ol>
              <li>
                {t(
                  'Google AI Studio에서 API 키를 복사합니다.',
                  'Sao chép khóa API từ Google AI Studio.',
                )}
              </li>
              <li>
                {t(
                  '키 전체를 붙여넣고 사용할 모델을 선택합니다.',
                  'Dán toàn bộ khóa và chọn mô hình.',
                )}
              </li>
              <li>
                {t(
                  '연결 확인 후 저장을 누릅니다. 성공하면 입력한 키가 비워지고 연결 상태가 바뀝니다.',
                  'Nhấn kiểm tra kết nối và lưu. Khi thành công, ô khóa được xóa và trạng thái thay đổi.',
                )}
              </li>
            </ol>
            <p>
              {t(
                '실패하면 입력값과 기존 저장 설정을 유지합니다. 오류 안내를 확인한 뒤 다시 시도하세요.',
                'Nếu lỗi, giữ nguyên dữ liệu nhập và cài đặt đã lưu. Xem hướng dẫn rồi thử lại.',
              )}
            </p>
          </aside>
        </div>
        {busy && (
          <output>
            {t(
              operation === 'GET'
                ? '저장된 설정을 불러오고 있습니다.'
                : 'Google 인증과 모델 접근을 확인하고 있습니다. 연결 확인은 최대 8초 정도 걸립니다.',
              'Đang chờ máy chủ. Kiểm tra kết nối mất khoảng tối đa 8 giây.',
            )}
          </output>
        )}
        {message && (
          <p
            role={error ? 'alert' : 'status'}
            className={
              error ? 'personal-settings-error' : 'personal-settings-success'
            }
          >
            {locale === 'vi' && fields.apiKey
              ? 'Khóa phải có 20–512 ký tự, không chứa khoảng trắng hoặc xuống dòng. Hỗ trợ AQ.'
              : message}
          </p>
        )}
        {status && !status.storageReady && (
          <p role="alert">
            {t(
              '안전한 키 저장소가 아직 준비되지 않았습니다. 키를 저장하지 않았습니다.',
              'Kho lưu khóa an toàn chưa sẵn sàng. Khóa chưa được lưu.',
            )}
          </p>
        )}
        {status?.checkedAt && (
          <p>
            {t('마지막 연결 확인', 'Lần kiểm tra gần nhất')}:{' '}
            {new Date(status.checkedAt).toLocaleString(
              locale === 'vi' ? 'vi-VN' : 'ko-KR',
            )}
          </p>
        )}
        <p className="settings-safety-note">
          <ShieldCheck aria-hidden="true" />
          {t(
            '키는 서버에서 암호화해 저장하며 다른 직원에게 공개하지 않습니다. 연결 확인은 산출서를 전송하지 않으며 AI 검수를 실행하지 않습니다.',
            'Khóa được mã hóa trên máy chủ, không chia sẻ với nhân viên khác. Kiểm tra kết nối không gửi bảng tính và không chạy kiểm tra AI.',
          )}
        </p>
        <p>
          {t(
            '현재 기본검사는 외부 AI 없이 실행됩니다. API 연결만으로 검수 방식이나 결과가 변경되지는 않습니다.',
            'Kiểm tra cơ bản hiện chạy không cần AI bên ngoài. Kết nối API không tự thay đổi cách kiểm tra hoặc kết quả.',
          )}
        </p>
        {status?.configured && (
          <div className="personal-settings-disconnect">
            {!confirm ? (
              <button
                disabled={busy}
                className="danger-action"
                onClick={() => setConfirm(true)}
              >
                {t('개인 API 연결 해제', 'Ngắt kết nối API cá nhân')}
              </button>
            ) : (
              <>
                <p>
                  {t(
                    '저장된 개인 키를 삭제합니다. 다시 연결하려면 키를 입력해야 합니다. 산출서와 검수 이력은 삭제하지 않습니다.',
                    'Xóa khóa cá nhân đã lưu. Cần nhập lại để kết nối. Không xóa bảng tính hoặc lịch sử kiểm tra.',
                  )}
                </p>
                <button
                  disabled={busy}
                  className="danger-action"
                  onClick={() => void request('DELETE')}
                >
                  {t('키 삭제 및 연결 해제', 'Xóa khóa và ngắt kết nối')}
                </button>
                <button disabled={busy} onClick={() => setConfirm(false)}>
                  {t('취소', 'Hủy')}
                </button>
              </>
            )}
          </div>
        )}
      </section>
      {isAdmin && (
        <section className="settings-card">
          <h2>{t('검수 지침', 'Quy tắc kiểm tra')}</h2>
          <p>
            {isAdmin
              ? t(
                  '상단의 검수 지침 관리 · 관리자 메뉴에서 지침을 작성하고 시험·활성화할 수 있습니다. 프로젝트를 먼저 선택하세요.',
                  'Chọn dự án rồi dùng mục quản lý quy tắc dành cho quản trị viên ở phía trên để soạn, thử và kích hoạt quy tắc.',
                )
              : t(
                  '회사 공통 지침은 지정 관리자만 변경합니다. 개인 API 키 설정은 관리자 권한과 별개입니다.',
                  'Chỉ quản trị viên được chỉ định mới thay đổi quy tắc chung. Khóa API cá nhân độc lập với quyền quản trị.',
                )}
          </p>
        </section>
      )}
      <details className="settings-card">
        <summary>
          {t(
            '아직 지원하지 않는 연동 · ERP / 공유 메모리',
            'Tích hợp chưa hỗ trợ · ERP / Bộ nhớ chung',
          )}
        </summary>
        <p>
          {t(
            'ERP 자동 동기화와 Mem0 공유 메모리의 사용자 설정은 아직 구현되지 않았습니다. 현재 자료 등록·기본검수·보고서는 이 연동 없이 사용할 수 있습니다.',
            'Chưa triển khai cài đặt đồng bộ ERP và bộ nhớ Mem0. Đăng ký tài liệu, kiểm tra cơ bản và báo cáo vẫn hoạt động độc lập.',
          )}
        </p>
      </details>
    </div>
  );
}
