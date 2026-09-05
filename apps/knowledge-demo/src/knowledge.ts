import type { EmbeddingProfile, EmbeddingProvider, RememberInput } from '@camadb/memory';

export const LOCAL_EMBEDDING_PROFILE: EmbeddingProfile = {
  dimensions: 128,
  model: 'signed-feature-hash',
  provider: 'camadb-browser-demo',
  revision: '1',
  schemaVersion: 'knowledge-chunk-v1',
};

export interface KnowledgeMetadata extends Record<string, unknown> {
  chunkIndex: number;
  importedAt: string;
  sourceName: string;
  totalChunks: number;
}

export interface ChunkOptions {
  maxCharacters?: number;
  overlapCharacters?: number;
}

const words = (content: string): string[] =>
  content
    .toLocaleLowerCase('en')
    .normalize('NFKC')
    .match(/[\p{L}\p{N}]+/gu) ?? [];

const hash = (value: string, seed: number): number => {
  let result = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

/**
 * A dependency-free local baseline. Signed feature hashing provides useful
 * lexical similarity without implying that this demo model understands prose.
 */
export const embedLocally = (content: string): number[] => {
  const vector = new Array<number>(LOCAL_EMBEDDING_PROFILE.dimensions).fill(0);
  const tokens = words(content);
  const features = tokens.concat(tokens.slice(0, -1).map((token, index) => `${token}:${tokens[index + 1]}`));
  for (const feature of features) {
    const bucket = hash(feature, 2166136261) % vector.length;
    const sign = (hash(feature, 374761393) & 1) === 0 ? 1 : -1;
    vector[bucket] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, component) => sum + component ** 2, 0));
  return magnitude === 0 ? vector : vector.map((component) => component / magnitude);
};

export const createLocalEmbeddingProvider = (): EmbeddingProvider => ({
  embed: async (content) => embedLocally(content),
  profile: { ...LOCAL_EMBEDDING_PROFILE },
});

const hardSplit = (value: string, maxCharacters: number, overlapCharacters: number): string[] => {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < value.length) {
    const upper = Math.min(value.length, offset + maxCharacters);
    let end = upper;
    if (upper < value.length) {
      const boundary = value.lastIndexOf(' ', upper);
      if (boundary > offset + Math.floor(maxCharacters / 2)) end = boundary;
    }
    chunks.push(value.slice(offset, end).trim());
    if (end >= value.length) break;
    offset = Math.max(offset + 1, end - overlapCharacters);
  }
  return chunks.filter(Boolean);
};

export const chunkDocument = (content: string, options: ChunkOptions = {}): string[] => {
  const maxCharacters = options.maxCharacters ?? 900;
  const overlapCharacters = options.overlapCharacters ?? 120;
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 100) {
    throw new Error('maxCharacters must be an integer of at least 100');
  }
  if (!Number.isSafeInteger(overlapCharacters) || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
    throw new Error('overlapCharacters must be a non-negative integer smaller than maxCharacters');
  }
  const normalized = content
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current) chunks.push(current);
    current = '';
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxCharacters) {
      flush();
      chunks.push(...hardSplit(paragraph, maxCharacters, overlapCharacters));
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxCharacters) current = candidate;
    else {
      flush();
      current = paragraph;
    }
  }
  flush();
  return chunks;
};

export const prepareKnowledgeDocument = (
  sourceName: string,
  content: string,
  importedAt = new Date().toISOString(),
): Array<RememberInput<KnowledgeMetadata>> => {
  const chunks = chunkDocument(content);
  return chunks.map((chunk, chunkIndex) => ({
    category: 'fact',
    content: chunk,
    metadata: { chunkIndex, importedAt, sourceName, totalChunks: chunks.length },
  }));
};
