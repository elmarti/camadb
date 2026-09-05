import Link from 'next/link';

const github = 'https://github.com/elmarti/camadb';

function Mark() {
  return (
    <svg className="cama-brand__mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#17251f" />
      <path
        d="M45.5 18.7c-3.4-2.5-7.6-3.9-12-3.9C22 14.8 14.8 22 14.8 32.1S22 49.3 33.5 49.3c4.8 0 9.1-1.4 12.6-4l-5.3-7.2a12.4 12.4 0 0 1-7.3 2.3c-5.5 0-9.4-3.2-9.4-8.3s3.9-8.4 9.4-8.4c2.9 0 5.3.8 7.3 2.4l4.7-7.4Z"
        fill="#cbf070"
      />
      <circle cx="47.5" cy="32" r="4.5" fill="#f2efe7" />
    </svg>
  );
}

const code = `import { Cama, PersistenceAdapterEnum } from '@camadb/core';

interface Note {
  _id: string;
  title: string;
  body: string;
}

const db = new Cama({
  persistenceAdapter: PersistenceAdapterEnum.IndexedDb,
});

const notes = await db.initCollection<Note>('notes', {
  indexes: ['title'],
  searchIndexes: ['title', 'body'],
});

await notes.insertOne({ title: 'Local first', body: 'Data stays here.' });`;

const capabilities = [
  ['Typed collections', 'A single document type flows through inserts, filters, updates, aggregation, and results.'],
  ['Four local adapters', 'Use filesystem, IndexedDB, localStorage, or memory through one persistence contract.'],
  [
    'Measured indexes',
    'Metadata, BM25 text, exact vectors, and inspectable hybrid retrieval—with the costs documented.',
  ],
  [
    'Durable mutation',
    'Serialized writes, recoverable append segments, checksummed commits, compaction, and explicit failure behaviour.',
  ],
  ['Configurable cache', 'Disabled, eager, lazy, and bounded LRU modes with invalidation and visible budgets.'],
  [
    'Local AI memory',
    'Store embeddings with provenance, recall locally, inspect ranking evidence, export, and delete.',
  ],
];

