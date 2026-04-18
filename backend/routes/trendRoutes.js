const express = require('express');
const trendController = require('../controllers/trendController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/alerts', trendController.getAlerts);
router.get('/:productName/:feature', trendController.getFeatureTrend);
router.get('/:productName', trendController.getTrends);

module.exports = router;
