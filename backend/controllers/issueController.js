const Issue = require('../models/Issue');
const User = require('../models/User');
const issueService = require('../services/issueService');

/**
 * GET /api/issues — list all issues (filterable via query params)
 */
exports.listIssues = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    if (req.query.sku) filter.sku = req.query.sku;

    const issues = await Issue.find(filter)
      .populate('assignedTo', 'name email role avatar')
      .populate('resolvedBy', 'name email avatar')
      .sort({ updatedAt: -1 });

    return res.json({ success: true, data: { issues }, message: 'OK' });
  } catch (err) {
    console.error('[issueController] listIssues', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * GET /api/issues/stats/admin — dashboard stat cards
 */
exports.getAdminStats = async (req, res) => {
  try {
    const stats = await issueService.getAdminStats(req.user._id);
    return res.json({ success: true, data: stats, message: 'OK' });
  } catch (err) {
    console.error('[issueController] getAdminStats', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * GET /api/issues/:id — single issue with reviews
 */
exports.getIssue = async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id)
      .populate('assignedTo', 'name email role avatar')
      .populate('resolvedBy', 'name email avatar');

    if (!issue) {
      return res.status(404).json({ success: false, data: null, message: 'Issue not found' });
    }
    return res.json({ success: true, data: { issue }, message: 'OK' });
  } catch (err) {
    console.error('[issueController] getIssue', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * POST /api/issues/:id/resolve
 */
exports.resolveIssue = async (req, res) => {
  try {
    const { resolutionNote } = req.body;
    const issue = await issueService.resolveIssue(req.params.id, req.user._id, resolutionNote);
    return res.json({ success: true, data: { issue }, message: 'Issue resolved' });
  } catch (err) {
    console.error('[issueController] resolveIssue', err);
    const status = err.message.includes('not found') ? 404 : err.message.includes('Only the') ? 403 : 500;
    return res.status(status).json({ success: false, data: null, message: err.message });
  }
};

/**
 * POST /api/issues/:id/reassign
 */
exports.reassignIssue = async (req, res) => {
  try {
    const { newAssigneeId } = req.body;
    if (!newAssigneeId) {
      return res.status(400).json({ success: false, data: null, message: 'newAssigneeId required' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ success: false, data: null, message: 'Issue not found' });
    }

    const newAssignee = await User.findById(newAssigneeId);
    if (!newAssignee || !['admin', 'member'].includes(newAssignee.role)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid assignee' });
    }

    // Decrement old assignee
    if (issue.assignedTo) {
      await User.findByIdAndUpdate(issue.assignedTo, {
        $inc: { activeIssueCount: -1 },
        $max: { activeIssueCount: 0 },
      });
    }

    // Assign new
    issue.assignedTo = newAssignee._id;
    issue.assignedAt = new Date();
    await issue.save();

    await User.findByIdAndUpdate(newAssignee._id, { $inc: { activeIssueCount: 1 } });

    return res.json({ success: true, data: { issue }, message: 'Issue reassigned' });
  } catch (err) {
    console.error('[issueController] reassignIssue', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};

/**
 * GET /api/users/admins — list assignable users
 */
exports.listAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'member'] } })
      .select('name email role avatar activeIssueCount')
      .sort({ activeIssueCount: 1 });
    return res.json({ success: true, data: { users: admins }, message: 'OK' });
  } catch (err) {
    console.error('[issueController] listAdmins', err);
    return res.status(500).json({ success: false, data: null, message: err.message });
  }
};
