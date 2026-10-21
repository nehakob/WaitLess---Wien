const express = require('express');
const Database = require('better-sqlite3');
const { DB_PATH } = require('../db/init');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function getDb() {
    return new Database(DB_PATH);
}

function generateTicket(db) {
    const last = db.prepare("SELECT ticket_number FROM queue_entries ORDER BY id DESC LIMIT 1").get();
    if (!last) return '#T-100';
    const num = parseInt(last.ticket_number.replace('#T-', ''), 10);
    return `#T-${num + 1}`;
}

// ── SSE Client Registry ──────────────────────────────────────────────────────
const sseClients = new Map();

function broadcastQueueUpdate(practiceId, payload) {
    const clients = sseClients.get(String(practiceId));
    if (!clients || clients.size === 0) return;
    const msg = `event: queue-update\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of [...clients]) {
        try { res.write(msg); } catch { clients.delete(res); }
    }
}

// GET /api/queue/stream/:practiceId — Server-Sent Events
router.get('/stream/:practiceId', (req, res) => {
    const pid = String(req.params.practiceId);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.flushHeaders();

    const db = getDb();
    try {
        const p = db.prepare('SELECT wait_minutes, queue_count FROM practices WHERE id = ?').get(pid);
        if (p) res.write(`event: queue-update\ndata: ${JSON.stringify({ practiceId: pid, waitMinutes: p.wait_minutes, queueCount: p.queue_count })}\n\n`);
    } finally { db.close(); }

    if (!sseClients.has(pid)) sseClients.set(pid, new Set());
    sseClients.get(pid).add(res);

    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { clearInterval(hb); } }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.get(pid)?.delete(res); });
});

// GET /api/queue/:practiceId — get queue for a practice
router.get('/:practiceId', requireAuth, (req, res) => {
    const db = getDb();
    try {
        const entries = db.prepare(`
            SELECT * FROM queue_entries
            WHERE practice_id = ? AND status NOT IN ('done', 'cancelled')
            ORDER BY
                CASE triage_level WHEN 'red' THEN 1 WHEN 'orange' THEN 2 ELSE 3 END,
                created_at ASC
        `).all(req.params.practiceId);
        res.json(entries);
    } finally {
        db.close();
    }
});

// POST /api/queue/:practiceId/request — patient requests an appointment
router.post('/:practiceId/request', requireAuth, (req, res) => {
    const { triageLevel, triageNotes } = req.body;
    const db = getDb();
    try {
        const practice = db.prepare('SELECT * FROM practices WHERE id = ?').get(req.params.practiceId);
        if (!practice) return res.status(404).json({ error: 'Praxis nicht gefunden' });

        const ticket = generateTicket(db);
        const displayName = `${req.user.firstName} ${req.user.lastName[0]}. (App-Termin)`;

        const result = db.prepare(`
            INSERT INTO queue_entries (practice_id, patient_id, ticket_number, patient_display_name, status, triage_level, triage_notes, est_wait_minutes)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        `).run(req.params.practiceId, req.user.id, ticket, displayName, triageLevel || 'green', triageNotes || null, practice.wait_minutes);

        // Update queue count
        db.prepare('UPDATE practices SET queue_count = queue_count + 1 WHERE id = ?').run(req.params.practiceId);

        const updPracticeReq = db.prepare('SELECT wait_minutes, queue_count FROM practices WHERE id = ?').get(req.params.practiceId);
        broadcastQueueUpdate(req.params.practiceId, { practiceId: req.params.practiceId, waitMinutes: updPracticeReq.wait_minutes, queueCount: updPracticeReq.queue_count, newTicket: ticket });

        res.status(201).json({
            id: result.lastInsertRowid,
            ticketNumber: ticket,
            practiceName: practice.practice_name,
            estWaitMinutes: practice.wait_minutes,
            status: 'pending'
        });
    } finally {
        db.close();
    }
});

// PATCH /api/queue/entry/:entryId — practice updates a queue entry
router.patch('/entry/:entryId', requireAuth, requireRole('practice'), (req, res) => {
    const { status, location } = req.body;
    const db = getDb();
    try {
        const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(req.params.entryId);
        if (!entry) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

        const practice = db.prepare('SELECT * FROM practices WHERE id = ? AND user_id = ?').get(entry.practice_id, req.user.id);
        if (!practice) return res.status(403).json({ error: 'Keine Berechtigung' });

        db.prepare(`
            UPDATE queue_entries SET
                status = COALESCE(?, status),
                location = COALESCE(?, location),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(status ?? null, location ?? null, req.params.entryId);

        if (status === 'done' || status === 'cancelled') {
            db.prepare('UPDATE practices SET queue_count = MAX(0, queue_count - 1) WHERE id = ?').run(entry.practice_id);
        }

        const updPractice = db.prepare('SELECT wait_minutes, queue_count FROM practices WHERE id = ?').get(entry.practice_id);
        broadcastQueueUpdate(entry.practice_id, { practiceId: entry.practice_id, waitMinutes: updPractice.wait_minutes, queueCount: updPractice.queue_count, entryId: parseInt(req.params.entryId), newStatus: status ?? entry.status });

        res.json({ message: 'Aktualisiert' });
    } finally {
        db.close();
    }
});

