const app = { enableShutdownHooks: jest.fn(), listen: jest.fn().mockResolvedValue(undefined) };
const create = jest.fn().mockResolvedValue(app);

jest.mock('@nestjs/core', () => ({ NestFactory: { create } }));
jest.mock('./config/config', () => ({ CONFIG: { http: { host: '127.0.0.1', port: 3000 } } }));
jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));

import { bootstrap } from './main';

describe('bootstrap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates the Nest app, enables shutdown hooks, and starts the configured listener', async () => {
    await bootstrap();

    expect(create).toHaveBeenCalledTimes(1);
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(3000, '127.0.0.1');
  });
});
