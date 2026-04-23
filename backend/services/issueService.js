/**
 * Issue lifecycle service — escalation, round-robin assignment, resolution.
 */
const Issue = require('../models/Issue');
const User = require('../models/User');

const CRITICAL_THRESHOLD = parseInt(process.env.CRITICAL_THRESHOLD, 10) || 10;
const MAX_REPRESENTATIVE_REVIEWS = 20;

let _io = null;

/** Inject socket.io instance (called once from server.js) */
function setIO(io) {
  _io = io;
}

/**
 * Upsert an issue by topic+sku, push an occurrence, and trigger escalation if threshold crossed.
 */
async function upsertIssue({ topic, sku, category, reviewText, sentiment, timestamp }) {
  const now = new Date(timestamp || Date.now());

  let issue = await Issue.findOne({ topic, sku, status: { $ne: 'resolved' } });

  if (!issue) {
    issue = new Issue({
      topic,
      sku,
      category: category || 'complaint',
      occurrenceCount: 0,
      occurrenceWindow: [],
      status: 'emerging',
      priority: 'low',
    });
  }

  issue.occurrenceCount += 1;
  issue.occurrenceWindow.push(now);
  // Keep only last 100 timestamps
  if (issue.occurrenceWindow.length > 100) {
    issue.occurrenceWindow = issue.occurrenceWindow.slice(-100);
  }

  // Add representative review
  if (issue.representativeReviews.length < MAX_REPRESENTATIVE_REVIEWS) {
    issue.representativeReviews.push({
      text: reviewText,
      sentiment: sentiment || 'Neutral',
      timestamp: now,
    });
  }

  // Compute priority
  const count = issue.occurrenceCount;
  if (count >= CRITICAL_THRESHOLD) {
    issue.priority = 'critical';
  } else if (count >= Math.floor(CRITICAL_THRESHOLD * 0.7)) {
    issue.priority = 'high';
  } else if (count >= Math.floor(CRITICAL_THRESHOLD * 0.4)) {
    issue.priority = 'medium';
  } else {
    issue.priority = 'low';
  }

  const justCrossedCritical =
    issue.priority === 'critical' &&
    issue.status === 'emerging';

  if (justCrossedCritical) {
    issue.status = 'critical';
    await issue.save();
    await autoAssign(issue);
  } else {
    await issue.save();
  }

  // Emit occurrence update to all dashboards
  if (_io) {
    _io.to('global_feed').emit('occurrence_updated', {
      issueId: issue._id,
      topic: issue.topic,
      sku: issue.sku,
      newCount: issue.occurrenceCount,
      delta: 1,
      priority: issue.priority,
      status: issue.status,
      crossedCriticalThreshold: justCrossedCritical,
    });
  }

  return issue;
}

/**
 * Round-robin assign issue to the admin/member with fewest active issues.
 */
async function autoAssign(issue) {
  try {
    const candidates = await User.find({
      role: { $in: ['admin', 'member'] },
    }).sort({ activeIssueCount: 1, createdAt: 1 });

    if (candidates.length === 0) {
      console.log('[issueService] no admin/member users available for assignment');
      return;
    }

    const assignee = candidates[0];

    issue.assignedTo = assignee._id;
    issue.assignedAt = new Date();
    issue.status = 'in_progress';
    await issue.save();

    await User.findByIdAndUpdate(assignee._id, { $inc: { activeIssueCount: 1 } });

    const populated = await Issue.findById(issue._id).populate('assignedTo', 'name email role avatar');

    const payload = {
      issueId: issue._id,
      topic: issue.topic,
      sku: issue.sku,
      category: issue.category,
      occurrenceCount: issue.occurrenceCount,
      priority: issue.priority,
      status: issue.status,
      assignedTo: {
        userId: assignee._id,
        name: assignee.name,
        avatar: assignee.avatar,
      },
      assignedAt: issue.assignedAt,
      representativeReviews: issue.representativeReviews.slice(-5),
    };

    if (_io) {
      _io.to('analyst_dashboard').to('admin_dashboard').emit('new_critical_issue', payload);
      _io.to(`user_${assignee._id}`).emit('issue_assigned', payload);
    }

    console.log(`[issueService] Auto-assigned "${issue.topic}" to ${assignee.name} (${assignee.email})`);
  } catch (err) {
    console.error('[issueService] autoAssign failed:', err.message);
  }
}

/**
 * Resolve an issue.
 */
async function resolveIssue(issueId, userId, resolutionNote) {
  const issue = await Issue.findById(issueId);
  if (!issue) throw new Error('Issue not found');

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Validate: must be assignee or admin
  const isAssignee = issue.assignedTo && issue.assignedTo.toString() === userId.toString();
  const isAdmin = user.role === 'admin';
  if (!isAssignee && !isAdmin) {
    throw new Error('Only the assignee or an admin can resolve this issue');
  }

  issue.status = 'resolved';
  issue.priority = 'low';
  issue.resolvedBy = userId;
  issue.resolvedAt = new Date();
  issue.resolutionNote = resolutionNote || '';
  issue.occurrenceCount = 0;
  issue.occurrenceWindow = [];
  await issue.save();

  // Decrement the assigned user's active count
  if (issue.assignedTo) {
    await User.findByIdAndUpdate(issue.assignedTo, {
      $inc: { activeIssueCount: -1 },
      $max: { activeIssueCount: 0 },        // safety — never go negative
    });
  }

  const payload = {
    issueId: issue._id,
    topic: issue.topic,
    sku: issue.sku,
    resolvedBy: {
      userId: user._id,
      name: user.name,
      avatar: user.avatar,
    },
    resolvedAt: issue.resolvedAt,
    resolutionNote: issue.resolutionNote,
    newPriority: 'low',
    newStatus: 'resolved',
  };

  if (_io) {
    _io.to('global_feed').emit('issue_resolved', payload);
  }

  console.log(`[issueService] Resolved "${issue.topic}" by ${user.name}`);
  return issue;
}

/**
 * Get admin dashboard stats.
 */
async function getAdminStats(userId) {
  const [totalCritical, resolvedToday, allResolved, myOpen] = await Promise.all([
    Issue.countDocuments({ status: { $in: ['critical', 'in_progress'] } }),
    Issue.countDocuments({
      status: 'resolved',
      resolvedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    Issue.find({
      status: 'resolved',
      resolvedAt: { $ne: null },
      assignedAt: { $ne: null },
    }).select('resolvedAt assignedAt'),
    Issue.countDocuments({ assignedTo: userId, status: { $in: ['critical', 'in_progress'] } }),
  ]);

  // Compute avg resolution time in minutes
  let avgResolutionTime = 0;
  if (allResolved.length > 0) {
    const totalMs = allResolved.reduce((sum, doc) => {
      return sum + (doc.resolvedAt.getTime() - doc.assignedAt.getTime());
    }, 0);
    avgResolutionTime = Math.round(totalMs / allResolved.length / 60000);
  }

  return {
    totalCritical,
    resolvedToday,
    avgResolutionTime,
    myOpenIssues: myOpen,
  };
}

/**
 * Get all active issues for state sync on reconnect.
 */
async function getActiveIssues() {
  return Issue.find({ status: { $in: ['emerging', 'critical', 'in_progress'] } })
    .populate('assignedTo', 'name email role avatar')
    .sort({ occurrenceCount: -1 });
}

module.exports = {
  setIO,
  upsertIssue,
  autoAssign,
  resolveIssue,
  getAdminStats,
  getActiveIssues,
  CRITICAL_THRESHOLD,
};
