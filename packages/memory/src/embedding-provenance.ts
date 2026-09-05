export interface EmbeddingProfile {
  /** Embedding implementation or service, for example "local-transformers". */
  provider: string;
  /** Provider-specific model identifier. */
  model: string;
  /** Exact vector width produced by the model. */
  dimensions: number;
  /** Application embedding/chunk schema identifier. */
  schemaVersion: string;
  /** Optional immutable provider model revision. */
  revision?: string;
}

export interface EmbeddingProvenance extends EmbeddingProfile {
  /** ISO-8601 time at which this embedding was produced. */
  createdAt: string;
}

export interface EmbeddingQuery {
  embedding: readonly number[];
  provenance: EmbeddingProfile;
}

export type EmbeddingCompatibilityField = keyof EmbeddingProfile;

export interface EmbeddingCompatibilityMismatch {
  expected: string | number | undefined;
  field: EmbeddingCompatibilityField;
  received: string | number | undefined;
}

export interface EmbeddingCompatibility {
  compatible: boolean;
  mismatches: readonly EmbeddingCompatibilityMismatch[];
}

export class EmbeddingCompatibilityError extends Error {
  readonly code = 'EMBEDDING_PROVENANCE_MISMATCH';

  constructor(readonly mismatches: readonly EmbeddingCompatibilityMismatch[]) {
    super(`Embedding provenance is incompatible: ${mismatches.map(({ expected, field, received }) =>
      `${field} expected ${JSON.stringify(expected)}, received ${JSON.stringify(received)}`,
    ).join('; ')}`);
    this.name = 'EmbeddingCompatibilityError';
  }
}

export interface ProvenancedEmbeddingRecord {
  embedding?: readonly number[];
  embeddingProvenance?: EmbeddingProvenance;
  id: string;
}

export type ReembeddingReason =
  | 'missing-embedding'
  | 'missing-provenance'
  | 'invalid-vector'
  | 'invalid-provenance'
  | 'incompatible-provenance';

export interface ReembeddingPlanItem {
  action: 'keep' | 'reembed';
  id: string;
  mismatches?: readonly EmbeddingCompatibilityMismatch[];
  reason?: ReembeddingReason;
}

export interface ReembeddingPlan {
  items: readonly ReembeddingPlanItem[];
  keepIds: readonly string[];
  reembedIds: readonly string[];
  target: EmbeddingProfile;
}

export interface ReembeddingUpdate {
  embedding: readonly number[];
  embeddingProvenance: EmbeddingProvenance;
  id: string;
}

const PROFILE_FIELDS: readonly EmbeddingCompatibilityField[] = [
  'provider',
  'model',
  'dimensions',
  'schemaVersion',
  'revision',
];

export const validateEmbeddingProfile = (profile: EmbeddingProfile, label = 'Embedding profile'): void => {
  if (!profile || typeof profile !== 'object') throw new Error(`${label} must be an object`);
  for (const field of ['provider', 'model', 'schemaVersion'] as const) {
    if (typeof profile[field] !== 'string' || profile[field].trim().length === 0) {
      throw new Error(`${label} ${field} must be a non-empty string`);
    }
  }
  if (!Number.isSafeInteger(profile.dimensions) || profile.dimensions <= 0) {
    throw new Error(`${label} dimensions must be a positive integer`);
  }
  if (profile.revision !== undefined &&
    (typeof profile.revision !== 'string' || profile.revision.trim().length === 0)) {
    throw new Error(`${label} revision must be a non-empty string when provided`);
  }
};

export const validateEmbeddingVector = (
  embedding: readonly number[],
  dimensions: number,
  label = 'Embedding',
): void => {
  if (!Array.isArray(embedding)) throw new Error(`${label} must be an array of finite numbers`);
  if (embedding.length !== dimensions) {
    throw new Error(`${label} has dimension ${embedding.length}; expected ${dimensions}`);
  }
  if (embedding.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
    throw new Error(`${label} must contain only finite numbers`);
  }
};

