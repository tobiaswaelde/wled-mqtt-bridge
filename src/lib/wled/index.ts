import { Agent } from 'node:http';
import WebSocket, { type RawData } from 'ws';
import { HttpMqttBridge } from '~/lib/http-mqtt-bridge';
import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import { WledConfig } from '~/types/config/wled';
import { objectToMap } from '~/util/object';

interface WledSnapshot {
  effects?: unknown;
  info?: Record<string, unknown>;
  palettes?: unknown;
  state?: Record<string, unknown>;
}

/**
 * Bridges a WLED device through one persistent WebSocket connection.
 *
 * WLED broadcasts its complete state and device info when clients connect and whenever the
 * lighting changes. Keeping that socket open avoids the repeated HTTP polling that can exhaust
 * the limited connection capacity of ESP-based WLED hardware.
 */
export class Wled extends HttpMqttBridge<WledConfig> {
  private readonly httpAgent = new Agent({ keepAlive: false });
  private commandsSubscribed = false;
  private connected = false;
  private connectionController?: AbortController;
  private destroyed = false;
  private hasPublishedConnectionStatus = false;
  private pingTimer?: NodeJS.Timeout;
  private pongTimeout?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private socket?: WebSocket;

  /**
   * Creates the class instance.
   * @param cfg - Value of type `{ id: string; enabled: boolean; topic: string; host: string; pingInterval: number; pongTimeout: number; reconnectInterval: number; }`.
   * @param mqtt - Value of type `MqttBridgeClient`.
   */
  constructor(cfg: WledConfig, mqtt: MqttBridgeClient) {
    super(cfg, mqtt, `WLED@${cfg.host}`, `http://${cfg.host}`);

    // The snapshot is intentionally a short-lived request: the WebSocket remains the only
    // persistent WLED connection.
    this.api.defaults.httpAgent = this.httpAgent;
  }

  //#region instance lifecycle
  /**
   * Executes `setup`.
   * @returns Result of type `void`.
   */
  public setup() {
    this.logger.debug(`Setting up WLED instance for host: ${this.cfg.host}`);
    this.subscribeCommands();
    this.setConnected(false);
    this.connect();
  }

  /**
   * Executes `destroy`.
   * @returns Result of type `void`.
   */
  public override destroy() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.connectionController?.abort();
    this.connectionController = undefined;
    this.socket = undefined;
    this.cancelRequest('snapshot');
    this.httpAgent.destroy();
    this.setConnected(false);

