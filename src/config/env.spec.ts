import path from 'node:path';
import { ENV } from './env';

describe('ENV', () => {
  const originalConfigFile = process.env.CONFIG_FILE;

  afterEach(() => {
    if (originalConfigFile === undefined) delete process.env.CONFIG_FILE;
    else process.env.CONFIG_FILE = originalConfigFile;
  });

  it('derives the configuration directory from the configured file', () => {
    process.env.CONFIG_FILE = 'nested/config.yml';

    expect(ENV.CONFIG_PATH).toBe(path.resolve('nested'));
  });
});
