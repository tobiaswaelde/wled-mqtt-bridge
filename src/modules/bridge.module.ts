import { Module } from '@nestjs/common';
import { MqttModule } from '~/modules/mqtt/mqtt.module';
import { BridgeService } from './bridge.service';

/**
 * Executes `BridgeModule`.
 */
@Module({ imports: [MqttModule], providers: [BridgeService] })
export class BridgeModule {}
