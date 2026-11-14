const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { loadEnvConfig } = require('@next/env');
const { getToken } = require('next-auth/jwt');
const { socketRoomsFor } = require('./src/lib/accessPolicy.js');

// Load .env / .env.local before reading PORT / secrets (required for custom server)
loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== 'production';
if (!process.env.NODE_ENV) process.env.NODE_ENV = dev ? 'development' : 'production';
const port = parseInt(process.env.PORT || '3000', 10);

// Next.js hostname is used for asset/HMR URLs — keep browser-reachable (localhost).
// Listen host can be 0.0.0.0 so other devices / cloud hosts can connect.
const nextHostname = process.env.NEXT_HOSTNAME || 'localhost';
const listenHost = process.env.HOSTNAME || (dev ? 'localhost' : '0.0.0.0');

const app = next({ dev, hostname: nextHostname, port });
const handle = app.getRequestHandler();

/** Allowed browser origins for Socket.io (comma-separated extras via SOCKET_CORS_ORIGIN) */
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

function parseCookies(cookieHeader = '') {
  const cookies = Object.create(null);
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (Object.prototype.hasOwnProperty.call(cookies, name)) continue;
    cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

function printPortInUseHelp() {
  console.error('');
  console.error(`  Port ${port} is already in use.`);
  console.error('');
  console.error('  MessMesh only needs ONE server process.');
  console.error('  "npm run dev" already runs node server.js — do not run both.');
  console.error('');
  console.error('  Correct start (single terminal):');
  console.error('    npm run dev');
  console.error('');
  console.error('  Then open:  http://localhost:' + port);
  console.error('');
  console.error('  Free the port in PowerShell if a ghost process is stuck:');
  console.error(
    `    Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
  );
  console.error('');
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
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) {
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

  global.io = io;

  io.use(async (socket, nextSocket) => {
    try {
      if (!process.env.NEXTAUTH_SECRET) throw new Error('Socket authentication is unavailable.');
      const cookies = parseCookies(socket.request.headers.cookie);
      const token = await getToken({
        req: {
          headers: socket.request.headers,
          cookies,
        },
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (!token?.id) throw new Error('Unauthenticated socket.');

      const { default: dbConnect } = await import('./src/lib/db.js');
      await dbConnect();
      const { default: User } = await import('./src/lib/models/User.js');
      const user = await User.findById(token.id).select(
        'role wing active authVersion needsPasswordChange'
      );
      if (
        !user ||
        user.active === false ||
        user.needsPasswordChange ||
        (token.authVersion ?? 0) !== (user.authVersion ?? 0)
      ) {
        throw new Error('Socket session is no longer valid.');
      }

      socket.data.user = {
        id: user._id.toString(),
        role: user.role,
        wing: user.wing,
      };
      const rooms = socketRoomsFor({
        id: user._id.toString(),
        role: user.role,
        wing: user.wing,
      });
      for (const room of rooms) {
        socket.join(room);
      }
      nextSocket();
    } catch {
      nextSocket(new Error('Authentication required.'));
    }
  });

  io.on('connection', (socket) => {
    if (dev) console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('disconnect', () => {
      if (dev) console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      printPortInUseHelp();
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(port, listenHost, () => {
    console.log('');
    console.log(`  MessMesh ready  →  http://localhost:${port}`);
    console.log(`  Mode: ${dev ? 'development' : 'production'}  |  bind: ${listenHost}:${port}`);
    if (allowedOrigins.length) {
      console.log(`  Socket CORS: ${allowedOrigins.join(', ')}`);
    }
    console.log('');
    console.log('  Tip: use only "npm run dev" (one terminal). Do not also run node server.js.');
    console.log('');
  });
});
