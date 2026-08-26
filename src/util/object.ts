/**
 * Executes `objectToMap`.
 * @param {unknown} value Value to flatten.
 * @param {string} prefix Initial path prefix.
 * @returns {Map<string, string | number | boolean>} Flattened MQTT-compatible values.
 */
export function objectToMap(value: unknown, prefix = ''): Map<string, string | number | boolean> {
  const result = new Map<string, string | number | boolean>();
  /**
   * Executes this implementation.
   * @param {unknown} current Current value.
   * @param {string} path Current path.
   * @returns {void} Nothing.
   */
  const visit = (current: unknown, path: string): void => {
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}/${index}`));
      return;
    }
    if (current && typeof current === 'object') {
      Object.entries(current).forEach(([key, entry]) => visit(entry, path ? `${path}/${key}` : key));
      return;
    }
    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean')
      result.set(path, current);
  };
  visit(value, prefix);
  return result;
}

/**
 * Executes `parseObject`.
 * @typeParam T Value type.
 * @param {T} value Value to return.
 * @returns {T} Unchanged value.
 */
export function parseObject<T>(value: T): T {
  return value;
}
