import type { Config } from 'jest';
const config: Config = {
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  testEnvironment: 'node',
  moduleNameMapper: { '^~/(.*)$': '<rootDir>/src/$1' },
};
export default config;
