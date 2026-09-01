import { ICama } from '../src/interfaces/cama.interface';
import { ICollection } from '../src/interfaces/collection.interface';

interface Message {
  _id: string;
  title: string;
  read: boolean;
  attempts: number;
}

export async function assertCollectionContracts(
  database: ICama,
  collection: ICollection<Message>,
): Promise<void> {
  await collection.insertOne({
    _id: 'message-1',
    title: 'Hello',
    read: false,
    attempts: 0,
  });
  await collection.insertMany([{
    _id: 'message-2',
    title: 'Typed throughout',
    read: true,
    attempts: 1,
  }]);

  // @ts-expect-error required document fields cannot be omitted
  await collection.insertOne({ _id: 'incomplete' });
  // @ts-expect-error field types cannot change between calls
  await collection.insertOne({ _id: 'bad', title: 'Bad', read: 'no', attempts: 0 });

  const result = await collection.findMany({
    read: false,
    attempts: { $gte: 1 },
  });
  const message: Message = result.rows[0];
  void message;

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
  });
  const initializedResult = await initialized.findMany({ _id: 'message-1' });
  const initializedMessage: Message = initializedResult.rows[0];
  void initializedMessage;
}