// POST /api/queue/:practiceId/emergency — insert emergency at front
router.post('/:practiceId/emergency', requireAuth, requireRole('practice'), (req, res) => {
    const { patientName } = req.body;
    const db = getDb();
    try {
        const practice = db.prepare('SELECT * FROM practices WHERE id = ? AND user_id = ?').get(req.params.practiceId, req.user.id);
        if (!practice) return res.status(403).json({ error: 'Keine Berechtigung' });

        const ticket = generateTicket(db);
        db.prepare(`
            INSERT INTO queue_entries (practice_id, ticket_number, patient_display_name, status, triage_level, est_wait_minutes)
            VALUES (?, ?, ?, 'approved', 'red', 0)
        `).run(req.params.practiceId, ticket, patientName || 'AKUTFALL (Notfall-Einschub)');

        db.prepare('UPDATE practices SET queue_count = queue_count + 1 WHERE id = ?').run(req.params.practiceId);

        // Broadcast delay to all pending entries
        db.prepare(`
            UPDATE queue_entries SET est_wait_minutes = est_wait_minutes + 15
            WHERE practice_id = ? AND status = 'approved' AND triage_level != 'red'
        `).run(req.params.practiceId);

        res.status(201).json({ ticketNumber: ticket, message: 'Notfall eingeschoben, +15 Min an alle gesendet' });
    } finally {
        db.close();
    }
});

// GET /api/queue/my-ticket — patient gets their active ticket
router.get('/my/ticket', requireAuth, requireRole('patient'), (req, res) => {
    const db = getDb();
    try {
        const entry = db.prepare(`
            SELECT qe.*, p.practice_name, p.specialty, p.district
            FROM queue_entries qe
            JOIN practices p ON p.id = qe.practice_id
            WHERE qe.patient_id = ? AND qe.status NOT IN ('done', 'cancelled')
            ORDER BY qe.created_at DESC LIMIT 1
        `).get(req.user.id);

        if (!entry) return res.json(null);

        const ahead = db.prepare(`
            SELECT COUNT(*) as c FROM queue_entries
            WHERE practice_id = ? AND status = 'approved'
              AND id < ? AND triage_level != 'red'
        `).get(entry.practice_id, entry.id);

        res.json({ ...entry, peopleAhead: ahead.c });
    } finally {
        db.close();
    }
});

// DELETE /api/queue/my-ticket — patient cancels their ticket
router.delete('/my/ticket', requireAuth, requireRole('patient'), (req, res) => {
    const db = getDb();
    try {
        const entry = db.prepare(`
            SELECT * FROM queue_entries
            WHERE patient_id = ? AND status NOT IN ('done', 'cancelled')
            ORDER BY created_at DESC LIMIT 1
        `).get(req.user.id);

        if (!entry) return res.status(404).json({ error: 'Kein aktiver Termin' });

        db.prepare("UPDATE queue_entries SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(entry.id);
        db.prepare('UPDATE practices SET queue_count = MAX(0, queue_count - 1) WHERE id = ?').run(entry.practice_id);

        res.json({ message: 'Termin storniert' });
    } finally {
        db.close();
    }
});

module.exports = router;
