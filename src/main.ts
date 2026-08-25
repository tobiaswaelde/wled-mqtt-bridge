import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
/**
 * Creates and starts the Nest HTTP application.
 * @returns {Promise<void>} Nothing after the HTTP server starts.
 */
export async function bootstrap(): Promise<void> {
  const { CONFIG } = await import('./config/config');
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(CONFIG.http.port, CONFIG.http.host);
}

/* istanbul ignore next -- executing this line would start an HTTP server in the test process. */
if (require.main === module) void bootstrap();
