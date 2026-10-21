require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDb } = require('./db/init');

// Initialize database on startup
initDb();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/queue', require('./routes/queue'));
app.use('/api/triage', require('./routes/triage'));
app.use('/api/places', require('./routes/places'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'WaitLess Wien', version: '1.0.0', time: new Date().toISOString() });
});

// Static files (HTML pages)
app.use(express.static(path.join(__dirname, 'public')));

// Root redirect: unauthenticated → login, authenticated → portal
app.get('/', (req, res) => {
    const token = req.cookies?.token;
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const { JWT_SECRET } = require('./middleware/auth');
            const user = jwt.verify(token, JWT_SECRET);
            if (user.role === 'practice') {
                return res.redirect('/b2b.html');
            }
            return res.redirect('/portal.html');
        } catch {
            // invalid token, fall through to login
        }
    }
    res.redirect('/login.html');
});

app.listen(PORT, () => {
    console.log(`\n🏥 WaitLess Wien läuft auf http://localhost:${PORT}`);
    console.log(`   Login:   http://localhost:${PORT}/login.html`);
    console.log(`   Portal:  http://localhost:${PORT}/portal.html`);
    console.log(`   B2B:     http://localhost:${PORT}/b2b.html`);
    console.log(`   API:     http://localhost:${PORT}/api/health\n`);
});
