import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import 'reflect-metadata';
import { ENV } from '~/config/env';

const logger = new Logger('APP');

/** Starts the HTTP API and the configured bridge instances. */
export async function bootstrap(): Promise<void> {
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // configuration
  app.enableShutdownHooks();

  // middlewares
  app.enableCors({ allowedHeaders: ['*'], origin: ENV.CORS_ORIGIN });

  // start app
  await app.listen(ENV.PORT, ENV.HOST);
  logger.log(`Application is running on ${await app.getUrl()}`);
}

/* istanbul ignore next -- executing this line would start an HTTP server in the test process. */
if (require.main === module || process.env.NODE_ENV === 'production') void bootstrap();
