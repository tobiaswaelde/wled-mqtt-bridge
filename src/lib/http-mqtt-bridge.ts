import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import type { MqttBridgeClient, MqttMessageHandler } from '~/modules/mqtt/mqtt.service';

export interface BridgeInstance {
  setup(): void;
  loop(time: number): void;
  destroy(): void;
}

/**
 * Executes `HttpMqttBridge`.
 * @typeParam T Configuration object type.
 */
export abstract class HttpMqttBridge<T extends object> implements BridgeInstance {
  protected readonly api: AxiosInstance;
  protected readonly logger: Logger;
  private readonly requests = new Map<string, AbortController>();
  private readonly unsubscribers = new Set<() => void>();
  private readonly tasks = new Map<string, { interval: number; last: number; task: () => void | Promise<void> }>();

  /**
   * Creates the class instance.
   * @param {T} cfg Instance configuration.
   * @param {MqttBridgeClient} mqtt MQTT client.
   * @param {string} scope Logger scope.
   * @param {string} baseURL HTTP API base URL.
   */
  protected constructor(
    protected readonly cfg: T,
    protected readonly mqtt: MqttBridgeClient,
    scope: string,
    baseURL: string,
  ) {
    this.logger = new Logger(scope);
    this.api = axios.create({ baseURL });
  }

  /**
   * Executes `setup`.
   * @returns {void} Nothing.
   */
  abstract setup(): void;

  /**
   * Executes `loop`.
   * @param {number} time Current timestamp in milliseconds.
   * @returns {void} Nothing.
   */

  loop(time: number) {
    for (const task of this.tasks.values())
      if (time - task.last >= task.interval) {
        task.last = time;
        void task.task();
      }
  }

  /**
   * Executes `destroy`.
   * @returns {void} Nothing.
   */
  destroy() {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    for (const controller of this.requests.values()) controller.abort();
    this.unsubscribers.clear();
    this.requests.clear();
    this.tasks.clear();
  }

  /**
   * Executes `subscribe`.
   * @param {string} topic MQTT topic filter.
   * @param {MqttMessageHandler} handler MQTT message handler.
   * @returns {() => void} Unsubscribe callback.
   */
  protected subscribe(topic: string, handler: MqttMessageHandler) {
    const unsubscribe = this.mqtt.subscribe(topic, handler);
    this.unsubscribers.add(unsubscribe);
    return unsubscribe;
  }

  /**
   * Executes `poll`.
   * @param {string} key Unique poll task key.
   * @param {number} interval Poll interval in milliseconds.
   * @param {() => void | Promise<void>} task Poll task.
   * @returns {void} Nothing.
   */
  protected poll(key: string, interval: number, task: () => void | Promise<void>) {
    this.tasks.set(key, { interval, last: 0, task });
  }

  /**
   * Executes `startRequest`.
   * @param {string} key Unique request key.
   * @returns {AbortController} Controller for the new request.
   */
  protected startRequest(key: string) {
    this.requests.get(key)?.abort();
    const controller = new AbortController();
    this.requests.set(key, controller);
    return controller;
  }

  /**
   * Executes `finishRequest`.
   * @param {string} key Unique request key.
   * @param {AbortController} controller Request controller.
   * @returns {void} Nothing.
   */
  protected finishRequest(key: string, controller: AbortController) {
    if (this.requests.get(key) === controller) this.requests.delete(key);
  }

  /**
   * Executes `cancelRequest`.
   * @param {string} key Unique request key.
   * @returns {void} Nothing.
   */
  protected cancelRequest(key: string) {
    this.requests.get(key)?.abort();
    this.requests.delete(key);
  }
}
