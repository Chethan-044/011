const nodemailer = require('nodemailer');
require('dotenv').config();

// ---------- Transporter setup ----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('[emailService] Gmail connection failed:', error.message);
  } else {
    console.log('[emailService] Gmail configured ✓ ready to send alerts');
  }
});

// Track which issues have already been emailed to avoid duplicates
const emailedIssues = new Set();

/**
 * Send an emerging issue alert email.
 * @param {Object} opts
 * @param {string} opts.to           - recipient email
 * @param {string} opts.issue        - issue cluster name (e.g. "Packaging Issue")
 * @param {string} opts.severity     - Critical / High / Early Signal
 * @param {number} opts.occurrences  - number of times this issue appeared
 * @param {string} opts.feature      - product feature affected
 * @param {string} opts.sentiment    - Positive / Negative / Neutral
 * @param {string} opts.recommendation - actionable recommendation
 * @param {string} opts.latestReview - the review text that triggered the alert
 * @param {string} opts.sku          - the product SKU
 */
async function sendIssueAlert({
  to,
  issue,
  severity,
  occurrences,
  feature,
  sentiment,
  recommendation,
  latestReview,
  sku,
}) {
  // Don't send duplicate emails for the same issue
  const key = `${sku}::${issue}`;
  if (emailedIssues.has(key)) {
    return false;
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[emailService] EMAIL_USER or EMAIL_PASS not set — skipping alert');
    return false;
  }

  const recipient = to || process.env.ALERT_EMAIL || process.env.EMAIL_USER;

  const severityColor =
    severity === 'Critical' ? '#dc2626' :
    severity === 'High' ? '#ea580c' :
    '#d97706';

  const severityEmoji =
    severity === 'Critical' ? '🚨' :
    severity === 'High' ? '⚠️' :
    '📡';

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 28px 32px;">
        <h1 style="margin: 0; color: #fff; font-size: 20px; font-weight: 600;">
          ${severityEmoji} ReviewSense Alert
        </h1>
        <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13px;">
          Emerging Issue Detected — Immediate Attention Required
        </p>
      </div>

      <!-- Body -->
      <div style="padding: 28px 32px;">
        
        <!-- Severity Badge -->
        <div style="margin-bottom: 20px;">
          <span style="display: inline-block; background: ${severityColor}; color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
            ${severity} Severity
          </span>
          <span style="display: inline-block; background: #e2e8f0; color: #475569; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-left: 8px;">
            SKU: ${sku || 'N/A'}
          </span>
        </div>

        <!-- Issue Card -->
        <div style="background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid ${severityColor}; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 4px; color: #0f172a; font-size: 18px; font-weight: 700;">
            ${issue}
          </h2>
          <p style="margin: 0; color: #64748b; font-size: 13px;">
            ${occurrences} occurrence${occurrences !== 1 ? 's' : ''} detected in the live review stream
          </p>
        </div>

        <!-- Details Grid -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 12px 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px 0 0 0; width: 50%;">
              <p style="margin: 0 0 4px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Feature Affected</p>
              <p style="margin: 0; color: #0f172a; font-size: 15px; font-weight: 600;">${feature}</p>
            </td>
            <td style="padding: 12px 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 0 8px 0 0;">
              <p style="margin: 0 0 4px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Sentiment</p>
              <p style="margin: 0; color: ${sentiment === 'Negative' ? '#dc2626' : sentiment === 'Positive' ? '#16a34a' : '#6366f1'}; font-size: 15px; font-weight: 600;">${sentiment}</p>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 12px 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 4px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Occurrences</p>
              <p style="margin: 0; color: #0f172a; font-size: 15px; font-weight: 600;">${occurrences} times</p>
            </td>
          </tr>
        </table>

        <!-- Latest Review -->
        <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 6px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">📝 Latest Review that Triggered Alert</p>
          <p style="margin: 0; color: #334155; font-size: 14px; font-style: italic; line-height: 1.6;">
            "${latestReview}"
          </p>
        </div>

        <!-- Recommendation -->
        ${recommendation ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 6px; color: #92400e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">💡 Recommended Action</p>
          <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
            ${recommendation}
          </p>
        </div>
        ` : ''}

        <!-- CTA -->
        <div style="text-align: center; margin-top: 24px;">
          <a href="http://localhost:5173/trends" style="display: inline-block; background: #4f46e5; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
            View in Dashboard →
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f1f5f9; padding: 16px 32px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">
          This is an automated alert from ReviewSense Real-time Intelligence.
          <br/>Generated at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"ReviewSense Alerts" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: `${severityEmoji} [${severity}] Emerging Issue: ${issue} — SKU ${sku || 'N/A'}`,
      html,
    });

    emailedIssues.add(key);
    console.log(`[emailService] ✉ Alert sent to ${recipient} for "${issue}"`);
    return true;
  } catch (err) {
    console.error('[emailService] Failed to send alert:', err.message);
    return false;
  }
}

/**
 * Reset the sent-issues tracker (e.g. when a stream restarts).
 */
function resetEmailTracker() {
  emailedIssues.clear();
}

module.exports = { sendIssueAlert, resetEmailTracker };
