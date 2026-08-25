import { parseWledCommand, toMqttPayload } from './protocol';

describe('WLED protocol helpers', () => {
  it('accepts object commands and rejects every other JSON value', () => {
    expect(parseWledCommand('{"on":true}')).toEqual({ on: true });

    for (const command of ['null', '[]', 'true', '"text"']) expect(() => parseWledCommand(command)).toThrow();
  });

  it('preserves strings and serializes scalar JSON values', () => {
    expect(toMqttPayload('Desk')).toBe('Desk');
    expect(toMqttPayload(42)).toBe('42');
    expect(toMqttPayload(false)).toBe('false');
  });
});
