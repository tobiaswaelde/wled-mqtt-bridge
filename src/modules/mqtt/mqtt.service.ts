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
   * @param {string} topic MQTT topic.
   * @param {string | number | boolean | null} payload MQTT payload.
   * @returns {void} Nothing.
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
   * @param {string} filter MQTT topic filter.
   * @param {MqttMessageHandler} handler MQTT message handler.
   * @returns {() => void} Unsubscribe callback.
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
   * @returns {void} Nothing.
   */
  onModuleDestroy() {
    this.subscriptions.clear();
    this.client.end();
  }
  /**
   * Executes `dispatch`.
   * @param {string} topic MQTT topic.
   * @param {string} payload MQTT payload.
   * @returns {void} Nothing.
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
 * @param {string} filter MQTT topic filter.
 * @param {string} topic MQTT topic.
 * @returns {boolean} Whether the topic matches the filter.
 */
function matches(filter: string, topic: string) {
  const a = filter.split('/'),
    b = topic.split('/');
  return (
    a.every((part, index) => (part === '#' ? index === a.length - 1 : part === '+' || part === b[index])) &&
    (a.at(-1) === '#' || a.length === b.length)
  );
}
