import axios, { AxiosInstance } from 'axios';
import { TypedEmitter } from '../util/typed-emitter';
import { ENV } from '../config/env';
import { logger } from '../config/logger';
import { Command, WledCommand } from '../types/wled-cmd';
import { WledEvents } from '../types/wled-events';

export class Wled extends TypedEmitter<WledEvents> {
	private host: string;
	private api: AxiosInstance;
	private pollTimer: NodeJS.Timeout | null = null;
	private pollDelay: number = ENV.WLED_POLL_INTERVAL;
	private firstFailAt: number | null = null; // timestamp of first failure

	constructor(host: string) {
		super();
		this.host = host;

		this.api = axios.create({
			baseURL: this.host,
			timeout: ENV.WLED_TIMEOUT,
		});

		// start polling
		this.startPolling();
	}

	public handleCommand(command: WledCommand) {
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
			const res = await this.api.post('/json/state', state);
			console.log(res.data);

			await this.getState();
		} catch (err) {
			logger.scope('WLED').error('Failed to set state:', err);
		}
	}

	private async getEffects() {
		try {
			const res = await this.api.get<string[]>('/json/eff');
			this.emit('effects', res.data);
		} catch (err) {
			logger.scope('WLED').error('Failed to fetch effects');
		}
	}

	private async getPalettes() {
		try {
			const res = await this.api.get<string[]>('/json/pal');
			this.emit('palettes', res.data);
		} catch (err) {
			logger.scope('WLED').error('Failed to fetch palettes');
		}
	}

	private async getState() {
		const res = await this.api.get<object>('/json/state');
		this.emit('state', res.data);
	}

	private async getInfo() {
		try {
			const res = await this.api.get<object>('/json/info');
			this.emit('info', res.data);
		} catch (err) {
			logger.scope('WLED').error('Failed to fetch info');
		}
	}
}
