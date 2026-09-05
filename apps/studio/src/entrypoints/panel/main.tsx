import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import '@camadb/design/styles.css';
import './style.css';
import { createRedactedDiagnostic } from '../../lib/diagnostics';
import { sendStudioCommand } from '../../lib/devtools-transport';
import type {
  StudioCollectionSummary,
  StudioDatabaseSummary,
  StudioQuery,
  StudioQueryHit,
  StudioRecord,
} from '../../lib/protocol';
import { parseStudioQuery, queryPlaceholder } from '../../lib/query-input';

type View = 'browse' | 'query' | 'health';

const json = (value: unknown): string => JSON.stringify(value, null, 2);
const recordTitle = (document: Record<string, unknown>): string => String(document._id ?? 'Document');
const recordId = (document: Record<string, unknown>): string => {
  if (typeof document._id !== 'string' || document._id.length === 0) {
    throw new Error('This stored document does not have a valid string _id');
  }
  return document._id;
};

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('browse');
  const [databases, setDatabases] = useState<StudioDatabaseSummary[]>([]);
  const [databaseName, setDatabaseName] = useState('');
  const [collections, setCollections] = useState<StudioCollectionSummary[]>([]);
  const [collectionName, setCollectionName] = useState('');
  const [records, setRecords] = useState<StudioRecord[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<StudioRecord>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [queryKind, setQueryKind] = useState<StudioQuery['kind']>('document');
  const [queryInput, setQueryInput] = useState(queryPlaceholder('document'));
  const [queryHits, setQueryHits] = useState<StudioQueryHit[]>([]);
  const [queryMeta, setQueryMeta] = useState<{ scanned: number; truncated: boolean }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const activeCollection = useMemo(
    () => collections.find((collection) => collection.name === collectionName),
    [collectionName, collections],
  );

  const execute = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(undefined);
    try {
      return await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const inspectDatabase = useCallback(
    async (name: string): Promise<void> => {
      const result = await execute(() => sendStudioCommand({ type: 'inspect-database', database: name }));
      if (result?.type !== 'database') return;
      setDatabaseName(name);
      setCollections(result.collections);
      setCollectionName((current) =>
        result.collections.some(({ name: item }) => item === current) ? current : (result.collections[0]?.name ?? ''),
      );
      setRecords([]);
      setCursor(undefined);
      setSelected(undefined);
    },
    [execute],
  );

  const refresh = useCallback(async (): Promise<void> => {
    const result = await execute(() => sendStudioCommand({ type: 'list-databases' }));
    if (result?.type !== 'databases') return;
    setDatabases(result.databases);
    const next = result.databases.some(({ name }) => name === databaseName)
      ? databaseName
      : (result.databases.find(({ name }) => name === 'cama')?.name ?? result.databases[0]?.name ?? '');
    if (next) await inspectDatabase(next);
    else {
      setDatabaseName('');
      setCollections([]);
      setCollectionName('');
    }
  }, [databaseName, execute, inspectDatabase]);

  const loadRecords = useCallback(
    async (append = false): Promise<void> => {
      if (!databaseName || !collectionName) return;
      const result = await execute(() =>
        sendStudioCommand({
          type: 'read-records',
          database: databaseName,
          collection: collectionName,
          after: append ? cursor : undefined,
          limit: 50,
        }),
      );
      if (result?.type !== 'records') return;
      setRecords((current) => (append ? [...current, ...result.records] : result.records));
      setCursor(result.nextCursor);
      if (!append) setSelected(result.records[0]);
    },
    [collectionName, cursor, databaseName, execute],
  );

  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (databaseName && collectionName) void loadRecords();
  }, [databaseName, collectionName]);

  const changeQueryKind = (kind: StudioQuery['kind']): void => {
    setQueryKind(kind);
    setQueryInput(queryPlaceholder(kind));
    setQueryHits([]);
    setQueryMeta(undefined);
  };

  const runQuery = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!databaseName || !collectionName) return;
    const result = await execute(async () => {
      const query = parseStudioQuery(queryKind, queryInput);
      return sendStudioCommand(
        {
          type: 'query-records',
          database: databaseName,
          collection: collectionName,
          query,
          limit: 50,
          scanLimit: 10000,
        },
        30000,
      );
    });
    if (result?.type !== 'query') return;
    setQueryHits(result.hits);
    setQueryMeta({ scanned: result.scanned, truncated: result.truncated });
  };

  const replaceSelected = async (): Promise<void> => {
    if (!selected || !databaseName || !collectionName) return;
    const result = await execute(async () => {
      const document: unknown = JSON.parse(draft);
      if (!document || typeof document !== 'object' || Array.isArray(document)) {
        throw new Error('Replacement document must be a JSON object');
      }
      return sendStudioCommand({
        type: 'replace-record',
        database: databaseName,
        collection: collectionName,
        id: recordId(selected.document),
        expectedGeneration: selected.generation,
        document: document as Record<string, unknown>,
      });
    });
    if (result?.type !== 'mutation') return;
    const document = JSON.parse(draft) as Record<string, unknown>;
    const replacement = { ...selected, document, generation: result.generation };
    setRecords((current) => current.map((record) => (record.cursor === selected.cursor ? replacement : record)));
    setSelected(replacement);
    setCollections((current) =>
      current.map((collection) =>
        collection.name === collectionName ? { ...collection, generation: result.generation } : collection,
      ),
    );
    setEditing(false);
  };

  const deleteSelected = async (): Promise<void> => {
    if (!selected || !databaseName || !collectionName) return;
    let id: string;
    try {
      id = recordId(selected.document);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    if (!window.confirm(`Delete record "${id}"? CamaDB will retain a tombstone until compaction.`)) return;
    const result = await execute(() =>
      sendStudioCommand({
        type: 'delete-record',
        database: databaseName,
        collection: collectionName,
        id,
        expectedGeneration: selected.generation,
      }),
    );
    if (result?.type !== 'mutation' || !result.changed) return;
    const remaining = records.filter((record) => record.cursor !== selected.cursor);
    setRecords(remaining);
    setSelected(remaining[0]);
    setEditing(false);
    setCollections((current) =>
      current.map((collection) =>
        collection.name === collectionName
          ? {
              ...collection,
              generation: result.generation,
              liveRecords: Math.max(0, collection.liveRecords - 1),
              tombstones: collection.tombstones + 1,
            }
          : collection,
      ),
    );
  };

  const exportDiagnostic = (): void => {
    const database = databases.find(({ name }) => name === databaseName);
    if (!database) return;
    const output = createRedactedDiagnostic(database, collections, records);
    const url = URL.createObjectURL(new Blob([json(output)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `camadb-diagnostic-${Date.now()}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="studio-app">
      <header className="studio-header">
        <div className="studio-brand">
          <img src="/camadb-mark.svg" alt="" />
          <div>
            <strong>Cama Studio</strong>
            <span>Local database inspector</span>
          </div>
        </div>
        <div className="studio-context">
          <label>
            <span>Database</span>
            <select value={databaseName} onChange={(event) => void inspectDatabase(event.target.value)} disabled={busy}>
              {databases.length === 0 && <option value="">No CamaDB database found</option>}
              {databases.map((database) => (
                <option key={database.name} value={database.name}>
                  {database.name}
                </option>
              ))}
            </select>
          </label>
          <button className="icon-button" onClick={() => void refresh()} disabled={busy} aria-label="Refresh databases">
            ↻
          </button>
        </div>
      </header>

      <div className="studio-body">
        <aside className="studio-sidebar">
          <div className="sidebar-heading">
            <span>Collections</span>
            <small>{collections.length}</small>
          </div>
          <nav aria-label="Collections">
            {collections.map((collection) => (
              <button
                key={collection.name}
                className={collection.name === collectionName ? 'collection-link active' : 'collection-link'}
                onClick={() => {
                  setCollectionName(collection.name);
                  setCursor(undefined);
                  setRecords([]);
                }}
              >
                <span className="collection-icon">{collection.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{collection.name}</strong>
                  <small>{collection.liveRecords.toLocaleString()} records</small>
                </span>
              </button>
            ))}
          </nav>
          <div className="privacy-note">
            <span>●</span>
            <p>
              <strong>Local connection</strong>Data stays inside this inspected tab.
            </p>
          </div>
        </aside>

        <main className="studio-main">
          <div className="view-header">
            <div>
              <span className="cama-kicker">{databaseName || 'Waiting for a database'}</span>
              <h1>{collectionName || 'Open a page using CamaDB'}</h1>
            </div>
            <div className="view-tabs" role="tablist" aria-label="Collection views">
              {(['browse', 'query', 'health'] as View[]).map((item) => (
                <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)} role="tab">
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <strong>Studio couldn’t inspect this page.</strong>
              <span>{error}</span>
            </div>
          )}
          {busy && (
            <div className="progress" aria-label="Loading">
              <span />
            </div>
          )}

          {!databaseName && !busy && (
            <section className="empty-state cama-card">
              <img src="/camadb-mark.svg" alt="" />
              <h2>No local CamaDB database detected</h2>
              <p>
                Open an application that uses CamaDB on this tab, then refresh the panel. Studio never creates or
                modifies a database while discovering it.
              </p>
            </section>
          )}

          {databaseName && collectionName && view === 'browse' && (
            <section className="record-browser">
              <div className="records-list cama-card">
                <div className="pane-heading">
                  <strong>Documents</strong>
                  <span>Bounded pages of 50</span>
                </div>
                {records.map((record) => (
                  <button
                    key={record.cursor}
                    className={selected?.cursor === record.cursor ? 'record-row active' : 'record-row'}
                    onClick={() => {
                      setSelected(record);
                      setEditing(false);
                    }}
                  >
                    <span className="record-dot" />
                    <span>
                      <strong>{recordTitle(record.document)}</strong>
                      <small>
                        sequence {record.sequence} · generation {record.generation}
                      </small>
                    </span>
                  </button>
                ))}
                {records.length === 0 && !busy && (
                  <p className="pane-empty">This collection contains no live records.</p>
                )}
                {cursor && (
                  <button className="load-more" onClick={() => void loadRecords(true)} disabled={busy}>
                    Load next 50
                  </button>
                )}
              </div>
              <div className="record-detail cama-card">
                <div className="pane-heading">
                  <strong>{selected ? recordTitle(selected.document) : 'Document'}</strong>
                  {selected && !editing ? (
                    <div className="record-actions">
                      <button
                        onClick={() => {
                          setDraft(json(selected.document));
                          setEditing(true);
                        }}
                      >
                        Edit
                      </button>
                      <button className="danger" onClick={() => void deleteSelected()}>
                        Delete
                      </button>
                    </div>
                  ) : (
                    <span>{editing ? 'Preserve _id when saving' : 'Select a document'}</span>
                  )}
                </div>
                {editing ? (
                  <div className="record-editor">
                    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
                    <div>
                      <button className="cama-button cama-button--quiet" onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                      <button
                        className="cama-button cama-button--accent"
                        onClick={() => void replaceSelected()}
                        disabled={busy}
                      >
                        Save replacement
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre>{selected ? json(selected.document) : 'Select a document to inspect it.'}</pre>
                )}
              </div>
            </section>
          )}

          {databaseName && collectionName && view === 'query' && (
            <section className="query-workspace">
              <form className="query-editor cama-card" onSubmit={(event) => void runQuery(event)}>
                <div className="pane-heading">
                  <strong>Query playground</strong>
                  <span>Scans at most 10,000 records</span>
                </div>
                <div className="query-kinds">
                  {(['document', 'text', 'vector', 'hybrid'] as StudioQuery['kind'][]).map((kind) => (
                    <button
                      type="button"
                      key={kind}
                      className={queryKind === kind ? 'active' : ''}
                      onClick={() => changeQueryKind(kind)}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                <textarea
                  className="query-textarea"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  spellCheck={false}
                />
                <div className="query-actions">
                  <span>Executed locally in the inspected origin</span>
                  <button className="cama-button cama-button--accent" type="submit" disabled={busy}>
                    Run query
                  </button>
                </div>
              </form>
              <div className="query-results cama-card">
                <div className="pane-heading">
                  <strong>Results</strong>
                  <span>
                    {queryMeta
                      ? `${queryHits.length} hits · ${queryMeta.scanned} scanned${queryMeta.truncated ? ' · truncated' : ''}`
                      : 'No query run'}
                  </span>
                </div>
                {queryHits.map((hit, index) => (
                  <details className="query-hit" key={`${String(hit.document._id)}-${index}`} open={index === 0}>
                    <summary>
                      <span>{recordTitle(hit.document)}</span>
                      <strong>{hit.score.toFixed(5)}</strong>
                    </summary>
                    <div className="score-strip">
                      {hit.explanation.textScore !== undefined && (
                        <span>text {hit.explanation.textScore.toFixed(3)}</span>
                      )}
                      {hit.explanation.vectorScore !== undefined && (
                        <span>vector {hit.explanation.vectorScore.toFixed(3)}</span>
                      )}
                      {hit.explanation.matchedTerms?.length ? (
                        <span>{hit.explanation.matchedTerms.join(', ')}</span>
                      ) : null}
                    </div>
                    <pre>{json(hit.document)}</pre>
                  </details>
                ))}
                {queryHits.length === 0 && (
                  <p className="pane-empty">Run a query to inspect matching documents and scores.</p>
                )}
              </div>
            </section>
          )}

          {databaseName && collectionName && view === 'health' && activeCollection && (
            <section className="health-grid">
              <article className="metric-card cama-card">
                <span>Live records</span>
                <strong>{activeCollection.liveRecords.toLocaleString()}</strong>
                <small>Visible to reads and queries</small>
              </article>
              <article className="metric-card cama-card">
                <span>Tombstones</span>
                <strong>{activeCollection.tombstones.toLocaleString()}</strong>
                <small>Reclaimable through compaction</small>
              </article>
              <article className="metric-card cama-card">
                <span>Generation</span>
                <strong>{activeCollection.generation ?? '—'}</strong>
                <small>Committed storage revision</small>
              </article>
              <article className="index-card cama-card">
                <div className="pane-heading">
                  <strong>Schema and retrieval configuration</strong>
                  <button className="diagnostic-button" onClick={exportDiagnostic}>
                    Export redacted diagnostic
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Declared columns</dt>
                    <dd>
                      {activeCollection.columns.length > 0
                        ? activeCollection.columns
                            .map((column) => String(column.name ?? column.field ?? 'field'))
                            .join(', ')
                        : 'No declared columns'}
                    </dd>
                  </div>
                  <div>
                    <dt>Metadata indexes</dt>
                    <dd>{activeCollection.indexes.join(', ') || 'None configured'}</dd>
                  </div>
                  <div>
                    <dt>Full-text fields</dt>
                    <dd>{activeCollection.searchIndexes.join(', ') || 'None configured'}</dd>
                  </div>
                  <div>
                    <dt>Vector fields</dt>
                    <dd>
                      {activeCollection.vectorIndexes
                        .map(({ field, dimensions }) => `${field} (${dimensions}d)`)
                        .join(', ') || 'None configured'}
                    </dd>
                  </div>
                </dl>
              </article>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Cama Studio root element is missing');
createRoot(root).render(<App />);
