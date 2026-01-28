const dgram = require('dgram');
const express = require('express');
const cors = require('cors');
const http = require('http');

const UDP_PORT = parseInt(process.env.ATLASLINK_UDP_PORT || '28555', 10);
const HTTP_PORT = parseInt(process.env.ATLASLINK_HTTP_PORT || '28556', 10);
const UDP_HOST = process.env.ATLASLINK_UDP_HOST || '127.0.0.1';

const app = express();
app.use(cors());

const server = http.createServer(app);

const telemetryClients = new Set();
const multicarClients = new Set();
const eventClients = new Set();

let latestSnapshot = null;
let lastPacketMs = 0;
let packetsPerSecond = 0;
let packetsInWindow = 0;
let totalPackets = 0;
const seenEventKeys = new Set();

function log(...args) {
  const stamp = new Date().toISOString();
  console.log(`[AtlasLinkBridge ${stamp}]`, ...args);
}

function registerSSE(req, res, clients, label) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  clients.add(res);

  log(`SSE client connected (${label}). total=${clients.size}`);

  req.on('close', () => {
    clients.delete(res);
    log(`SSE client disconnected (${label}). total=${clients.size}`);
  });
}

function broadcast(clients, payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => {
    try {
      res.write(data);
    } catch (error) {
      clients.delete(res);
      log('Dropped SSE client after write error:', error.message);
    }
  });
}

function keepAlive(clients) {
  clients.forEach((res) => {
    try {
      res.write(':\n\n');
    } catch (error) {
      clients.delete(res);
    }
  });
}

app.get('/health', (req, res) => {
  const now = Date.now();
  const age = lastPacketMs ? now - lastPacketMs : null;
  res.json({
    status: latestSnapshot ? 'ready' : 'idle',
    last_packet_ms: lastPacketMs,
    age_ms: age,
    packets_per_second: packetsPerSecond,
    total_packets: totalPackets,
    udp_port: UDP_PORT,
    http_port: HTTP_PORT,
  });
});

app.get('/atlas-link/telemetry', (req, res) => {
  registerSSE(req, res, telemetryClients, 'telemetry');
  if (latestSnapshot) {
    res.write(`data: ${JSON.stringify(latestSnapshot)}\n\n`);
  }
});

app.get('/atlas-link/multicar', (req, res) => {
  registerSSE(req, res, multicarClients, 'multicar');
  if (latestSnapshot) {
    res.write(`data: ${JSON.stringify(latestSnapshot.opponents || [])}\n\n`);
  }
});

app.get('/atlas-link/events', (req, res) => {
  registerSSE(req, res, eventClients, 'events');
});

server.listen(HTTP_PORT, () => {
  log(`HTTP/SSE bridge listening on http://127.0.0.1:${HTTP_PORT}`);
});

const udp = dgram.createSocket('udp4');

udp.on('error', (err) => {
  log('UDP socket error:', err);
});

udp.on('message', (msg, rinfo) => {
  log(`UDP packet received: src=${rinfo.address}:${rinfo.port} size=${msg.length}`);

  let parsed;
  try {
    parsed = JSON.parse(msg.toString('utf-8'));
  } catch (err) {
    log('Failed to parse UDP packet as JSON:', err.message);
    return;
  }

  const payload = parsed && typeof parsed === 'object' ? parsed.payload : null;
  if (!payload || typeof payload !== 'object') {
    log('Received packet without payload');
    return;
  }

  const snapshot = {
    session: payload.session || {},
    player: payload.player || {},
    opponents: Array.isArray(payload.opponents) ? payload.opponents : [],
    events: Array.isArray(payload.events) ? payload.events : [],
    meta: Object.assign({}, payload.meta || {}, {
      received_at_ms: Date.now(),
      schema: parsed.schema || 'unknown',
    }),
  };

  latestSnapshot = snapshot;
  lastPacketMs = snapshot.meta.received_at_ms;
  packetsInWindow += 1;
  totalPackets += 1;

  broadcast(telemetryClients, snapshot);
  broadcast(multicarClients, snapshot.opponents);

  const freshEvents = [];
  snapshot.events.forEach((event) => {
    const key = `${event.type}-${event.timestamp_ms || snapshot.meta.received_at_ms}`;
    if (!seenEventKeys.has(key)) {
      seenEventKeys.add(key);
      freshEvents.push(event);
    }
  });

  if (freshEvents.length) {
    freshEvents.forEach((event) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      eventClients.forEach((res) => {
        try {
          res.write(data);
        } catch (error) {
          eventClients.delete(res);
        }
      });
    });
  }
});

udp.bind(UDP_PORT, UDP_HOST, () => {
  log(`UDP listener bound to ${UDP_HOST}:${UDP_PORT}`);
});

setInterval(() => {
  packetsPerSecond = packetsInWindow;
  packetsInWindow = 0;
  keepAlive(telemetryClients);
  keepAlive(multicarClients);
  keepAlive(eventClients);
}, 1000);

process.on('SIGINT', () => {
  log('Shutting down bridge...');
  telemetryClients.forEach((res) => res.end());
  multicarClients.forEach((res) => res.end());
  eventClients.forEach((res) => res.end());
  udp.close();
  server.close(() => process.exit(0));
});
