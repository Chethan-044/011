const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const realtimeController = require('../controllers/realtimeController');

const router = express.Router();

router.use(authMiddleware);

router.get('/status', realtimeController.streamStatus);
router.get('/state/:sku', realtimeController.skuState);
router.post('/start', realtimeController.startStream);
router.delete('/stop/:sku', realtimeController.stopStream);

module.exports = router;

