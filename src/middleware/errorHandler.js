const { sendAlert } = require('./errorAlerter');

/**
 * Global error handler — must be the last middleware registered in app.js.
 * Catches anything passed via next(err).
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    console.error('[error]', err);
    sendAlert(err, {
      method: req.method,
      route:  req.originalUrl || req.path,
      userId: req.user?.sub,
      role:   req.user?.role,
    }).catch(() => {}); // sendAlert never throws, but guard anyway
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
