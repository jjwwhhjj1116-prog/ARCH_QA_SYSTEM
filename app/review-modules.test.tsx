import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '@/lib/domain/contracts';
import {
  ModuleWorkspace,
  studioNavigation,
  type StudioNavigationGroup,
} from './review-modules';

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

afterEach(cleanup);

describe('studioNavigation', () => {
  it('publishes the exact five-stage hierarchy and settings', () => {
    expect(studioNavigation.map((item) => item.label)).toEqual([
      '프로젝트 등록',
      '프로젝트 자료',
      '산출식 AI 검수',
      '중복 아이템 AI 검수',
      '수량산출 분석표',
      '설정',
    ]);
    expect(studioNavigation.slice(0, 5).map((item) => item.stage)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('keeps seven structure leaves and the four exact finish leaves', () => {
    const analysis = studioNavigation[4] as StudioNavigationGroup;
    const structure = analysis.children[1] as StudioNavigationGroup;
    const finish = analysis.children[2] as StudioNavigationGroup;

    expect(analysis.defaultView).toBe('analysis');
    expect(structure.label).toBe('구조');
    expect(structure.children.map((item) => item.label)).toEqual([
      '보',
      '슬라브',
      '기둥',
      '옹벽',
      '기초',
      '아파트슬라브',
      '아파트옹벽',
    ]);
    expect(finish.label).toBe('마감');
    expect(finish.children.map((item) => item.label)).toEqual([
      '면적 분석표(내부)',
      '면적 분석표(외부)',
      '수량 분석표(조적)',
      '수량 분석표(창호)',
    ]);
  });
});

describe('ModuleWorkspace', () => {
  it('routes an unselected module back to project registration', () => {
    const onOpenProjects = vi.fn();
    render(
      <ModuleWorkspace
        view="formula-ai"
        selectedProject={null}
        reviewCases={[]}
        onOpenProjects={onOpenProjects}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: '프로젝트 등록·선택으로 이동' }),
    );
    expect(onOpenProjects).toHaveBeenCalledOnce();
  });

  it('keeps not-run formula results as N/A and labels the example', () => {
    render(
      <ModuleWorkspace
        view="formula-ai"
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

  it('keeps analysis inputs missing and Excel export locked', () => {
    render(
      <ModuleWorkspace
        view="analysis"
        selectedProject={project}
        reviewCases={[]}
        onOpenProjects={vi.fn()}
      />,
    );
    expect(screen.getAllByText('미등록')).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: 'Excel 다운로드' }),
    ).toBeDisabled();
    expect(screen.getByText('N/A · 원천 미등록')).toBeVisible();
  });

  it('renders the selected trade without fabricating a quantity result', () => {
    render(
      <ModuleWorkspace
        view="analysis-structure-apartment-slab"
        selectedProject={project}
        reviewCases={[]}
        onOpenProjects={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', {
        name: '구조 · 아파트슬라브 공종별 분석표',
      }),
    ).toBeVisible();
    expect(screen.getByText('N/A · 미실행')).toBeVisible();
    expect(
      screen.getByText(
        '아파트슬라브 공종의 산출서와 집계표 입력 매핑이 완료되지 않았습니다.',
      ),
    ).toBeVisible();
  });

  it('keeps the masonry leaf audit-only and out of review calculations', () => {
    render(
      <ModuleWorkspace
        view="analysis-finish-masonry"
        selectedProject={project}
        reviewCases={[]}
        onOpenProjects={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: '마감 · 조적 수량 분석표' }),
    ).toBeVisible();
    expect(screen.getByText('N/A · 제외 계보 미등록')).toBeVisible();
    expect(
      screen.getByText(
        /AI 검수·동일 아이템·면적분석·경험통계에는 포함하지 않으며/,
      ),
    ).toBeVisible();
  });

  it('allows global settings to explain missing integrations without a project', () => {
    render(
      <ModuleWorkspace
        view="settings"
        selectedProject={null}
        reviewCases={[]}
        onOpenProjects={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '설정' })).toBeVisible();
    expect(screen.getByText('N/A · 미구현')).toBeVisible();
    expect(screen.getAllByText('미연결')).toHaveLength(4);
  });
});
