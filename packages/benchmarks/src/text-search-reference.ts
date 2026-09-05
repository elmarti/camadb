export interface ReferenceDocument {
  _id: string;
  [field: string]: unknown;
}

export interface ReferenceHit<TDocument> {
  document: TDocument;
  matchedTerms: string[];
  score: number;
}

const K1 = 1.2;
const B = 0.75;

export const tokenize = (value: string): string[] =>
  value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export const scanText = <TDocument extends ReferenceDocument>(
  documents: TDocument[],
  query: string,
  fields: string[],
  match: 'all' | 'any' = 'any',
): ReferenceHit<TDocument>[] => {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || documents.length === 0) return [];
  const querySet = new Set(queryTerms);
  const prepared = documents.map((document, sequence) => {
    const frequencies = new Map<string, number>();
    const tokens = fields.flatMap((field) => typeof document[field] === 'string' ? tokenize(document[field]) : []);
    for (const token of tokens) {
      if (querySet.has(token)) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    return { document, frequencies, length: tokens.length, sequence };
  });
  const averageLength = prepared.reduce((sum, row) => sum + row.length, 0) / prepared.length || 1;
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, prepared.filter((row) => row.frequencies.has(term)).length);
  }
  return prepared
    .filter((row) => match === 'all'
      ? queryTerms.every((term) => row.frequencies.has(term))
      : queryTerms.some((term) => row.frequencies.has(term)))
    .map((row) => {
      let score = 0;
      const matchedTerms: string[] = [];
      for (const term of queryTerms) {
        const frequency = row.frequencies.get(term) ?? 0;
        if (frequency === 0) continue;
        matchedTerms.push(term);
        const occurrences = documentFrequency.get(term) ?? 0;
        const inverseFrequency = Math.log(1 + (documents.length - occurrences + 0.5) / (occurrences + 0.5));
        score += inverseFrequency *
          (frequency * (K1 + 1)) /
          (frequency + K1 * (1 - B + B * row.length / averageLength));
      }
      return { document: row.document, matchedTerms, score, sequence: row.sequence };
    })
    .sort((left, right) => right.score - left.score || left.sequence - right.sequence)
    .map(({ sequence: _sequence, ...hit }) => hit);
};

