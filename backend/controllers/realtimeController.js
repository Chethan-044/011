/**
 * Realtime stream management endpoints.
 * Engine instance is injected via app.set('realtimeEngine', engine).
 */
exports.startStream = async (req, res) => {
  try {
    const { sku, category, productName } = req.body || {};
    if (!sku) {
      return res.status(400).json({
        success: false,
        data: {},
        message: 'sku is required',
      });
    }
    const engine = req.app.get('realtimeEngine');
    await engine.startSkuStream({ sku, category, productName });
    return res.json({
      success: true,
      data: { sku, running: true },
      message: `Realtime stream started for ${sku}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: {},
      message: err.message,
    });
  }
};

exports.stopStream = async (req, res) => {
  try {
    const { sku } = req.params;
    const engine = req.app.get('realtimeEngine');
    const stopped = engine.stopSkuStream(sku);
    return res.json({
      success: true,
      data: { sku, stopped },
      message: stopped ? `Realtime stream stopped for ${sku}` : `No active stream for ${sku}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: {},
      message: err.message,
    });
  }
};

exports.streamStatus = async (req, res) => {
  try {
    const engine = req.app.get('realtimeEngine');
    const status = engine.getStatus();
    return res.json({
      success: true,
      data: { streams: status },
      message: 'Realtime stream status',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: {},
      message: err.message,
    });
  }
};

exports.skuState = async (req, res) => {
  try {
    const { sku } = req.params;
    const engine = req.app.get('realtimeEngine');
    const state = engine.getPublicState(sku);
    if (!state) {
      return res.status(404).json({
        success: false,
        data: {},
        message: `No realtime state for ${sku}`,
      });
    }
    return res.json({
      success: true,
      data: { state },
      message: `Realtime state for ${sku}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: {},
      message: err.message,
    });
  }
};

