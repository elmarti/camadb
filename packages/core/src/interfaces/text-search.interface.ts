import { Filter } from './document-types';

export type TextSearchMatch = 'all' | 'any';

export interface TextSearchOptions<TDocument extends object> {
  filter?: Filter<TDocument>;
  limit?: number;
  match?: TextSearchMatch;
  offset?: number;
}

export interface TextSearchHit<TDocument extends object> {
  document: TDocument;
  matchedTerms: string[];
  score: number;
}

