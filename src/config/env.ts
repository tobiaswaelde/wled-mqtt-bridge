import { configDirectory } from './runtime';
export const ENV = {
  /**
   * Executes `CONFIG_PATH`.
   * @returns Result of type `string`.
   */
  get CONFIG_PATH() {
    return configDirectory();
  },
};
