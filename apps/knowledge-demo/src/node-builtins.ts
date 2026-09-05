const unavailable = (): never => {
  throw new Error('The filesystem persistence adapter is unavailable in the browser knowledge demo.');
};

export const createHash = unavailable;
export const dirname = unavailable;
export const join = unavailable;
export const promises = new Proxy({}, { get: () => unavailable });
