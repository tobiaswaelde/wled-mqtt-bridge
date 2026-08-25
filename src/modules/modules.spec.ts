jest.mock('~/config/config', () => ({ CONFIG: { instances: [] } }));

import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '~/app.module';
import { BridgeModule } from './bridge.module';
import { HealthController } from './health/health.controller';
import { HealthModule } from './health/health.module';
import { MqttModule } from './mqtt/mqtt.module';

describe('Nest modules', () => {
  it('exposes the health endpoint and wires the application modules', () => {
    const name = process.env.npm_package_name;
    const version = process.env.npm_package_version;
    delete process.env.npm_package_name;
    delete process.env.npm_package_version;
    expect(new HealthController().getHealth()).toEqual(
      expect.objectContaining({ name: 'wled-mqtt-bridge', status: 'ok', uptime: expect.any(Number), version: '2.0.8' }),
    );
    process.env.npm_package_name = 'test-bridge';
    process.env.npm_package_version = '1.2.3';
    expect(new HealthController().getHealth()).toEqual(
      expect.objectContaining({ name: 'test-bridge', status: 'ok', uptime: expect.any(Number), version: '1.2.3' }),
    );
    if (name === undefined) delete process.env.npm_package_name;
    else process.env.npm_package_name = name;
    if (version === undefined) delete process.env.npm_package_version;
    else process.env.npm_package_version = version;
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toEqual(
      expect.arrayContaining([BridgeModule, HealthModule]),
    );
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, BridgeModule)).toEqual([MqttModule]);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, HealthModule)).toEqual([HealthController]);
  });
});
