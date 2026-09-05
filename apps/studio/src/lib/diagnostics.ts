import { STUDIO_PROTOCOL_VERSION } from './protocol';
import type { StudioCollectionSummary, StudioDatabaseSummary, StudioRecord } from './protocol';

const redact = (value: unknown): unknown => {
  if (value === null) return null;
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).map((key) => [
        key,
        redact((value as Record<string, unknown>)[key]),
      ]),
    );
  }
  return `<redacted:${typeof value}>`;
};

export function createRedactedDiagnostic(
  database: StudioDatabaseSummary,
  collections: StudioCollectionSummary[],
  records: StudioRecord[],
  generatedAt = new Date().toISOString(),
): Record<string, unknown> {
  return {
    format: 'camadb-studio-diagnostic',
    protocol: STUDIO_PROTOCOL_VERSION,
    generatedAt,
    database,
    collections,
    recordShapes: records.slice(0, 20).map(({ document }) => redact(document)),
    redaction: 'All record values and identities are redacted. Field names, value types and array lengths remain.',
  };
}
