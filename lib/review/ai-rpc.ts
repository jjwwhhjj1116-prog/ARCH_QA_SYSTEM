// Plain data only: deployed RPC runtimes may not support Request/Response transfer.
export type AiRpcRequest = {
  url: string;
  method: string;
  headers: [string, string][];
  body: string;
};
export type AiRpcResponse = {
  status: number;
  headers: [string, string][];
  body: string;
};
export type AiRpcCall = (request: AiRpcRequest) => Promise<AiRpcResponse>;

export async function boundedBody(response: Response, maximum = 256 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return text + decoder.decode();
      size += part.value.byteLength;
      if (size > maximum) throw new Error('AI_RPC_RESPONSE_TOO_LARGE');
      text += decoder.decode(part.value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
