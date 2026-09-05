import { parseStudioQuery } from './query-input';

it('parses each supported Studio query shape', () => {
  expect(parseStudioQuery('document', '{"status":{"$in":["ready"]}}')).toEqual({
    kind: 'document',
    filter: { status: { $in: ['ready'] } },
  });
  expect(parseStudioQuery('text', '  local memory  ')).toEqual({ kind: 'text', text: 'local memory', match: 'any' });
  expect(parseStudioQuery('vector', '{"field":"embedding","vector":[1,0],"metric":"dot"}')).toEqual({
    kind: 'vector',
    field: 'embedding',
    vector: [1, 0],
    metric: 'dot',
  });
  expect(parseStudioQuery('hybrid', '{"text":"local","field":"embedding","vector":[1,0]}')).toEqual({
    kind: 'hybrid',
    text: 'local',
    field: 'embedding',
    vector: [1, 0],
    metric: undefined,
    textWeight: undefined,
    vectorWeight: undefined,
  });
});

it('rejects malformed and non-finite query inputs', () => {
  expect(() => parseStudioQuery('document', '[]')).toThrow('JSON object');
  expect(() => parseStudioQuery('vector', '{"field":"embedding","vector":[]}')).toThrow('non-empty');
  expect(() => parseStudioQuery('hybrid', '{"text":"","field":"embedding","vector":[1]}')).toThrow('non-empty');
});
