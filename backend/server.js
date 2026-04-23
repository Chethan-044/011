require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { initCloudinary } = require('./config/cloudinary');
const pythonBridge = require('./services/pythonBridge');
const { initializeRealtimeEngine } = require('./services/realtimeReviewEngine');

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

io.on('connection', (socket) => {
  console.log('[socket] connected', socket.id);

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
  const py = await pythonBridge.checkPythonHealth();
  console.log('[startup] Python AI available:', py.available, 'models:', py.models_loaded);
  httpServer.listen(PORT, () => {
    console.log(`ReviewSense backend listening on port ${PORT}`);
  });
});
