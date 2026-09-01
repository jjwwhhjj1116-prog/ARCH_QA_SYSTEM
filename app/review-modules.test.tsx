import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '@/lib/domain/contracts';
import { ModuleWorkspace } from './review-modules';

const project: ProjectSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'MANUAL-11111111111141118111111111111111',
  name: '덕천3구역 재건축',
  clientName: '한화건설',
  status: 'active',
  role: 'project_owner',
  openCaseCount: 0,
  needsAttentionCount: 0,
  createdAt: new Date().toISOString(),
};

describe('ModuleWorkspace', () => {
  it('routes an unselected module back to project selection', () => {
    const onOpenProjects = vi.fn();
    render(
      <ModuleWorkspace
        view="formula"
        selectedProject={null}
        reviewCases={[]}
        onOpenProjects={onOpenProjects}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '프로젝트 선택' }));
    expect(onOpenProjects).toHaveBeenCalledOnce();
  });

  it('keeps not-run results as N/A and labels the educational example', () => {
    render(
      <ModuleWorkspace
        view="formula"
        selectedProject={project}
        reviewCases={[]}
        onOpenProjects={vi.fn()}
      />,
    );
    expect(screen.getByText('N/A · 미실행')).toBeVisible();
    expect(screen.getByLabelText('교육용 판정 예시')).toHaveTextContent(
      '실제 결과 아님',
    );
    fireEvent.click(screen.getByRole('button', { name: '구조' }));
    expect(screen.queryByLabelText('교육용 판정 예시')).toBeNull();
  });

  it('keeps report export locked until a verified result exists', () => {
    render(
      <ModuleWorkspace
        view="reports"
        selectedProject={project}
        reviewCases={[]}
        onOpenProjects={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Excel 다운로드' }),
    ).toBeDisabled();
    expect(screen.getAllByText('결과 확정 후 생성')).toHaveLength(5);
  });
});
