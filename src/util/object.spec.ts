import { objectToMap, parseObject } from './object';

describe('object utilities', () => {
  it('flattens nested objects and arrays while retaining MQTT-compatible leaves', () => {
    expect(
      objectToMap({ state: { on: true, segments: [{ bri: 120 }] }, ignored: null, nested: { value: 'text' } }),
    ).toEqual(
      new Map<string, string | number | boolean>([
        ['state/on', true],
        ['state/segments/0/bri', 120],
        ['nested/value', 'text'],
      ]),
    );
  });

  it('supports a prefix and leaves values unchanged in parseObject', () => {
    expect(objectToMap(false, 'state')).toEqual(new Map([['state', false]]));
    expect(parseObject({ on: true })).toEqual({ on: true });
  });
});
