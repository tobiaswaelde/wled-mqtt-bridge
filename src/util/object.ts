/**
 * Executes `objectToMap`.
 * @param value - Value of type `unknown`.
 * @param prefix - Value of type `string`.
 * @returns Result of type `Map<string, string | number | boolean>`.
 */
export function objectToMap(value: unknown, prefix = ''): Map<string, string | number | boolean> {
  const result = new Map<string, string | number | boolean>();
  /**
   * Executes this implementation.
   * @param current - Value of type `unknown`.
   * @param path - Value of type `string`.
   * @returns Result of type `void`.
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
 * @param value - Value of type `T`.
 * @returns Result of type `T`.
 */
export function parseObject<T>(value: T): T {
  return value;
}
