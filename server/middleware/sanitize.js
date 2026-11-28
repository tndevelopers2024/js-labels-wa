/**
 * Sanitizes input data to prevent NoSQL operator injection.
 * Recursively strips keys starting with '$' or containing '.' from objects.
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item));
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Drop keys that begin with $ (Mongo operators) or contain . (nested path injection)
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    clean[key] = sanitize(value);
  }
  return clean;
}

const sanitizeMiddleware = (req, res, next) => {
  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }
  next();
};

module.exports = { sanitize, sanitizeMiddleware };
