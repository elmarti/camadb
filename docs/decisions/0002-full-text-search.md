# Full-text search contract

- Status: Accepted for #4
- Scope: CamaDB 3 local keyword retrieval
- Benchmark: measured before and after implementation with identical workloads

## Context

CamaDB needs a keyword retrieval primitive that can later combine with exact
vector search. The first release must work in Node.js, Electron, and browsers,
remain inspectable, and preserve ordinary collection correctness. It must not
claim language features or dataset sizes that have not been measured.

## Decision

Collections declare top-level string fields in an optional `searchIndexes`
configuration. They expose `searchText(query, options)`, returning ranked hits
whose document, numeric score, and matched terms are visible. Options support a
metadata filter, `any` or `all` query-term matching, offset, and limit.

### Tokenization and normalization

Text is normalized with Unicode NFKC, converted to locale-independent lower
case, and split into contiguous Unicode letter or number tokens. Duplicate
query tokens collapse to one term. The first version does not silently apply
stemming, stop-word removal, fuzzy matching, phrase matching, or prefix
expansion. Empty or punctuation-only queries return no hits.

### Ranking

Ranking uses BM25 with fixed constants `k1 = 1.2` and `b = 0.75`. All configured
fields have equal weight and are treated as one logical document. Scores sort
descending; equal scores retain collection order. The response includes matched
terms so a later hybrid retriever can explain the keyword component.

### Filtering and bounded reads

When a supported metadata index can resolve the supplied filter, its candidate
identities are intersected with text postings before document loading and
scoring. The complete metadata predicate is still evaluated on fetched records.
Unsupported filter shapes remain correct through post-filtering rather than
changing semantics. Only selected documents are loaded through bounded record
APIs.

### Persistence and recovery

Search field definitions are persisted as collection metadata. Posting lists,
term frequencies, document lengths, and corpus statistics are derived in-memory
state. Committed records remain authoritative. The search index rebuilds after
opening a collection or observing an external storage revision.

Insert, replacement, and deletion update derived state only after the storage
mutation commits. A rejected mutation therefore cannot advance the index. A
failed or interrupted rebuild is discarded and can be repeated safely; it never
changes stored documents.

### Runtime and memory model

The implementation is pure TypeScript with no Node-only dependency, allowing
the CPU work to run inside a browser Worker chosen by the application. Index
memory is proportional to indexed tokens and postings and therefore grows with
the indexed corpus. The benchmark report must publish cold-build cost, steady query latency,
heap observations, and the unindexed scan comparison. Applications exceeding
the documented range should use a dedicated search engine.

## Rejected for the first release

- Persisting postings inside the record-storage format, which couples recovery
  and compaction to a new derived format before its performance is understood.
- Locale-specific tokenizers with runtime-dependent results.
- Adding a large search dependency before measuring the narrow native design.
- WASM by default. It remains an experiment only if identical end-to-end
  workloads show a material gain after initialization and data-transfer costs.
