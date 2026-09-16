import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { AiInstruction } from '@/lib/review/contracts';
import { AiInstructionEditor } from './ai-instruction-editor';
import { WorkspacePreferences } from './workspace-preferences';

function EditorHarness({ initial = [] }: { initial?: AiInstruction[] }) {
  const [instructions, setInstructions] = useState(initial);
  return (
    <WorkspacePreferences>
      <AiInstructionEditor
        instructions={instructions}
        onChange={setInstructions}
      />
    </WorkspacePreferences>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('adds a UUID draft, edits it, toggles it, and removes it without confirmation', () => {
  render(<EditorHarness />);
  fireEvent.click(screen.getByRole('button', { name: '지침 추가' }));

  const text = screen.getByLabelText('AI 지침 1 내용');
  expect(text).toHaveValue('');
  expect(text).toHaveAttribute('maxlength', '1000');
  fireEvent.change(text, {
    target: { value: '벽체 마감의 단위와 부위를 비교한다.' },
  });
  expect(text).toHaveValue('벽체 마감의 단위와 부위를 비교한다.');

  const enabled = screen.getByRole('checkbox', { name: 'AI 지침 1 활성' });
  expect(enabled).toBeChecked();
  fireEvent.click(enabled);
  expect(enabled).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  expect(screen.queryByLabelText('AI 지침 1 내용')).not.toBeInTheDocument();
});

it('prevents more than ten draft instructions', () => {
  const initial = Array.from({ length: 10 }, (_, index) => ({
    id: `instruction-${index}`,
    text: `지침 ${index + 1}`,
    enabled: true,
  }));
  render(<EditorHarness initial={initial} />);

  expect(screen.getByRole('button', { name: '지침 추가' })).toBeDisabled();
  expect(screen.getByText('10 / 10개')).toBeInTheDocument();
});

it('uses Vietnamese copy from the saved workspace locale', () => {
  localStorage.setItem(
    'qc-workspace-preferences',
    JSON.stringify({ locale: 'vi', sidebarWidth: 248 }),
  );
  render(<EditorHarness />);

  expect(
    screen.getByRole('heading', { name: 'Danh sách hướng dẫn kiểm tra AI' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Thêm hướng dẫn' })).toBeEnabled();
});
