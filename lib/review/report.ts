import { zipSync, strToU8 } from 'fflate';
import type { Decision, Run } from './contracts';
import { columnName } from './columns';

const escapeXml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32 || '\t\n\r'.includes(c))
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
// All exported cells are OOXML inline strings: spreadsheet formula injection is never executed.
export function exportReview(run: Run, decisions: Decision[]): Uint8Array {
  const latest = new Map(decisions.map((d) => [d.findingId, d]));
  const sheets: { name: string; rows: (string | number)[][] }[] = [
    {
      name: '검수 결과',
      rows: [
        [
          '실행 ID',
          '실행 구분',
          '지침 버전',
          '규칙',
          '판단 수준',
          '중요도',
          '결과',
          '품명',
          '규격',
          '단위',
          '산식',
          '물량',
          '원본 파일',
          '원본 버전',
          'SHA256',
          '시트',
          '행',
          '셀',
          '판단 근거',
          '제한사항',
          '사람 판단',
          '사유',
        ],
        ...run.findings.map((f) => {
          const row = run.rows.find((r) => r.id === f.rowId)!;
          const d = latest.get(f.id);
          return [
            run.id,
            run.trial ? '시험 · 정식 검수 아님' : '정식',
            run.profileVersion,
            f.ruleId,
            f.level,
            f.severity,
            f.title,
            row.values.item,
            row.values.spec,
            row.values.unit,
            row.values.formula,
            row.values.quantity,
            row.ref.filename,
            row.ref.sourceVersionId,
            row.ref.sha256,
            row.ref.sheet,
            row.ref.row,
            row.ref.cell,
            f.evidence.join('\n'),
            f.limitation,
            d?.disposition ?? '미판단',
            d?.reason ?? '',
          ];
        }),
      ],
    },
    {
      name: '검수 범위와 제한',
      rows: [
        ['실행 ID', run.id],
        ['검사 엔진', run.engineVersion],
        ['실행 시각', run.createdAt],
        ['지침', run.profile.name],
        ['변경 사유', run.profile.reason],
        ['기준 스냅샷', JSON.stringify(run.profile)],
        [''],
        ['규칙', '이름', '평가', '미평가', '미평가 사유'],
        ...run.coverage.map((c) => [
          c.ruleId,
          c.label,
          c.evaluated,
          c.unevaluated,
          c.reasons.join('\n'),
        ]),
        [''],
        ...run.limitations.map((l) => ['제한', l]),
      ],
    },
    {
      name: '판단 변경 이력',
      rows: [
        ['판단 ID', '항목 ID', '판단', '사유', '행위자', '시각'],
        ...decisions.map((d) => [
          d.id,
          d.findingId,
          d.disposition,
          d.reason,
          d.actorId,
          d.createdAt,
        ]),
      ],
    },
  ];
  const entries: Record<string, Uint8Array> = {};
  const put = (name: string, text: string) => {
    entries[name] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + text,
    );
  };
  put(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
  );
  put(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  put(
    'xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets
        .map(
          (s, i) =>
            `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join('') +
      '</sheets></workbook>',
  );
  put(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      '</Relationships>',
  );
  sheets.forEach((s, i) =>
    put(
      `xl/worksheets/sheet${i + 1}.xml`,
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="24" width="24" customWidth="1"/></cols><sheetData>' +
        s.rows
          .map(
            (r, n) =>
              `<row r="${n + 1}">` +
              r
                .map(
                  (v, c) =>
                    `<c r="${columnName(c)}${n + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`,
                )
                .join('') +
              '</row>',
          )
          .join('') +
        '</sheetData></worksheet>',
    ),
  );
  return zipSync(entries, { level: 6 });
}
