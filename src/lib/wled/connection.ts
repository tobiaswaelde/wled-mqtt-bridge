import { Logger } from '@nestjs/common';
import WebSocket, { type RawData } from 'ws';

/** Callbacks emitted by a persistent WLED WebSocket connection. */
export interface WledConnectionCallbacks {
  /** Handles a successful socket connection. @returns {void} Nothing. */
  onConnected(): void;
  /** Handles a lost socket connection. @returns {void} Nothing. */
  onDisconnected(): void;
  /** Handles a WLED WebSocket message. @param {RawData} data Raw message. @returns {void} Nothing. */
  onMessage(data: RawData): void;
}

/** Configuration values required to keep a WLED WebSocket alive. */
export interface WledConnectionOptions extends WledConnectionCallbacks {
  /** WLED host name or IP address of type `string`. */
  host: string;
  /** Ping cadence in milliseconds of type `number`. */
  pingInterval: number;
  /** Maximum pong wait time in milliseconds of type `number`. */
  pongTimeout: number;
  /** Delay before a reconnect attempt in milliseconds of type `number`. */
  reconnectInterval: number;
}

/**
 * Owns exactly one reconnecting WebSocket connection to a WLED controller.
 *
 * Every event checks that it belongs to the current socket. That prevents delayed events from a
 * terminated connection from disconnecting or publishing state for its replacement.
 */
export class WledConnection {
  private controller?: AbortController;
  private destroyed = false;
  private pingTimer?: NodeJS.Timeout;
  private pongTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private socket?: WebSocket;

  /**
   * Creates a WLED connection manager.
   * @param {WledConnectionOptions} options Connection options and callbacks.
   * @param {Logger} logger Nest logger.
   */
  public constructor(
    private readonly options: WledConnectionOptions,
    private readonly logger: Logger,
  ) {}

  /** Starts the initial socket connection. @returns {void} Nothing. */
  public connect(): void {
    if (this.destroyed || this.socket) return;

    this.clearReconnectTimer();
    const controller = new AbortController();
    const socket = new WebSocket(`ws://${this.options.host}/ws`);
    controller.signal.addEventListener('abort', () => this.terminate(socket), { once: true });
    this.controller = controller;
    this.socket = socket;

    socket.on('open', () => this.handleOpen(socket, controller));
    socket.on('message', (data) => this.handleMessage(socket, controller, data));
    socket.on('pong', () => this.handlePong(socket, controller));
    socket.on('error', (error) => this.handleError(socket, controller, error));
    socket.on('close', () => this.handleClose(socket, controller));
  }

  /**
   * Sends data through the active socket.
   * @param {string} payload Serialized WLED command.
   * @returns {boolean} Whether the command was sent.
   */
  public send(payload: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.logger.warn('Ignoring command because WLED is disconnected.');
      return false;
    }

    this.socket.send(payload);
    return true;
  }

  /** Stops timers, terminates the socket, and prevents future reconnects. @returns {void} Nothing. */
  public destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.socket = undefined;
    this.controller?.abort();
    this.controller = undefined;
  }

  /**
   * Handles a successful WebSocket connection.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @returns {void} Nothing.
   */
  private handleOpen(socket: WebSocket, controller: AbortController): void {
    if (!this.isCurrent(socket, controller)) return;

    this.logger.log('Connected.');
    this.options.onConnected();
    this.startHeartbeat(socket, controller);
  }

  /**
   * Handles an incoming WebSocket message.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @param {RawData} data Raw WebSocket message.
   * @returns {void} Nothing.
   */
  private handleMessage(socket: WebSocket, controller: AbortController, data: RawData): void {
    if (this.isCurrent(socket, controller)) this.options.onMessage(data);
  }

  /**
   * Handles a socket error.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @param {Error} error Socket error.
   * @returns {void} Nothing.
   */
  private handleError(socket: WebSocket, controller: AbortController, error: Error): void {
    if (!this.isCurrent(socket, controller)) return;

    this.logger.warn(`Connection failed: ${error.message}`);
    this.disconnect(socket, controller);
  }

  /**
   * Handles a socket close event.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @returns {void} Nothing.
   */
  private handleClose(socket: WebSocket, controller: AbortController): void {
    if (!this.isCurrent(socket, controller)) return;

    this.logger.warn('Disconnected.');
    this.disconnect(socket, controller);
  }

  /**
   * Disconnects the active socket and schedules one reconnect.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @returns {void} Nothing.
   */
  private disconnect(socket: WebSocket, controller: AbortController): void {
    this.stopHeartbeat();
    this.socket = undefined;
    this.controller = undefined;
    controller.abort();
    this.options.onDisconnected();
    this.scheduleReconnect();
  }

  /** Schedules a reconnect. @returns {void} Nothing. */
  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.options.reconnectInterval);
  }

  /** Clears a pending reconnect timer. @returns {void} Nothing. */
  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  /**
   * Starts periodic ping checks for the current socket.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @returns {void} Nothing.
   */
  private startHeartbeat(socket: WebSocket, controller: AbortController): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => this.ping(socket, controller), this.options.pingInterval);
  }

  /**
   * Pings the current socket and waits for its pong.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @returns {void} Nothing.
   */
  private ping(socket: WebSocket, controller: AbortController): void {
    if (!this.isCurrent(socket, controller) || this.pongTimer) return;

    try {
      socket.ping();
      this.pongTimer = setTimeout(() => {
        if (!this.isCurrent(socket, controller)) return;

        this.logger.warn('Connection timed out.');
        this.disconnect(socket, controller);
      }, this.options.pongTimeout);
    } catch (error) {
      this.logger.warn(`Failed to ping WLED: ${error}`);
      this.disconnect(socket, controller);
    }
  }

  /** Stops heartbeat and pong timers. @returns {void} Nothing. */
  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    this.clearPongTimer();
  }

  /** Clears a pending pong timeout. @returns {void} Nothing. */
  private clearPongTimer(): void {
    if (!this.pongTimer) return;

    clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
  }

  /**
   * Handles a heartbeat pong.
   * @param {WebSocket} socket Current WebSocket.
   * @param {AbortController} controller Current connection controller.
   * @returns {void} Nothing.
   */
  private handlePong(socket: WebSocket, controller: AbortController): void {
    if (this.isCurrent(socket, controller)) this.clearPongTimer();
  }

  /**
   * Checks whether an event belongs to the active socket.
   * @param {WebSocket} socket Socket to check.
   * @param {AbortController} controller Controller to check.
   * @returns {boolean} Whether both belong to the active connection.
   */
  private isCurrent(socket: WebSocket, controller: AbortController): boolean {
    return !this.destroyed && this.socket === socket && this.controller === controller;
  }

  /**
   * Terminates a socket that has not already closed.
   * @param {WebSocket} socket Socket to terminate.
   * @returns {void} Nothing.
   */
  private terminate(socket: WebSocket): void {
    if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
  }
}
