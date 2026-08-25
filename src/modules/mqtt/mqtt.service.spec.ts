const client = {
  end: jest.fn(),
  on: jest.fn(),
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
};
const connect = jest.fn(() => client);

jest.mock('mqtt', () => ({ connect }));
jest.mock('~/config/config', () => ({
  CONFIG: {
    mqtt: {
      clientId: 'wled-mqtt-bridge',
      host: 'mqtt.local',
      keepAliveSeconds: 30,
      password: 'secret',
      port: 1883,
      protocol: 'mqtt',
      reconnectDelayMs: 5000,
      username: 'user',
    },
  },
}));

import { Logger } from '@nestjs/common';
import { resolveMqttClientId } from './client-id';
import { MqttService } from './mqtt.service';

describe('MqttService', () => {
  const listeners = new Map<string, (...args: never[]) => void>();
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    client.on.mockImplementation((event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, listener);
      return client;
    });
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => error.mockRestore());

  it('connects with the configured options and reports publish errors', () => {
    client.publish.mockImplementation(
      (_topic: string, _payload: string, _options: unknown, callback: (publishError?: Error) => void) =>
        callback(new Error('denied')),
    );
    const service = new MqttService();
    listeners.get('error')?.(new Error('offline') as never);
    service.publish('wled/test/cmd', null);

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'wled-mqtt-bridge', host: 'mqtt.local', protocol: 'mqtt' }),
    );
    expect(client.publish).toHaveBeenCalledWith('wled/test/cmd', '', { retain: false }, expect.any(Function));
    expect(error).toHaveBeenCalledWith('MQTT connection failed', expect.any(Error));
    expect(error).toHaveBeenCalledWith('Failed to publish wled/test/cmd', expect.any(Error));
  });

  it('preserves configured client IDs and generates one for an empty value', () => {
    expect(resolveMqttClientId('configured')).toBe('configured');
    expect(resolveMqttClientId('')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('publishes scalar values and reports subscription errors', () => {
    client.subscribe.mockImplementation((_filter: string, callback: (subscriptionError?: Error) => void) =>
      callback(new Error('denied')),
    );
    const service = new MqttService();
    service.publish('wled/test/brightness', 128);
    service.subscribe('home/test', jest.fn());

    expect(client.publish).toHaveBeenCalledWith('wled/test/brightness', '128', { retain: false }, expect.any(Function));
    expect(error).toHaveBeenCalledWith('Failed to subscribe home/test', expect.any(Error));
  });

  it('routes exact and wildcard subscriptions, isolates handler failures, and unsubscribes once', () => {
    const service = new MqttService();
    const exact = jest.fn();
    const plus = jest.fn();
    const hash = jest.fn();
    const failing = jest.fn(() => {
      throw new Error('handler failed');
    });
    const removeExact = service.subscribe('home/desk/cmd', exact);
    const removeSecondExact = service.subscribe('home/desk/cmd', failing);
    const removePlus = service.subscribe('home/+/cmd', plus);
    const removeHash = service.subscribe('home/#', hash);

    listeners.get('message')?.('home/desk/cmd' as never, Buffer.from('payload') as never);
    listeners.get('message')?.('home/desk/state' as never, Buffer.from('state') as never);

    expect(exact).toHaveBeenCalledWith('home/desk/cmd', 'payload');
    expect(plus).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('MQTT handler failed for home/desk/cmd', expect.any(Error));
    expect(client.subscribe).toHaveBeenCalledTimes(3);

    removeExact();
    removeSecondExact();
    removePlus();
    removeHash();
    removeHash();
    expect(client.unsubscribe).toHaveBeenCalledTimes(3);
  });

  it('ends the client when the module is destroyed', () => {
    const service = new MqttService();
    service.onModuleDestroy();

    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
