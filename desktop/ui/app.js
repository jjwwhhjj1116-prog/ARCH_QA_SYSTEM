const $ = (id) => document.getElementById(id);
let selected = [],
  answer = null,
  busy = false,
  signed = false,
  view = 'files';
let inspections = [],
  overrides = [],
  mappingOpen = false,
  mappingDirty = false;
const mappingButton = button('열·자료종류 매핑 확인', inspectMapping);
mappingButton.id = 'inspectMapping';
$('cloudChoose').after(mappingButton);
let cloudFiles = [];
let loginRecoveryTimer;
let projectSaving = false;
function clearLoginRecovery() {
  clearTimeout(loginRecoveryTimer);
  $('refresh').hidden = true;
}
function clearCloudPicker() {
  cloudFiles = [];
  $('cloudPanel').hidden = true;
  $('cloudChoose').setAttribute('aria-expanded', 'false');
  $('cloudCase').replaceChildren(new Option('자료 기록 선택', ''));
  $('cloudFile').replaceChildren(new Option('파일 선택', ''));
  $('cloudStatus').textContent = '';
}
const mappingPanel = document.createElement('section');
mappingPanel.id = 'mappingPanel';
mappingPanel.hidden = true;
mappingPanel.setAttribute('aria-label', '원본 열 매핑 편집');
document.querySelector('.workspace').before(mappingPanel);
function clearMappings() {
  inspections = [];
  overrides = [];
  mappingOpen = false;
  mappingDirty = false;
  mappingPanel.replaceChildren();
}
const initialDetail = $('detail').cloneNode(true),
  initialLimitations = $('limitations').cloneNode(true),
  initialEmpty = $('empty').cloneNode(true);
let memberEmail = null,
  memberIsAdmin = false,
  generation = 0,
  authenticating = false,
  cancelling = false;
