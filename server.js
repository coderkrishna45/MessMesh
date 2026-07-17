const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
// 0.0.0.0 so Railway/Render/Docker can accept external traffic.
// Override with HOSTNAME=localhost for local-only binding if needed.
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/** Allowed browser origins for Socket.io (comma-separated) */
function getAllowedOrigins() {
  const list = new Set();
  if (process.env.NEXTAUTH_URL) {
    list.add(process.env.NEXTAUTH_URL.replace(/\/$/, ''));
  }
  if (process.env.SOCKET_CORS_ORIGIN) {
    process.env.SOCKET_CORS_ORIGIN.split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean)
      .forEach((o) => list.add(o));
  }
  if (dev) {
    list.add('http://localhost:3000');
    list.add('http://127.0.0.1:3000');
  }
  return [...list];
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const allowedOrigins = getAllowedOrigins();

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow non-browser clients (no Origin header) and same-origin tools
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) {
          // Misconfigured prod: fail closed unless still in dev
          return callback(null, dev);
        }
        if (allowedOrigins.includes(origin.replace(/\/$/, ''))) {
          return callback(null, true);
        }
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
    },
  });

  // Store the io instance so Next.js API routes can emit events
  global.io = io;

  io.on('connection', (socket) => {
    if (dev) console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('join-poll', (pollId) => {
      socket.join(pollId);
      if (dev) console.log(`[Socket] Client ${socket.id} joined poll room: ${pollId}`);
    });

    socket.on('cast-vote', (data) => {
      if (data?.pollId) {
        socket.to(data.pollId).emit('vote-tallied', data);
      }
    });

    socket.on('disconnect', () => {
      if (dev) console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port} (${dev ? 'dev' : 'production'})`);
    if (allowedOrigins.length) {
      console.log(`> Socket CORS origins: ${allowedOrigins.join(', ')}`);
    }
  });
});
