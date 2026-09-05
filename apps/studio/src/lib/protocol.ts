export const STUDIO_PROTOCOL_VERSION = 1 as const;

export interface StudioDatabaseSummary {
  name: string;
  version?: number;
}

export interface StudioCollectionSummary {
  name: string;
  generation?: number;
  liveRecords: number;
  tombstones: number;
  columns: Array<Record<string, unknown>>;
  indexes: string[];
  searchIndexes: string[];
  vectorIndexes: Array<{ field: string; dimensions: number }>;
}

export interface StudioRecord {
  cursor: string;
  document: Record<string, unknown>;
  generation: number;
  sequence: number;
}

export interface StudioRecordPage {
  records: StudioRecord[];
  nextCursor?: string;
  scanned: number;
}

export type StudioQuery =
  | { kind: 'document'; filter: Record<string, unknown> }
  | { kind: 'text'; text: string; match?: 'all' | 'any' }
  | { kind: 'vector'; field: string; vector: number[]; metric?: 'cosine' | 'dot' | 'euclidean' }
  | {
      kind: 'hybrid';
      field: string;
      text: string;
      vector: number[];
      metric?: 'cosine' | 'dot' | 'euclidean';
      textWeight?: number;
      vectorWeight?: number;
    };

export interface StudioQueryHit {
  document: Record<string, unknown>;
  score: number;
  explanation: {
    matchedTerms?: string[];
    textScore?: number;
    vectorScore?: number;
    textRank?: number;
    vectorRank?: number;
  };
}

export type StudioCommand =
  | { type: 'list-databases' }
  | { type: 'inspect-database'; database: string }
  | { type: 'read-records'; database: string; collection: string; after?: string; limit: number }
  | {
      type: 'replace-record';
      database: string;
      collection: string;
      id: string;
      expectedGeneration: number;
      document: Record<string, unknown>;
    }
  | { type: 'delete-record'; database: string; collection: string; id: string; expectedGeneration: number }
  | {
      type: 'query-records';
      database: string;
      collection: string;
      query: StudioQuery;
      limit: number;
      scanLimit: number;
    };

export type StudioCommandResult =
  | { type: 'databases'; databases: StudioDatabaseSummary[] }
  | { type: 'database'; database: StudioDatabaseSummary; collections: StudioCollectionSummary[] }
  | ({ type: 'records' } & StudioRecordPage)
  | { type: 'mutation'; action: 'replace' | 'delete'; id: string; generation: number; changed: boolean }
  | { type: 'query'; hits: StudioQueryHit[]; scanned: number; truncated: boolean };

export interface StudioProbeResponse {
  protocol: typeof STUDIO_PROTOCOL_VERSION;
  result?: StudioCommandResult;
  error?: string;
}
