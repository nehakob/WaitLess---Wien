const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'waitless.db');

function initDb() {
    const db = new Database(DB_PATH);

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('patient', 'practice')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS practices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            practice_name TEXT NOT NULL,
            specialty TEXT NOT NULL,
            district TEXT NOT NULL,
            address TEXT NOT NULL,
            phone TEXT,
            insurance TEXT NOT NULL DEFAULT 'Alle Kassen',
            wait_minutes INTEGER NOT NULL DEFAULT 15,
            distance_km REAL NOT NULL DEFAULT 1.0,
            queue_count INTEGER NOT NULL DEFAULT 0,
            last_report TEXT DEFAULT 'Vor 1 Min.',
            opening_hours TEXT DEFAULT 'Mo-Fr 08:00-13:00',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS queue_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            practice_id INTEGER NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
            patient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            ticket_number TEXT NOT NULL,
            patient_display_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'called', 'done', 'cancelled')),
            triage_level TEXT DEFAULT 'green' CHECK(triage_level IN ('red', 'orange', 'green')),
            triage_notes TEXT,
            location TEXT DEFAULT 'waiting_room' CHECK(location IN ('waiting_room', 'outdoor', 'transit')),
            est_wait_minutes INTEGER DEFAULT 15,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            practice_id INTEGER NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
            sender_type TEXT NOT NULL CHECK(sender_type IN ('patient', 'ai', 'system')),
            content TEXT NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migration: add opening_hours column if it doesn't exist yet
    try { db.exec(`ALTER TABLE practices ADD COLUMN opening_hours TEXT DEFAULT 'Mo-Fr 08:00-13:00'`); } catch {}

    // Seed demo data if users table is empty
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
    if (userCount.c === 0) {
        seedDemoData(db);
    }

    db.close();
    console.log('✅ Database initialized at', DB_PATH);
}

function seedDemoData(db) {
    const salt = bcrypt.genSaltSync(10);

    const insertUser = db.prepare(
        'INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)'
    );
    const insertPractice = db.prepare(`
        INSERT INTO practices (user_id, practice_name, specialty, district, address, phone, insurance, wait_minutes, distance_km, queue_count, opening_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertQueue = db.prepare(`
        INSERT INTO queue_entries (practice_id, patient_display_name, ticket_number, status, triage_level, location, est_wait_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Demo patient
    const patientResult = insertUser.run(
        'maria@example.at',
        bcrypt.hashSync('patient123', salt),
        'Maria', 'Mustermann', 'patient'
    );

    // Demo practices
    const practicesData = [
        { email: 'fuchs@waitless.at',    pw: 'praxis123', fn: 'Dr.', ln: 'Fuchs',           name: 'Dr. Monika Fuchs',                    spec: 'General Medicine', dist: 'Wien 1.',  addr: 'Elisabethstraße 22/18, 1010 Wien',          phone: '+43 1 5858383',  ins: 'ÖGK, SVS, BVAEB',    wait: 12, km: 0.4, queue: 3, hours: 'Mo-Do 08:00-18:00 | Fr 08:00-15:00' },
        { email: 'cape10@waitless.at',   pw: 'praxis123', fn: 'Dr.', ln: 'Cape',            name: 'Kinderarzt Cape 10',                  spec: 'Pediatrics',       dist: 'Wien 10.', addr: 'Alfred-Adler-Straße 1/5, 1100 Wien',        phone: '+43 1 9050006',  ins: 'Alle Kassen',        wait: 15, km: 3.1, queue: 4, hours: 'Mo-Mi 09:00-19:00 | Do 07:00-19:00 | Fr 09:00-19:00 | Sa-So 10:00-15:00' },
        { email: 'radner@waitless.at',   pw: 'praxis123', fn: 'Dr.', ln: 'Radner',          name: 'Dr. Gerald Radner',                   spec: 'Gynecology',       dist: 'Wien 3.',  addr: 'Landstraßer Hauptstraße 146/6A/B2, 1030 Wien', phone: '+43 1 7108080',  ins: 'Alle Kassen',        wait: 38, km: 1.8, queue: 7, hours: 'Mo 12:00-17:00 | Di 08:00-13:00 | Mi 12:00-17:00 | Do 08:00-13:00 | Fr 08:30-12:00' },
        { email: 'voitl@waitless.at',    pw: 'praxis123', fn: 'DDr.', ln: 'Voitl',          name: 'DDr. Peter Voitl & Partner',          spec: 'Pediatrics',       dist: 'Wien 22.', addr: 'Wagramer Straße 2A, 1220 Wien',              phone: '+43 1 2637979',  ins: 'Alle Kassen',        wait: 28, km: 6.2, queue: 5, hours: 'Mo-Do 08:00-19:00 | Fr 07:00-17:00 | Sa-So 09:00-15:00' },
        { email: 'holzer@waitless.at',   pw: 'praxis123', fn: 'Dr.',  ln: 'Holzer',          name: 'Dr. Sabine Holzer',                   spec: 'General Medicine', dist: 'Wien 5.',  addr: 'Reinprechtsdorfer Straße 25/4, 1050 Wien',  phone: '+43 1 5443892',  ins: 'Alle Kassen',        wait: 16, km: 2.1, queue: 3, hours: 'Mo-Fr 08:00-13:00 | Mo, Mi 15:00-17:00' },
    ];

    for (const p of practicesData) {
        const userRes = insertUser.run(p.email, bcrypt.hashSync(p.pw, salt), p.fn, p.ln, 'practice');
        const practiceRes = insertPractice.run(userRes.lastInsertRowid, p.name, p.spec, p.dist, p.addr, p.phone, p.ins, p.wait, p.km, p.queue, p.hours || 'Mo-Fr 08:00-13:00');

        insertQueue.run(practiceRes.lastInsertRowid, 'Maria M. (App-Termin)', '#T-108', 'approved', 'green', 'outdoor', p.wait);
        insertQueue.run(practiceRes.lastInsertRowid, 'Peter H.', '#T-109', 'approved', 'green', 'waiting_room', p.wait + 12);
    }

    console.log('✅ Demo data seeded');
    console.log('   Patient login: maria@example.at / patient123');
    console.log('   Practice login: denia@waitless.at / praxis123');
}

module.exports = { initDb, DB_PATH };
