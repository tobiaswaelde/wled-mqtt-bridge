import { resolveMqttClientId } from './client-id';

describe('resolveMqttClientId', () => {
  it('preserves a configured client ID', () => {
    expect(resolveMqttClientId('wled-mqtt-bridge')).toBe('wled-mqtt-bridge');
  });

  it('creates a UUID when the client ID is empty', () => {
    expect(resolveMqttClientId('')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
