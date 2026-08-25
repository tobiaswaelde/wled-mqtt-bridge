import { Agent } from 'node:http';
import type { RawData } from 'ws';
import { HttpMqttBridge } from '~/lib/http-mqtt-bridge';
import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import { WledConfig } from '~/types/config/wled';
import { objectToMap } from '~/util/object';
import { WledConnection } from './connection';
import { parseWledCommand, toMqttPayload, type WledSnapshot } from './protocol';

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
  private destroyed = false;
  private hasPublishedConnectionStatus = false;
  private readonly connection: WledConnection;

  /**
   * Creates the class instance.
   * @param {WledConfig} cfg WLED instance configuration.
   * @param {MqttBridgeClient} mqtt MQTT client.
   */
  constructor(cfg: WledConfig, mqtt: MqttBridgeClient) {
    super(cfg, mqtt, `WLED@${cfg.host}`, `http://${cfg.host}`);
    this.api.defaults.httpAgent = this.httpAgent;
    this.connection = new WledConnection(
      {
        host: cfg.host,
        pingInterval: cfg.pingInterval,
        pongTimeout: cfg.pongTimeout,
        reconnectInterval: cfg.reconnectInterval,
        onConnected: () => {
          this.setConnected(true);
          void this.getSnapshot();
        },
        onDisconnected: () => {
          this.cancelRequest('snapshot');
          this.setConnected(false);
        },
        onMessage: (data) => this.handleMessage(data),
      },
      this.logger,
    );
  }

  //#region instance lifecycle
  /**
   * Executes `setup`.
   * @returns {void} Nothing.
   */
  public setup(): void {
    this.logger.debug(`Setting up WLED instance for host: ${this.cfg.host}`);
    this.subscribeCommands();
    this.setConnected(false);
    this.connection.connect();
  }

  /**
   * Executes `destroy`.
   * @returns {void} Nothing.
   */
  public override destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.connection.destroy();
    this.cancelRequest('snapshot');
    this.httpAgent.destroy();
    this.setConnected(false);

    super.destroy();
  }
  //#endregion

  //#region state
  /**
   * Executes `handleMessage`.
   * @param {RawData} data Raw WebSocket message.
   * @returns {void} Nothing.
   */
  private handleMessage(data: RawData): void {
    if (!data) return;

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
   * @returns {Promise<void>} Nothing after publishing the snapshot.
   */
  private async getSnapshot(): Promise<void> {
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
   * @param {string} prefix MQTT topic prefix.
   * @param {Record<string, unknown>} data WLED data object.
   * @returns {void} Nothing.
   */
  private publishObject(prefix: string, data: Record<string, unknown>): void {
    for (const [path, value] of objectToMap(data)) {
      const topic = [this.cfg.topic, prefix, path].filter(Boolean).join('/');
      this.mqtt.publish(topic, toMqttPayload(value));
    }
  }

  /**
   * Executes `setConnected`.
   * @param {boolean} connected Connection state.
   * @returns {void} Nothing.
   */
  private setConnected(connected: boolean): void {
    if (this.hasPublishedConnectionStatus && this.connected === connected) return;

    this.connected = connected;
    this.hasPublishedConnectionStatus = true;
    this.mqtt.publish(`${this.cfg.topic}/connected`, connected);
  }
  //#endregion

  //#region commands
  /**
   * Executes `subscribeCommands`.
   * @returns {void} Nothing.
   */
  private subscribeCommands(): void {
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
   * @param {string} command JSON command payload.
   * @returns {void} Nothing.
   */
  private sendCommand(command: string): void {
    try {
      // `v` makes WLED return the resulting state immediately, avoiding a polling round-trip.
      this.connection.send(JSON.stringify({ ...parseWledCommand(command), v: true }));
    } catch (error) {
      this.logger.error('Error sending command to WLED.', error);
    }
  }
  //#endregion
}
