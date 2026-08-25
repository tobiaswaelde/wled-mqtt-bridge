const mockAxiosGet = jest.fn();
const mockAxiosCreate = jest.fn(() => ({ defaults: {}, get: mockAxiosGet }));
const mockMqttPublish = jest.fn();
const mockMqttSubscribe = jest.fn((_topic: string, _handler: (topic: string, payload: string) => void) => jest.fn());

/**
 * Executes `MockWebSocket`.
 */
class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;
  public static readonly instances: MockWebSocket[] = [];

  public readonly close = jest.fn();
  public readonly ping = jest.fn();
  public readonly send = jest.fn();
  public readonly terminate = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  public readyState = MockWebSocket.CONNECTING;

  private readonly handlers = new Map<string, (...args: unknown[]) => void>();

  /**
   * Creates the class instance.
   * @param url - Value of type `string`.
   */
  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  public on = jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    this.handlers.set(event, handler);
    return this;
  });

  /**
   * Executes `emit`.
   * @param event - Value of type `string`.
   * @param args - Value of type `unknown[]`.
   * @returns Result of type `void`.
   */
  public emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }
}

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: mockAxiosCreate },
}));
jest.mock('ws', () => ({
  __esModule: true,
  default: MockWebSocket,
}));

import type { MqttBridgeClient } from '~/modules/mqtt/mqtt.service';
import { Wled } from './index';

describe('Wled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockWebSocket.instances.length = 0;
    mockAxiosGet.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes disconnected before the first connection attempt', () => {
    const wled = createWled();
    wled.setup();

    expect(mockMqttPublish).toHaveBeenCalledWith('wled/test/connected', false);

    wled.destroy();
  });

  it('forwards WebSocket state immediately and sends MQTT commands over the same connection', () => {
    const wled = createWled();
    wled.setup();

    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');
    socket.emit('message', Buffer.from('{"state":{"on":true,"bri":128},"info":{"name":"Desk"}}'));

    expect(mockMqttPublish).toHaveBeenCalledWith('wled/test/connected', true);
    expect(mockMqttPublish).toHaveBeenCalledWith(
      'wled/test/json',
      '{"state":{"on":true,"bri":128},"info":{"name":"Desk"}}',
    );
    expect(mockMqttPublish).toHaveBeenCalledWith('wled/test/state/on', 'true');
    expect(mockMqttPublish).toHaveBeenCalledWith('wled/test/info/name', 'Desk');

    const handleCommand = mockMqttSubscribe.mock.calls[0][1] as (topic: string, payload: string) => void;
    handleCommand('wled/test/cmd', '{"on":false}');

    expect(socket.send).toHaveBeenCalledWith('{"on":false,"v":true}');
    expect(mockMqttPublish).toHaveBeenCalledWith('wled/test/cmd', null);

    wled.destroy();
  });

  it('keeps only one socket, reconnects once after a close, and accepts heartbeat pongs', () => {
    jest.useFakeTimers();
    const wled = createWled({ pingInterval: 1_000, reconnectInterval: 5_000 });
    wled.setup();

    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');

    jest.advanceTimersByTime(1_000);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    socket.emit('pong');
    jest.advanceTimersByTime(1_000);
    expect(socket.ping).toHaveBeenCalledTimes(2);

    socket.emit('close');
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5_000);
    expect(MockWebSocket.instances).toHaveLength(2);

    wled.destroy();
    jest.advanceTimersByTime(5_000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('publishes offline when a heartbeat pong is missing', () => {
    jest.useFakeTimers();
    const wled = createWled({ pingInterval: 1_000, pongTimeout: 100 });
    wled.setup();

    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');

    jest.advanceTimersByTime(1_100);

    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(mockMqttPublish).toHaveBeenCalledWith('wled/test/connected', false);

    wled.destroy();
  });

  it('aborts the snapshot request and terminates the socket during shutdown', () => {
    mockAxiosGet.mockImplementation(() => new Promise(() => undefined));
    const wled = createWled();
    wled.setup();

    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');

    const signal = mockAxiosGet.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    wled.destroy();

    expect(signal.aborted).toBe(true);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });
});

/**
 * Executes `createWled`.
 * @param overrides - Value of type `Partial<{ pingInterval: number; pongTimeout: number; reconnectInterval: number; }>`.
 * @returns Result of type `Wled`.
 */
function createWled(overrides: Partial<{ pingInterval: number; pongTimeout: number; reconnectInterval: number }> = {}) {
  return new Wled(
    {
      enabled: true,
      id: 'test',
      host: 'wled.local',
      pingInterval: 60_000,
      pongTimeout: 5_000,
      reconnectInterval: 15_000,
      topic: 'wled/test',
      ...overrides,
    },
    { publish: mockMqttPublish, subscribe: mockMqttSubscribe } as MqttBridgeClient,
  );
}
