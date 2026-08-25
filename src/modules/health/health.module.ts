import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
/**
 * Executes `HealthModule`.
 */
@Module({ controllers: [HealthController] })
export class HealthModule {}
