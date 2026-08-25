const mockLogger = { log: jest.fn(), warn: jest.fn() };

/** In-memory WebSocket implementation used to drive connection events deterministically. */
class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;
  public static readonly instances: MockWebSocket[] = [];

  public readonly ping = jest.fn();
  public readonly send = jest.fn();
  public readonly terminate = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  public readyState = MockWebSocket.CONNECTING;
  private readonly handlers = new Map<string, (...args: never[]) => void>();

  /** Creates a mock socket. @param {string} url WebSocket URL. */
  public constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  /**
   * Registers an event handler.
   * @param {string} event Event name.
   * @param {(...args: never[]) => void} handler Event handler.
   * @returns {MockWebSocket} Socket instance.
   */
  public on = jest.fn((event: string, handler: (...args: never[]) => void) => {
    this.handlers.set(event, handler);
    return this;
  });

  /**
   * Emits an event to its registered handler.
   * @param {string} event Event name.
   * @param {unknown[]} args Event arguments.
   * @returns {void} Nothing.
   */
  public emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.(...(args as never[]));
  }
}

jest.mock('ws', () => ({ __esModule: true, default: MockWebSocket }));

import { WledConnection } from './connection';

describe('WledConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockWebSocket.instances.length = 0;
  });

  afterEach(() => jest.useRealTimers());

  it('delivers messages and only sends while the socket is open', () => {
    const callbacks = createCallbacks();
    const connection = createConnection(callbacks);
    connection.connect();
    connection.connect();

    const socket = MockWebSocket.instances[0];
    expect(connection.send('{"on":true}')).toBe(false);
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');
    socket.emit('message', Buffer.from('{"state":{}}'));

    expect(callbacks.onConnected).toHaveBeenCalledTimes(1);
    expect(callbacks.onMessage).toHaveBeenCalledWith(Buffer.from('{"state":{}}'));
    expect(connection.send('{"on":true}')).toBe(true);
    expect(socket.send).toHaveBeenCalledWith('{"on":true}');
    expect(MockWebSocket.instances).toHaveLength(1);

    connection.destroy();
  });

  it('disconnects on an error, ignores stale events, and reconnects once', () => {
    jest.useFakeTimers();
    const callbacks = createCallbacks();
    const connection = createConnection(callbacks);
    connection.connect();
    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');
    socket.emit('error', new Error('offline'));
    socket.emit('message', Buffer.from('stale'));
    socket.emit('open');
    socket.emit('error', new Error('stale'));
    socket.emit('pong');
    socket.emit('close');

    expect(callbacks.onDisconnected).toHaveBeenCalledTimes(1);
    expect(callbacks.onMessage).not.toHaveBeenCalled();
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2);

    connection.destroy();
  });

  it('times out a missing pong and recovers from a throwing ping', () => {
    jest.useFakeTimers();
    const callbacks = createCallbacks();
    const connection = createConnection(callbacks);
    connection.connect();
    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');

    jest.advanceTimersByTime(10);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(20);
    expect(callbacks.onDisconnected).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100);
    const recovered = MockWebSocket.instances[1];
    recovered.readyState = MockWebSocket.OPEN;
    recovered.ping.mockImplementationOnce(() => {
      throw new Error('ping failed');
    });
    recovered.emit('open');
    jest.advanceTimersByTime(10);

    expect(callbacks.onDisconnected).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith('Failed to ping WLED: Error: ping failed');
    connection.destroy();
  });

  it('clears a pong timeout and does not reconnect after destruction', () => {
    jest.useFakeTimers();
    const callbacks = createCallbacks();
    const connection = createConnection(callbacks);
    connection.connect();
    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');
    jest.advanceTimersByTime(10);
    socket.emit('pong');
    socket.readyState = MockWebSocket.CLOSED;
    connection.destroy();
    connection.destroy();
    jest.advanceTimersByTime(1_000);

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(callbacks.onDisconnected).not.toHaveBeenCalled();
  });

  it('ignores a timeout callback left behind by a stale socket', () => {
    jest.useFakeTimers();
    const callbacks = createCallbacks();
    const connection = createConnection(callbacks);
    connection.connect();
    const socket = MockWebSocket.instances[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit('open');
    jest.advanceTimersByTime(10);

    (connection as unknown as { socket?: undefined }).socket = undefined;
    jest.advanceTimersByTime(20);

    expect(callbacks.onDisconnected).not.toHaveBeenCalled();
  });
});

/**
 * Creates callback spies for a WLED connection.
 * @returns {{ onConnected: jest.Mock; onDisconnected: jest.Mock; onMessage: jest.Mock }} Callback spies.
 */
function createCallbacks() {
  return { onConnected: jest.fn(), onDisconnected: jest.fn(), onMessage: jest.fn() };
}

/**
 * Creates a WLED connection with short test intervals.
 * @param {ReturnType<typeof createCallbacks>} callbacks Connection callback spies.
 * @returns {WledConnection} WLED connection.
 */
function createConnection(callbacks: ReturnType<typeof createCallbacks>): WledConnection {
  return new WledConnection(
    { ...callbacks, host: 'wled.local', pingInterval: 10, pongTimeout: 20, reconnectInterval: 100 },
    mockLogger as never,
  );
}