    super.destroy();
  }
  //#endregion

  //#region connection
  /**
   * Executes `connect`.
   * @returns Result of type `void`.
   */
  private connect() {
    if (this.destroyed || this.socket) return;

    this.clearReconnectTimer();
    const controller = new AbortController();
    const socket = new WebSocket(`ws://${this.cfg.host}/ws`);
    /**
     * Executes this implementation.
     * @returns Result of type `void`.
     */
    /**
     * Executes this implementation.
     * @returns Result of type `void`.
     */
    const abortSocket = () => {
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.terminate();
      }
    };

    controller.signal.addEventListener('abort', abortSocket, { once: true });
    this.connectionController = controller;
    this.socket = socket;

    socket.on('open', () => {
      if (!this.isCurrentSocket(socket, controller)) return;

      this.logger.log('Connected.');
      this.setConnected(true);
      this.startHeartbeat(socket, controller);
      void this.getSnapshot();
    });
    socket.on('message', (data) => this.handleMessage(socket, controller, data));
    socket.on('pong', () => this.handlePong(socket, controller));
    socket.on('error', (error) => this.handleSocketError(socket, controller, error));
    socket.on('close', () => this.handleSocketClose(socket, controller));
  }

  /**
   * Executes `handleSocketError`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @param error - Value of type `Error`.
   * @returns Result of type `void`.
   */
  private handleSocketError(socket: WebSocket, controller: AbortController, error: Error) {
    if (!this.isCurrentSocket(socket, controller)) return;

    this.logger.warn(`Connection failed: ${error.message}`);
    this.disconnect(socket, controller);
  }

  /**
   * Executes `handleSocketClose`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @returns Result of type `void`.
   */
  private handleSocketClose(socket: WebSocket, controller: AbortController) {
    if (!this.isCurrentSocket(socket, controller)) return;

    this.logger.warn('Disconnected.');
    this.disconnect(socket, controller);
  }

  /**
   * Executes `disconnect`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @returns Result of type `void`.
   */
  private disconnect(socket: WebSocket, controller: AbortController) {
    if (!this.isCurrentSocket(socket, controller)) return;

    this.stopHeartbeat();
    this.cancelRequest('snapshot');
    this.socket = undefined;
    this.connectionController = undefined;
    controller.abort();
    this.setConnected(false);

    if (!this.destroyed) {
      this.scheduleReconnect();
    }
  }

  /**
   * Executes `scheduleReconnect`.
   * @returns Result of type `void`.
   */
  private scheduleReconnect() {
    if (this.reconnectTimer || this.destroyed) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.cfg.reconnectInterval);
  }

  /**
   * Executes `clearReconnectTimer`.
   * @returns Result of type `void`.
   */
  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  /**
   * Executes `startHeartbeat`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @returns Result of type `void`.
   */
  private startHeartbeat(socket: WebSocket, controller: AbortController) {
    this.stopHeartbeat();

    this.pingTimer = setInterval(() => {
      if (!this.isCurrentSocket(socket, controller)) return;

      this.ping(socket, controller);
    }, this.cfg.pingInterval);
  }

  /**
   * Executes `ping`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @returns Result of type `void`.
   */
  private ping(socket: WebSocket, controller: AbortController) {
    if (this.pongTimeout) return;

    try {
      socket.ping();
      this.pongTimeout = setTimeout(() => {
        if (!this.isCurrentSocket(socket, controller)) return;

        this.logger.warn('Connection timed out.');
        this.disconnect(socket, controller);
      }, this.cfg.pongTimeout);
    } catch (error) {
      this.logger.warn(`Failed to ping WLED: ${error}`);
      this.disconnect(socket, controller);
    }
  }

  /**
   * Executes `stopHeartbeat`.
   * @returns Result of type `void`.
   */
  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }

    this.clearPongTimeout();
  }

  /**
   * Executes `clearPongTimeout`.
   * @returns Result of type `void`.
   */
  private clearPongTimeout() {
    if (!this.pongTimeout) return;

    clearTimeout(this.pongTimeout);
    this.pongTimeout = undefined;
  }

  /**
   * Executes `handlePong`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @returns Result of type `void`.
   */
  private handlePong(socket: WebSocket, controller: AbortController) {
    if (!this.isCurrentSocket(socket, controller)) return;

    this.clearPongTimeout();
  }

  /**
   * Executes `isCurrentSocket`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @returns Result of type `boolean`.
   */
  private isCurrentSocket(socket: WebSocket, controller: AbortController) {
    return !this.destroyed && this.socket === socket && this.connectionController === controller;
  }
  //#endregion

  //#region state
  /**
   * Executes `handleMessage`.
   * @param socket - Value of type `WebSocket`.
   * @param controller - Value of type `AbortController`.
   * @param data - Value of type `RawData`.
   * @returns Result of type `void`.
   */
  private handleMessage(socket: WebSocket, controller: AbortController, data: RawData) {
    if (!this.isCurrentSocket(socket, controller) || !data) return;

    const message = data.toString();
    if (!message) return;

    this.mqtt.publish(`${this.cfg.topic}/json`, message);

    try {
      this.publishObject('', JSON.parse(message) as Record<string, unknown>);
    } catch {
      this.logger.warn('Received invalid JSON from WLED.');
    }
  }

  /**
   * Executes `getSnapshot`.
   * @returns Result of type `Promise<void>`.
   */
  private async getSnapshot() {
    const controller = this.startRequest('snapshot');

    try {
      const res = await this.api.get<WledSnapshot>('/json', { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (res.data.state) this.publishObject('state', res.data.state);
      if (res.data.info) this.publishObject('info', res.data.info);
      if (res.data.effects !== undefined)
        this.mqtt.publish(`${this.cfg.topic}/effects`, JSON.stringify(res.data.effects));
      if (res.data.palettes !== undefined)
        this.mqtt.publish(`${this.cfg.topic}/palettes`, JSON.stringify(res.data.palettes));
    } catch (error) {
      if (controller.signal.aborted) return;

      this.logger.warn(`Failed to load WLED snapshot: ${error}`);
    } finally {
      this.finishRequest('snapshot', controller);
    }
  }

  /**
   * Executes `publishObject`.
   * @param prefix - Value of type `string`.
   * @param data - Value of type `Record<string, unknown>`.
   * @returns Result of type `void`.
   */
  private publishObject(prefix: string, data: Record<string, unknown>) {
    for (const [path, value] of objectToMap(data)) {
      const topic = [this.cfg.topic, prefix, path].filter(Boolean).join('/');
      this.mqtt.publish(topic, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }

  /**
   * Executes `setConnected`.
   * @param connected - Value of type `boolean`.
   * @returns Result of type `void`.
   */
  private setConnected(connected: boolean) {
    if (this.hasPublishedConnectionStatus && this.connected === connected) return;

    this.connected = connected;
    this.hasPublishedConnectionStatus = true;
    this.mqtt.publish(`${this.cfg.topic}/connected`, connected);
  }
  //#endregion

  //#region commands
  /**
   * Executes `subscribeCommands`.
   * @returns Result of type `void`.
   */
  private subscribeCommands() {
    if (this.commandsSubscribed) return;

    const commandTopic = `${this.cfg.topic}/cmd`;
    this.subscribe(commandTopic, (_, payload) => {
      if (payload === '') return;

      this.sendCommand(payload);
      this.mqtt.publish(commandTopic, null);
    });
    this.commandsSubscribed = true;
  }

  /**
   * Executes `sendCommand`.
   * @param command - Value of type `string`.
   * @returns Result of type `void`.
   */
  private sendCommand(command: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.logger.warn('Ignoring command because WLED is disconnected.');
      return;
    }

    try {
      const value = JSON.parse(command);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('A WLED command must be a JSON object.');
      }

      // `v` makes WLED return the resulting state immediately, avoiding a polling round-trip.
      this.socket.send(JSON.stringify({ ...value, v: true }));
    } catch (error) {
      this.logger.error('Error sending command to WLED.', error);
    }
  }
  //#endregion
}
