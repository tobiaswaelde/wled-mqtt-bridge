import { TypedEmitter } from '../util/typed-emitter';
import { ENV } from '../config/env';
import { logger } from '../config/logger';
import { Command, WledCommand } from '../types/wled-cmd';
import { WledEvents } from '../types/wled-events';
import { Http } from '../util/http';

export class Wled extends TypedEmitter<WledEvents> {
	private http: Http;
	private pollTimer: NodeJS.Timeout | null = null;
	private pollDelay: number = ENV.WLED_POLL_INTERVAL;
	private firstFailAt: number | null = null; // timestamp of first failure

	constructor(host: string) {
		super();
		this.http = new Http(host);

		// start polling
		this.startPolling();
	}

	public handleCommand(command: WledCommand) {
		logger.scope('WLED').start(`Handling command "${command.cmd}"...`);
		switch (command.cmd) {
			case Command.SetState:
				this.setState(command.state);
				break;
			case Command.GetState:
				this.getState();
				break;
			case Command.GetInfo:
				this.getInfo();
				break;
			case Command.GetEffects:
				this.getEffects();
				break;
			case Command.GetPalettes:
				this.getPalettes();
				break;
		}

		logger.scope('WLED').success(`Command "${command.cmd}" executed.`);
	}

	private startPolling() {
		if (this.pollTimer) clearTimeout(this.pollTimer);

		let delay = this.pollDelay;

		// if we've been failing for longer than the timeout, slow down
		if (this.firstFailAt && Date.now() - this.firstFailAt >= ENV.WLED_TIMEOUT) {
			delay = ENV.WLED_TIMEOUT_DURATION;
		}

		this.pollTimer = setTimeout(async () => {
			try {
				await this.getState();
				await this.getInfo();

				// successful → reset attempts + restore normal delay
				if (this.firstFailAt) {
					logger.scope('WLED').info('Connection restored, resetting delay');
				}
				this.firstFailAt = null;
				this.pollDelay = ENV.WLED_POLL_INTERVAL;

				this.emit('connected', undefined);
			} catch (err) {
				if (!this.firstFailAt) {
					this.firstFailAt = Date.now();
				}
				this.emit('disconnected', undefined);
				logger
					.scope('WLED')
					.warn(`Polling failed, first fail at ${new Date(this.firstFailAt).toISOString()}`);
			}

			// schedule next poll
			this.startPolling();
		}, delay);
	}

	private async setState(state: any) {
		try {
			await this.http.post('/json/state', state);
			await this.getState();
		} catch (err) {
			logger.scope('WLED').error('Failed to set state:', err);
		}
	}

	private async getEffects() {
		try {
			const effects = await this.http.get<string[]>('/json/eff');
			this.emit('effects', effects);
			logger.scope('WLED').debug(`Effects: ${JSON.stringify(effects)}`);
		} catch (err) {
			logger.scope('WLED').error('Failed to fetch effects');
		}
	}

	private async getPalettes() {
		try {
			const palettes = await this.http.get<string[]>('/json/pal');
			this.emit('palettes', palettes);
			logger.scope('WLED').debug(`Palettes: ${JSON.stringify(palettes)}`);
		} catch (err) {
			logger.scope('WLED').error('Failed to fetch palettes');
		}
	}

	private async getState() {
		const state = await this.http.get<object>('/json/state');
		this.emit('state', state);
		logger.scope('WLED').debug(`State: ${JSON.stringify(state)}`);
	}

	private async getInfo() {
		const info = await this.http.get<object>('/json/info');
		this.emit('info', info);
		logger.scope('WLED').debug(`Info: ${JSON.stringify(info)}`);
	}
}
