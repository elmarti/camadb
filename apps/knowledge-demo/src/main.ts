import { Cama, PersistenceAdapterEnum } from '@camadb/core';
import { CamaMemory, type MemoryRecord, type RecallResult } from '@camadb/memory';
import { createLocalEmbeddingProvider, type KnowledgeMetadata, prepareKnowledgeDocument } from './knowledge';
import './styles.css';

const MAX_FILE_BYTES = 2_000_000;
const MAX_VISIBLE_MEMORIES = 200;

const element = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing demo element: ${selector}`);
  return found;
};

const status = element<HTMLElement>('#activity-status');
const count = element<HTMLElement>('#memory-count');
const results = element<HTMLElement>('#results');
const memories = element<HTMLElement>('#memories');
const inspector = element<HTMLDialogElement>('#inspector');
const inspectorBody = element<HTMLElement>('#inspector-body');
const importButton = element<HTMLButtonElement>('#import-button');
const fileInput = element<HTMLInputElement>('#file-input');
const pasteInput = element<HTMLTextAreaElement>('#paste-input');
const sourceInput = element<HTMLInputElement>('#source-name');

const database = new Cama({
  cache: { maxBytes: 16 * 1024 * 1024, maxRecords: 2_500, mode: 'lru' },
  path: 'camadb-knowledge-demo-v1',
  persistenceAdapter: PersistenceAdapterEnum.IndexedDb,
});
const memory = await CamaMemory.create<KnowledgeMetadata>(database, {
  collectionName: 'knowledge',
  embeddingProvider: createLocalEmbeddingProvider(),
});

const setStatus = (message: string, tone: 'busy' | 'error' | 'ready' = 'ready'): void => {
  status.textContent = message;
  status.dataset.tone = tone;
};

const button = (label: string, action: () => Promise<void>, className = 'button button--quiet'): HTMLButtonElement => {
  const control = document.createElement('button');
  control.className = className;
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', () => void action());
  return control;
};

const sourceLabel = (record: MemoryRecord<KnowledgeMetadata>): string => {
  const source = record.metadata?.sourceName ?? 'Unknown source';
  const chunk = record.metadata ? ` · chunk ${record.metadata.chunkIndex + 1}/${record.metadata.totalChunks}` : '';
  return `${source}${chunk}`;
};

const inspectRecord = async (id: string): Promise<void> => {
  const record = await memory.inspect(id);
  if (!record) {
    setStatus('That memory no longer exists.', 'error');
    return;
  }
  inspectorBody.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = sourceLabel(record);
  const content = document.createElement('p');
  content.textContent = record.content;
  const details = document.createElement('pre');
  details.textContent = JSON.stringify(record, null, 2);
  inspectorBody.append(title, content, details);
  inspector.showModal();
};

const forgetRecord = async (id: string): Promise<void> => {
  await memory.forget(id);
  setStatus('Memory deleted from this browser.');
  await refreshMemories();
};

const memoryCard = (record: MemoryRecord<KnowledgeMetadata>): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'memory-card';
  const meta = document.createElement('div');
  meta.className = 'eyebrow';
  meta.textContent = sourceLabel(record);
  const content = document.createElement('p');
  content.textContent = record.content;
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(
    button('Inspect', () => inspectRecord(record.id)),
    button('Delete', () => forgetRecord(record.id), 'button button--danger'),
  );
  card.append(meta, content, actions);
  return card;
};

async function refreshMemories(): Promise<void> {
  const all = await memory.list({ limit: MAX_VISIBLE_MEMORIES });
  count.textContent = String(all.length);
  memories.replaceChildren();
  if (all.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No local memories yet. Import the sample or add your own notes.';
    memories.append(empty);
    return;
  }
  memories.append(...all.map(memoryCard));
}

const explanationText = (result: RecallResult<KnowledgeMetadata>): string => {
  const parts = [`${result.explanation.strategy} score ${result.score.toFixed(4)}`];
  if (result.explanation.text) {
    parts.push(
      `text rank ${result.explanation.text.rank}; terms ${result.explanation.text.matchedTerms.join(', ') || 'none'}`,
    );
  }
  if (result.explanation.vector) {
    parts.push(`vector rank ${result.explanation.vector.rank}; cosine ${result.explanation.vector.score.toFixed(4)}`);
  }
  return parts.join(' · ');
};

const resultCard = (result: RecallResult<KnowledgeMetadata>, rank: number): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'result-card';
  const rankElement = document.createElement('span');
  rankElement.className = 'result-rank';
  rankElement.textContent = String(rank + 1).padStart(2, '0');
  const body = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'eyebrow';
  meta.textContent = sourceLabel(result.memory);
  const content = document.createElement('p');
  content.textContent = result.memory.content;
  const explanation = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Why this result?';
  const reason = document.createElement('p');
  reason.textContent = explanationText(result);
  explanation.append(summary, reason);
  body.append(meta, content, explanation);
  card.append(rankElement, body);
  return card;
};

const importText = async (sourceName: string, content: string): Promise<number> => {
  const prepared = prepareKnowledgeDocument(sourceName.trim() || 'Pasted notes', content);
  if (prepared.length === 0) throw new Error('The document does not contain any text to import.');
  if (prepared.length > 10_000) throw new Error('This import exceeds the 10,000-chunk atomic mutation limit.');
  await memory.rememberMany(prepared);
  return prepared.length;
};

const importFiles = async (files: readonly File[]): Promise<number> => {
  let imported = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 2 MB demo limit.`);
    imported += await importText(file.name, await file.text());
  }
  return imported;
};

