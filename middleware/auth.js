const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'waitless-wien-secret-2026';

function requireAuth(req, res, next) {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        if (req.headers.accept?.includes('text/html')) {
            return res.redirect('/login.html');
        }
        return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        if (req.headers.accept?.includes('text/html')) {
            return res.redirect('/login.html');
        }
        res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role)) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };
