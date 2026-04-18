const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.csv';
    cb(null, `${uuidv4()}${ext}`);
  },
});

/**
 * Accept CSV, JSON, TXT up to 20MB.
 */
const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.csv', '.json', '.txt'].includes(path.extname(file.originalname).toLowerCase());
    if (!ok) {
      return cb(new Error('Only .csv, .json, .txt allowed'));
    }
    cb(null, true);
  },
});

module.exports = uploadMiddleware;
