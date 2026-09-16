import type { QuantityInspectionObject } from './compute-object';
import { env } from 'cloudflare:workers';
import { regionalGeminiFetch } from '@/lib/server/ai/regional-fetch';
import { boundedBody, type AiRpcRequest } from './ai-rpc';

export async function forwardReview(request: Request, projectId: string) {
  const binding = (
    env as unknown as {
      QUANTITY_INSPECTION?: DurableObjectNamespace<QuantityInspectionObject>;
    }
  ).QUANTITY_INSPECTION;
  if (!binding) return null;
  // vinext supplies a framework request wrapper; the binding requires a native Request.
  const forwarded = new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.method === 'POST' ? request.body : undefined,
    redirect: 'manual',
  });
  const response = await binding
    .get(binding.idFromName(projectId))
    .review(forwarded, async (googleRequest: AiRpcRequest) => {
      const response = await regionalGeminiFetch(googleRequest.url, {
        method: googleRequest.method,
        headers: googleRequest.headers,
        body: googleRequest.body,
        signal: AbortSignal.timeout(60_000),
      });
      return {
        status: response.status,
        headers: [...response.headers].filter(([name]) =>
          ['content-type', 'retry-after', 'x-qc-gemini-response'].includes(
            name,
          ),
        ),
        body: await boundedBody(response),
      };
    });
  // The framework adds response headers; service-binding response headers are immutable.
  return new Response(response.body, {
    status: response.status,
    headers: new Headers(response.headers),
  });
}
