const mongoose = require('mongoose');

/**
 * Connect to MongoDB using MONGODB_URI from environment.
 */
const connectDB = async () => {
  try {
    console.log('[DB] Connecting to MongoDB...');
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('[DB] MongoDB connection error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
