import http from "node:http";
import net from "node:net";

const listenHost = process.env.FLOWSTOCK_SHARE_HOST || "127.0.0.1";
const listenPort = Number(process.env.FLOWSTOCK_SHARE_PORT || 3010);
const upstreamHost = process.env.FLOWSTOCK_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.FLOWSTOCK_UPSTREAM_PORT || 3000);
const username = process.env.FLOWSTOCK_SHARE_USER || "flowstock";
const password = process.env.FLOWSTOCK_SHARE_PASSWORD;

if (!password || password.length < 12) {
  throw new Error("FLOWSTOCK_SHARE_PASSWORD must contain at least 12 characters");
}

const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

function authorized(headers) {
  return headers.authorization === expected;
}

function challenge(response) {
  response.writeHead(401, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Flowstock", charset="UTF-8"',
  });
  response.end("Flowstock access code required.\n");
}

function upstreamHeaders(headers) {
  const forwarded = { ...headers };
  delete forwarded.authorization;
  delete forwarded["proxy-authorization"];
  forwarded.host = `${upstreamHost}:${upstreamPort}`;
  if (forwarded.origin) forwarded.origin = `http://${upstreamHost}:${upstreamPort}`;
  return forwarded;
}

const server = http.createServer((request, response) => {
  if (!authorized(request.headers)) {
    challenge(response);
    return;
  }

  const proxy = http.request(
    {
      host: upstreamHost,
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers: upstreamHeaders(request.headers),
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  proxy.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end(`Flowstock is unavailable: ${error.message}\n`);
  });

  request.pipe(proxy);
});

server.on("upgrade", (request, socket, head) => {
  if (!authorized(request.headers)) {
    socket.write(
      "HTTP/1.1 401 Unauthorized\r\n" +
        'WWW-Authenticate: Basic realm="Flowstock"\r\n' +
        "Connection: close\r\n\r\n",
    );
    socket.destroy();
    return;
  }

  const upstream = net.connect(upstreamPort, upstreamHost, () => {
    const headers = upstreamHeaders(request.headers);
    const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${name}: ${item}`);
      } else if (value !== undefined) {
        lines.push(`${name}: ${value}`);
      }
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => socket.destroy());
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `Flowstock share gateway listening on http://${listenHost}:${listenPort} -> http://${upstreamHost}:${upstreamPort}`,
  );
});
