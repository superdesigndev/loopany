// Local embedding model for semantic search.
//
// Uses @huggingface/transformers with Xenova/all-MiniLM-L6-v2 (384-dim, q8 ~22MB)
// via ONNX. Model is auto-downloaded from HuggingFace Hub on first use and
// cached under HF_HOME (default: ~/.cache/huggingface).
//
// If the model fails to load, isAvailable() returns false and callers should
// fall back to keyword-only search. The failure is logged to stderr — not
// silent — because a silent fallback hides a real functional degradation.

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
  ready(): Promise<void>;
  isAvailable(): boolean;
  readonly dim: number;
}

export class TransformersEmbedder implements Embedder {
  private extractor: unknown = null;
  private loading: Promise<void> | null = null;
  private available = true;
  readonly dim = EMBEDDING_DIM;

  async ready(): Promise<void> {
    if (this.extractor) return;
    if (this.loading) return this.loading;
    this.loading = this.init();
    return this.loading;
  }

  private async init(): Promise<void> {
    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      this.extractor = await pipeline(
        'feature-extraction',
        MODEL_NAME,
        { dtype: 'q8' } as Parameters<typeof pipeline>[2],
      );
    } catch (err) {
      this.available = false;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `loopany: embedding model failed to load — falling back to keyword-only search. Reason: ${msg}\n`,
      );
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async embed(text: string): Promise<Float32Array> {
    await this.ready();
    if (!this.extractor) return new Float32Array(EMBEDDING_DIM);
    const extract = this.extractor as (
      t: string,
      opts: { pooling: 'mean'; normalize: boolean },
    ) => Promise<{ data: Float32Array }>;
    const out = await extract(text, { pooling: 'mean', normalize: true });
    return new Float32Array(out.data);
  }
}

/** For tests: returns deterministic zero vectors, never calls the network. */
export class NoopEmbedder implements Embedder {
  readonly dim = EMBEDDING_DIM;
  async embed(): Promise<Float32Array> {
    return new Float32Array(EMBEDDING_DIM);
  }
  async ready(): Promise<void> {}
  isAvailable(): boolean {
    return false;
  }
}

/** Cosine similarity between two L2-normalized vectors (= dot product). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function embeddingToBuffer(e: Float32Array): Buffer {
  return Buffer.from(e.buffer, e.byteOffset, e.byteLength);
}

export function bufferToEmbedding(buf: Uint8Array): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
