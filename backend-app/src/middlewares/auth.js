const { verifyAccessToken } = require('../utils/jwt');
const { error } = require('../utils/response');

const normalizeRole = (role = '') => String(role || '').trim().toLowerCase();

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'No token provided', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      ...decoded,
      role: normalizeRole(decoded.role),
    };
    next();
  } catch (err) {
    return error(res, 'Invalid or expired token', 401);
  }
};

const authorize = (...roles) => {
  const allowedRoles = roles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Unauthorized', 401);
    }

    const userRole = normalizeRole(req.user.role);
    if (!allowedRoles.includes(userRole)) {
      return error(res, 'Forbidden: Insufficient permissions', 403);
    }

    req.user.role = userRole;
    next();
  };
};

module.exports = { authenticate, authorize };
