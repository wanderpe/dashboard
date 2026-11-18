/** @param {ReadableStream<Uint8Array> | null} body @param {number} maxBytes @returns {Promise<unknown>} */
export async function readLimitedJsonBody(body, maxBytes) {
  if (!body) throw new SyntaxError("Missing request body.");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("Invalid request body limit.");

  const reader = body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The limit error is authoritative even if stream cancellation fails.
        }
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A failed stream read may already release the lock.
    }
  }
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("The request body exceeds the byte limit.");
    this.name = "RequestBodyTooLargeError";
    this.code = "request_too_large";
  }
}
