import { Zip, ZipDeflate, strToU8 } from 'fflate';
import type { Decision, Run } from './contracts';
import { columnName } from './columns';
import { reviewCompleteness } from './completeness';

const escapeXml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32 || '\t\n\r'.includes(c))
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\r', '&#13;');
// All exported cells are OOXML inline strings: spreadsheet formula injection is never executed.
export function exportReview(run: Run, decisions: Decision[]): Uint8Array {
  const completeness = reviewCompleteness(run);
  const rowsById = new Map(run.rows.map((row) => [row.id, row]));
  const latest = new Map(decisions.map((d) => [d.findingId, d]));
  const recordedPairs = new Set(
    (run.aiChecks ?? []).map((c) => JSON.stringify([c.rowId, c.instructionId])),
  );
  const sheets: { name: string; rows: Iterable<(string | number)[]> }[] = [
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
          '비교 대상 원본 위치',
        ],
        ...run.findings.map((f) => {
          const row = rowsById.get(f.rowId)!;
          const d = latest.get(f.id);
          return [
            run.id,
            run.kind === 'baseline'
              ? '제품 기본검사 · 최종 승인 아님'
              : run.trial
                ? '시험 · 정식 검수 아님'
                : '승인 지침 검수 · 최종 승인 아님',
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
            f.peerIds
              .map((id) => {
                const peer = rowsById.get(id);
                return peer
                  ? `${id} · ${peer.ref.filename} · ${peer.ref.sourceVersionId} · ${peer.ref.sheet} · ${peer.ref.row}행 · ${peer.ref.cell}`
                  : `${id} · 원본 행 확인 불가`;
              })
              .join('\n'),
          ];
        }),
      ],
    },
    {
      name: '검수 범위와 제한',
      rows: (function* () {
        yield* [
          ['실행 ID', run.id],
          ['프로젝트 ID', run.projectId],
          ['검수 사례 ID', run.caseId],
          ['지침 ID', run.profileId],
          ['실행 회원 식별자', run.actorId],
          [
            '실행 구분',
            run.kind === 'baseline'
              ? '제품 기본검사 · 외부 AI 미사용'
              : run.trial
                ? '지침 시험'
                : '승인 지침 검수',
          ],
          ['검사 대상 행', run.rowCount ?? run.rows.length],
          ['검사 엔진', run.engineVersion],
          ['실행 시각', run.createdAt],
          ['지침', run.profile.name],
          ['변경 사유', run.profile.reason],
          ['기준 스냅샷', JSON.stringify(run.profile)],
          ['AI 실행 정보', run.ai ? JSON.stringify(run.ai) : '외부 AI 미사용'],
          ['이전 묶음 실행', run.parentRunId ?? '첫 실행'],
          ['행·지침 상태', '원본 행 ID', '지침 ID', '사유'],
        ];
        for (const c of run.aiChecks ?? [])
          yield [c.status, c.rowId, c.instructionId, c.reason];
        for (const row of run.rows)
          for (const i of run.profile.instructions ?? []) {
            if (i.enabled && !recordedPairs.has(JSON.stringify([row.id, i.id])))
              yield ['missing', row.id, i.id, '처리 기록 없음 · 미검수'];
          }
        yield* [
          ['전체 검수 판정', completeness.label],
          [
            '행·지침 처리 조합',
            `${completeness.evaluatedPairs}/${completeness.totalPairs}`,
          ],
          [
            '등록 파일·시트 대조',
            run.sourceAudit
              ? JSON.stringify(run.sourceAudit)
              : '대조 기록 없음',
          ],
          ...completeness.issues.map((issue) => ['전체 완료 차단 사유', issue]),
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
          [''],
          ['원본 파일', '원본 버전', 'SHA256', '시트', '기준 행', '기준 셀'],
          ...run.sources.map((s) => [
            s.filename,
            s.sourceVersionId,
            s.sha256,
            s.sheet,
            s.row,
            s.cell,
          ]),
          [''],
          ['매핑 원본 버전', '시트', '매핑 스냅샷'],
          ...run.mappings.map((m) => [
            m.sourceVersionId,
            m.sheet,
            JSON.stringify(m),
          ]),
        ];
      })(),
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
    {
      name: '원본 행 색인',
      rows: [
        [
          '원본 행 ID',
          '원본 파일',
          '원본 버전',
          'SHA256',
          '시트',
          '행',
          '기준 셀',
          '필드별 원본 위치',
          '제외 사유',
        ],
        ...run.rows.map((row) => [
          row.id,
          row.ref.filename,
          row.ref.sourceVersionId,
          row.ref.sha256,
          row.ref.sheet,
          row.ref.row,
          row.ref.cell,
          JSON.stringify(row.fieldRefs),
          row.excluded ?? '',
        ]),
      ],
    },
  ];
  // Excel limits cell text to 32,767 characters. Keep long evidence in ordered pieces.
  const overflow: (string | number)[][] = [
    ['원본 시트', '원본 셀', '조각 순서', '원문 조각'],
  ];
  sheets.push({ name: '긴 셀 원문', rows: overflow });
  const chunks: Uint8Array[] = [];
  const archive = new Zip((error, data) => {
    if (error) throw error;
    chunks.push(data);
  });
  const file = (name: string) => {
    const stream = new ZipDeflate(name, { level: 6 });
    stream.mtime = new Date(1980, 0, 1, 0, 0, 0);
    archive.add(stream);
    return stream;
  };
  const put = (name: string, text: string) => {
    file(name).push(
      strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + text),
      true,
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
  sheets.forEach((s, i) => {
    const stream = file(`xl/worksheets/sheet${i + 1}.xml`);
    let xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="24" width="24" customWidth="1"/></cols><sheetData>';
    let n = 0;
    for (const r of s.rows) {
      n++;
      xml +=
        `<row r="${n}">` +
        r
          .map((v, c) => {
            if (typeof v === 'string' && v.length > 32767) {
              let part = 1;
              for (let start = 0; start < v.length;) {
                let end = Math.min(start + 30000, v.length);
                if (
                  end < v.length &&
                  v.charCodeAt(end - 1) >= 0xd800 &&
                  v.charCodeAt(end - 1) <= 0xdbff
                )
                  end--;
                overflow.push([
                  s.name,
                  `${columnName(c)}${n}`,
                  part++,
                  v.slice(start, end),
                ]);
                start = end;
              }
              v = `긴 셀 원문 시트 참조: ${s.name}!${columnName(c)}${n} · ${part - 1}개 조각 · 원문 생략 아님`;
            }
            return `<c r="${columnName(c)}${n}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
          })
          .join('') +
        '</row>';
      if (xml.length >= 32 * 1024) {
        stream.push(strToU8(xml));
        xml = '';
      }
    }
    stream.push(strToU8(xml + '</sheetData></worksheet>'), true);
  });
  archive.end();
  const output = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
