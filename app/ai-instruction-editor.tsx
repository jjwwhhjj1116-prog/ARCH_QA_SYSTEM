'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { AiInstruction } from '@/lib/review/contracts';
import { useWorkspacePreferences } from './workspace-preferences';

const MAX_INSTRUCTIONS = 10;

export function AiInstructionEditor({
  instructions,
  onChange,
}: {
  instructions: AiInstruction[];
  onChange: (items: AiInstruction[]) => void;
}) {
  const { locale } = useWorkspacePreferences();
  const t = (ko: string, vi: string) => (locale === 'vi' ? vi : ko);

  function update(id: string, patch: Partial<AiInstruction>) {
    onChange(
      instructions.map((instruction) =>
        instruction.id === id ? { ...instruction, ...patch } : instruction,
      ),
    );
  }

  return (
    <section
      className="settings-card"
      aria-labelledby="ai-instruction-editor-title"
    >
      <h2 id="ai-instruction-editor-title">
        {t('AI 검수 지침 목록', 'Danh sách hướng dẫn kiểm tra AI')}
      </h2>
      <p>
        {t(
          '초안을 저장하면 새 버전이 생성됩니다. 시험 결과 확인과 승인 뒤에만 정식 검수에 적용됩니다.',
          'Lưu bản nháp sẽ tạo phiên bản mới. Chỉ áp dụng cho kiểm tra chính thức sau khi xem kết quả thử và phê duyệt.',
        )}
      </p>
      <p className="qc-meta">
        {t(
          '대상·조건·예외를 적고, 근거가 부족하면 미검수로 남기도록 작성하세요.',
          'Hãy nêu đối tượng, điều kiện và ngoại lệ; khi thiếu căn cứ, hãy để là chưa kiểm tra.',
        )}
      </p>

      <div className="personal-settings-actions">
        <button
          type="button"
          className="secondary-action"
          disabled={instructions.length >= MAX_INSTRUCTIONS}
          onClick={() =>
            onChange([
              ...instructions,
              { id: crypto.randomUUID(), text: '', enabled: true },
            ])
          }
        >
          <Plus aria-hidden="true" />
          {t('지침 추가', 'Thêm hướng dẫn')}
        </button>
        <output aria-live="polite">
          {instructions.length} / {MAX_INSTRUCTIONS}
          {t('개', ' mục')}
        </output>
      </div>

      {instructions.length ? (
        <div
          className="qc-form-grid"
          style={{ gridTemplateColumns: '1fr', marginTop: 16 }}
        >
          {instructions.map((instruction, index) => {
            const textId = `ai-instruction-${instruction.id}`;
            const enabledId = `ai-instruction-enabled-${instruction.id}`;
            return (
              <fieldset key={instruction.id}>
                <legend>
                  {t('AI 지침', 'Hướng dẫn AI')} {index + 1}
                </legend>
                <label htmlFor={textId}>
                  {t(
                    `AI 지침 ${index + 1} 내용`,
                    `Nội dung hướng dẫn AI ${index + 1}`,
                  )}
                  <textarea
                    id={textId}
                    maxLength={1000}
                    value={instruction.text}
                    placeholder={t(
                      '예: 대상: 벽체 마감 면적. 조건: 단위·부위를 비교. 예외: 범위가 다르면 분리. 근거가 부족하면 미검수로 남기고 사용자 기준 숫자로 수량 오류를 임의 확정하지 마세요.',
                      'Ví dụ: Đối tượng: diện tích hoàn thiện tường. Điều kiện: so sánh đơn vị và bộ phận. Ngoại lệ: tách khi phạm vi khác. Thiếu căn cứ thì để chưa kiểm tra; không tự kết luận lỗi khối lượng theo số liệu do người dùng đặt ra.',
                    )}
                    onChange={(event) =>
                      update(instruction.id, { text: event.target.value })
                    }
                  />
                </label>
                <div className="personal-settings-actions">
                  <label className="qc-checkbox" htmlFor={enabledId}>
                    <input
                      id={enabledId}
                      type="checkbox"
                      checked={instruction.enabled}
                      onChange={(event) =>
                        update(instruction.id, {
                          enabled: event.target.checked,
                        })
                      }
                    />
                    {t(
                      `AI 지침 ${index + 1} 활성`,
                      `Bật hướng dẫn AI ${index + 1}`,
                    )}
                  </label>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() =>
                      onChange(
                        instructions.filter(
                          (item) => item.id !== instruction.id,
                        ),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                    {t('삭제', 'Xóa')}
                  </button>
                </div>
              </fieldset>
            );
          })}
        </div>
      ) : (
        <p className="qc-meta">
          {t(
            '아직 작성한 AI 검수 지침이 없습니다. 지침을 추가해 초안을 만드세요.',
            'Chưa có hướng dẫn kiểm tra AI. Hãy thêm hướng dẫn để tạo bản nháp.',
          )}
        </p>
      )}
    </section>
  );
}
