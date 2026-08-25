import { Controller, Get } from '@nestjs/common';
/**
 * Executes `HealthController`.
 */
@Controller('health')
export class HealthController {
  /**
   * Executes `getHealth`.
   * @returns Result of type `{ status: string; name: string; version: string; uptime: number; }`.
   */
  @Get() getHealth() {
    return {
      status: 'ok',
      name: process.env.npm_package_name ?? 'wled-mqtt-bridge',
      version: process.env.npm_package_version ?? '2.0.8',
      uptime: process.uptime(),
    };
  }
}
