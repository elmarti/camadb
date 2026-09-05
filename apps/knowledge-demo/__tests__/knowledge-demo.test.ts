import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import { CamaMemory } from '@camadb/memory';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  LOCAL_EMBEDDING_PROFILE,
  chunkDocument,
  createLocalEmbeddingProvider,
  embedLocally,
  prepareKnowledgeDocument,
} from '../src/knowledge';

describe('local browser knowledge journey', () => {
  it('ships a same-origin offline shell with outbound application connections blocked', async () => {
    const publicDirectory = path.join(process.cwd(), 'apps/knowledge-demo/public');
    const [page, worker] = await Promise.all([
      fs.readFile(path.join(publicDirectory, 'index.html'), 'utf8'),
      fs.readFile(path.join(publicDirectory, 'service-worker.js'), 'utf8'),
    ]);
    expect(page).toContain("connect-src 'none'");
    for (const asset of ['./index.html', './app.css', './app.js', './camadb-mark.svg', './manifest.webmanifest']) {
      expect(worker).toContain(`'${asset}'`);
    }
    expect(worker).toContain('event.request.method');
    expect(worker).toContain('self.location.origin');
  });

  it('creates deterministic bounded chunks and vectors without a provider request', () => {
    const content = new Array(180).fill('local private knowledge').join(' ');
    const chunks = chunkDocument(content, { maxCharacters: 240, overlapCharacters: 32 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 240)).toBe(true);
    expect(chunkDocument(content, { maxCharacters: 240, overlapCharacters: 32 })).toEqual(chunks);

    const first = embedLocally('local private knowledge');
    expect(first).toEqual(embedLocally('local private knowledge'));
    expect(first).toHaveLength(LOCAL_EMBEDDING_PROFILE.dimensions);
    expect(Math.sqrt(first.reduce((sum, component) => sum + component ** 2, 0))).toBeCloseTo(1);
  });

  it('imports, reloads, recalls, explains, inspects, exports, and deletes entirely through browser storage', async () => {
    const databaseName = `knowledge-demo-${Date.now()}-${Math.random()}`;
    const firstDatabase = new Cama({ path: databaseName, persistenceAdapter: PersistenceAdapterEnum.IndexedDb });
    const firstMemory = await CamaMemory.create(firstDatabase, {
      collectionName: 'knowledge',
      embeddingProvider: createLocalEmbeddingProvider(),
    });
    const prepared = prepareKnowledgeDocument(
      'field-guide.md',
      'CamaDB stores browser records in IndexedDB.\n\nHybrid retrieval exposes text and vector ranking evidence.',
      '2026-09-05T00:00:00.000Z',
    );
    const remembered = await firstMemory.rememberMany(prepared);
    expect(remembered).toHaveLength(prepared.length);

    // A second instance represents an offline reload: persistence and recall do
    // not depend on the original JavaScript objects or any network provider.
    const reloadedDatabase = new Cama({ path: databaseName, persistenceAdapter: PersistenceAdapterEnum.IndexedDb });
    const reloadedMemory = await CamaMemory.create(reloadedDatabase, {
      collectionName: 'knowledge',
      embeddingProvider: createLocalEmbeddingProvider(),
    });
    const recalled = await reloadedMemory.recall('browser records IndexedDB', { strategy: 'hybrid' });
    expect(recalled[0].memory.metadata?.sourceName).toBe('field-guide.md');
    expect(reloadedMemory.explain(recalled[0]).strategy).toBe('hybrid');
    expect(await reloadedMemory.inspect(recalled[0].memory.id)).toEqual(recalled[0].memory);

    const exported = await reloadedMemory.export();
    expect(exported.memories).toHaveLength(prepared.length);
    expect(exported.schemaVersion).toBe(1);

    await reloadedMemory.forget(recalled[0].memory.id);
    expect(await reloadedMemory.inspect(recalled[0].memory.id)).toBeUndefined();
  });
});
