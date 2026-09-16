// Existing project-scoped server profiles; local baseline never claims to apply them.
(() => {
  const node = (tag, text) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    return el;
  };
  const toggle = node('button', '관리자 지침');
  toggle.id = 'instructionsToggle';
  toggle.disabled = true;
  document.querySelector('nav').append(toggle);
  const panel = node('section');
  panel.id = 'instructionsPanel';
  panel.hidden = true;
  panel.className = 'instructionPanel';
  panel.append(node('h2', '관리자 설정 · 프로젝트 검수지침'));
  panel.append(
    node(
      'p',
      '새 초안 버전으로 저장합니다. 기존 지침은 유지됩니다. 이 PC의 일반 기본검사에는 아직 적용되지 않습니다. 시험·활성화는 서버에 등록된 자료로 별도 진행해야 합니다.',
    ),
  );
  const message = node('p');
  message.setAttribute('role', 'status');
  panel.append(message);
  const form = node('form');
  form.id = 'instructionsForm';
  const field = (label, control) => {
    const wrap = node('label', label);
    wrap.append(control);
    form.append(wrap);
    return control;
  };
  const cases = field('자료 기록', node('select'));
  cases.id = 'instructionCase';
  const profiles = field(
    '저장 지침 버전 · 선택 후 시험 또는 새 초안 작성',
    node('select'),
  );
  profiles.id = 'instructionProfile';
  const trialPanel = node('section');
  trialPanel.className = 'instructionTrial';
  trialPanel.append(node('h3', '저장된 버전 시험 · 활성화'));
  const readiness = node('p');
  readiness.id = 'instructionReadiness';
  const trial = node('button', '서버 자료로 시험 · AI 호출 없음');
  trial.type = 'button';
  trial.id = 'instructionTrial';
  trial.className = 'primary';
  const history = node('select');
  history.id = 'instructionTrialHistory';
  history.setAttribute('aria-label', '선택 지침의 서버 시험 이력');
  const detail = node('button', '시험 결과 조회');
  detail.type = 'button';
  detail.id = 'instructionTrialDetail';
  const approve = node('button', '시험 확인 후 활성화');
  approve.type = 'button';
  approve.id = 'instructionApprove';
  const trialResult = node('div');
  trialResult.id = 'instructionTrialResult';
  trialResult.setAttribute('aria-live', 'polite');
  const trialActions = node('div');
  trialActions.className = 'instructionTrialActions';
  trialActions.append(trial, history, detail, approve);
  trialPanel.append(readiness, trialActions, trialResult);
  form.append(trialPanel);
  const name = field('지침 이름', node('input'));
  name.id = 'instructionName';
  name.maxLength = 100;
  name.required = true;
  const reason = field('작성·변경 이유', node('textarea'));
  reason.id = 'instructionReason';
  reason.maxLength = 500;
  reason.required = true;
  const rows = node('div');
  rows.id = 'instructionRows';
  form.append(rows);
  const add = node('button', '지침 항목 추가');
  add.type = 'button';
  add.id = 'instructionAdd';
  const save = node('button', '새 초안 버전 저장');
  save.type = 'submit';
  save.id = 'instructionSave';
  save.className = 'primary';
  const reload = node('button', '서버 지침 다시 조회');
  reload.type = 'button';
  reload.id = 'instructionReload';
  form.append(add, save, reload);
  panel.append(form);
  document.querySelector('main').prepend(panel);
  let context = { signed: false, projectId: '', busy: false },
    state = null,
    epoch = 0,
    loading = false,
    summary = null,
    uncertain = false;
  const drafts = new Map();
  let priorTab = 'projectTab';
  const values = () => ({
    caseId: cases.value,
    baseProfileId: profiles.value || null,
    expectedRevision: state?.expectedRevision,
    name: name.value,
    reason: reason.value,
    instructions: [...rows.children].map((row) => ({
      id: row.dataset.id,
      text: row.querySelector('textarea').value,
      enabled: row.querySelector('input').checked,
    })),
  });
  const selected = () => state?.profiles.find((p) => p.id === profiles.value);
  const dirty = () => drafts.has(context.projectId);
  function renderTrial() {
    const version = selected();
    readiness.textContent = !version
      ? '먼저 저장된 지침 버전을 선택하세요. 새 기본 초안은 저장 후 시험합니다.'
      : dirty()
        ? '미저장 편집 내용이 있습니다. 새 초안으로 저장한 뒤 해당 버전을 선택하세요.'
        : `v${version.version} · 서버 자료 ${state.sourcesCount ?? 0}개 / 확인한 매핑 ${state.confirmedMappingCount ?? 0}개. ${!state.sourcesCount || !state.confirmedMappingCount ? '서버 자료 등록과 매핑 확인이 먼저 필요합니다.' : '이 PC의 선택 파일이 아닌 서버에 저장된 자료로 시험합니다.'}`;
    trialResult.replaceChildren();
    if (!summary) return;
    trialResult.append(
      node(
        'p',
        `시험 ${summary.id} · v${summary.profileVersion} · ${summary.rowCount}행 / 검토 후보 ${summary.findingCount}건`,
      ),
    );
    const table = node('table');
    const header = node('tr');
    for (const title of ['검수 규칙', '평가', '미평가', '미평가 사유']) {
      const th = node('th', title);
      th.scope = 'col';
      header.append(th);
    }
    const head = node('thead');
    head.append(header);
    const body = node('tbody');
    for (const item of summary.coverage) {
      const row = node('tr');
      for (const value of [
        `${item.ruleId} · ${item.label}`,
        String(item.evaluated),
        String(item.unevaluated),
        item.reasons.join(' / ') || '—',
      ])
        row.append(node('td', value));
      body.append(row);
    }
    table.append(head, body);
    trialResult.append(table);
    if (summary.limitations.length) {
      const limits = node('details');
      limits.append(
        node(
          'summary',
          `시험 한계 ${summary.limitations.length}건 · 확인 필요`,
        ),
      );
      const list = node('ul');
      for (const limitation of summary.limitations)
        list.append(node('li', limitation));
      limits.append(list);
      trialResult.append(limits);
    }
    for (const blocker of summary.approvalBlockers)
      trialResult.append(node('p', `활성화 불가: ${blocker}`));
    trialResult.append(
      node(
        'p',
        '미평가는 정상이 아닙니다. 활성화는 지침 사용 허용이며 산출량이나 보고서의 최종 승인이 아닙니다.',
      ),
    );
  }
  function historyOptions() {
    const previous = history.value;
    history.replaceChildren(new Option('시험 이력 선택', ''));
    for (const run of state?.runs ?? []) {
      if (run.trial && run.profileVersion === selected()?.version)
        history.add(
          new Option(
            `v${run.profileVersion} · ${run.createdAt} · ${run.id}`,
            run.id,
          ),
        );
    }
    if (
      summary &&
      ![...history.options].some((option) => option.value === summary.id)
    )
      history.add(new Option(`현재 확인한 시험 · ${summary.id}`, summary.id));
    history.value = summary?.id ?? previous;
  }
  function controls() {
    const tabs = ['projectTab', 'reviewTab'].map((id) =>
      document.getElementById(id),
    );
    const activeTab = tabs.find((tab) => tab.classList.contains('selected'));
    if (!panel.hidden) {
      if (activeTab) priorTab = activeTab.id;
      for (const tab of tabs) tab.classList.remove('selected');
    } else if (!activeTab)
      document.getElementById(priorTab).classList.add('selected');
    document
      .querySelector('main')
      .classList.toggle('instructions-open', !panel.hidden);
    toggle.classList.toggle('selected', !panel.hidden);
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.hidden = !context.isAdmin;
    toggle.disabled = !context.signed || !context.projectId || context.busy;
    for (const el of form.querySelectorAll('input,select,textarea,button'))
      el.disabled = loading || context.busy || !state?.canManageGuidelines;
    reload.disabled = loading || context.busy || !context.signed;
    add.disabled ||= rows.children.length >= 10;
    save.disabled ||= !cases.value;
    const blocked =
      loading ||
      context.busy ||
      !context.signed ||
      !state?.canManageGuidelines ||
      !selected() ||
      dirty();
    trial.disabled =
      blocked ||
      uncertain ||
      !state?.sourcesCount ||
      !state?.confirmedMappingCount;
    history.disabled = blocked;
    detail.disabled = blocked || !history.value;
    approve.disabled =
      blocked ||
      uncertain ||
      !summary?.canApprove ||
      summary.profileId !== profiles.value ||
      selected()?.status === 'active';
    renderTrial();
  }
  function appendInstruction(item) {
    const row = node('div');
    row.className = 'instructionRow';
    row.dataset.id = item.id;
    const enabled = node('input');
    enabled.type = 'checkbox';
    enabled.checked = item.enabled;
    const label = node('label', '사용');
    label.prepend(enabled);
    const text = node('textarea');
    text.value = item.text;
    text.maxLength = 1000;
    text.required = true;
    text.setAttribute('aria-label', `검수지침 ${rows.children.length + 1}`);
    const remove = node('button', '항목 제외');
    remove.type = 'button';
    remove.className = 'danger';
    remove.onclick = () => {
      row.remove();
      remember();
      controls();
    };
    row.append(label, text, remove);
    rows.append(row);
  }
  function fill(profile) {
    name.value = profile.name;
    reason.value = profile.reason;
    rows.replaceChildren();
    for (const item of profile.instructions ?? []) appendInstruction(item);
    controls();
  }
  function remember() {
    if (state?.canManageGuidelines) {
      const value = values();
      const base = selected()?.profile ?? state.defaultProfile;
      if (
        value.name === base.name &&
        value.reason === base.reason &&
        JSON.stringify(value.instructions) ===
          JSON.stringify(base.instructions ?? [])
      )
        drafts.delete(context.projectId);
      else drafts.set(context.projectId, value);
    }
    controls();
  }
  form.oninput = (event) => {
    if (event.target !== cases && event.target !== profiles) remember();
  };
  async function call(input) {
    const response = await window.qc.instructions(input);
    if (response.error) throw new Error(response.error);
    return response.data;
  }
  async function load(caseId, discard = false) {
    if (loading || !context.signed || !context.projectId) return;
    const current = ++epoch,
      projectId = context.projectId;
    loading = true;
    controls();
    message.textContent = '프로젝트 지침과 관리자 권한 확인 중';
    try {
      const data = await call({
        action: 'list',
        projectId,
        ...(caseId ? { caseId } : {}),
      });
      if (current !== epoch) return;
      state = data;
      summary = null;
      uncertain = false;
      cases.replaceChildren(new Option('자료 기록 선택', ''));
      for (const c of data.cases) cases.add(new Option(c.name, c.id));
      cases.value = data.caseId ?? '';
      profiles.replaceChildren(new Option('새 기본 초안', ''));
      for (const p of data.profiles)
        profiles.add(
          new Option(`${p.profile.name} · v${p.version} · ${p.status}`, p.id),
        );
      const draft = !discard && drafts.get(projectId);
      if (draft && draft.caseId === cases.value) {
        profiles.value = draft.baseProfileId ?? '';
        fill(draft);
        // Keep the version the draft was based on; a changed server list must conflict.
        state.expectedRevision = draft.expectedRevision;
        message.textContent =
          '미저장 초안을 복원했습니다. 서버 변경 시 저장을 중단하고 다시 조회합니다.';
      } else {
        fill(data.defaultProfile);
        message.textContent = !data.caseId
          ? '등록된 마감 자료 기록이 없습니다. 웹에서 자료등록 후 다시 조회해 주세요.'
          : data.canManageGuidelines
            ? '프로젝트별 지침 · 초안 저장 가능 / 시험·활성화는 별도입니다.'
            : '지정 관리자만 지침 초안을 작성할 수 있습니다.';
      }
      historyOptions();
    } catch (e) {
      if (current === epoch) message.textContent = e.message;
    } finally {
      if (current === epoch) {
        loading = false;
        controls();
      }
    }
  }
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    controls();
    if (!panel.hidden && !state) void load();
  };
  for (const id of ['projectTab', 'reviewTab'])
    document.getElementById(id).addEventListener('click', () => {
      panel.hidden = true;
      controls();
    });
  reload.onclick = () => {
    if (
      drafts.has(context.projectId) &&
      !window.confirm('미저장 초안을 버리고 서버 지침을 다시 조회할까요?')
    )
      return;
    drafts.delete(context.projectId);
    void load(cases.value, true);
  };
  cases.onchange = () => {
    if (
      drafts.has(context.projectId) &&
      !window.confirm('미저장 초안을 버리고 다른 자료 기록을 열까요?')
    ) {
      cases.value = state.caseId ?? '';
      return;
    }
    drafts.delete(context.projectId);
    void load(cases.value, true);
  };
  profiles.onchange = () => {
    if (
      drafts.has(context.projectId) &&
      !window.confirm('미저장 초안을 버리고 선택한 지침을 복사할까요?')
    ) {
      profiles.value = drafts.get(context.projectId).baseProfileId ?? '';
      return;
    }
    fill(
      state.profiles.find((p) => p.id === profiles.value)?.profile ??
        state.defaultProfile,
    );
    drafts.delete(context.projectId);
    summary = null;
    historyOptions();
    controls();
  };
  history.onchange = () => {
    summary = null;
    controls();
  };
  async function trialAction(action) {
    controls();
    const button =
      action === 'trial' ? trial : action === 'approve' ? approve : detail;
    if (button.disabled) return;
    const version = selected();
    if (
      action === 'approve' &&
      !window.confirm(
        `「${version.profile.name}」v${version.version}를 시험 ${summary.id} 근거로 활성화할까요? 기존 지침과 시험 이력은 유지됩니다. 산출량·보고서 최종 승인은 아닙니다.`,
      )
    )
      return;
    const input = {
      action,
      projectId: context.projectId,
      caseId: cases.value,
      profileId: version.id,
      ...(action !== 'trial-detail'
        ? { expectedRevision: state.expectedRevision }
        : {}),
      ...(action !== 'trial'
        ? { trialRunId: action === 'approve' ? summary.id : history.value }
        : {}),
    };
    const current = ++epoch;
    loading = true;
    if (action === 'trial') summary = null;
    controls();
    message.textContent =
      action === 'trial'
        ? '서버 시험 중 · 외부 AI를 호출하지 않습니다. 자동 재시도하지 않습니다.'
        : action === 'approve'
          ? '서버 권한과 시험 근거를 다시 확인하여 활성화 중'
          : '저장된 시험 결과 조회 중';
    try {
      const result = await call(input);
      if (current !== epoch) return;
      if (action === 'trial-detail') {
        summary = result;
        message.textContent = '저장된 시험 결과를 확인했습니다.';
      } else {
        if (action === 'trial') summary = result;
        // Trial changes the profile's trialRunId, so approval must use a fresh revision.
        uncertain = true;
        const fresh = await call({
          action: 'list',
          projectId: input.projectId,
          caseId: input.caseId,
        });
        if (current !== epoch) return;
        state = fresh;
        for (const option of profiles.options) {
          const profile = fresh.profiles.find((p) => p.id === option.value);
          if (profile)
            option.textContent = `${profile.profile.name} · v${profile.version} · ${profile.status}`;
        }
        uncertain = false;
        historyOptions();
        message.textContent =
          action === 'trial'
            ? '서버 시험을 저장했습니다. 평가 범위와 한계를 확인하세요. AI 지침은 별도의 AI 시험이 필요합니다.'
            : '선택 지침 버전을 활성화했습니다. 이 PC의 일반 기본검사에는 적용되지 않습니다.';
      }
    } catch (e) {
      if (current === epoch) {
        if (action !== 'trial-detail') uncertain = true;
        message.textContent = `${e.message} 자동 재시도하지 않습니다. 서버 지침 다시 조회 후 시험 이력을 확인하세요. 입력한 초안은 유지했습니다.`;
      }
    } finally {
      if (current === epoch) {
        loading = false;
        historyOptions();
        controls();
      }
    }
  }
  trial.onclick = () => void trialAction('trial');
  detail.onclick = () => void trialAction('trial-detail');
  approve.onclick = () => void trialAction('approve');
  add.onclick = () => {
    if (rows.children.length >= 10) return;
    appendInstruction({ id: crypto.randomUUID(), text: '', enabled: true });
    remember();
    controls();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (
      loading ||
      context.busy ||
      !context.signed ||
      !state?.canManageGuidelines ||
      !cases.value
    )
      return;
    remember();
    const input = { action: 'save', projectId: context.projectId, ...values() },
      current = ++epoch;
    loading = true;
    controls();
    message.textContent = '새 초안 저장 중 · 자동 활성화하지 않습니다.';
    try {
      await call(input);
      if (current !== epoch) return;
      drafts.delete(context.projectId);
      state = null;
      summary = null;
      uncertain = false;
      message.textContent =
        '새 초안 버전을 저장했습니다. 아직 시험·활성화되지 않았습니다. 서버 지침 다시 조회로 확인하세요.';
    } catch (e) {
      if (current === epoch)
        message.textContent = `${e.message} 입력한 초안은 유지했습니다. 자동 재시도하지 않습니다.`;
    } finally {
      if (current === epoch) {
        loading = false;
        controls();
      }
    }
  };
  window.addEventListener('qc:context', (event) => {
    const next = event.detail;
    if (!next.signed || !next.isAdmin || next.projectId !== context.projectId) {
      if (context.signed) remember();
      epoch++;
      loading = false;
      state = null;
      panel.hidden = true;
      summary = null;
      uncertain = false;
      rows.replaceChildren();
      name.value = '';
      reason.value = '';
      message.textContent = '';
      cases.replaceChildren();
      profiles.replaceChildren();
      history.replaceChildren();
      if (!next.signed) drafts.clear();
    }
    context = next;
    controls();
  });
})();
