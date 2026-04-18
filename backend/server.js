require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { initCloudinary } = require('./config/cloudinary');
const pythonBridge = require('./services/pythonBridge');

const app = express();

initCloudinary();

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/trends', require('./routes/trendRoutes'));

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

connectDB().then(async () => {
  const py = await pythonBridge.checkPythonHealth();
  console.log('[startup] Python AI available:', py.available, 'models:', py.models_loaded);
  app.listen(PORT, () => {
    console.log(`ReviewSense backend listening on port ${PORT}`);
  });
});
