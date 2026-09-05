import type { StudioQuery } from './protocol';

const objectValue = (value: string, label: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed as Record<string, unknown>;
};

const vectorValue = (value: unknown): number[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((component) => typeof component !== 'number' || !Number.isFinite(component))
  ) {
    throw new Error('Vector must be a non-empty array of finite numbers');
  }
  return value as number[];
};

export function parseStudioQuery(kind: StudioQuery['kind'], value: string): StudioQuery {
  if (kind === 'text') {
    const text = value.trim();
    if (!text) throw new Error('Enter one or more search terms');
    return { kind, text, match: 'any' };
  }
  const parsed = objectValue(value, kind === 'document' ? 'Filter' : 'Query');
  if (kind === 'document') return { kind, filter: parsed };
  const field = parsed.field;
  if (typeof field !== 'string' || !field) throw new Error('Query field must be a non-empty string');
  const vector = vectorValue(parsed.vector);
  const metric = parsed.metric;
  if (metric !== undefined && metric !== 'cosine' && metric !== 'dot' && metric !== 'euclidean') {
    throw new Error('Metric must be cosine, dot or euclidean');
  }
  if (kind === 'vector') return { kind, field, vector, metric };
  if (typeof parsed.text !== 'string' || !parsed.text.trim())
    throw new Error('Hybrid query text must be a non-empty string');
  const textWeight = parsed.textWeight;
  const vectorWeight = parsed.vectorWeight;
  if (textWeight !== undefined && (typeof textWeight !== 'number' || textWeight < 0))
    throw new Error('Text weight must be non-negative');
  if (vectorWeight !== undefined && (typeof vectorWeight !== 'number' || vectorWeight < 0))
    throw new Error('Vector weight must be non-negative');
  return {
    kind,
    field,
    vector,
    metric,
    text: parsed.text.trim(),
    textWeight: textWeight as number | undefined,
    vectorWeight: vectorWeight as number | undefined,
  };
}

export const queryPlaceholder = (kind: StudioQuery['kind']): string => {
  if (kind === 'text') return 'harbor notes';
  if (kind === 'document') return '{\n  "category": "decision"\n}';
  if (kind === 'vector') return '{\n  "field": "embedding",\n  "vector": [1, 0, 0],\n  "metric": "cosine"\n}';
  return '{\n  "text": "harbor notes",\n  "field": "embedding",\n  "vector": [1, 0, 0],\n  "textWeight": 1,\n  "vectorWeight": 1\n}';
};
