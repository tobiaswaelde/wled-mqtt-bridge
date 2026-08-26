const app = {
  enableCors: jest.fn(),
  enableShutdownHooks: jest.fn(),
  getUrl: jest.fn().mockResolvedValue('http://127.0.0.1:3000'),
  listen: jest.fn().mockResolvedValue(undefined),
};
const create = jest.fn().mockResolvedValue(app);

jest.mock('@nestjs/core', () => ({ NestFactory: { create } }));
jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));

import { bootstrap } from './main';

describe('bootstrap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('configures CORS, enables shutdown hooks, and starts the configured listener', async () => {
    await bootstrap();

    expect(create).toHaveBeenCalledTimes(1);
    expect(app.enableCors).toHaveBeenCalledWith({ allowedHeaders: ['*'], origin: '*' });
    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(3000, '0.0.0.0');
  });
});
