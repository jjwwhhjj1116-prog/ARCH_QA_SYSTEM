'use client';
import {
  Home,
  FolderKanban,
  FileSpreadsheet,
  FileScan,
  Layers3,
  BarChart3,
  Check,
} from 'lucide-react';
import type { StudioView } from './review-modules';
import { useWorkspacePreferences } from './workspace-preferences';

export function WorkflowNavigation({
  view,
  selected,
  ready,
  onNavigate,
}: {
  view: StudioView;
  selected: boolean;
  ready: boolean;
  onNavigate: (view: StudioView) => unknown;
}) {
  const { locale } = useWorkspacePreferences();
  const t = (ko: string, vi: string) => (locale === 'vi' ? vi : ko);
  function item(
    id: StudioView,
    label: string,
    Icon = FileSpreadsheet,
    needs: 'project' | 'sources' | null = null,
  ) {
    const blocked =
      needs === 'sources' ? !ready : needs === 'project' ? !selected : false;
    return (
      <button
        key={id}
        type="button"
        className="workflow-link"
        aria-current={view === id ? 'page' : undefined}
        disabled={blocked}
        onClick={() => onNavigate(id)}
      >
        <Icon aria-hidden="true" />
        <span>
          {label}
          {blocked && (
            <small>
              {t(
                selected ? '자료 등록 후 이용' : '프로젝트 선택 필요',
                selected ? 'Cần đăng ký tài liệu' : 'Chọn dự án trước',
              )}
            </small>
          )}
        </span>
        {view === id && (
          <Check className="nav-current-check" aria-hidden="true" />
        )}
      </button>
    );
  }
  return (
    <nav
      className="workflow-navigation"
      aria-label={t('작업 순서', 'Quy trình làm việc')}
    >
      {item('home', t('홈', 'Trang chủ'), Home)}
      {item('project-register', t('프로젝트', 'Dự án'), FolderKanban)}
      <div className="workflow-tree">
        {item(
          'project-data',
          t('STEP 1. 자료등록', 'STEP 1. Tài liệu'),
          FileSpreadsheet,
          'project',
        )}
        <details open className="workflow-group">
          <summary>
            <FileScan />
            {t('STEP 2. AI 검수', 'STEP 2. Kiểm tra AI')}
          </summary>
          {item(
            'formula-ai',
            t('산출식 AI 검수', 'Kiểm tra công thức AI'),
            FileScan,
            'sources',
          )}
          {item(
            'duplicate-ai',
            t('중복 ITEM 검수', 'Kiểm tra ITEM trùng'),
            Layers3,
            'sources',
          )}
        </details>
        <details open className="workflow-group">
          <summary>
            <BarChart3 />
            {t('STEP 3. 수량산출 분석표', 'STEP 3. Phân tích khối lượng')}
          </summary>
          {item(
            'analysis',
            t('분석표 개요', 'Tổng quan'),
            BarChart3,
            'sources',
          )}
          <details open={view.startsWith('analysis-finish-')}>
            <summary>{t('마감', 'Hoàn thiện')}</summary>
            <details open>
              <summary>{t('자료등록 · 분석', 'Tài liệu · Phân tích')}</summary>
              {(
                [
                  ['interior', '내부', 'Bên trong'],
                  ['exterior', '외부', 'Bên ngoài'],
                  ['masonry', '조적', 'Xây'],
                  ['window', '창호', 'Cửa'],
                ] as const
              ).map(([key, ko, vi]) =>
                item(
                  `analysis-finish-${key}`,
                  t(ko, vi),
                  FileSpreadsheet,
                  'sources',
                ),
              )}
            </details>
          </details>
          <details open={view.startsWith('analysis-structure-')}>
            <summary>{t('구조', 'Kết cấu')}</summary>
            {(
              [
                ['beam', '보', 'Dầm'],
                ['slab', '슬래브', 'Sàn'],
                ['column', '기둥', 'Cột'],
                ['retaining-wall', '옹벽', 'Tường chắn'],
                ['foundation', '기초', 'Móng'],
                ['apartment-retaining-wall', '아파트옹벽', 'Tường chắn căn hộ'],
                ['apartment-slab', '아파트슬라브', 'Sàn căn hộ'],
              ] as const
            ).map(([key, ko, vi]) =>
              item(
                `analysis-structure-${key}`,
                t(ko, vi),
                FileSpreadsheet,
                'sources',
              ),
            )}
          </details>
        </details>
      </div>
    </nav>
  );
}
