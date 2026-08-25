import type { MqttBridgeClient, MqttMessageHandler } from '~/modules/mqtt/mqtt.service';
import { HttpMqttBridge } from './http-mqtt-bridge';

const subscribe = jest.fn((_topic: string, _handler: MqttMessageHandler) => jest.fn());

/** Minimal concrete bridge used to exercise shared lifecycle behaviour. */
class TestBridge extends HttpMqttBridge<{ id: string }> {
  /** Creates a concrete test bridge. @param {MqttBridgeClient} mqtt MQTT client stub. */
  public constructor(mqtt: MqttBridgeClient) {
    super({ id: 'test' }, mqtt, 'test', 'http://test');
  }

  public setup(): void {}

  public addPoll(key: string, interval: number, task: () => void | Promise<void>): void {
    this.poll(key, interval, task);
  }

  public addSubscription(topic: string, handler: MqttMessageHandler): () => void {
    return this.subscribe(topic, handler);
  }

  public cancel(key: string): void {
    this.cancelRequest(key);
  }

  public finish(key: string, controller: AbortController): void {
    this.finishRequest(key, controller);
  }

  public start(key: string): AbortController {
    return this.startRequest(key);
  }
}

describe('HttpMqttBridge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs due poll tasks only once per interval', () => {
    const bridge = createBridge();
    const task = jest.fn();
    bridge.addPoll('state', 100, task);

    bridge.loop(99);
    bridge.loop(100);
    bridge.loop(150);
    bridge.loop(200);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('replaces and cleans up requests and subscriptions during destruction', () => {
    const bridge = createBridge();
    const unsubscribe = bridge.addSubscription('wled/test/cmd', jest.fn());
    const first = bridge.start('snapshot');
    const second = bridge.start('snapshot');

    expect(first.signal.aborted).toBe(true);
    bridge.finish('snapshot', first);
    bridge.destroy();

    expect(second.signal.aborted).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('finishes and cancels the current request without affecting another key', () => {
    const bridge = createBridge();
    const current = bridge.start('state');
    const other = bridge.start('info');

    bridge.finish('state', current);
    bridge.cancel('state');
    bridge.cancel('info');

    expect(current.signal.aborted).toBe(false);
    expect(other.signal.aborted).toBe(true);
  });
});

/** Creates a test bridge backed by an MQTT client stub. @returns {TestBridge} Test bridge. */
function createBridge(): TestBridge {
  return new TestBridge({ publish: jest.fn(), subscribe } as MqttBridgeClient);
}
