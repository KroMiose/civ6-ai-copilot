import net from "node:net";
import { randomUUID } from "node:crypto";

const TAG_HANDSHAKE = 4;
const TAG_COMMAND = 3;
const TAG_OUTPUT = 0xffffffff;

export class TunerProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TunerProtocolError";
  }
}

export interface TunerConnectOptions {
  host?: string;
  ports?: number[];
  timeoutMs?: number;
  appName?: string;
}

export interface TunerFrame {
  tag: number;
  payload: Buffer;
}

export interface TunerConnectionInfo {
  host: string;
  port: number;
  stateCount: number;
}

export class TunerClient {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
  readonly states = new Map<string, number>();

  private buffer = Buffer.alloc(0);

  private constructor(
    private readonly socket: net.Socket,
    options: { host: string; port: number; timeoutMs: number }
  ) {
    this.host = options.host;
    this.port = options.port;
    this.timeoutMs = options.timeoutMs;
  }

  static async connect(options: TunerConnectOptions = {}): Promise<TunerClient> {
    const host = options.host ?? "127.0.0.1";
    const ports = options.ports?.length ? options.ports : [4318, 4319];
    const timeoutMs = options.timeoutMs ?? 8000;
    const appName = options.appName ?? "civ6-ai-copilot";
    const errors: string[] = [];

    for (const port of ports) {
      let socket: net.Socket | undefined;
      try {
        socket = await connectSocket(host, port, timeoutMs);
        socket.setNoDelay(true);
        const client = new TunerClient(socket, { host, port, timeoutMs });
        await client.sendFrame(TAG_HANDSHAKE, `APP:${appName}`);
        await client.sendFrame(TAG_HANDSHAKE, "LSQ:");
        await client.readStateList();
        if (client.states.size > 0) {
          return client;
        }
        errors.push(`${port}: connected but no Lua states`);
        client.close();
      } catch (error) {
        socket?.destroy();
        errors.push(`${port}: ${(error as Error).message}`);
      }
    }

    throw new TunerProtocolError(`no usable Civ6 tuner port: ${errors.join("; ")}`);
  }

  info(): TunerConnectionInfo {
    return {
      host: this.host,
      port: this.port,
      stateCount: this.states.size
    };
  }

  close(): void {
    this.socket.destroy();
  }

  async run(state: string | number, lua: string, options: { timeoutMs?: number } = {}): Promise<string> {
    const stateIndex = typeof state === "number" ? state : this.states.get(state);
    if (stateIndex === undefined) {
      throw new TunerProtocolError(`unknown Lua state ${JSON.stringify(state)}; available states: ${[...this.states.keys()].join(", ")}`);
    }

    const sentinel = `__CIV6_AI_COPILOT_TUNER_SENTINEL_${randomUUID().replace(/-/g, "")}`;
    await this.sendFrame(TAG_COMMAND, `CMD:${stateIndex}:${lua}\nprint("${sentinel}")`);

    const output: string[] = [];
    while (true) {
      const frame = await this.readFrame(options.timeoutMs);
      if (frame.tag !== TAG_OUTPUT) {
        continue;
      }

      const text = decodeOutput(frame.payload);
      const sentinelIndex = text.indexOf(sentinel);
      if (sentinelIndex >= 0) {
        const beforeSentinel = text.slice(0, sentinelIndex);
        if (beforeSentinel.length > 0) {
          output.push(beforeSentinel);
        }
        break;
      }
      output.push(text);
    }

    return output.join("\n");
  }

  private async readStateList(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const frame = await this.readFrame();
      if (frame.tag !== TAG_HANDSHAKE) {
        continue;
      }

      const states = parseStateList(frame.payload);
      if (states.size > 0) {
        this.states.clear();
        for (const [name, index] of states) {
          this.states.set(name, index);
        }
        return;
      }
    }
  }

  private async sendFrame(tag: number, text: string): Promise<void> {
    const payload = Buffer.from(`${text}\0`, "utf8");
    const frame = Buffer.alloc(8 + payload.byteLength);
    frame.writeUInt32LE(payload.byteLength, 0);
    frame.writeUInt32LE(tag >>> 0, 4);
    payload.copy(frame, 8);

    await new Promise<void>((resolve, reject) => {
      this.socket.write(frame, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private async readFrame(timeoutMs = this.timeoutMs): Promise<TunerFrame> {
    while (true) {
      const frame = this.takeFrame();
      if (frame) {
        return frame;
      }
      await this.readMore(timeoutMs);
    }
  }

  private takeFrame(): TunerFrame | undefined {
    if (this.buffer.byteLength < 8) {
      return undefined;
    }

    const length = this.buffer.readUInt32LE(0);
    if (this.buffer.byteLength < 8 + length) {
      return undefined;
    }

    const tag = this.buffer.readUInt32LE(4);
    const payload = this.buffer.subarray(8, 8 + length);
    this.buffer = this.buffer.subarray(8 + length);
    return { tag, payload };
  }

  private async readMore(timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.socket.off("data", onData);
        this.socket.off("error", onError);
        this.socket.off("close", onClose);
      };
      const onData = (chunk: Buffer): void => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        cleanup();
        resolve();
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onClose = (): void => {
        cleanup();
        reject(new TunerProtocolError("tuner socket closed"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new TunerProtocolError(`timed out waiting for tuner frame after ${timeoutMs}ms`));
      }, timeoutMs);

      this.socket.once("data", onData);
      this.socket.once("error", onError);
      this.socket.once("close", onClose);
    });
  }
}

export function chooseDefaultState(states: Map<string, number>): string | undefined {
  for (const preferred of ["civ6_ai_copilot", "InGame", "GameCore_Tuner", "Main State"]) {
    if (states.has(preferred)) {
      return preferred;
    }
  }

  return [...states.keys()].find((name) => /civ6_ai_copilot|copilot/i.test(name)) ?? [...states.keys()][0];
}

function parseStateList(payload: Buffer): Map<string, number> {
  const tokens = payload
    .toString("utf8")
    .split("\0")
    .filter((token) => token.length > 0);
  const states = new Map<string, number>();

  for (let index = 0; index < tokens.length - 1; index += 2) {
    const stateIndex = Number.parseInt(tokens[index], 10);
    const name = tokens[index + 1];
    if (Number.isInteger(stateIndex) && name) {
      states.set(name, stateIndex);
    }
  }

  return states;
}

function decodeOutput(payload: Buffer): string {
  const parts = payload.toString("utf8").split("\0");
  return parts.length >= 2 ? parts[1] : parts[0] ?? "";
}

async function connectSocket(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };
    const onConnect = (): void => {
      cleanup();
      resolve(socket);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new TunerProtocolError(`connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}
