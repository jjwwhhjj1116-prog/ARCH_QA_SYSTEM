import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WorkspacePreferences,
  PersonalPreferences,
  SidebarResizer,
  clampSidebar,
  useWorkspacePreferences,
} from './workspace-preferences';
import { UiText } from './ui-translation';
function StateProbe() {
  const p = useWorkspacePreferences();
  return (
    <output aria-label="state">
      {p.locale}:{p.sidebarWidth}
    </output>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe('local workspace preferences', () => {
  it('clamps corrupt widths and does not accept invalid locale', () => {
    expect(clampSidebar(NaN)).toBe(248);
    expect(clampSidebar(900)).toBe(380);
    expect(clampSidebar(100)).toBe(220);
    localStorage.setItem(
      'qc-workspace-preferences',
      JSON.stringify({ locale: 'invalid', sidebarWidth: 900 }),
    );
    render(
      <WorkspacePreferences>
        <StateProbe />
      </WorkspacePreferences>,
    );
    expect(screen.getByLabelText('state')).toHaveTextContent('ko:380');
  });
  it('resizes with keyboard, persists preference, and translates UI without changing original data', () => {
    render(
      <WorkspacePreferences>
        <PersonalPreferences />
        <SidebarResizer />
        <StateProbe />
        <UiText text="삭제" />
        <p>원본 품명 · 미장</p>
      </WorkspacePreferences>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-valuenow',
      '380',
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vi' } });
    expect(screen.getByLabelText('state')).toHaveTextContent('vi:380');
    expect(screen.getByText('Xóa')).toBeVisible();
    expect(screen.getByText('원본 품명 · 미장')).toBeVisible();
    expect(
      JSON.parse(localStorage.getItem('qc-workspace-preferences')!),
    ).toEqual({ locale: 'vi', sidebarWidth: 380 });
  });
});
