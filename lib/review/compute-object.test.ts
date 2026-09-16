// @vitest-environment node
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  respond: vi.fn().mockResolvedValue(new Response('ok')),
}));
vi.mock('@/app/api/projects/[projectId]/review/route', () => ({
  respond: mocks.respond,
}));
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
import { QuantityInspectionObject } from './compute-object';

it('keeps recovery in the DO but calls the originating HTTP callback for AI', async () => {
  const send = vi
    .fn()
    .mockResolvedValue({ status: 200, headers: [], body: 'google' });
  const object = new QuantityInspectionObject(
    { storage: {} } as DurableObjectState,
    {
      DB: {} as D1Database,
    },
  );
  await object.review(
    new Request(
      'https://qc.example/api/projects/11111111-1111-4111-8111-111111111111/review',
    ),
    send,
  );
  const args = mocks.respond.mock.calls.at(-1)!;
  expect(args[3]).toBe(true);
  expect(args[4]).toBeDefined();
  const controller = new AbortController();
  await args[5](
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
    {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    },
  );
  expect(send).toHaveBeenCalledTimes(1);
  const request = send.mock.calls[0][0];
  expect(request.body).toBe('{}');
  expect(request).not.toBeInstanceOf(Request);
});

it('does not fall back to a DO Google call if the main executor is absent', async () => {
  const object = new QuantityInspectionObject(
    { storage: {} } as DurableObjectState,
    { DB: {} as D1Database },
  );
  await object.fetch(
    new Request(
      'https://qc.example/api/projects/11111111-1111-4111-8111-111111111111/review',
    ),
  );
  const aiFetch = mocks.respond.mock.calls.at(-1)![5];
  await expect(
    aiFetch('https://generativelanguage.googleapis.com/v1beta/models'),
  ).rejects.toThrow('AI_MAIN_EXECUTOR_UNAVAILABLE');
});
