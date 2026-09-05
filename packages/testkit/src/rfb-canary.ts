import { createCipheriv } from "node:crypto";

/** A deliberately small RFB client for synthetic sandbox release checks; never a product client. */
export interface RfbTransport {
  read(size: number): Promise<Buffer>;
  send(bytes: Uint8Array): void;
}

export async function authenticateRfb(transport: RfbTransport, password: string) {
  const version = (await transport.read(12)).toString("ascii");
  if (version !== "RFB 003.008\n") throw new Error("Canary requires RFB 3.8");
  transport.send(Buffer.from(version, "ascii"));
  const count = (await transport.read(1))[0]!;
  if (!count) throw new Error("RFB server refused the connection");
  const security = await transport.read(count);
  if (security.includes(1) || !security.includes(2)) {
    throw new Error("RFB server must require VNC authentication");
  }
  transport.send(Uint8Array.of(2));
  const challenge = await transport.read(16);
  const key = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    const byte = password.charCodeAt(i) || 0;
    for (let bit = 0; bit < 8; bit++) key[i] = key[i]! | (((byte >> bit) & 1) << (7 - bit));
  }
  // Three identical DES keys give standard DES while avoiding OpenSSL's disabled legacy cipher.
  const cipher = createCipheriv("des-ede3", Buffer.concat([key, key, key]), null);
  cipher.setAutoPadding(false);
  transport.send(Buffer.concat([cipher.update(challenge), cipher.final()]));
  if ((await transport.read(4)).readUInt32BE() !== 0) throw new Error("VNC authentication denied");
  transport.send(Uint8Array.of(1));
  const init = await transport.read(24);
  const nameLength = init.readUInt32BE(20);
  if (nameLength > 4096) throw new Error("Invalid RFB desktop name length");
  await transport.read(nameLength);
  return { width: init.readUInt16BE(0), height: init.readUInt16BE(2) };
}

export class CanaryRfbConnection implements RfbTransport {
  private buffer: Buffer = Buffer.alloc(0);
  private wake: (() => void) | undefined;
  private ended = false;
  private readonly closedPromise: Promise<void>;

  private constructor(private readonly socket: WebSocket) {
    socket.binaryType = "arraybuffer";
    socket.addEventListener("message", (event) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(event.data as ArrayBuffer)]);
      this.wake?.();
    });
    this.closedPromise = new Promise((resolve) => {
      const end = () => {
        this.ended = true;
        this.wake?.();
        resolve();
      };
      socket.addEventListener("close", end, { once: true });
      socket.addEventListener("error", end, { once: true });
    });
  }

  static async connect(url: string, password: string) {
    const socket = new WebSocket(url, ["binary"]);
    const connection = new CanaryRfbConnection(socket);
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          socket.addEventListener("open", () => resolve(), { once: true });
          socket.addEventListener("error", () => reject(new Error("RFB WebSocket failed")), {
            once: true,
          });
        }),
        connection.closedPromise.then(() => {
          throw new Error("RFB connection closed before opening");
        }),
        timeout(10_000),
      ]);
      await authenticateRfb(connection, password);
      return connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  async read(size: number): Promise<Buffer> {
    while (this.buffer.length < size) {
      if (this.ended) throw new Error("RFB connection closed");
      await Promise.race([
        new Promise<void>((resolve) => {
          this.wake = resolve;
        }),
        timeout(10_000),
      ]);
      this.wake = undefined;
    }
    const bytes = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return bytes;
  }

  send(bytes: Uint8Array) {
    this.socket.send(bytes);
  }
  move(x: number, y: number) {
    const event = Buffer.alloc(6);
    event[0] = 5;
    event.writeUInt16BE(x, 2);
    event.writeUInt16BE(y, 4);
    this.send(event);
  }
  close() {
    this.socket.close();
  }
  async expectClosed() {
    await Promise.race([this.closedPromise, timeout(5000)]);
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error("RFB canary timed out")), ms);
    timer.unref();
  });
}
