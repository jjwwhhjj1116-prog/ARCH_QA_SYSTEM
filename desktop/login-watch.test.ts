import { afterEach, expect, it, vi } from 'vitest';
import { watchLogin } from './login-watch.mjs';
afterEach(() => vi.useRealTimers());
it('waits for confirmed session and completes once', async () => {
  vi.useFakeTimers();
  const check = vi
    .fn()
    .mockRejectedValueOnce(new Error('401'))
    .mockResolvedValue({ email: 'member@example.invalid' });
  const done = vi.fn();
  watchLogin(check, () => true, done);
  await vi.advanceTimersByTimeAsync(2000);
  expect(done).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10000);
  expect(check).toHaveBeenCalledTimes(2);
});
it('discards a late authenticated response after closing or logout', async () => {
  let resolve!: (value: unknown) => void;
  const done = vi.fn();
  const stop = watchLogin(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => true,
    done,
  );
  stop();
  resolve({ email: 'member@example.invalid' });
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
});
it('does not accept an account response after its window context changes', async () => {
  let current = true;
  const done = vi.fn();
  watchLogin(
    async () => {
      current = false;
      return { email: 'member@example.invalid' };
    },
    () => current,
    done,
  );
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
});
