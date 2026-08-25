/** Snapshot fields returned by WLED's `/json` endpoint. */
export interface WledSnapshot {
  /** Available effects of type `unknown`. */
  effects?: unknown;
  /** Device metadata of type `Record<string, unknown>`. */
  info?: Record<string, unknown>;
  /** Available palettes of type `unknown`. */
  palettes?: unknown;
  /** Current device state of type `Record<string, unknown>`. */
  state?: Record<string, unknown>;
}

/**
 * Parses a WLED command and restricts it to a JSON object.
 * @param {string} command JSON command payload.
 * @returns {Record<string, unknown>} Parsed WLED command.
 * @throws {Error} When the payload is not a JSON object.
 */
export function parseWledCommand(command: string): Record<string, unknown> {
  const value: unknown = JSON.parse(command);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A WLED command must be a JSON object.');

  return value as Record<string, unknown>;
}

/**
 * Converts a WLED leaf value into its MQTT payload representation.
 * @param {string | number | boolean} value WLED leaf value.
 * @returns {string} MQTT payload.
 */
export function toMqttPayload(value: string | number | boolean): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
