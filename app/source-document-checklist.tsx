import { Check, FileQuestion, Upload } from 'lucide-react';
import type { SourcePackageSummary } from '@/lib/ingestion/contracts';
import {
  checklistAvailability,
  hasUsableStoredSources,
  matchDocument,
} from '@/lib/ingestion/document-checklist';

export function SourceDocumentChecklist({
  discipline,
  files,
  packages,
}: {
  discipline: 'FIN' | 'RC';
  files: File[];
  packages: SourcePackageSummary[];
}) {
  const rows = checklistAvailability(discipline, files, packages);
  const matched = rows.filter(
    (row) => row.stored > 0 || row.selected > 0,
  ).length;
  const unknown = [
    ...new Set(
      [
        ...files.map((file) => file.name),
        ...packages
          .filter(hasUsableStoredSources)
          .flatMap((item) =>
            item.files
              .filter((file) => file.status === 'stored')
              .map((file) => file.filename),
          ),
      ].filter((name) => !matchDocument(name, discipline)),
    ),
  ];

  return (
    <section
      className="document-checklist"
      aria-labelledby="document-checklist-title"
    >
      <header>
        <div>
          <h4 id="document-checklist-title">검수 자료 체크리스트</h4>
          <p>
            파일명으로 {matched}종을 찾았습니다. 내용 검증 전이며, 모든 자료를
            제출할 필요는 없습니다.
          </p>
        </div>
        <span className="checklist-policy">
          누락 자료는 안내만 · 저장된 자료로 진행
        </span>
      </header>
      <div className="document-checklist-groups">
        {(['takeoff', 'summary'] as const).map((group) => (
          <details key={group} open={group === 'takeoff'}>
            <summary>
              {group === 'takeoff' ? '공종별 산출서' : '집계표 종류와 용도'}{' '}
              <span>
                {
                  rows.filter(
                    (row) =>
                      row.group === group &&
                      (row.stored > 0 || row.selected > 0),
                  ).length
                }
                종 확인
              </span>
            </summary>
            <ul>
              {rows
                .filter((row) => row.group === group)
                .map((row) => (
                  <li
                    key={row.id}
                    className={
                      row.stored
                        ? 'is-stored'
                        : row.selected
                          ? 'is-selected'
                          : 'is-missing'
                    }
                  >
                    <div>
                      <strong>{row.label}</strong>
                      <span>
                        {row.stored ? (
                          <>
                            <Check aria-hidden="true" /> 저장 {row.stored}개
                          </>
                        ) : row.selected ? (
                          <>
                            <Upload aria-hidden="true" /> 선택 {row.selected}개
                            · 저장 전
                          </>
                        ) : (
                          '미등록 · 해당 시 보완'
                        )}
                      </span>
                    </div>
                    <p>{row.description}</p>
                  </li>
                ))}
            </ul>
          </details>
        ))}
      </div>
      {unknown.length > 0 && (
        <p className="checklist-unmatched">
          <FileQuestion aria-hidden="true" /> 종류 확인 필요:{' '}
          {unknown.join(', ')}. 파일명으로 구분하지 못했으며 저장은 가능합니다.
        </p>
      )}
      <p className="checklist-limitation">
        없는 자료를 0이나 정상으로 판단하지 않습니다. 다음 단계에서 입력 매핑 후
        가능한 항목만 검수하고, 근거가 부족한 항목은 미평가로 남깁니다. 현재
        매칭은 파일명 안내이며 AI 분석 결과가 아닙니다.
      </p>
      {discipline === 'FIN' && (
        <details className="summary-guide">
          <summary>FIN 매뉴얼 기준 · 집계표를 함께 보는 이유</summary>
          <p>
            FIN 6.2 사용자 설명서 100–106쪽 기준입니다.
            공종별·동별·층별·실별·세대별은 같은 수량을 서로 다른 범위로 확인하는
            집계입니다. 산출근거집계표는 재료의 산출 위치·산출식·집계 수량을
            추적합니다.
          </p>
          <p>
            할증, 층별 환산, 확장형·마이너스 옵션에 따라 수량이 달라질 수 있어
            단순 합계 차이만으로 오류를 확정하지 않습니다. 부위별집계표는 별도의
            보조 자료로 실제 양식을 확인합니다.
          </p>
        </details>
      )}
    </section>
  );
}
