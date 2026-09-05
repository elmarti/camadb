import { scanText, tokenize } from './text-search-reference';

it('normalizes Unicode deterministically', () => {
  expect(tokenize('Ｃafé, CAFÉ! road-map_2')).toEqual(['café', 'café', 'road', 'map', '2']);
});

it('ranks term frequency deterministically and supports all-term matching', () => {
  const rows = [
    { _id: 'first', body: 'cobalt harbor local record' },
    { _id: 'second', body: 'cobalt cobalt harbor record' },
    { _id: 'third', body: 'cobalt local durable record' },
  ];
  expect(scanText(rows, 'cobalt harbor', ['body']).map((hit) => hit.document._id)).toEqual([
    'second',
    'first',
    'third',
  ]);
  expect(scanText(rows, 'cobalt harbor', ['body'], 'all').map((hit) => hit.document._id)).toEqual([
    'second',
    'first',
  ]);
});
