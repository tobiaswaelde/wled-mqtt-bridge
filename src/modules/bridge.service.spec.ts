const mockSetup = jest.fn();
const mockLoop = jest.fn();
const mockDestroy = jest.fn();
const Wled = jest.fn(() => ({ destroy: mockDestroy, loop: mockLoop, setup: mockSetup }));

jest.mock('~/config/config', () => ({
  CONFIG: {
    instances: [
      {
        enabled: true,
        host: 'desk.local',
        id: 'desk',
        pingInterval: 1,
        pongTimeout: 1,
        reconnectInterval: 1,
        topic: 'wled/desk',
      },
      {
        enabled: false,
        host: 'off.local',
        id: 'off',
        pingInterval: 1,
        pongTimeout: 1,
        reconnectInterval: 1,
        topic: 'wled/off',
      },
    ],
  },
}));
jest.mock('~/lib/wled', () => ({ Wled }));

import { Test } from '@nestjs/testing';
import { BridgeModule } from './bridge.module';
import { BridgeService } from './bridge.service';
import { MqttService } from './mqtt/mqtt.service';

describe('BridgeService', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it('creates enabled bridges and runs their lifecycle on a single timer', () => {
    jest.useFakeTimers();
    const service = new BridgeService({} as never);
    service.onModuleInit();
    jest.advanceTimersByTime(1_000);
    service.onModuleDestroy();

    expect(Wled).toHaveBeenCalledTimes(1);
    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(mockLoop).toHaveBeenCalledWith(expect.any(Number));
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('destroys instances even when initialization has not started the timer', () => {
    const service = new BridgeService({} as never);
    service.onModuleDestroy();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('injects the MQTT provider through the Nest module', async () => {
    const mqtt = { publish: jest.fn(), subscribe: jest.fn() };
    const module = await Test.createTestingModule({ imports: [BridgeModule] })
      .overrideProvider(MqttService)
      .useValue(mqtt)
      .compile();

    expect(module.get(BridgeService)).toBeInstanceOf(BridgeService);
    expect(Wled).toHaveBeenCalledWith(expect.objectContaining({ id: 'desk' }), mqtt);
    await module.close();
  });
});
