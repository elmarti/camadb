import { Cama as CoreCama } from '@camadb/core';
import { Cama } from './index';

it('re-exports the supported core entry point', () => {
  expect(Cama).toBe(CoreCama);
});
