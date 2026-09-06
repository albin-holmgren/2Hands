import { describe, expect, it } from "vitest";
import { authenticateRfb, type RfbTransport } from "./rfb-canary.js";

function transport(parts: Buffer[]): RfbTransport & { sent: Buffer[] } {
  let buffered = Buffer.concat(parts);
  const sent: Buffer[] = [];
  return {
    sent,
    async read(size) {
      if (buffered.length < size) throw new Error("fixture exhausted");
      const bytes = buffered.subarray(0, size);
      buffered = buffered.subarray(size);
      return bytes;
    },
    send(bytes) {
      sent.push(Buffer.from(bytes));
    },
  };
}
const version = Buffer.from("RFB 003.008\n");
describe("release canary RFB authentication", () => {
  it("rejects anonymous RFB before sending any credential", async () => {
    const channel = transport([version, Buffer.from([2, 1, 2])]);
    await expect(authenticateRfb(channel, "test-key")).rejects.toThrow(
      /must require VNC authentication/,
    );
    expect(channel.sent).toEqual([version]);
  });
  it("distinguishes an old rejected password from an authenticated desktop", async () => {
    const channel = transport([
      version,
      Buffer.from([1, 2]),
      Buffer.alloc(16),
      Buffer.from([0, 0, 0, 1]),
    ]);
    await expect(authenticateRfb(channel, "test-key")).rejects.toThrow("VNC authentication denied");
    expect(channel.sent.map((bytes) => bytes.length)).toEqual([12, 1, 16]);
  });
  it("finishes only after authenticated server initialization", async () => {
    const init = Buffer.alloc(24);
    init.writeUInt16BE(1280, 0);
    init.writeUInt16BE(800, 2);
    init.writeUInt32BE(4, 20);
    const channel = transport([
      version,
      Buffer.from([1, 2]),
      Buffer.alloc(16),
      Buffer.alloc(4),
      init,
      Buffer.from("test"),
    ]);
    await expect(authenticateRfb(channel, "test-key")).resolves.toEqual({
      width: 1280,
      height: 800,
    });
    expect(channel.sent.map((bytes) => bytes.length)).toEqual([12, 1, 16, 1]);
  });
});