const runImport = async (): Promise<void> => {
  importButton.disabled = true;
  setStatus('Chunking and embedding locally…', 'busy');
  try {
    let imported = 0;
    const selected = Array.from(fileInput.files ?? []);
    if (selected.length > 0) imported += await importFiles(selected);
    if (pasteInput.value.trim()) imported += await importText(sourceInput.value, pasteInput.value);
    if (imported === 0) throw new Error('Choose a text file or paste some notes first.');
    fileInput.value = '';
    pasteInput.value = '';
    setStatus(`Stored ${imported} chunk${imported === 1 ? '' : 's'} in this browser.`);
    await refreshMemories();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Import failed.', 'error');
  } finally {
    importButton.disabled = false;
  }
};

const SAMPLE = `CamaDB is an embedded, local-first database for TypeScript applications. It runs in Node.js, Electron, and modern browsers.

The browser adapter stores records in IndexedDB. Normal point operations use record identity rather than hydrating an entire collection, while bounded caches make memory usage observable.

Full-text retrieval uses deterministic BM25 scoring. Exact vector search supports cosine, dot-product, and Euclidean distance, and hybrid retrieval exposes every component score and fusion contribution.

The @camadb/memory package adds typed remember, recall, explain, inspect, edit, export, and forget workflows. Embedding providers are optional and supplied by the application, so a cloud account is never required.

This knowledge demo chunks text and computes a small signed feature-hash vector entirely in the browser. The baseline is useful for demonstrating local retrieval, but it is lexical rather than a production semantic model.`;

element<HTMLButtonElement>('#sample-button').addEventListener('click', () => {
  sourceInput.value = 'CamaDB field guide';
  pasteInput.value = SAMPLE;
  pasteInput.focus();
  setStatus('Sample loaded. Select “Store locally” to import it.');
});

importButton.addEventListener('click', () => void runImport());

const dropzone = element<HTMLElement>('#dropzone');
for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.dataset.dragging = 'true';
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    delete dropzone.dataset.dragging;
  });
}
dropzone.addEventListener('drop', (event) => {
  const dropped = (event as DragEvent).dataTransfer?.files;
  if (!dropped?.length) return;
  const transfer = new DataTransfer();
  for (const file of Array.from(dropped)) transfer.items.add(file);
  fileInput.files = transfer.files;
  setStatus(`${dropped.length} local file${dropped.length === 1 ? '' : 's'} ready to import.`);
});

element<HTMLFormElement>('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = element<HTMLInputElement>('#search-query').value;
  const strategy = element<HTMLSelectElement>('#search-strategy').value as 'hybrid' | 'text' | 'vector';
  setStatus('Searching local records…', 'busy');
  try {
    const recalled = await memory.recall(query, { limit: 8, strategy });
    results.replaceChildren();
    if (recalled.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No matching chunks found.';
      results.append(empty);
    } else results.append(...recalled.map(resultCard));
    setStatus(`Found ${recalled.length} result${recalled.length === 1 ? '' : 's'} without a network request.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Search failed.', 'error');
  }
});

element<HTMLButtonElement>('#export-button').addEventListener('click', async () => {
  const exported = await memory.export();
  const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.download = `camadb-knowledge-${new Date().toISOString().slice(0, 10)}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${exported.memories.length} local memories.`);
});

element<HTMLButtonElement>('#clear-button').addEventListener('click', async () => {
  if (!window.confirm('Delete every memory stored by this demo in this browser?')) return;
  setStatus('Deleting local memories…', 'busy');
  for (const record of await memory.list({ includeExpired: true })) await memory.forget(record.id);
  results.replaceChildren();
  await refreshMemories();
  setStatus('All demo memories were deleted from this browser.');
});

element<HTMLButtonElement>('#close-inspector').addEventListener('click', () => inspector.close());
inspector.addEventListener('click', (event) => {
  if (event.target === inspector) inspector.close();
});

const updateConnection = (): void => {
  const connection = element<HTMLElement>('#connection-status');
  connection.textContent = navigator.onLine ? 'Online · local-only data path' : 'Offline · retrieval available';
  connection.dataset.online = String(navigator.onLine);
};
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
updateConnection();

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./service-worker.js').catch(() => {
    setStatus('Local storage works, but offline reload could not be enabled.', 'error');
  });
}

await refreshMemories();
setStatus('Ready. Your data stays in this browser.');
