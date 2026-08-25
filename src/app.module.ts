import { Module } from '@nestjs/common';
import { BridgeModule } from '~/modules/bridge.module';
import { HealthModule } from '~/modules/health/health.module';
/**
 * Executes `AppModule`.
 */
@Module({ imports: [HealthModule, BridgeModule] })
export class AppModule {}
