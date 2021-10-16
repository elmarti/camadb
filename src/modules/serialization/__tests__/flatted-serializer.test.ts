import { createMockContainer } from '../../../mocks/createMockContainer';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { TYPES } from '../../../types';
import { FlattedSerializer } from '../flatted-serializer';
import { ISerializer } from '../../../interfaces/serializer.interface';

let container:any = null;

beforeEach(() =>  {
  container = createMockContainer({
    persistenceAdapter: PersistenceAdapterEnum.InMemory
  })
  container.rebind(TYPES.Serializer)
    .to(FlattedSerializer);
})

it('serializes content in the Flatted format', () => {
  const serializer = container.get(TYPES.Serializer);
  const input = [{
    "Test":"Field 1"
  },
    {
      "Test":"Field 2"
    },{
      "Test":"Field 3"
    }];
  const serializationResult = serializer.serialize(input);
  const expectedOutput = `[["1","2","3"],{"Test":"4"},{"Test":"5"},{"Test":"6"},"Field 1","Field 2","Field 3"]`
  expect(serializationResult).toEqual(expectedOutput);
});

it('deserializes content from the Flatted format', () => {
  const serializer = container.get(TYPES.Serializer);
  const input = `[["1","2","3"],{"Test":"4"},{"Test":"5"},{"Test":"6"},"Field 1","Field 2","Field 3"]`

  const expectedOutput = [{
    "Test":"Field 1"
  },
    {
      "Test":"Field 2"
    },{
      "Test":"Field 3"
    }];
  const serializationResult = serializer.deserialize(input);
  expect(serializationResult).toEqual(expectedOutput);
});
