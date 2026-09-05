import { browser } from 'wxt/browser';
import { createProbeExpression, createProbePollExpression } from './page-probe';
import { STUDIO_PROTOCOL_VERSION } from './protocol';
import type { StudioCommand, StudioCommandResult, StudioProbeResponse } from './protocol';

interface EvaluationException {
  isError?: boolean;
  isException?: boolean;
  value?: string;
  description?: string;
}

interface PendingProbe {
  ready: boolean;
  value?: StudioProbeResponse;
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function evaluate<T>(expression: string): Promise<T> {
  const evaluation = await browser.devtools.inspectedWindow.eval(expression);
  const value = evaluation.result as T;
  const exception = evaluation.exceptionInfo as EvaluationException | undefined;
  if (exception)
    throw new Error(exception.description ?? exception.value ?? 'The inspected page rejected the Studio probe');
  return value;
}

export async function sendStudioCommand(command: StudioCommand, timeoutMs = 10000): Promise<StudioCommandResult> {
  const requestId = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  const accepted = await evaluate<{ accepted?: boolean; protocol?: number }>(createProbeExpression(command, requestId));
  if (!accepted?.accepted || accepted.protocol !== STUDIO_PROTOCOL_VERSION) {
    throw new Error('The inspected page did not accept the Cama Studio probe');
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = await evaluate<PendingProbe>(createProbePollExpression(requestId));
    if (pending?.ready) {
      if (!pending.value || pending.value.protocol !== STUDIO_PROTOCOL_VERSION) {
        throw new Error('The inspected page returned an incompatible Studio response');
      }
      if (pending.value.error) throw new Error(pending.value.error);
      if (!pending.value.result) throw new Error('The inspected page returned an empty Studio response');
      return pending.value.result;
    }
    await delay(30);
  }
  throw new Error('The inspected page did not respond to Cama Studio in time');
}