function invalidate() {
  generation++;
  answer = null;
  render();
  return generation;
}
function setStatus(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
function controls() {
  const ready =
    signed &&
    !!$('projects').value &&
    !busy &&
    !authenticating &&
    !projectSaving;
  $('login').disabled = signed || busy || authenticating;
  $('login').textContent = signed ? '로그인됨' : '로그인';
  $('profile').hidden = !signed;
  $('newProject').disabled = !signed || busy || authenticating || projectSaving;
  for (const id of [
    'projectName',
    'projectClient',
    'projectSave',
    'projectClose',
  ])
    $(id).disabled = !signed || projectSaving || authenticating;
  $('refresh').disabled = busy || authenticating;
  $('choose').disabled = !ready;
  $('cloudChoose').disabled = !ready;
  $('cloudCase').disabled = !ready;
  $('cloudFile').disabled = !ready || !cloudFiles.length;
  $('cloudImport').disabled =
    !ready || !$('cloudCase').value || !$('cloudFile').value;
  $('cloudClose').disabled = busy || authenticating;
  $('run').disabled = !ready || !selected.length || mappingDirty;
  mappingButton.disabled = !ready || !selected.length;
  $('remove').disabled = busy || !selected.length || view !== 'files';
  $('cancel').disabled = !busy;
  $('exportTop').disabled = !ready || !answer || !answer.files.length;
  $('logout').disabled = !signed;
  $('projects').disabled = !signed || busy || authenticating || projectSaving;
  for (const input of mappingPanel.querySelectorAll('input, select, button'))
    input.disabled = !ready;
}
async function call(name, input) {
  const response = await window.qc[name](input);
  if (response.error) throw new Error(response.error);
  return response.data;
}
function button(label, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = action;
  return b;
}
function cell(row, text) {
  const td = document.createElement('td');
  td.textContent = String(text ?? '');
  row.append(td);
  return td;
}
function render() {
  mappingPanel.hidden = !mappingOpen;
  document.querySelector('.workspace').hidden = mappingOpen;
  if (!answer) {
    $('detail').replaceChildren(
      ...[...initialDetail.childNodes].map((n) => n.cloneNode(true)),
    );
    $('limitations').replaceChildren(
      ...[...initialLimitations.childNodes].map((n) => n.cloneNode(true)),
    );
    $('footer').textContent = signed
      ? '회원 확인됨 · 검수 결과 없음'
      : '회원 인증 전 · 검수 결과 없음';
  }
  $('empty').replaceChildren(
    ...[...initialEmpty.childNodes].map((n) => n.cloneNode(true)),
  );
  $('rows').replaceChildren();
  $('empty').hidden =
    (view === 'files' ? selected.length : answer?.findings.length) > 0;
  $('projectTab').classList.toggle('selected', view === 'files');
  $('reviewTab').classList.toggle('selected', view === 'findings');
  $('columns').replaceChildren();
  for (const label of view === 'files'
    ? ['선택', '원본 파일', '크기', '상태']
    : ['규칙', '수준', '검토 항목', '근거']) {
    const th = document.createElement('th');
    th.textContent = label;
    $('columns').append(th);
  }
  $('title').textContent =
    view === 'files' ? '산출서와 집계표' : '일반 검수 결과';
  if (view === 'files')
    for (const item of selected) {
      const tr = document.createElement('tr');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.dataset.id = item.id;
      check.setAttribute('aria-label', item.filename + ' 선택');
      cell(tr, '').append(check);
      cell(tr, item.filename);
      cell(tr, (item.size / 1048576).toFixed(2) + 'MiB');
      cell(
        tr,
        answer?.files.some((f) => f.filename === item.filename)
          ? '일반검사 처리됨'
          : item.registered
            ? '등록 원본 · 서버 검수 대기 / PC 실행 전'
            : '선택 · 실행 전',
      );
      $('rows').append(tr);
    }
  else
    for (const finding of answer?.findings ?? []) {
      const tr = document.createElement('tr');
      cell(tr, finding.ruleId);
      cell(tr, finding.level);
      cell(tr, '').append(
        button(finding.title ?? finding.message ?? '검토 근거 보기', () =>
          showFinding(finding),
        ),
      );
      cell(tr, finding.evidence?.join(' · ') || '근거 미제공 · 상세 확인 필요');
      $('rows').append(tr);
    }
  if (view === 'findings' && answer && !answer.findings.length) {
    $('empty').replaceChildren();
    const p = document.createElement('p');
    p.textContent = answer.files.length
      ? answer.coverage?.length &&
        answer.coverage.every((c) => c.evaluated === 0)
        ? '평가된 항목이 없습니다. 미평가 사유와 매핑을 확인하세요. 적합 판정이 아닙니다.'
        : '표시할 후보가 없습니다. 아래 평가 범위·제한사항을 확인하세요. 전체 적합 판정이 아닙니다.'
      : '처리된 원본이 없습니다. 미완료이며 파일과 형식을 확인해 주세요.';
    $('empty').append(p);
  }
  controls();
  window.dispatchEvent(
    new CustomEvent('qc:context', {
      detail: {
        signed,
        isAdmin: memberIsAdmin,
        projectId: $('projects').value,
        busy: busy || authenticating,
        generation,
      },
    }),
  );
}
function showFinding(finding) {
  $('detail').replaceChildren();
  for (const [label, value] of [
    ['검토 항목', finding.title],
    ['규칙 / 수준', `${finding.ruleId} / ${finding.level}`],
    ['원본 행 식별자', finding.rowId],
    [
      '원본 위치',
      answer?.sourceRefs?.[finding.rowId]
        ? `${answer.sourceRefs[finding.rowId].filename} · ${answer.sourceRefs[finding.rowId].sheet} · ${answer.sourceRefs[finding.rowId].row}행 · ${answer.sourceRefs[finding.rowId].cell}`
        : '원본 파일·시트·셀 위치가 제공되지 않았습니다. 행 식별자만으로 원본 위치를 확정할 수 없습니다.',
    ],
    ['근거', (finding.evidence ?? []).join('\n')],
    ['판정 제한', finding.limitation],
  ]) {
    const heading = document.createElement('h3');
    heading.textContent = label;
    const p = document.createElement('p');
    p.textContent = value || '정보 없음';
    $('detail').append(heading, p);
  }
}
async function refresh() {
  if (busy || authenticating) return;
  clearLoginRecovery();
  authenticating = true;
  clearCloudPicker();
  const current = invalidate();
  setStatus('회원과 프로젝트 접근 권한을 확인하고 있습니다.');
  try {
    const user = await call('session');
    if (current !== generation) return;
    if (memberEmail !== user.email) {
      $('projectPanel').hidden = true;
      $('projectName').value = '';
      $('projectClient').value = '';
      clearMappings();
      answer = null;
      selected = [];
      $('projects').replaceChildren(new Option('프로젝트를 선택하세요', ''));
    }
    memberEmail = user.email;
    memberIsAdmin = user.isAdmin === true;
    signed = true;
    $('member').textContent = user.displayName;
    $('memberEmail').textContent = user.email;
    $('memberRole').textContent =
      user.isAdmin === true ? '관리자 계정' : '일반 회원';
    render();
    const projects = await call('projects');
    if (current !== generation) return;
    const old = $('projects').value;
    $('projects').replaceChildren(new Option('프로젝트를 선택하세요', ''));
    for (const p of projects) $('projects').add(new Option(p.name, p.id));
    if (projects.some((p) => p.id === old)) $('projects').value = old;
    else {
      answer = null;
      selected = [];
      clearMappings();
    }
    setStatus(
      projects.length
        ? '회원 확인 완료. 프로젝트를 선택하거나 새 프로젝트를 등록하세요.'
        : '등록된 프로젝트가 없습니다. 새 프로젝트를 등록하면 산출서를 가져올 수 있습니다.',
    );
  } catch (e) {
    if (current !== generation) return;
    signed = false;
    $('projectPanel').hidden = true;
    memberEmail = null;
    memberIsAdmin = false;
    answer = null;
    selected = [];
    clearMappings();
    $('member').textContent = '로그인 필요';
    $('projects').replaceChildren(new Option('회원 로그인 후 선택', ''));
    setStatus(e.message, true);
    $('refresh').hidden = false;
  } finally {
    if (current === generation) {
      authenticating = false;
      render();
    }
  }
}
$('login').onclick = async () => {
  clearLoginRecovery();
  const current = generation;
  try {
    await call('login');
    if (current !== generation || signed) return;
    setStatus(
      '로그인 창에서 로그인을 완료하세요. 완료되면 이 작업 창으로 자동 돌아옵니다.',
    );
    loginRecoveryTimer = setTimeout(() => {
      if (current !== generation || signed) return;
      $('refresh').hidden = false;
      setStatus(
        '로그인 완료 후에도 연결되지 않았다면 아래에서 연결을 다시 확인하세요.',
      );
    }, 20000);
  } catch (e) {
    if (current !== generation || signed) return;
    setStatus(e.message, true);
    $('refresh').hidden = false;
  }
};
$('refresh').onclick = refresh;
$('newProject').onclick = () => {
  if ($('newProject').disabled) return;
  $('projectPanel').hidden = false;
  $('projectStatus').textContent = '';
  $('projectName').focus();
};
$('projectClose').onclick = () => {
  if (projectSaving) return;
  $('projectPanel').hidden = true;
  $('newProject').focus();
};
$('projectSave').onclick = async () => {
  if (!signed || projectSaving || authenticating) return;
  const name = $('projectName').value.trim();
  if (name.length < 2) {
    $('projectStatus').textContent = '프로젝트명을 2자 이상 입력하세요.';
    return;
  }
  if (
    selected.length &&
    !window.confirm(
      '새 프로젝트로 전환하면 현재 선택 파일과 매핑 편집을 비웁니다. 원본은 삭제하지 않습니다. 계속할까요?',
    )
  )
    return;
  const current = generation;
  projectSaving = true;
  controls();
  $('projectStatus').textContent = '프로젝트를 저장하고 있습니다.';
  try {
    const project = await call('createProject', {
      name,
      clientName: $('projectClient').value.trim(),
    });
    if (current !== generation || !signed) return;
    if (!project?.id || !project?.name)
      throw new Error(
        '저장 결과를 확인하지 못했습니다. 연결을 다시 확인하여 프로젝트 목록을 조회하세요.',
      );
    $('projects').add(new Option(project.name, project.id));
    $('projects').value = project.id;
    $('projects').dispatchEvent(new Event('change'));
    $('projectName').value = '';
    $('projectClient').value = '';
    $('projectPanel').hidden = true;
    setStatus(
      '프로젝트를 저장하고 선택했습니다. 산출서 가져오기로 자료를 등록하세요.',
    );
  } catch (e) {
    if (current !== generation || !signed) return;
    $('projectStatus').textContent =
      `${e.message} 입력값은 유지했습니다. 중복 생성을 피하려면 프로젝트 목록을 먼저 확인하세요.`;
    $('refresh').hidden = false;
  } finally {
    projectSaving = false;
    controls();
  }
};
$('logout').onclick = async () => {
  clearLoginRecovery();
  $('projectPanel').hidden = true;
  $('projectName').value = '';
  $('projectClient').value = '';
  $('memberEmail').textContent = '';
  $('memberRole').textContent = '';
  signed = false;
  memberEmail = null;
  memberIsAdmin = false;
  selected = [];
  clearMappings();
  clearCloudPicker();
  authenticating = true;
  busy = false;
  cancelling = false;
  invalidate();
  $('member').textContent = '로그인 필요';
  $('projects').replaceChildren(new Option('회원 로그인 후 선택', ''));
  try {
    await call('logout');
    setStatus('로그아웃했습니다. 이전 파일 목록과 검수 근거를 지웠습니다.');
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    authenticating = false;
    signed = false;
    answer = null;
    selected = [];
    $('member').textContent = '로그인 필요';
    $('projects').replaceChildren(new Option('회원 로그인 후 선택', ''));
    render();
  }
};
$('projects').onchange = () => {
  clearMappings();
  clearCloudPicker();
  selected = [];
  busy = false;
  cancelling = false;
  const current = invalidate();
  // Also invalidate a main-process request that has not yet reported progress.
  call('cancel').catch((e) => {
    if (current === generation) setStatus(e.message, true);
  });
};
async function loadCloudSources(caseId) {
  if (busy || authenticating || !signed || !$('projects').value) return;
  busy = true;
  const current = ++generation;
  cloudFiles = [];
  $('cloudFile').replaceChildren(new Option('파일 선택', ''));
  $('cloudPanel').hidden = false;
  $('cloudChoose').setAttribute('aria-expanded', 'true');
  $('cloudStatus').textContent = '등록 원본 목록을 불러오고 있습니다.';
  render();
  try {
    const data = await call('cloudSources', {
      projectId: $('projects').value,
      ...(caseId ? { caseId } : {}),
    });
    if (current !== generation) return;
    $('cloudCase').replaceChildren(new Option('자료 기록 선택', ''));
    for (const item of data.cases)
      $('cloudCase').add(new Option(item.name, item.id));
    $('cloudCase').value = data.caseId ?? '';
    cloudFiles = data.files;
    cloudFiles.forEach((file, index) =>
      $('cloudFile').add(
        new Option(
          `${file.filename} · ${file.packageName} · ${(file.sizeBytes / 1048576).toFixed(2)}MiB`,
          String(index + 1),
        ),
      ),
    );
    $('cloudStatus').textContent = !data.cases.length
      ? '등록된 자료 기록이 없습니다. 웹에서 자료를 등록한 뒤 다시 열어 주세요.'
      : cloudFiles.length
        ? `${cloudFiles.length}개 등록 원본 · 파일을 선택하세요.`
        : '가져올 수 있는 파일이 없습니다. 다른 자료 기록을 선택하거나 웹 등록 상태를 확인하세요.';
  } catch (e) {
    if (current === generation)
      $('cloudStatus').textContent =
        `${e.message} 닫은 뒤 다시 열어 재시도하세요.`;
  } finally {
    if (current === generation) {
      busy = false;
      render();
      $('cloudCase').focus();
    }
  }
}
$('cloudChoose').onclick = () => loadCloudSources();
$('cloudCase').onchange = () => loadCloudSources($('cloudCase').value);
$('cloudFile').onchange = controls;
$('cloudClose').onclick = () => {
  if (busy || authenticating) return;
  clearCloudPicker();
  controls();
  $('cloudChoose').focus();
};
$('cloudImport').onclick = async () => {
  const file = cloudFiles[Number($('cloudFile').value) - 1];
  if (
    busy ||
    authenticating ||
    !signed ||
    !$('projects').value ||
    !$('cloudCase').value ||
    !file
  )
    return;
  if (
    (selected.length || mappingDirty || overrides.length) &&
    !window.confirm(
      '현재 선택 파일과 이번 PC의 매핑 편집을 선택한 등록 원본으로 교체합니다. 계속할까요? 원본 파일은 삭제하지 않습니다.',
    )
  )
    return;
  busy = true;
  const current = ++generation;
  render();
  $('cloudStatus').textContent =
    '등록 원본을 가져오고 전송 무결성을 확인합니다.';
  try {
    const files = await call('importSource', {
      projectId: $('projects').value,
      caseId: $('cloudCase').value,
      packageId: file.packageId,
      sourceVersionId: file.sourceVersionId,
    });
    if (current !== generation) return;
    if (!files?.length) throw new Error('가져온 원본이 없습니다.');
    selected = files;
    clearMappings();
    clearCloudPicker();
    answer = null;
    view = 'files';
    setStatus(
      '등록 원본을 가져왔습니다. 서버 검수 대기 · 열 매핑 확인 후 PC 기본검사를 실행하세요. AI 검수·서버 승인 미완료.',
    );
  } catch (e) {
    if (current === generation)
      $('cloudStatus').textContent =
        `${e.message} 기존 선택과 매핑은 유지했습니다. 다시 시도하세요.`;
  } finally {
    if (current === generation) {
      busy = false;
      render();
    }
  }
};
$('choose').onclick = async () => {
  const current = generation;
  try {
    const list = await call('choose');
    if (current !== generation) return;
    if (list.length) {
      clearCloudPicker();
      clearMappings();
      selected = list;
      answer = null;
      view = 'files';
      render();
      setStatus(
        `${list.length}개 파일 선택 · 원본은 아직 서버로 전송하지 않았습니다.`,
      );
    }
  } catch (e) {
    setStatus(e.message, true);
  }
};
$('remove').onclick = () => {
  const ids = new Set(
    [...$('rows').querySelectorAll('input:checked')].map((x) => x.dataset.id),
  );
  selected = selected.filter((x) => !ids.has(x.id));
  const names = new Set(selected.map((x) => x.filename));
  overrides = overrides.filter((x) => names.has(x.filename));
  inspections = inspections.filter((x) => names.has(x.filename));
  answer = null;
  render();
  setStatus('선택 목록에서 제외했습니다. PC 원본 파일은 삭제하지 않았습니다.');
};
$('run').onclick = async () => {
  if (busy || authenticating || !signed || !$('projects').value || mappingDirty)
    return;
  mappingOpen = false;
  busy = true;
  cancelling = false;
  const current = invalidate();
  setStatus('일반 검수를 시작합니다.');
  try {
    const result = await call('review', {
      projectId: $('projects').value,
      ids: selected.map((x) => x.id),
      overrides,
    });
    if (current !== generation) return;
    answer = result;
    view = 'findings';
    $('limitations').replaceChildren();
    for (const text of answer.limitations ?? []) {
      const li = document.createElement('li');
      li.textContent = text;
      $('limitations').append(li);
    }
    for (const coverage of answer.coverage ?? []) {
      const li = document.createElement('li');
      li.textContent = `${coverage.label || coverage.ruleId} · 평가 ${coverage.evaluated} · 미평가 ${coverage.unevaluated}${coverage.reasons?.length ? ' · ' + coverage.reasons.join(' / ') : ''}`;
      $('limitations').append(li);
    }
    setStatus(
      answer.files.length
        ? `일반검사 처리 ${answer.files.length}개 · 후보 ${answer.findingCount}건 · 서버 미저장 / AI 미사용`
        : '처리된 파일 없음 · 미완료',
      !answer.files.length,
    );
    $('footer').textContent = `로컬 실행 ${answer.runId}`;
  } catch (e) {
    if (current !== generation) return;
    setStatus(e.message, true);
  } finally {
    if (current === generation) {
      busy = false;
      render();
    }
  }
};
$('cancel').onclick = async () => {
  if (!busy) return;
  cancelling = true;
  clearCloudPicker();
  const current = invalidate();
  setStatus('작업 중단 중 · 결과는 저장하지 않습니다.');
  try {
    await call('cancel');
    if (current === generation)
      setStatus('작업을 중단했습니다. 원본 파일은 유지됩니다.');
  } catch (e) {
    if (current === generation) setStatus(e.message, true);
  } finally {
    if (current === generation) {
      busy = false;
      cancelling = false;
      render();
    }
  }
};
$('exportTop').onclick = async () => {
  try {
    const saved = await call('export');
    if (saved.saved)
      setStatus(
        '분석표를 PC에 저장했습니다. 회사 Drive에는 아직 동기화하지 않았습니다.',
      );
  } catch (e) {
    setStatus(e.message, true);
  }
};
$('projectTab').onclick = () => {
  mappingOpen = false;
  view = 'files';
  render();
};
$('reviewTab').onclick = () => {
  mappingOpen = false;
  view = 'findings';
  render();
};
async function inspectMapping() {
  if (busy || authenticating || !signed || !$('projects').value) return;
  if (inspections.length) {
    mappingOpen = true;
    render();
    return;
  }
  busy = true;
  const current = invalidate();
  setStatus('원본 시트와 열을 확인하고 있습니다. 원본은 변경하지 않습니다.');
  try {
    const data = await call('review', {
      mode: 'inspect',
      projectId: $('projects').value,
      ids: selected.map((x) => x.id),
    });
    if (current !== generation) return;
    inspections = data.files;
    mappingOpen = inspections.some((f) => f.sheets.length);
    if (mappingOpen) buildMappingPanel(data.limitations ?? []);
    setStatus(
      mappingOpen
        ? '원본과 열 의미를 대조하세요. 변경한 매핑은 명시적으로 확정해야 검수할 수 있습니다.'
        : '열을 확인할 수 있는 자료가 없습니다. ' +
            (data.limitations ?? []).join(' / '),
      !mappingOpen,
    );
  } catch (e) {
    if (current === generation) setStatus(e.message, true);
  } finally {
    if (current === generation) {
      busy = false;
      render();
    }
  }
}
function columnName(index) {
  let name = '';
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
function buildMappingPanel(limitations) {
  mappingPanel.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = '원본 열·자료종류 매핑';
  const help = document.createElement('p');
  help.textContent =
    '원본의 실제 행·열 번호를 확인하세요. 미리보기는 시트별 30행·64열까지이며 원본 내용과 수량을 수정하지 않습니다. 매핑은 이번 PC 작업에만 적용됩니다.';
  const selector = document.createElement('select');
  selector.id = 'mappingSheet';
  selector.setAttribute('aria-label', '매핑할 파일과 시트');
  const entries = inspections.flatMap((file) =>
    file.sheets.map((sheet) => ({ file, sheet })),
  );
  entries.forEach(({ file, sheet }, index) =>
    selector.add(new Option(`${file.filename} / ${sheet.name}`, String(index))),
  );
  const content = document.createElement('div');
  content.className = 'mappingContent';
  const warning = document.createElement('p');
  warning.textContent = limitations.join(' / ');
  mappingPanel.append(heading, help, selector, warning, content);
  const drafts = entries.map(({ file, sheet }) => {
    const prior = overrides.find(
      (o) =>
        o.filename === file.filename &&
        o.sha256 === file.sha256 &&
        o.mapping.sheet === sheet.name,
    );
    return {
      mapping: structuredClone(prior?.mapping ?? sheet.mapping),
      dirty: false,
    };
  });
  function showSheet() {
    content.replaceChildren();
    const index = Number(selector.value),
      { file, sheet } = entries[index],
      draft = drafts[index];
    const form = document.createElement('div');
    form.className = 'mappingForm';
    const state = document.createElement('p');
    state.id = 'mappingState';
    const updateState = () => {
      state.textContent = draft.dirty
        ? '변경됨 · 매핑 확정 전에는 검수할 수 없습니다.'
        : draft.mapping.confirmed
          ? '매핑 확인됨 · 변경하면 다시 확정해야 합니다.'
          : '미확정 · 자동 추정입니다. 원본을 대조해 확정하세요.';
    };
    const changed = () => {
      draft.dirty = true;
      draft.mapping.confirmed = false;
      mappingDirty = drafts.some((d) => d.dirty);
      invalidate();
      updateState();
    };
    function field(label, id, options, value, change) {
      const wrapper = document.createElement('label');
      wrapper.textContent = label;
      const input = document.createElement(options ? 'select' : 'input');
      input.id = id;
      if (options)
        for (const [key, text] of options) input.add(new Option(text, key));
      else {
        input.type = 'number';
        input.min = '1';
        input.max = '1000';
      }
      input.value = String(value);
      input.onchange = () => {
        change(input.value);
        changed();
      };
      wrapper.append(input);
      form.append(wrapper);
    }
    field(
      '헤더 행 번호',
      'mappingHeader',
      null,
      draft.mapping.headerRow,
      (v) => {
        draft.mapping.headerRow = Number(v);
      },
    );
    field(
      '자료 종류',
      'mappingKind',
      [
        ['detail', '상세 산출서'],
        ['building-summary', '동별집계표'],
        ['reference', '참고 자료 · 일반검수 대상 제외'],
      ],
      draft.mapping.kind,
      (v) => {
        draft.mapping.kind = v;
      },
    );
    const labels = {
      item: '품명',
      spec: '규격',
      unit: '단위',
      formula: '산출식',
      quantity: '물량',
      trade: '공종',
      part: '부위',
      code: '재료코드',
      scope: '동·층·실 범위',
      dimension: '확인할 치수',
      cohort: '동일 비교집단',
    };
    const options = [
      ['', '연결하지 않음'],
      ...Array.from({ length: 256 }, (_, i) => [
        String(i),
        `${columnName(i)}열 (${i + 1})`,
      ]),
    ];
    for (const [key, label] of Object.entries(labels))
      field(
        label,
        `mapping-${key}`,
        options,
        draft.mapping.columns[key] ?? '',
        (v) => {
          draft.mapping.columns[key] = v === '' ? null : Number(v);
        },
      );
    field(
      '물량 열의 의미',
      'mappingBasis',
      [
        ['unknown', '미확인 · 산식 결과값 대조 제외'],
        ['formula-result', '산출식의 계산 결과값'],
      ],
      draft.mapping.arithmeticBasis,
      (v) => {
        draft.mapping.arithmeticBasis = v;
      },
    );
    const confirm = button('이 시트 매핑 확정', () => {
      const values = Object.values(draft.mapping.columns).filter(
        (v) => v !== null,
      );
      if (
        !Number.isInteger(draft.mapping.headerRow) ||
        draft.mapping.headerRow < 1 ||
        draft.mapping.headerRow > 1000 ||
        new Set(values).size !== values.length
      ) {
        setStatus(
          '헤더 행은 1~1000의 정수이며, 서로 다른 의미를 같은 열에 연결할 수 없습니다.',
          true,
        );
        return;
      }
      const { kind, columns } = draft.mapping;
      if (
        (kind === 'detail' &&
          (columns.item === null || columns.formula === null)) ||
        (kind === 'building-summary' &&
          (columns.item === null || columns.unit === null))
      ) {
        setStatus(
          '상세 산출서는 품명·산출식 열, 동별집계표는 품명·단위 열을 연결해야 매핑을 확정할 수 있습니다.',
          true,
        );
        return;
      }
      const header = sheet.preview.find(
        (row) => row.row === draft.mapping.headerRow,
      );
      // A 64-cell preview may be truncated; the core validates the full source width.
      if (
        header &&
        header.cells.length < 64 &&
        values.some((column) => column >= header.cells.length)
      ) {
        setStatus(
          '선택한 열이 원본 헤더의 열 범위를 벗어났습니다. 원본 미리보기와 열 선택을 다시 확인하세요.',
          true,
        );
        return;
      }
      draft.mapping.confirmed = true;
      draft.dirty = false;
      overrides = overrides.filter(
        (o) =>
          !(
            o.filename === file.filename &&
            o.sha256 === file.sha256 &&
            o.mapping.sheet === sheet.name
          ),
      );
      overrides.push({
        filename: file.filename,
        sha256: file.sha256,
        mapping: structuredClone(draft.mapping),
      });
      mappingDirty = drafts.some((d) => d.dirty);
      invalidate();
      updateState();
      setStatus(
        '이 시트 매핑을 확정했습니다. 다른 시트도 확인한 뒤 일반 검수를 실행하세요.',
      );
    });
    confirm.id = 'mappingConfirm';
    confirm.className = 'primary';
    const reset = button('이 시트 변경 취소', () => {
      const prior = overrides.find(
        (o) =>
          o.filename === file.filename &&
          o.sha256 === file.sha256 &&
          o.mapping.sheet === sheet.name,
      );
      drafts[index] = {
        mapping: structuredClone(prior?.mapping ?? sheet.mapping),
        dirty: false,
      };
      mappingDirty = drafts.some((d) => d.dirty);
      showSheet();
      render();
    });
    reset.id = 'mappingReset';
    form.append(state, confirm, reset);
    const preview = document.createElement('div');
    preview.className = 'mappingPreview';
    preview.tabIndex = 0;
    preview.setAttribute(
      'aria-label',
      '읽기 전용 원본 미리보기 · 가로 스크롤 가능',
    );
    const table = document.createElement('table'),
      thead = document.createElement('thead'),
      header = document.createElement('tr'),
      tbody = document.createElement('tbody');
    const rows = sheet.preview.slice(0, 30);
    const count = Math.min(64, Math.max(0, ...rows.map((r) => r.cells.length)));
    for (const label of [
      '원본 행',
      ...Array.from({ length: count }, (_, i) => columnName(i)),
    ]) {
      const th = document.createElement('th');
      th.textContent = label;
      header.append(th);
    }
    thead.append(header);
    for (const row of rows) {
      const tr = document.createElement('tr');
      cell(tr, row.row);
      for (let c = 0; c < count; c++) cell(tr, row.cells[c]);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    preview.append(table);
    content.append(form, preview);
    updateState();
    controls();
  }
  selector.onchange = showSheet;
  showSheet();
}
window.qc.onProgress((value) => {
  if (busy && signed && !authenticating && !cancelling)
    setStatus(value.message);
});
window.qc.onAuthenticated(refresh);
render();
