import { DurableObject } from 'cloudflare:workers';
import { respond } from '@/app/api/projects/[projectId]/review/route';
import { AiRecoveryStore } from './ai-recovery';
import type { AiRpcCall } from './ai-rpc';

type ComputeEnvironment = { DB: D1Database };

// Binding-only entry. The delegated handler authenticates the original session again.
export class QuantityInspectionObject extends DurableObject<ComputeEnvironment> {
  health() {
    return { ready: Boolean(this.env.DB) };
  }
  async fetch(request: Request) {
    return this.review(request);
  }
  // RPC callback executes in the originating web request, not in this DO's
  // location. It is never persisted, exposed to the browser, or called on GET.
  async review(request: Request, google?: AiRpcCall) {
    const match = /^\/api\/projects\/([a-f0-9-]{36})\/review$/u.exec(
      new URL(request.url).pathname,
    );
    if (!match || !['GET', 'POST'].includes(request.method))
      return new Response(null, { status: 404 });
    return respond(
      request,
      { params: Promise.resolve({ projectId: match[1] }) },
      request.method === 'POST',
      true,
      new AiRecoveryStore(this.ctx.storage),
      async (input, init) => {
        if (!google) throw new Error('AI_MAIN_EXECUTOR_UNAVAILABLE');
        try {
          const request = new Request(input, init);
          const result = await google({
            url: request.url,
            method: request.method,
            headers: [...request.headers],
            body: await request.text(),
          });
          return new Response(
            [204, 205, 304].includes(result.status) ? null : result.body,
            { status: result.status, headers: result.headers },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          const category = /different request|I\/O|execution context/i.test(
            message,
          )
            ? 'CONTEXT'
            : /dispos|no longer|canceled|cancelled/i.test(message)
              ? 'LIFETIME'
              : /serializ|clone/i.test(message)
                ? 'SERIALIZATION'
                : /not a function|not callable/i.test(message)
                  ? 'NOT_CALLABLE'
                  : /network|connection|fetch failed/i.test(message)
                    ? 'NETWORK'
                    : /limit|exceeded/i.test(message)
                      ? 'LIMIT'
                      : 'UNKNOWN';
          // Only fixed categories: never log exception text, keys, or documents.
          console.warn('QC_AI_RPC_FAILURE', category);
          throw error;
        }
      },
    );
  }
}
