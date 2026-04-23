const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const issueController = require('../controllers/issueController');

const router = express.Router();

router.use(authMiddleware);

// All authenticated users can view issues
router.get('/', issueController.listIssues);
router.get('/stats/admin', issueController.getAdminStats);
router.get('/:id', issueController.getIssue);

// Only admin/member can resolve or reassign
router.post('/:id/resolve', requireRole('admin', 'member'), issueController.resolveIssue);
router.post('/:id/reassign', requireRole('admin', 'member'), issueController.reassignIssue);

// Admin user listing
router.get('/users/admins', issueController.listAdmins);

module.exports = router;
