export interface EvaluationException {
  isError?: boolean;
  isException?: boolean;
  value?: string;
  description?: string;
}

export type DevtoolsEvaluate = (
  expression: string,
  callback?: (result: unknown, exception?: EvaluationException) => void,
) => unknown;

function resultOrThrow<T>(result: unknown, exception?: EvaluationException): T {
  if (exception && (exception.isError || exception.isException || exception.description || exception.value)) {
    throw new Error(exception.description ?? exception.value ?? 'The inspected page rejected the Studio probe');
  }
  return result as T;
}

/** Normalizes callback-based Chromium and Promise-based Firefox/Safari evaluation. */
export async function evaluateDevtoolsExpression<T>(
  evaluate: DevtoolsEvaluate,
  expression: string,
  style: 'callback' | 'promise',
): Promise<T> {
  if (style === 'callback') {
    return new Promise<T>((resolve, reject) => {
      try {
        evaluate(expression, (result, exception) => {
          try {
            resolve(resultOrThrow<T>(result, exception));
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  const response = await evaluate(expression);
  if (Array.isArray(response)) return resultOrThrow<T>(response[0], response[1] as EvaluationException | undefined);
  if (response && typeof response === 'object' && 'exceptionInfo' in response) {
    const wrapped = response as { result?: unknown; exceptionInfo?: EvaluationException };
    return resultOrThrow<T>(wrapped.result, wrapped.exceptionInfo);
  }
  return response as T;
}
