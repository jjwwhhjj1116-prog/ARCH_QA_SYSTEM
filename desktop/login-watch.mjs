// Sequential checks only while the owned login window exists. No credentials logged.
export function watchLogin(check, isCurrent, complete) {
  let stopped = false,
    timer;
  async function poll() {
    if (stopped || !isCurrent()) return;
    let user;
    try {
      user = await check();
    } catch {
      /* Not authenticated or temporarily offline. */
    }
    if (stopped || !isCurrent()) return;
    if (typeof user?.email === 'string' && user.email.length) {
      stopped = true;
      complete();
      return;
    }
    timer = setTimeout(poll, 2000);
  }
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
