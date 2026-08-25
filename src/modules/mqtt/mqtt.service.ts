import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, type IClientOptions, type MqttClient } from 'mqtt';
import { CONFIG } from '~/config/config';
import { resolveMqttClientId } from './client-id';

export type MqttMessageHandler = (topic: string, payload: string) => void;
export interface MqttBridgeClient {
  publish(topic: string, payload: string | number | boolean | null): void;
  subscribe(topic: string, handler: MqttMessageHandler): () => void;
}

/**
 * Executes `MqttService`.
 */
@Injectable()
export class MqttService implements MqttBridgeClient, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private readonly client: MqttClient;
  private readonly subscriptions = new Map<string, Set<MqttMessageHandler>>();
  /**
   * Creates the class instance.
   */
  constructor() {
    const { mqtt } = CONFIG;
    const clientId = resolveMqttClientId(mqtt.clientId);
    const options: IClientOptions = {
      protocol: mqtt.protocol,
      host: mqtt.host,
      port: mqtt.port,
      clientId,
      username: mqtt.username,
      password: mqtt.password,
      keepalive: mqtt.keepAliveSeconds,
      reconnectPeriod: mqtt.reconnectDelayMs,
    };
    this.client = connect(options);
    this.client.on('error', (error) => this.logger.error('MQTT connection failed', error));
    this.client.on('message', (topic, payload) => this.dispatch(topic, payload.toString()));
  }
  /**
   * Executes `publish`.
   * @param topic - Value of type `string`.
   * @param payload - Value of type `string | number | boolean | null`.
   * @returns Result of type `void`.
   */
  publish(topic: string, payload: string | number | boolean | null) {
    this.client.publish(
      topic,
      payload === null ? '' : String(payload),
      { retain: false },
      (error) => error && this.logger.error(`Failed to publish ${topic}`, error),
    );
  }
  /**
   * Executes `subscribe`.
   * @param filter - Value of type `string`.
   * @param handler - Value of type `MqttMessageHandler`.
   * @returns Result of type `() => void`.
   */
  subscribe(filter: string, handler: MqttMessageHandler) {
    let handlers = this.subscriptions.get(filter);
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(filter, handlers);
      this.client.subscribe(filter, (error) => error && this.logger.error(`Failed to subscribe ${filter}`, error));
    }
    handlers.add(handler);
    return () => {
      const current = this.subscriptions.get(filter);
      if (!current) return;
      current.delete(handler);
      if (current.size) return;
      this.subscriptions.delete(filter);
      this.client.unsubscribe(filter);
    };
  }
  /**
   * Executes `onModuleDestroy`.
   * @returns Result of type `void`.
   */
  onModuleDestroy() {
    this.subscriptions.clear();
    this.client.end();
  }
  /**
   * Executes `dispatch`.
   * @param topic - Value of type `string`.
   * @param payload - Value of type `string`.
   * @returns Result of type `void`.
   */
  private dispatch(topic: string, payload: string) {
    for (const [filter, handlers] of this.subscriptions)
      if (matches(filter, topic))
        for (const handler of handlers)
          try {
            handler(topic, payload);
          } catch (error) {
            this.logger.error(`MQTT handler failed for ${filter}`, error);
          }
  }
}
/**
 * Executes `matches`.
 * @param filter - Value of type `string`.
 * @param topic - Value of type `string`.
 * @returns Result of type `boolean`.
 */
function matches(filter: string, topic: string) {
  const a = filter.split('/'),
    b = topic.split('/');
  return (
    a.every((part, index) => (part === '#' ? index === a.length - 1 : part === '+' || part === b[index])) &&
    (a.at(-1) === '#' || a.length === b.length)
  );
}
