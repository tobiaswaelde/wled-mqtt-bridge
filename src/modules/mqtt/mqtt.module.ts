import { Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';

/**
 * Executes `MqttModule`.
 */
@Module({ providers: [MqttService], exports: [MqttService] })
export class MqttModule {}
