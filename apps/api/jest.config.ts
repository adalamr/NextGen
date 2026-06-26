import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@platform/shared(.*)$':      '<rootDir>/../../../packages/shared/src$1',
    '^@platform/database(.*)$':    '<rootDir>/../../../packages/database/src$1',
    '^@platform/llm-gateway(.*)$': '<rootDir>/../../../packages/llm-gateway/src$1',
    '^@platform/connectors(.*)$':  '<rootDir>/../../../packages/connectors/src$1',
  },
  collectCoverageFrom: [
    'utils/**/*.ts',
    'middleware/**/*.ts',
    'modules/layer1-context/**/*.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches:   70,
      functions:  80,
      lines:      80,
      statements: 80,
    },
  },
  clearMocks: true,
  resetMocks: true,
};

export default config;
