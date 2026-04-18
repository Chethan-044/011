const express = require('express');
const reviewController = require('../controllers/reviewController');
const authMiddleware = require('../middleware/authMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/upload', uploadMiddleware.single('file'), reviewController.uploadReviews);
router.post('/process/:batchId', reviewController.processReviews);
router.post('/single', reviewController.addSingleReview);
router.get('/list', reviewController.getUserBatches);
router.get('/:batchId/download', reviewController.downloadReport);
router.get('/:batchId', reviewController.getAnalysis);

module.exports = router;
