import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
/**
 * Executes `bootstrap`.
 * @returns Result of type `Promise<void>`.
 */
async function bootstrap() {
  const { CONFIG } = await import('./config/config');
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(CONFIG.http.port, CONFIG.http.host);
}
void bootstrap();
