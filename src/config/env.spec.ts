import path from 'node:path';
import { ENV } from './env';

describe('ENV', () => {
  const originalConfigFile = process.env.CONFIG_FILE;
  const originalCorsOrigin = process.env.CORS_ORIGIN;
  const originalHost = process.env.HOST;
  const originalPort = process.env.PORT;

  afterEach(() => {
    if (originalConfigFile === undefined) delete process.env.CONFIG_FILE;
    else process.env.CONFIG_FILE = originalConfigFile;
    if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalCorsOrigin;
    if (originalHost === undefined) delete process.env.HOST;
    else process.env.HOST = originalHost;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  });

  it('loads HTTP settings during environment initialization', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.net';
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '3100';
    jest.resetModules();
    const { ENV: configuredEnv } = await import('./env');

    expect(configuredEnv.CORS_ORIGIN).toBe('https://app.example.net');
    expect(configuredEnv.HOST).toBe('127.0.0.1');
    expect(configuredEnv.PORT).toBe(3100);
  });

  it('derives the configuration directory from the configured file', () => {
    process.env.CONFIG_FILE = 'nested/config.yml';

    expect(ENV.CONFIG_PATH).toBe(path.resolve('nested'));
  });
});
