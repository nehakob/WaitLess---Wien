const express = require('express');
const Database = require('better-sqlite3');
const { DB_PATH } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getDb() {
    return new Database(DB_PATH);
}

// GET /api/doctors — list all practices with optional filters
router.get('/', (req, res) => {
    const { district, specialty, insurance, sort, search } = req.query;
    const db = getDb();
    try {
        let query = `
            SELECT p.*, u.first_name || ' ' || u.last_name as doctor_name
            FROM practices p
            JOIN users u ON u.id = p.user_id
            WHERE 1=1
        `;
        const params = [];

        if (district && district !== 'Alle') {
            query += ' AND p.district = ?';
            params.push(district);
        }
        if (specialty && specialty !== 'Alle') {
            query += ' AND p.specialty = ?';
            params.push(specialty);
        }
        if (insurance && insurance !== 'Alle') {
            query += ' AND p.insurance LIKE ?';
            params.push(`%${insurance}%`);
        }
        if (search) {
            query += ' AND (p.practice_name LIKE ? OR p.specialty LIKE ? OR p.address LIKE ? OR p.district LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }

        if (sort === 'distance') {
            query += ' ORDER BY p.distance_km ASC';
        } else {
            query += ' ORDER BY p.wait_minutes ASC';
        }

        const rows = db.prepare(query).all(...params);
        res.json(rows);
    } finally {
        db.close();
    }
});

// GET /api/doctors/:id
router.get('/:id', (req, res) => {
    const db = getDb();
    try {
        const practice = db.prepare(`
            SELECT p.*, u.first_name || ' ' || u.last_name as doctor_name
            FROM practices p JOIN users u ON u.id = p.user_id
            WHERE p.id = ?
        `).get(req.params.id);

        if (!practice) return res.status(404).json({ error: 'Praxis nicht gefunden' });
        res.json(practice);
    } finally {
        db.close();
    }
});

// PATCH /api/doctors/:id — update wait time / queue count (practice only)
router.patch('/:id', requireAuth, (req, res) => {
    const { waitMinutes, queueCount, lastReport } = req.body;
    const db = getDb();
    try {
        const practice = db.prepare('SELECT * FROM practices WHERE id = ?').get(req.params.id);
        if (!practice) return res.status(404).json({ error: 'Praxis nicht gefunden' });

        if (req.user.role !== 'practice' || practice.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        db.prepare(`
            UPDATE practices SET
                wait_minutes = COALESCE(?, wait_minutes),
                queue_count = COALESCE(?, queue_count),
                last_report = COALESCE(?, last_report)
            WHERE id = ?
        `).run(waitMinutes ?? null, queueCount ?? null, lastReport ?? null, req.params.id);

        res.json({ message: 'Aktualisiert' });
    } finally {
        db.close();
    }
});

module.exports = router;
