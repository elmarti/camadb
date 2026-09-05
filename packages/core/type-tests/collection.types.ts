import { ICama } from '../src/interfaces/cama.interface';
import { ICollection } from '../src/interfaces/collection.interface';

interface Message {
  _id: string;
  title: string;
  read: boolean;
  attempts: number;
  embedding: number[];
}

export async function assertCollectionContracts(
  database: ICama,
  collection: ICollection<Message>,
): Promise<void> {
  await collection.insertOne({
    title: 'Hello',
    read: false,
    attempts: 0,
    embedding: [1, 0, 0],
  });
  await collection.insertMany([{
    _id: 'message-2',
    title: 'Typed throughout',
    read: true,
    attempts: 1,
    embedding: [0, 1, 0],
  }]);

  // @ts-expect-error required document fields cannot be omitted
  await collection.insertOne({ _id: 'incomplete' });
  // @ts-expect-error field types cannot change between calls
  await collection.insertOne({ _id: 'bad', title: 'Bad', read: 'no', attempts: 0, embedding: [1, 0, 0] });

  const result = await collection.findMany({
    read: false,
    attempts: { $gte: 1 },
  });
  const message: Message = result.rows[0];
  void message;

  const textHits = await collection.searchText('hello world', {
    filter: { read: false },
    limit: 10,
    match: 'all',
  });
  const searchedMessage: Message = textHits[0].document;
  const searchScore: number = textHits[0].score;
  void searchedMessage;
  void searchScore;
  // @ts-expect-error text-search metadata filters preserve document field types
  await collection.searchText('hello', { filter: { attempts: 'many' } });

  const vectorHits = await collection.searchVector('embedding', [1, 0, 0], {
    filter: { read: false },
    limit: 5,
    metric: 'cosine',
  });
  const vectorMessage: Message = vectorHits[0].document;
  const vectorScore: number = vectorHits[0].score;
  void vectorMessage;
  void vectorScore;
  // @ts-expect-error vector search fields must contain numeric vectors
  await collection.searchVector('title', [1, 0, 0]);
  // @ts-expect-error vector-search metadata filters preserve document field types
  await collection.searchVector('embedding', [1, 0, 0], { filter: { attempts: 'many' } });

  const hybridHits = await collection.searchHybrid({
    filter: { read: false },
    fusion: { strategy: 'rrf', textWeight: 1.5, vectorWeight: 1 },
    limit: 5,
    text: { query: 'hello', match: 'all' },
    vector: { field: 'embedding', metric: 'dot', query: [1, 0, 0] },
  });
  const hybridMessage: Message = hybridHits[0].document;
  const finalScore: number = hybridHits[0].score;
  const textScore: number | undefined = hybridHits[0].components.text?.score;
  void hybridMessage;
  void finalScore;
  void textScore;
  // @ts-expect-error hybrid vector fields must contain numeric vectors
  await collection.searchHybrid({ text: { query: 'hello' }, vector: { field: 'title', query: [1, 0, 0] } });
  // @ts-expect-error hybrid metadata filters preserve document field types
  await collection.searchHybrid({ filter: { attempts: 'many' }, text: { query: 'hello' }, vector: { field: 'embedding', query: [1, 0, 0] } });

  // @ts-expect-error filters use the collection's field types
  await collection.findMany({ attempts: 'many' });
  // @ts-expect-error unknown document fields are rejected
  await collection.findMany({ missing: true });

  await collection.updateMany(
    { _id: 'message-1' },
    { $set: { read: true } },
  );
  await collection.updateMany({}, { $inc: { attempts: 1 } });
  // @ts-expect-error updates preserve document field types
  await collection.updateMany({}, { $set: { read: 'yes' } });
  // @ts-expect-error increment only accepts numeric fields
  await collection.updateMany({}, { $inc: { title: 1 } });
  // @ts-expect-error document identity is immutable
  await collection.updateMany({}, { $set: { _id: 'replacement' } });

  const matched = await collection.aggregate([
    { $match: { read: true } },
    { $sort: { attempts: -1 } },
  ]);
  const matchedMessage: Message = matched[0];
  void matchedMessage;

  const summaries = await collection.aggregate<{ title: string }>([
    { $project: { title: 1, _id: 0 } },
  ]);
  const summaryTitle: string = summaries[0].title;
  void summaryTitle;

  // @ts-expect-error aggregation matches use the input document type
  await collection.aggregate([{ $match: { read: 'sometimes' } }]);

  const initialized = await database.initCollection<Message>('messages', {
    columns: [],
    indexes: [],
    vectorIndexes: [{ field: 'embedding', dimensions: 3 }],
  });
  const initializedResult = await initialized.findMany({ _id: 'message-1' });
  const initializedMessage: Message = initializedResult.rows[0];
  void initializedMessage;

  const count: number = await collection.count({ read: false });
  const deleted = await collection.deleteOne({ _id: 'message-1' });
  const deletedCount: number = deleted.deletedCount;
  const upserted = await collection.upsert(
    { title: 'new' },
    { title: 'new', read: false, attempts: 0, embedding: [1, 0, 0] },
  );
  const upsertedId: string | undefined = upserted.upsertedId;
  void count;
  void deletedCount;
  void upsertedId;

  // @ts-expect-error delete filters preserve document field types
  await collection.deleteMany({ attempts: 'never' });
  // @ts-expect-error upsert documents must contain the declared fields
  await collection.upsert({ title: 'bad' }, { title: 'bad' });
}
