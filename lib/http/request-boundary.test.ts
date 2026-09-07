// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { assertSameSiteMutation, readJson } from './request-boundary';
afterEach(() => vi.unstubAllEnvs());
it('requires exact same origin for employee mutations, including login', () => {
  vi.stubEnv('EMPLOYEE_LOGIN_ENABLED', 'true');
  vi.stubEnv('APP_ORIGIN', 'https://qc.example.test');
  expect(() => assertSameSiteMutation(new Headers())).toThrow();
  expect(() =>
    assertSameSiteMutation(
      new Headers({ origin: 'https://other.example.test' }),
    ),
  ).toThrow();
  expect(() =>
    assertSameSiteMutation(
      new Headers({
        origin: 'https://qc.example.test',
        'sec-fetch-site': 'cross-site',
      }),
    ),
  ).toThrow();
  expect(() =>
    assertSameSiteMutation(new Headers({ origin: 'https://qc.example.test' })),
  ).not.toThrow();
});
it('bounds actual JSON bytes even without Content-Length', async () => {
  const request = new Request('https://qc.example.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(2050) }),
  });
  await expect(readJson(request, 2048)).rejects.toMatchObject({ status: 413 });
});
