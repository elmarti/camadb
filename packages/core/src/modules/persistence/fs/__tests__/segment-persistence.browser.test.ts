describe('filesystem module browser loading', () => {
  it('does not read Node Buffer while the module graph initializes', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Buffer');
    Object.defineProperty(globalThis, 'Buffer', { configurable: true, value: undefined, writable: true });
    try {
      jest.isolateModules(() => {
        expect(() => require('../segment-persistence')).not.toThrow();
      });
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'Buffer', descriptor);
    }
  });
});
