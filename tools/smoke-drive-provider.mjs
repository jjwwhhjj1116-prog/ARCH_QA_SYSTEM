// Local-only OAuth/Drive responses. Unknown requests fail closed; never fetch.
import assert from 'node:assert/strict';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
export function syntheticDrive() {
  const secret = randomBytes(32);
  const connectionId = '55555555-5555-4555-8555-555555555555';
  const folderId = 'syntheticFolder123';
  const files = new Map();
  let sequence = 0;
  let failUpload = false;
  const hash = (b) => createHash('sha256').update(b).digest('hex');
  const encrypt = (subject) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', secret, iv);
    cipher.setAAD(Buffer.from(`qc-personal-gemini-v1:${subject}`));
    const body = Buffer.concat([
      cipher.update('synthetic-credential'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return `${iv.toString('base64')}.${body.toString('base64')}`;
  };
  return {
    secret: secret.toString('hex'),
    failUploads(value) {
      failUpload = value;
    },
    async fetch(request) {
      const url = new URL(request.url);
      if (
        url.href === 'https://oauth2.googleapis.com/token' &&
        request.method === 'POST'
      )
        return Response.json({
          access_token: 'synthetic-access-token',
          token_type: 'Bearer',
        });
      assert.equal(url.origin, 'https://www.googleapis.com');
      assert.equal(
        request.headers.get('authorization'),
        'Bearer synthetic-access-token',
      );
      if (url.pathname === '/drive/v3/files/generateIds')
        return Response.json({ ids: [`syntheticFile${++sequence}`] });
      if (
        url.pathname.startsWith('/drive/v3/files/') &&
        request.method === 'GET'
      ) {
        const file = files.get(url.pathname.split('/').at(-1));
        if (!file?.bytes) return new Response(null, { status: 404 });
        return url.searchParams.get('alt') === 'media'
          ? new Response(file.bytes)
          : Response.json(file.meta);
      }
      if (
        url.pathname === '/upload/drive/v3/files' &&
        request.method === 'POST'
      ) {
        if (failUpload) return new Response(null, { status: 403 });
        const meta = await request.json();
        files.set(meta.id, { meta });
        return new Response(null, {
          headers: {
            location: `https://www.googleapis.com/upload/drive/v3/files?upload_id=${meta.id}`,
          },
        });
      }
      if (
        url.pathname === '/upload/drive/v3/files' &&
        request.method === 'PUT'
      ) {
        const file = files.get(url.searchParams.get('upload_id'));
        assert.ok(file);
        file.bytes = new Uint8Array(await request.arrayBuffer());
        Object.assign(file.meta, {
          size: String(file.bytes.length),
          sha256Checksum: hash(file.bytes),
          trashed: false,
        });
        return Response.json(file.meta);
      }
      throw new Error('Unexpected outbound request in synthetic Drive smoke');
    },
    async seed(db) {
      await db
        .prepare('INSERT INTO qc_drive_connection VALUES (?,?,?,?,?,?,?,?)')
        .bind(
          connectionId,
          'synthetic@example.test',
          'synthetic-client',
          encrypt(`drive-client:${connectionId}`),
          encrypt(`drive-refresh:${connectionId}`),
          folderId,
          'ready',
          new Date().toISOString(),
        )
        .run();
      await db
        .prepare('INSERT INTO qc_drive_settings VALUES (1,?,?,?,?,1)')
        .bind(
          'synthetic-client',
          'unused-synthetic',
          'synthetic@example.test',
          connectionId,
        )
        .run();
      return {
        async put(key, value) {
          const bytes = Buffer.from(value);
          const prior = await db
            .prepare('SELECT file_id FROM qc_drive_object WHERE object_key=?')
            .bind(key)
            .first();
          const id = prior?.file_id ?? `syntheticFile${++sequence}`;
          const meta = {
            id,
            size: String(bytes.length),
            mimeType: 'application/json',
            parents: [folderId],
            trashed: false,
            appProperties: {
              qcApp: 'fin-rc-review-studio',
              qcConnection: connectionId,
              qcKey: hash(key),
              sha256: hash(bytes),
            },
          };
          files.set(id, { bytes, meta });
          if (!prior)
            await db
              .prepare(
                "INSERT INTO qc_drive_object VALUES (?,?,?,?,?,?,'stored')",
              )
              .bind(
                key,
                connectionId,
                id,
                hash(bytes),
                bytes.length,
                'application/json',
              )
              .run();
        },
        async get(key) {
          const row = await db
            .prepare('SELECT file_id FROM qc_drive_object WHERE object_key=?')
            .bind(key)
            .first();
          const file = files.get(row?.file_id);
          assert.ok(file?.bytes);
          return {
            arrayBuffer: async () => Uint8Array.from(file.bytes).buffer,
            text: async () => Buffer.from(file.bytes).toString(),
          };
        },
      };
    },
  };
}
