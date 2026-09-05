module.exports = {
  rootDir: '.',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  setupFiles: ['fake-indexeddb/auto'],
  testMatch: [
    '<rootDir>/packages/**/?(*.)+(spec|test).ts',
    '<rootDir>/apps/**/?(*.)+(spec|test).ts',
    '<rootDir>/tests/**/?(*.)+(spec|test).ts',
  ],
  moduleNameMapper: {
    '^@camadb/core$': '<rootDir>/packages/core/src/index.ts',
    '^@camadb/memory$': '<rootDir>/packages/memory/src/index.ts',
    '^@camadb/test-utils$': '<rootDir>/packages/test-utils/src/index.ts',
    '^camadb$': '<rootDir>/packages/camadb/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
