import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { commonSchema, instanceSchema } from './runtime';

describe('configuration contract', () => {
  it('applies common defaults', () => {
    expect(commonSchema.parse({ mqtt: { host: 'localhost', clientId: 'bridge' } })).toMatchObject({
      http: { port: 3000 },
      logging: { level: 'log' },
      mqtt: { port: 1883 },
    });
  });
  it('accepts an empty MQTT client ID', () => {
    expect(commonSchema.parse({ mqtt: { host: 'localhost', clientId: '' } }).mqtt.clientId).toBe('');
  });
  it('accepts multiple unique instance-shaped entries', () => {
    expect([
      instanceSchema.parse({ id: 'one', topic: 'home/one' }),
      instanceSchema.parse({ id: 'two', topic: 'home/two' }),
    ]).toHaveLength(2);
  });
  it('rejects topic-unsafe ids', () => {
    expect(() => instanceSchema.parse({ id: 'living room', topic: 'home/one' })).toThrow();
  });
  it('validates the example and rejects duplicate instance ids or topics', async () => {
    const file = path.resolve(__dirname, '../../config/config.example.yml');
    process.env.CONFIG_FILE = file;
    const { configSchema } = await import('./config');
    const example = load(readFileSync(file, 'utf8')) as { instances: Array<Record<string, unknown>> };
    const first = example.instances[0];
    expect(configSchema.parse(example).instances).toHaveLength(example.instances.length);
    expect(() => configSchema.parse({ ...example, instances: [first, { ...first, topic: 'home/other' }] })).toThrow();
    expect(() => configSchema.parse({ ...example, instances: [first, { ...first, id: 'other' }] })).toThrow();
  });
});
