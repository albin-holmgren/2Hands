import { createServer } from "node:http";
import type { Socket } from "node:net";

export const STRIPE_DELIVERY_BODY_LIMIT = 1_048_576;

/** Public tunnel ingress exposes one random POST path and no application/admin endpoints. */
export async function startStripeDeliveryServer(options: {
  path: string;
  webhook: (request: Request) => Response | Promise<Response>;
  delivered: (body: string, status: number) => void;
}) {
  if (!/^\/stripe-delivery\/[a-f0-9]{48}$/.test(options.path))
    throw new Error("A random 192-bit Stripe delivery path is required.");
  const sockets = new Set<Socket>();
  const server = createServer({ maxHeaderSize: 16_384 }, async (request, response) => {
    response.setHeader("cache-control", "no-store");
    if (request.url !== options.path || request.method !== "POST") {
      response.writeHead(404).end();
      request.resume();
      return;
    }
    if (typeof request.headers["stripe-signature"] !== "string") {
      response.writeHead(400).end();
      request.resume();
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > STRIPE_DELIVERY_BODY_LIMIT) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      const result = await options.webhook(
        new Request("http://127.0.0.1/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": request.headers["stripe-signature"] },
          body,
        }),
      );
      // The production route verifies signatures and returns only a bounded JSON acknowledgement.
      const output = await result.text();
      if (Buffer.byteLength(output) > 8192) throw new Error("Unexpected webhook response size");
      options.delivered(body, result.status);
      response.writeHead(result.status, { "content-type": "application/json" }).end(output);
    } catch {
      if (!response.headersSent) response.writeHead(503).end();
      else response.destroy();
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 1000;
  server.maxConnections = 16;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Webhook server did not listen");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
