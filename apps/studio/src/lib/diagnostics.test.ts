import { createRedactedDiagnostic } from './diagnostics';

it('preserves useful record shapes without exporting values or identities', () => {
  const diagnostic = createRedactedDiagnostic(
    { name: 'cama', version: 3 },
    [
      {
        name: 'notes',
        generation: 2,
        liveRecords: 1,
        tombstones: 0,
        columns: [],
        indexes: [],
        searchIndexes: ['content'],
        vectorIndexes: [{ field: 'embedding', dimensions: 2 }],
      },
    ],
    [
      {
        cursor: 'record:secret-id',
        generation: 2,
        sequence: 0,
        document: {
          _id: 'secret-id',
          content: 'private words',
          embedding: [0.1, 0.2],
          metadata: { owner: 'Ada' },
        },
      },
    ],
    '2026-09-05T00:00:00.000Z',
  );
  const output = JSON.stringify(diagnostic);
  expect(output).not.toContain('secret-id');
  expect(output).not.toContain('private words');
  expect(output).not.toContain('Ada');
  expect(diagnostic).toMatchObject({
    format: 'camadb-studio-diagnostic',
    recordShapes: [{ _id: '<redacted:string>', content: '<redacted:string>', embedding: { type: 'array', length: 2 } }],
  });
});
