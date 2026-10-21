const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { DB_PATH } = require('../db/init');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function getDb() {
    return new Database(DB_PATH);
}

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
    }

    const db = getDb();
    try {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Ungültige E-Mail oder Passwort' });
        }

        let practiceId = null;
        if (user.role === 'practice') {
            const practice = db.prepare('SELECT id FROM practices WHERE user_id = ?').get(user.id);
            practiceId = practice?.id ?? null;
        }

        const payload = { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name, practiceId };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        res.cookie('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            token,
            user: { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name, practiceId }
        });
    } finally {
        db.close();
    }
});

// POST /api/auth/register
router.post('/register', (req, res) => {
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
    }
    if (!['patient', 'practice'].includes(role)) {
        return res.status(400).json({ error: 'Ungültige Rolle' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
    }

    const db = getDb();
    try {
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
        if (existing) {
            return res.status(409).json({ error: 'E-Mail bereits registriert' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare(
            'INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)'
        ).run(email.toLowerCase().trim(), hash, firstName.trim(), lastName.trim(), role);

        res.status(201).json({ message: 'Registrierung erfolgreich', userId: result.lastInsertRowid });
    } finally {
        db.close();
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Abgemeldet' });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Nicht authentifiziert' });
    try {
        const user = jwt.verify(token, JWT_SECRET);
        res.json({ user });
    } catch {
        res.status(401).json({ error: 'Token ungültig' });
    }
});

module.exports = router;
