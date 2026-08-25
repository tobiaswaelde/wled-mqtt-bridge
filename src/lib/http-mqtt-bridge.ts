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
 * @typeParam T - Generic type parameter `T`.
 */
export abstract class HttpMqttBridge<T extends object> implements BridgeInstance {
  protected readonly api: AxiosInstance;
  protected readonly logger: Logger;
  private readonly requests = new Map<string, AbortController>();
  private readonly unsubscribers = new Set<() => void>();
  private readonly tasks = new Map<string, { interval: number; last: number; task: () => void | Promise<void> }>();
  /**
   * Creates the class instance.
   * @param cfg - Value of type `T`.
   * @param mqtt - Value of type `MqttBridgeClient`.
   * @param scope - Value of type `string`.
   * @param baseURL - Value of type `string`.
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
   * @returns Result of type `void`.
   */
  abstract setup(): void;
  /**
   * Executes `loop`.
   * @param time - Value of type `number`.
   * @returns Result of type `void`.
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
   * @returns Result of type `void`.
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
   * @param topic - Value of type `string`.
   * @param handler - Value of type `MqttMessageHandler`.
   * @returns Result of type `() => void`.
   */
  protected subscribe(topic: string, handler: MqttMessageHandler) {
    const unsubscribe = this.mqtt.subscribe(topic, handler);
    this.unsubscribers.add(unsubscribe);
    return unsubscribe;
  }
  /**
   * Executes `poll`.
   * @param key - Value of type `string`.
   * @param interval - Value of type `number`.
   * @param task - Value of type `() => void | Promise<void>`.
   * @returns Result of type `void`.
   */
  protected poll(key: string, interval: number, task: () => void | Promise<void>) {
    this.tasks.set(key, { interval, last: 0, task });
  }
  /**
   * Executes `startRequest`.
   * @param key - Value of type `string`.
   * @returns Result of type `AbortController`.
   */
  protected startRequest(key: string) {
    this.requests.get(key)?.abort();
    const controller = new AbortController();
    this.requests.set(key, controller);
    return controller;
  }
  /**
   * Executes `finishRequest`.
   * @param key - Value of type `string`.
   * @param controller - Value of type `AbortController`.
   * @returns Result of type `void`.
   */
  protected finishRequest(key: string, controller: AbortController) {
    if (this.requests.get(key) === controller) this.requests.delete(key);
  }
  /**
   * Executes `cancelRequest`.
   * @param key - Value of type `string`.
   * @returns Result of type `void`.
   */
  protected cancelRequest(key: string) {
    this.requests.get(key)?.abort();
    this.requests.delete(key);
  }
}