export default function Home() {
  return (
    <>
      <a className="cama-skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="cama-shell site-header__inner">
          <a className="cama-brand" href="#top" aria-label="CamaDB home">
            <Mark />
            CamaDB
          </a>
          <nav aria-label="Main navigation">
            <a href="#science">How it works</a>
            <a href="#performance">Performance</a>
            <a href="#quickstart">Quick start</a>
            <Link href="/demo/index.html">Demo</Link>
          </nav>
          <a className="cama-button cama-button--quiet header-github" href={github}>
            GitHub ↗
          </a>
        </div>
      </header>

      <main id="main">
        <section className="hero" id="top">
          <div className="cama-shell hero__grid">
            <div className="hero__copy">
              <div className="cama-kicker">Open-source embedded TypeScript database</div>
              <h1 className="cama-display">
                Local data.
                <br />
                <em>Measured.</em>
              </h1>
              <p className="hero__lede">
                CamaDB keeps application data and AI memory close to the user. Typed collections, durable local
                persistence, and inspectable retrieval—without requiring a database server.
              </p>
              <div className="hero__actions">
                <Link className="cama-button cama-button--accent" href="/demo/index.html">
                  Try the offline demo
                </Link>
                <a className="cama-button cama-button--quiet" href="#quickstart">
                  Install in five minutes
                </a>
              </div>
              <div className="hero__facts" aria-label="Project facts">
                <span>MIT licensed</span>
                <span>Node 22+</span>
                <span>Browser + Electron</span>
                <span>No service required</span>
              </div>
            </div>
            <div className="hero__diagram" aria-label="Local CamaDB architecture">
              <div className="diagram__device">
                <div className="diagram__label">Your application</div>
                <div className="diagram__core">
                  <Mark />
                  <strong>CamaDB</strong>
                  <small>typed query + retrieval</small>
                </div>
                <div className="diagram__stores">
                  <span>IndexedDB</span>
                  <span>Filesystem</span>
                  <span>Memory</span>
                </div>
              </div>
              <div className="diagram__boundary">
                <span>private execution boundary</span>
              </div>
              <div className="diagram__optional">
                Network <strong>optional</strong>, never assumed
              </div>
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Measured results">
          <div className="cama-shell proof-strip__grid">
            <div>
              <strong>84.8×</strong>
              <span>indexed intersection speedup at 100k records</span>
            </div>
            <div>
              <strong>0.05 ms</strong>
              <span>filesystem point inspection at 10k records</span>
            </div>
            <div>
              <strong>4</strong>
              <span>persistence adapters under one conformance suite</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>ranking evidence available to inspect</span>
            </div>
          </div>
          <p className="proof-strip__note">Apple M5, Node 24 benchmark medians. Reproduce before relying on them.</p>
        </section>

        <section className="section" id="science">
          <div className="cama-shell">
            <div className="section__intro">
              <div className="cama-kicker">Built in the open</div>
              <h2>Database mechanics you can actually inspect.</h2>
              <p>
                CamaDB exposes the choices that determine durability, memory use, and relevance instead of hiding them
                behind a cloud endpoint.
              </p>
            </div>
            <div className="capability-grid">
              {capabilities.map(([title, description], index) => (
                <article className="cama-card capability" key={title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--dark" id="quickstart">
          <div className="cama-shell quickstart">
            <div>
              <div className="cama-kicker">Five-minute quick start</div>
              <h2>One type. One collection. Data stays close.</h2>
              <ol className="steps">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Install</strong>
                    <code>yarn add @camadb/core</code>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Choose an adapter</strong>
                    <p>IndexedDB for browsers; filesystem for Node and Electron.</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Query typed data</strong>
                    <p>Add text, vector, or metadata indexes when measurements justify them.</p>
                  </div>
                </li>
              </ol>
              <a className="cama-button cama-button--accent" href={`${github}#getting-started`}>
                Read the full guide ↗
              </a>
            </div>
            <pre className="cama-code">
              <code>{code}</code>
            </pre>
          </div>
        </section>

        <section className="section" id="performance">
          <div className="cama-shell performance">
            <div className="section__intro">
              <div className="cama-kicker">Performance without theatre</div>
              <h2>Every fast claim keeps its receipt.</h2>
              <p>
                Before-and-after workloads, raw JSON samples, environment metadata, regressions, and rejected
                experiments all stay in the repository.
              </p>
            </div>
            <div className="benchmark-card cama-card">
              <div className="benchmark-card__head">
                <span>100,000 records</span>
                <span>Filesystem · steady state</span>
              </div>
              <div className="benchmark-row">
                <span>Equality query</span>
                <b style={{ '--bar': '76%' } as React.CSSProperties}>80.0 → 3.9 ms</b>
                <em>20.6×</em>
              </div>
              <div className="benchmark-row">
                <span>Range query</span>
                <b style={{ '--bar': '65%' } as React.CSSProperties}>81.6 → 5.9 ms</b>
                <em>13.8×</em>
              </div>
              <div className="benchmark-row">
                <span>Index intersection</span>
                <b style={{ '--bar': '94%' } as React.CSSProperties}>87.2 → 1.0 ms</b>
                <em>84.8×</em>
              </div>
              <div className="benchmark-row benchmark-row--control">
                <span>Unindexed control</span>
                <b style={{ '--bar': '8%' } as React.CSSProperties}>82.0 → 78.0 ms</b>
                <em>1.1×</em>
              </div>
              <div className="benchmark-card__foot">
                Cold index construction is slower and reported separately. These numbers are not a universal SLA.
              </div>
            </div>
            <div className="performance__actions">
              <a className="cama-button cama-button--primary" href={`${github}/tree/develop/docs/benchmarks`}>
                Inspect benchmark reports ↗
              </a>
              <a className="text-link" href={`${github}/tree/develop/docs/benchmarks/speed-lab`}>
                See rejected experiments and raw data ↗
              </a>
            </div>
          </div>
        </section>

        <section className="section local-boundary">
          <div className="cama-shell local-boundary__grid">
            <div>
              <div className="cama-kicker">A clear execution boundary</div>
              <h2>
                Local by default.
                <br />
                Network by explicit choice.
              </h2>
            </div>
            <div className="boundary-list">
              <article>
                <span className="cama-badge">Local</span>
                <h3>Included in CamaDB</h3>
                <p>
                  Storage, indexes, text search, exact vectors, hybrid ranking, caching, memory provenance, export, and
                  deletion.
                </p>
              </article>
              <article>
                <span className="cama-badge badge--optional">Optional</span>
                <h3>Your integration</h3>
                <p>
                  Embedding models, sync, collaboration, backups, or hosted services are separate capabilities chosen by
                  the application.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section scale">
          <div className="cama-shell scale__grid">
            <div>
              <div className="cama-kicker">Supported scale</div>
              <h2>Know when to reach for something else.</h2>
            </div>
            <div className="scale__copy">
              <p>
                CamaDB is measured for local application collections up to 100,000 small records in selected index
                workloads. Actual limits depend on payload size, adapter, query shape, and device.
              </p>
              <p>
                Choose SQLite when you need mature SQL planning and relational storage. Choose a client/server database
                for many independent writers or shared network access.
              </p>
              <a
                className="text-link"
                href={`${github}/blob/develop/docs/benchmarks/wave4-comparison.md#supported-workload-guidance`}
              >
                Read the full workload guidance ↗
              </a>
            </div>
          </div>
        </section>

        <section className="demo-cta">
          <div className="cama-shell demo-cta__inner">
            <div>
              <div className="cama-kicker">Flagship browser demo</div>
              <h2>Import a document. Pull the plug. Keep searching.</h2>
              <p>
                The app blocks outbound connections, stores records in IndexedDB, and shows exactly why each result
                ranked.
              </p>
            </div>
            <Link className="cama-button cama-button--accent" href="/demo/index.html">
              Open the local knowledge lab →
            </Link>
          </div>
        </section>
      </main>

      <footer>
        <div className="cama-shell footer__inner">
          <a className="cama-brand" href="#top">
            <Mark />
            CamaDB
          </a>
          <p>Open source under MIT. Built for inspectable local software.</p>
          <div>
            <a href={github}>GitHub</a>
            <a href={`${github}/issues`}>Issues</a>
            <a href={`${github}/tree/develop/docs`}>Docs</a>
          </div>
        </div>
      </footer>
    </>
  );
}
