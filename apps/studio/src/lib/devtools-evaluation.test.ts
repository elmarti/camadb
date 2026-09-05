import { evaluateDevtoolsExpression } from './devtools-evaluation';
import type { DevtoolsEvaluate } from './devtools-evaluation';

it('uses the callback result required by Chrome before version 151', async () => {
  const evaluate: DevtoolsEvaluate = (_expression, callback) => {
    callback?.({ accepted: true, protocol: 1 });
  };
  await expect(evaluateDevtoolsExpression(evaluate, 'probe', 'callback')).resolves.toEqual({
    accepted: true,
    protocol: 1,
  });
});

it('normalizes Firefox tuple and modern Chromium object promises', async () => {
  const firefox: DevtoolsEvaluate = () => Promise.resolve([{ ready: true }, undefined]);
  const chromium: DevtoolsEvaluate = () => Promise.resolve({ result: { ready: true }, exceptionInfo: undefined });

  await expect(evaluateDevtoolsExpression(firefox, 'poll', 'promise')).resolves.toEqual({ ready: true });
  await expect(evaluateDevtoolsExpression(chromium, 'poll', 'promise')).resolves.toEqual({ ready: true });
});

it('does not treat an empty Chrome exception-info object as a failure', async () => {
  const evaluate: DevtoolsEvaluate = (_expression, callback) => callback?.({ accepted: true }, {});
  await expect(evaluateDevtoolsExpression(evaluate, 'probe', 'callback')).resolves.toEqual({ accepted: true });
});

it('surfaces inspected-page evaluation exceptions in either API style', async () => {
  const callback: DevtoolsEvaluate = (_expression, done) => done?.(undefined, { value: 'callback failure' });
  const promise: DevtoolsEvaluate = () => Promise.resolve([undefined, { description: 'promise failure' }]);

  await expect(evaluateDevtoolsExpression(callback, 'probe', 'callback')).rejects.toThrow('callback failure');
  await expect(evaluateDevtoolsExpression(promise, 'probe', 'promise')).rejects.toThrow('promise failure');
});
