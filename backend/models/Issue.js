const mongoose = require('mongoose');

const representativeReviewSchema = new mongoose.Schema(
  {
    text: String,
    sentiment: String,
    timestamp: Date,
  },
  { _id: false }
);

const issueSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    category: { type: String, default: 'complaint' }, // complaint | praise
    sku: { type: String, default: '' },
    occurrenceCount: { type: Number, default: 0 },
    occurrenceWindow: { type: [Date], default: [] },
    status: {
      type: String,
      enum: ['emerging', 'critical', 'in_progress', 'resolved'],
      default: 'emerging',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: '' },
    representativeReviews: { type: [representativeReviewSchema], default: [] },
  },
  { timestamps: true }
);

issueSchema.index({ status: 1 });
issueSchema.index({ assignedTo: 1 });
issueSchema.index({ sku: 1, topic: 1 });

module.exports = mongoose.model('Issue', issueSchema);
