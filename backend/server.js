require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { initCloudinary } = require('./config/cloudinary');
const pythonBridge = require('./services/pythonBridge');
const { initializeRealtimeEngine } = require('./services/realtimeReviewEngine');
const issueService = require('./services/issueService');
const User = require('./models/User');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174'],
    credentials: true,
  },
});

initCloudinary();

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174'],
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/trends', require('./routes/trendRoutes'));
app.use('/api/realtime', require('./routes/realtimeRoutes'));
app.use('/api/issues', require('./routes/issueRoutes'));
app.use('/api/extension', require('./routes/extensionRoutes'));

app.get('/api/health', async (_req, res) => {
  try {
    const py = await pythonBridge.checkPythonHealth();
    console.log('[health] Python service', py.available ? 'up' : 'down');
    return res.json({
      success: true,
      data: { api: 'ok', python: py },
      message: 'ReviewSense API healthy',
    });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
const realtimeEngine = initializeRealtimeEngine(io);
app.set('realtimeEngine', realtimeEngine);
app.set('io', io);

// ---------- Socket.io with JWT auth and room architecture ----------
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (user) socket.user = user;
  } catch (_) { /* anonymous connection allowed — will just have no user */ }
  next();
});

io.on('connection', (socket) => {
  const userName = socket.user?.name || 'anonymous';
  const userRole = socket.user?.role || 'analyst';
  console.log(`[socket] connected ${socket.id} user=${userName} role=${userRole}`);

  // Join rooms based on role
  socket.join('global_feed');
  if (socket.user) {
    socket.join(`user_${socket.user._id}`);
    if (['admin', 'member'].includes(userRole)) {
      socket.join('admin_dashboard');
    } else {
      socket.join('analyst_dashboard');
    }
  }

  // Reconnection state sync
  socket.on('request_sync', async () => {
    try {
      const activeIssues = await issueService.getActiveIssues();
      socket.emit('sync_state', { issues: activeIssues });
    } catch (err) {
      console.error('[socket] sync failed:', err.message);
    }
  });

  socket.on('subscribe_sku', async (payload = {}) => {
    try {
      const sku = String(payload.sku || '').trim();
      if (!sku) {
        socket.emit('stream_error', {
          success: false,
          data: {},
          message: 'sku is required',
        });
        return;
      }
      socket.join(`sku:${sku}`);
      await realtimeEngine.startSkuStream({
        sku,
        category: payload.category || 'other',
        productName: payload.productName || sku,
      });
      socket.emit('stream_status', {
        success: true,
        data: { sku, subscribed: true },
        message: `Subscribed to ${sku}`,
      });
    } catch (err) {
      socket.emit('stream_error', {
        success: false,
        data: {},
        message: err.message,
      });
    }
  });

  socket.on('unsubscribe_sku', (payload = {}) => {
    const sku = String(payload.sku || '').trim();
    if (!sku) return;
    socket.leave(`sku:${sku}`);
    socket.emit('stream_status', {
      success: true,
      data: { sku, subscribed: false },
      message: `Unsubscribed from ${sku}`,
    });
  });

  socket.on('disconnect', () => {
    console.log('[socket] disconnected', socket.id);
  });
});

connectDB().then(async () => {
  // Inject io into issueService for socket broadcasting
  issueService.setIO(io);

  const py = await pythonBridge.checkPythonHealth();
  console.log('[startup] Python AI available:', py.available, 'models:', py.models_loaded);
  httpServer.listen(PORT, () => {
    console.log(`ReviewSense backend listening on port ${PORT}`);
  });
});

