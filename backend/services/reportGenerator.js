const pythonBridge = require('./pythonBridge');

/**
 * Delegates report creation to the Python ReportLab/CSV service.
 */
async function buildReport(analysisPayload, format) {
  console.log('[reportGenerator] Requesting', format, 'report');
  return pythonBridge.generateReport(analysisPayload, format);
}

module.exports = { buildReport };
