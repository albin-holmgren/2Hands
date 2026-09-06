import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import tls from "node:tls";
import {
  proxyUpstreamRequestHeaders,
  resolveNovncTarget,
  safeProxyResponseHeaders,
  stripSensitiveHandshakeHeaders,
} from "./screen-proxy.js";

export function attachNovncProxy(server: NodeJS.EventEmitter, secret: string) {
  const previous = server.listeners("request").slice() as http.RequestListener[];
  server.removeAllListeners("request");
  server.on("request", (req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.startsWith("/novnc/")) {
      proxyNovncHttp(req, res, secret);
      return;
    }
    for (const listener of previous) listener(req, res);
  });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!req.url?.startsWith("/novnc/")) return;
    proxyNovncUpgrade(req, socket, head, secret);
  });
}

function proxyNovncHttp(req: IncomingMessage, res: ServerResponse, secret: string) {
  const target = resolveNovncTarget(req.url, secret);
  if (!target) {
    res.statusCode = 403;
    res.end("Invalid or expired screen capability");
    return;
  }
  const headers = proxyUpstreamRequestHeaders(req.headers, target);
  const transport = target.protocol === "https:" ? https : http;
  const upstream = transport.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      method: req.method,
      headers,
      ...(target.protocol === "https:" ? { servername: target.hostname } : {}),
    },
    (incoming) => {
      res.writeHead(incoming.statusCode ?? 502, {
        ...safeProxyResponseHeaders(incoming.headers, target.upstreamHeaders),
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      });
      incoming.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.statusCode = 502;
    res.end("The computer connection is unavailable.");
  });
  req.pipe(upstream);
}

function proxyNovncUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, secret: string) {
  const target = resolveNovncTarget(req.url, secret);
  if (!target) {
    socket.destroy();
    return;
  }
  const upstream =
    target.protocol === "https:"
      ? tls.connect({ port: target.port, host: target.hostname, servername: target.hostname })
      : net.connect(target.port, target.hostname);
  upstream.once(target.protocol === "https:" ? "secureConnect" : "connect", () => {
    const headers = proxyUpstreamRequestHeaders(req.headers, target);
    const headerLines = [`${req.method ?? "GET"} ${target.path} HTTP/1.1`];
    for (const [key, value] of Object.entries(headers)) {
      headerLines.push(`${key}: ${Array.isArray(value) ? value.join(",") : value}`);
    }
    upstream.write(`${headerLines.join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    const responseChunks: Buffer[] = [];
    let responseSize = 0;
    let responseTail = Buffer.alloc(0);
    const forwardHandshake = (chunk: Buffer) => {
      responseChunks.push(chunk);
      responseSize += chunk.length;
      if (responseSize > 64 * 1024) {
        socket.destroy();
        upstream.destroy();
        return;
      }
      const boundarySearch = Buffer.concat([responseTail, chunk]);
      if (boundarySearch.indexOf("\r\n\r\n") < 0) {
        responseTail = Buffer.from(boundarySearch.subarray(-3));
        return;
      }
      const responseHead = Buffer.concat(responseChunks, responseSize);
      const safe = stripSensitiveHandshakeHeaders(responseHead, target.upstreamHeaders);
      if (!safe) {
        socket.destroy();
        upstream.destroy();
        return;
      }
      upstream.off("data", forwardHandshake);
      socket.write(safe);
      upstream.pipe(socket);
    };
    upstream.on("data", forwardHandshake);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}
