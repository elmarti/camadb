import { createMockContainer } from '../../../mocks/createMockContainer';
import { PersistenceAdapterEnum } from '../../../interfaces/perisistence-adapter.enum';
import { TYPES } from '../../../types';
import { FlattedSerializer } from '../flatted-serializer';

let container:any = null;

beforeEach(() =>  {
  container = createMockContainer({
    persistenceAdapter: PersistenceAdapterEnum.InMemory
  })
  container.rebind(TYPES.Serializer)
    .to(FlattedSerializer);
})

it('works', () => {
  expect(1).toBe(1);
});
