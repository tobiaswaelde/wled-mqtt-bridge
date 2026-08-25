import { configDirectory } from './runtime';

export const ENV = {
  /**
   * Executes `CONFIG_PATH`.
   * @returns {string} Configuration directory path.
   */
  get CONFIG_PATH() {
    return configDirectory();
  },
};
