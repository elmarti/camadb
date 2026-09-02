export interface RecordMutation<T = any> {
  deletes?: string[];
  puts?: T[];
}

export interface IPersistenceAdapter {
  insert(ts: Array<any>): Promise<any>;
  getData(): Promise<any>;

  /** Bounded record APIs implemented by format-v3 adapters. */
  getRecord?(id: string): Promise<any | undefined>;
  getRecords?(ids: string[]): Promise<Map<string, any>>;
  iterateRecords?(): AsyncIterable<any>;
  mutateRecords?(mutation: RecordMutation): Promise<void>;
  compact?(): Promise<void>;

  update(updated: any): Promise<void>;

  destroy(): Promise<void>;
}