export const compareEmbeddingProvenance = (
  expected: EmbeddingProfile,
  received: EmbeddingProfile,
): EmbeddingCompatibility => {
  validateEmbeddingProfile(expected, 'Expected embedding profile');
  validateEmbeddingProfile(received, 'Received embedding profile');
  const mismatches = PROFILE_FIELDS.flatMap((field): EmbeddingCompatibilityMismatch[] =>
    expected[field] === received[field] ? [] : [{ expected: expected[field], field, received: received[field] }],
  );
  return { compatible: mismatches.length === 0, mismatches };
};

export const assertEmbeddingCompatibility = (
  expected: EmbeddingProfile,
  received: EmbeddingProfile,
): void => {
  const result = compareEmbeddingProvenance(expected, received);
  if (!result.compatible) throw new EmbeddingCompatibilityError(result.mismatches);
};

/** Validate provenance and vector shape before passing a query to CamaDB. */
export const prepareEmbeddingQuery = (
  expected: EmbeddingProfile,
  query: EmbeddingQuery,
): readonly number[] => {
  assertEmbeddingCompatibility(expected, query.provenance);
  validateEmbeddingVector(query.embedding, expected.dimensions, 'Embedding query');
  return query.embedding;
};

export const createEmbeddingProvenance = (
  profile: EmbeddingProfile,
  createdAt: string,
): EmbeddingProvenance => {
  validateEmbeddingProfile(profile);
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Embedding provenance createdAt must be an ISO-8601 timestamp');
  }
  return { ...profile, createdAt };
};

/** Pure inspection: records are classified without changing their content. */
export const planReembedding = <TRecord extends ProvenancedEmbeddingRecord>(
  records: readonly TRecord[],
  target: EmbeddingProfile,
): ReembeddingPlan => {
  validateEmbeddingProfile(target, 'Target embedding profile');
  const ids = new Set<string>();
  const items = records.map((record): ReembeddingPlanItem => {
    if (typeof record.id !== 'string' || record.id.length === 0) throw new Error('Memory ids must be non-empty strings');
    if (ids.has(record.id)) throw new Error(`Duplicate memory id in re-embedding plan: ${record.id}`);
    ids.add(record.id);
    if (!record.embedding) return { action: 'reembed', id: record.id, reason: 'missing-embedding' };
    if (!record.embeddingProvenance) return { action: 'reembed', id: record.id, reason: 'missing-provenance' };
    try {
      validateEmbeddingProfile(record.embeddingProvenance, `Embedding provenance for memory "${record.id}"`);
    } catch {
      return { action: 'reembed', id: record.id, reason: 'invalid-provenance' };
    }
    try {
      validateEmbeddingVector(record.embedding, record.embeddingProvenance.dimensions);
    } catch {
      return { action: 'reembed', id: record.id, reason: 'invalid-vector' };
    }
    let compatibility: EmbeddingCompatibility;
    try {
      compatibility = compareEmbeddingProvenance(target, record.embeddingProvenance);
    } catch {
      return { action: 'reembed', id: record.id, reason: 'invalid-provenance' };
    }
    return compatibility.compatible
      ? { action: 'keep', id: record.id }
      : { action: 'reembed', id: record.id, mismatches: compatibility.mismatches, reason: 'incompatible-provenance' };
  });
  return {
    items,
    keepIds: items.filter(({ action }) => action === 'keep').map(({ id }) => id),
    reembedIds: items.filter(({ action }) => action === 'reembed').map(({ id }) => id),
    target: { ...target },
  };
};

/**
 * Produce a fully validated update batch without writing it. Callers explicitly
 * commit the returned updates only after the complete batch has staged.
 */
export const stageReembedding = async <TRecord extends ProvenancedEmbeddingRecord>(
  records: readonly TRecord[],
  target: EmbeddingProfile,
  embed: (record: TRecord, target: EmbeddingProfile) => Promise<readonly number[]>,
  createdAt: string,
): Promise<readonly ReembeddingUpdate[]> => {
  const plan = planReembedding(records, target);
  const wanted = new Set(plan.reembedIds);
  const provenance = createEmbeddingProvenance(target, createdAt);
  const updates: ReembeddingUpdate[] = [];
  for (const record of records) {
    if (!wanted.has(record.id)) continue;
    const embedding = await embed(record, target);
    validateEmbeddingVector(embedding, target.dimensions, `Embedding for memory "${record.id}"`);
    updates.push({ embedding: [...embedding], embeddingProvenance: { ...provenance }, id: record.id });
  }
  return updates;
};
