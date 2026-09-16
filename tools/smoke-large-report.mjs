// Invoked by smoke-review-compute --large-report. Drive adapter with local provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function smokeLargeReport({
  mf,
  db,
  projectId,
  caseId,
  url,
  headers,
  drive,
}) {
  const bucket = await drive.seed(db);
  const runId = '33333333-3333-4333-8333-333333333333';
  const profileId = '44444444-4444-4444-8444-444444444444';
  const key = `projects/${projectId}/cases/${caseId}/reviews/${runId}/run.json`;
  const run = {
    id: runId,
    projectId,
    caseId,
    profileId,
    profileVersion: 1,
    actorId: 'compute',
    createdAt: '2026-09-15T00:00:00Z',
    trial: false,
    engineVersion: 'synthetic',
    profile: {
      name: '합성 시험',
      instructions: Array.from({ length: 10 }, (_, i) => ({
        id: `i${i}`,
        text: '합성 지침',
        enabled: true,
      })),
    },
    rows: Array.from({ length: 20000 }, (_, i) => ({
      id: `row-${i}`,
      ref: {
        filename: '합성.csv',
        sourceVersionId: 'synthetic',
        sha256: 'synthetic',
        sheet: '자료',
        row: i + 2,
        cell: `A${i + 2}`,
      },
      fieldRefs: {},
      excluded: null,
    })),
    sources: [],
    mappings: [],
    findings: [],
    coverage: [],
    limitations: [],
  };
  const evidence = JSON.stringify(run);
  await bucket.put(key, evidence);
  // Separate local-only admin seed obeys immutable employee identity constraints.
  // It has no session or password; requests still use the synthetic reviewer.
  await db.exec(
    `INSERT INTO user_profile VALUES ('seed-admin','yjw@con-cost.com','Synthetic admin',1); INSERT INTO project_member VALUES ('admin-member','${projectId}','seed-admin','workspace_admin',1);`,
  );
  await db
    .prepare('INSERT INTO qc_profile_version VALUES (?,?,?,?,?,?)')
    .bind(
      profileId,
      projectId,
      1,
      JSON.stringify(run.profile),
      'seed-admin',
      run.createdAt,
    )
    .run();
  await db
    .prepare('INSERT INTO qc_review_run VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(
      'seed-trial',
      projectId,
      caseId,
      profileId,
      1,
      1,
      'seed-trial.json',
      'synthetic',
      0,
      0,
      'seed-admin',
      run.createdAt,
    )
    .run();
  await db
    .prepare('INSERT INTO qc_profile_approval VALUES (?,?,?,?,?,?)')
    .bind(
      'seed-approval',
      projectId,
      profileId,
      'seed-trial',
      'seed-admin',
      run.createdAt,
    )
    .run();
  await db
    .prepare('INSERT INTO qc_review_run VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(
      runId,
      projectId,
      caseId,
      profileId,
      1,
      0,
      key,
      sha(evidence),
      0,
      run.rows.length,
      'compute',
      run.createdAt,
    )
    .run();
  const save = (id = runId) =>
    mf.dispatchFetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        origin: new URL(url).origin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'save-report', caseId, runId: id }),
    });
  const auditCount = async () =>
    (
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_event WHERE action='review.report.saved'",
        )
        .first()
    ).n;
  const start = performance.now();
  const response = await save();
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.data.saved, true);
  const bytes = new Uint8Array(
    await (await bucket.get(body.data.objectKey)).arrayBuffer(),
  );
  assert.equal(sha(bytes), body.data.sha256);
  assert.equal(bytes.length, body.data.size);
  assert.equal(await auditCount(), 1);
  const stored = await db
    .prepare('SELECT state,sha256,size FROM qc_drive_object WHERE object_key=?')
    .bind(body.data.objectKey)
    .first();
  assert.deepEqual(stored, {
    state: 'stored',
    sha256: body.data.sha256,
    size: bytes.length,
  });
  const audit = await db
    .prepare(
      "SELECT target_id,payload_json FROM audit_event WHERE action='review.report.saved'",
    )
    .first();
  assert.equal(audit.target_id, runId);
  const payload = JSON.parse(audit.payload_json);
  assert.equal(payload.objectKey, body.data.objectKey);
  assert.equal(payload.sha256, sha(bytes));
  assert.equal(payload.size, bytes.length);
  assert.equal(
    await (await bucket.get(key)).text(),
    evidence,
    'Original run changed',
  );
  const savedMs = Math.round(performance.now() - start);
  const files = unzipSync(bytes);
  const ledger = strFromU8(files['xl/worksheets/sheet2.xml']);
  const index = strFromU8(files['xl/worksheets/sheet4.xml']);
  assert.equal((ledger.match(/>missing<\/t>/g) ?? []).length, 200000);
  const pairs = new Set();
  for (const [, xml] of ledger.matchAll(/<row r="\d+">([\s\S]*?)<\/row>/g)) {
    const cells = [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(
      (m) => m[1],
    );
    if (cells[0] !== 'missing') continue;
    const pair = `${cells[1]}:${cells[2]}`;
    assert.equal(pairs.has(pair), false, 'Duplicate missing pair');
    pairs.add(pair);
  }
  for (let row = 0; row < 20000; row++)
    for (let instruction = 0; instruction < 10; instruction++)
      assert.ok(
        pairs.delete(`row-${row}:i${instruction}`),
        'Missing expected pair',
      );
  assert.equal(pairs.size, 0, 'Unexpected pair');
  assert.equal((index.match(/<row r=/g) ?? []).length, 20001);
  assert.ok(index.includes('row-19999'));
  assert.ok(
    ledger.includes('부분'),
    'Incomplete synthetic run must not claim completion',
  );
  const namespace = await mf.getDurableObjectNamespace('QUANTITY_INSPECTION');
  const stub = namespace.get(namespace.idFromName(projectId));
  const direct = await stub.fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      origin: new URL(url).origin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'save-report', caseId, runId }),
  });
  const directBody = await direct.json();
  assert.equal(direct.status, 200, JSON.stringify(directBody));
  assert.equal(directBody.data.sha256, body.data.sha256);
  assert.equal(directBody.data.objectKey, body.data.objectKey);
  assert.equal(await auditCount(), 2);
  // A corrupt stored run must neither return saved nor append an audit event.
  await db
    .prepare('UPDATE qc_drive_object SET sha256=? WHERE object_key=?')
    .bind('0'.repeat(64), key)
    .run();
  const corrupt = await save();
  assert.equal(corrupt.status, 409);
  assert.equal((await corrupt.json()).error.code, 'DRIVE_OBJECT_MISMATCH');
  assert.equal(await auditCount(), 2);
  await db
    .prepare('UPDATE qc_drive_object SET sha256=? WHERE object_key=?')
    .bind(sha(evidence), key)
    .run();
  await db.exec(
    "UPDATE project_member SET role='viewer' WHERE user_id='compute'",
  );
  assert.equal((await save()).status, 403);
  assert.equal(await auditCount(), 2);
  await db.exec(
    "UPDATE project_member SET role='reviewer' WHERE user_id='compute'",
  );
  const failureId = '66666666-6666-4666-8666-666666666666';
  const failureKey = key.replace(runId, failureId);
  const failureEvidence = JSON.stringify({
    ...run,
    id: failureId,
    rows: run.rows.slice(0, 1),
  });
  await bucket.put(failureKey, failureEvidence);
  await db
    .prepare('INSERT INTO qc_review_run VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(
      failureId,
      projectId,
      caseId,
      profileId,
      1,
      0,
      failureKey,
      sha(failureEvidence),
      0,
      1,
      'compute',
      run.createdAt,
    )
    .run();
  drive.failUploads(true);
  const failure = await save(failureId);
  const failureBody = await failure.json();
  assert.equal(failure.status, 401, JSON.stringify(failureBody));
  assert.equal(failureBody.error.code, 'DRIVE_RECONNECT_REQUIRED');
  assert.equal(failureBody.data?.saved, undefined);
  assert.equal(await auditCount(), 2);
  const reserved = await db
    .prepare('SELECT state FROM qc_drive_object WHERE object_key LIKE ?')
    .bind(`%/${failureId}/report-%`)
    .first();
  assert.equal(reserved.state, 'reserved');
  drive.failUploads(false);
  assert.equal(await (await bucket.get(key)).text(), evidence);
  console.log(
    JSON.stringify({
      kind: 'local-built-worker-large-report',
      savedMs,
      sourceRows: 20000,
      missingPairs: 200000,
      zipBytes: bytes.length,
      storedHashVerified: true,
      originalUnchanged: true,
      corruptRunDenied: true,
      viewerSaveDenied: true,
      failedUploadNotSaved: true,
      directDurableObjectSave: true,
      storage: 'drive-adapter-local-provider',
      googleDrive: false,
      realAi: false,
      production: false,
      productionMemoryLimitVerified: false,
    }),
  );
}
