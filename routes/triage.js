require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const { DB_PATH } = require('../db/init');

const router = express.Router();

function getDb() {
    return new Database(DB_PATH);
}

const WIEN_HOSPITALS = [
    { name: 'AKH Wien – Allgemeines Krankenhaus', address: 'Währinger Gürtel 18–20, 1090 Wien', phone: '+43 1 40400-0' },
    { name: 'Krankenhaus Wien-Nord (Floridsdorf)', address: 'Brünner Straße 68, 1210 Wien', phone: '+43 1 27700' },
    { name: 'SMZ Ost – Donauspital', address: 'Langobardenstraße 122, 1220 Wien', phone: '+43 1 28802-0' },
    { name: 'Wilhelminenspital', address: 'Montleartstraße 37, 1160 Wien', phone: '+43 1 49150-0' },
    { name: 'Krankenhaus Hietzing', address: 'Wolkersbergenstraße 1, 1130 Wien', phone: '+43 1 80110-0' },
    { name: 'Krankenhaus Rudolfstiftung', address: 'Juchgasse 25, 1030 Wien', phone: '+43 1 71165-0' },
    { name: 'St. Anna Kinderspital', address: 'Kinderspitalgasse 6, 1090 Wien', phone: '+43 1 40170-0' },
];

const DENTAL_EMERGENCY = {
    name: 'Zahnärztlicher Notfalldienst Wien (24h)',
    phone: '+43 1 512 2078',
    note: 'Wiener Zahnärztekammer – Sie erhalten die Adresse des diensthabenden Notfall-Zahnarztes.'
};

function has(lower, ...words) {
    return words.some(w => lower.includes(w));
}

function analyzeSymptoms(text) {
    const lower = text.toLowerCase();

    const isIntense    = has(lower, 'stark','heftig','unerträglich','schlimm','extrem','sehr','massiv','arg','furchtbar','stechend','stechen','drücken','druck','brennen','engegefühl');
    const isAcuteOnset = has(lower, 'plötzlich','seit heute','gerade eben','soeben','auf einmal','seit stunden','jetzt gerade','urplötzlich');
    const isChild      = has(lower, 'kind','bua','mädel','baby','säugling','kleinkind','mein sohn','meine tochter','mein kind');
    const isElderly    = /\b(6[5-9]|7\d|8\d|9\d)\s*(jahre|j\.|jährig)/.test(lower) || has(lower, 'senior','pensionist','hochbetagt');

    // RED
    const redKeywords = [
        'herzinfarkt','herzschmerz','herz schmerzt','brustschmerz','brust schmerzt',
        'brustenge','herzenge','engegefühl brust','druck auf der brust','druck in der brust',
        'stechen in der brust','stechen im herz','stechen brust','brust brennt','brust drückt',
        'herzrasen','herzstolpern','herzrhythmus','puls sehr hoch',
        'atemnot','keine luft','luftnot','kann nicht atmen','atme kaum','ersticke',
        'bewusstlos','ohnmacht','kollabiert','umgefallen','nicht ansprechbar','reagiert nicht',
        'schlaganfall','lähmung','gesicht verzogen','mund hängt','taubheit im gesicht',
        'arm taub einseitig','sprachstörung','kann nicht sprechen','verwirrt plötzlich',
        'krampfanfall','epileptisch','zuckungen',
        'starke blutung','blut hört nicht auf','blut spucken',
        'vergiftung','überdosis','tabletten geschluckt',
        'allergischer schock','anaphylaxie','geschwollene zunge','hals schwillt','hals zuschwellen',
        'suizid','selbstverletzung','will mir was antun','will nicht mehr leben',
        'schwere verbrennung','verbrüht','sturz aus höhe','schwerer unfall',
    ];
    const chestPainWords = ['stechen','schmerz','druck','brennen','ziehen','eng','weh','tut weh'];
    const hasBrustPain = has(lower, 'brust','herz','herzgegend','brustkorb')
        && chestPainWords.some(w => lower.includes(w));

    const hasKopfschmerz = has(lower, 'kopfschmerz','kopfweh','kopf tut weh','kopf platzt','kopf drückt','schädel');

    const isRed = redKeywords.some(k => lower.includes(k))
        || hasBrustPain
        || (isElderly && has(lower, 'brust','herz','herzgegend','arm','kiefer') && isIntense)
        || (isIntense && isAcuteOnset && hasKopfschmerz)
        || (isIntense && has(lower, 'bauch','bauchschmerz') && has(lower, 'fieber','erbrechen'))
        || (isChild && has(lower, 'fieber') && has(lower, 'säugling','baby','2 monate','3 monate','neugeboren'));

    if (isRed) {
        return {
            triageLevel: 'red',
            mtsLabel: 'MTS Stufe 1: ROT (Sofort)',
            recommendedSpecialty: null,
            specialtyReason: null,
            recommendedDistrict: parseDistrict(lower),
            hospital: isChild ? WIEN_HOSPITALS[6] : WIEN_HOSPITALS[0],
            allHospitals: WIEN_HOSPITALS,
            dentalEmergency: null,
        };
    }

    // DENTAL ORANGE
    const isDentalOrange =
        has(lower, 'zahnschmerz','zahnweh','zahn schmerzt','zahn tut weh','zahn weh',
            'zahnfleisch entzündet','zahnfleisch schwillt','zahn abgebrochen',
            'zahnentzündung','abszess','kiefer schwillt','geschwollene backe',
            'backe geschwollen','backe schwillt','wurzelentzündung','krone raus')
        || (has(lower, 'zahn','zähne','beißer') && has(lower, 'schmerz','weh','stechen','schlimm','stark','heftig','brennen'))
        || (has(lower, 'kiefer') && has(lower, 'schmerz','weh','schwillt','geschwollen'));

    // ORANGE
    const orangeKeywords = [
        'hohes fieber','39 grad','40 grad','41 grad','fieber seit',
        'ohrenschmerz','ohrweh','ohrwaschelweh','ohr tut weh',
        'starke kopfschmerzen','kopfschmerzen seit','starkes kopfweh','kopfweh seit',
        'sehstörung','sieht verschwommen','doppelbilder','plötzlich blind',
        'erbrechen','kann nichts bei sich behalten','ständiges speiben','speiben',
        'harnverhalt','starke schmerzen','akute schmerzen',
    ];
    const isOrange = isDentalOrange
        || orangeKeywords.some(k => lower.includes(k))
        || (isIntense && hasKopfschmerz)
        || (isIntense && has(lower, 'rücken', 'kreuzweh') && has(lower, 'taubheit', 'kribbeln', 'bein'))
        || (isChild && has(lower, 'fieber', 'ohrenschmerz', 'ohrweh', 'atemnot'))
        || (isAcuteOnset && has(lower, 'sehstörung', 'blind'))
        || (isIntense && has(lower, 'bauch', 'magen', 'unterleib'))
        || (isIntense && has(lower, 'ohr', 'zahn', 'zähne', 'auge', 'gelenk', 'knie', 'schulter'));

    const { spec, reason } = parseSpecialty(lower);
    const district = parseDistrict(lower);

    if (isOrange) {
        return {
            triageLevel: 'orange',
            mtsLabel: 'MTS Stufe 2: ORANGE (Dringend)',
            recommendedSpecialty: spec,
            specialtyReason: reason,
            recommendedDistrict: district,
            isDental: isDentalOrange,
            isChild,
            dentalEmergency: isDentalOrange ? DENTAL_EMERGENCY : null,
            hospital: null,
        };
    }

    return {
        triageLevel: 'green',
        mtsLabel: 'MTS Stufe 3: GRÜN (Regulär)',
        recommendedSpecialty: spec,
        specialtyReason: reason,
        recommendedDistrict: district,
        isChild,
        dentalEmergency: null,
        hospital: null,
    };
}

function parseDistrict(lower) {
    const names = {
        'innere stadt':'Wien 1.','leopoldstadt':'Wien 2.','landstraße':'Wien 3.','landstrasse':'Wien 3.',
        'wieden':'Wien 4.','margareten':'Wien 5.','mariahilf':'Wien 6.','neubau':'Wien 7.',
        'josefstadt':'Wien 8.','alsergrund':'Wien 9.','favoriten':'Wien 10.','simmering':'Wien 11.',
        'meidling':'Wien 12.','hietzing':'Wien 13.','penzing':'Wien 14.','rudolfsheim':'Wien 15.',
        'ottakring':'Wien 16.','hernals':'Wien 17.','währing':'Wien 18.','döbling':'Wien 19.',
        'brigittenau':'Wien 20.','floridsdorf':'Wien 21.','donaustadt':'Wien 22.','liesing':'Wien 23.'
    };
    for (const [k,v] of Object.entries(names)) {
        if (lower.includes(k)) return v;
    }
    for (let i = 1; i <= 23; i++) {
        if (lower.includes(`${i}.`) || lower.includes(`bezirk ${i}`) || lower.includes(` ${i} `)) return `Wien ${i}.`;
    }
    return null;
}

function parseSpecialty(lower) {
    const h = (...w) => w.some(x => lower.includes(x));
    if (h('kind','bua','mädel','baby','säugling','kleinkind','impfung','kinderarzt'))
        return { spec: 'Kinderheilkunde', reason: 'Pädiatrische Erstversorgung' };
    if (h('kreuzweh','rücken','gelenk','knochen','knie','hüfte','schulter','bandscheibe','arthrose','wirbelsäule'))
        return { spec: 'Orthopädie', reason: 'Orthopädische Fachuntersuchung' };
    if (h('haut','fleck','ausschlag','juck','ekzem','eiter','muttermal','psoriasis','neurodermitis','hautarzt'))
        return { spec: 'Dermatologie', reason: 'Dermatologische Befundung' };
    if (h('zahn','zahnfleisch','zahnschmerz','zahnweh'))
        return { spec: 'Zahnheilkunde', reason: 'Zahnärztliche Akutbehandlung' };
    if (h('bauch','magen','darm','übelkeit','speiben','sodbrennen','reflux','magenschmerz','verstopfung','durchfall','brechreiz'))
        return { spec: 'Innere Medizin', reason: 'Magen-Darm-Abklärung' };
    if (h('unterleib','schwanger','periode','menstruation','gebärmutter','eierstock','gynäkologie','zyklus','vaginal','scheide','frauenarzt'))
        return { spec: 'Gynäkologie', reason: 'Gynäkologische Fachkonsultation' };
    if (h('auge','sehstörung','sehschärfe','augenschmerz','bindehaut','augendruck','augenarzt'))
        return { spec: 'Augenheilkunde', reason: 'Augenärztliche Untersuchung' };
    if (h('kopfweh','kopfschmerz','migräne','schwindel','gleichgewicht'))
        return { spec: 'Allgemeinmedizin', reason: 'Hausärztliche Abklärung von Kopfschmerzen' };
    if (h('herz','blutdruck','diabetes','zucker','schilddrüse','lunge','bronchitis','asthma','husten','brust','brustkorb'))
        return { spec: 'Innere Medizin', reason: 'Internistische Abklärung von Herz-Kreislauf- oder Atembeschwerden' };
    if (h('ohr','hören','tinnitus','hals','nasen','mandeln','hno','schnupfen','heiserkeit'))
        return { spec: 'HNO', reason: 'HNO-Abklärung' };
    return { spec: 'Allgemeinmedizin', reason: 'Hausärztliche Erstabklärung' };
}

// POST /api/triage/analyze
router.post('/analyze', (req, res) => {
    const { symptoms } = req.body;
    if (!symptoms || symptoms.trim().length < 5) {
        return res.status(400).json({ error: 'Symptom-Beschreibung zu kurz' });
    }

    const analysis = analyzeSymptoms(symptoms);
    const db = getDb();

    try {
        let practices = [];
        if (analysis.recommendedSpecialty) {
            let query = 'SELECT * FROM practices WHERE specialty = ?';
            const params = [analysis.recommendedSpecialty];
            if (analysis.recommendedDistrict) {
                query += ' AND district = ?';
                params.push(analysis.recommendedDistrict);
            }
            query += ' ORDER BY wait_minutes ASC LIMIT 3';
            practices = db.prepare(query).all(...params);

            if (practices.length === 0) {
                practices = db.prepare('SELECT * FROM practices WHERE specialty = ? ORDER BY wait_minutes ASC LIMIT 3').all(analysis.recommendedSpecialty);
            }
        }

        res.json({ ...analysis, practices });
    } finally {
        db.close();
    }
});

// POST /api/triage/gemini  — echte KI via Google Gemini
router.post('/gemini', async (req, res) => {
    const { symptoms } = req.body;
    if (!symptoms || symptoms.trim().length < 5) {
        return res.status(400).json({ error: 'Symptom-Beschreibung zu kurz' });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'HIER_DEINEN_KEY_EINFUEGEN') {
        return res.status(503).json({
            error: 'kein_key',
            message: 'Kein Gemini API-Key konfiguriert. Bitte GEMINI_API_KEY in der .env Datei eintragen.'
        });
    }

    const systemPrompt = `Du bist ein medizinischer Triage-Assistent für Wien, Österreich.
Analysiere die Symptombeschreibung des Patienten und antworte AUSSCHLIESSLICH mit einem JSON-Objekt.

Regeln:
- triageLevel: "red" (Notfall/Lebensgefahr → sofort 144), "orange" (dringend, heute), "green" (regulär)
- Bei Brustschmerzen/Herzproblemen/Atemnot/Bewusstlosigkeit/Schlaganfall → IMMER "red"
- Bei Zahnschmerzen → isDental: true, triageLevel: "orange"
- Bei Kindern unter 14 → isChild: true
- Bei Personen über 65 → isElderly: true
- recommendedSpecialty: eine von: Allgemeinmedizin, Innere Medizin, Kinderheilkunde, Orthopädie, Dermatologie, Gynäkologie, Augenheilkunde, Zahnheilkunde, HNO
- reasoning: kurze Erklärung auf Deutsch (1-2 Sätze, empathisch)
- urgencyNote: kurzer Hinweis was der Patient jetzt tun soll

Antworte NUR mit diesem JSON, kein Text davor oder danach:
{
  "triageLevel": "green",
  "recommendedSpecialty": "Allgemeinmedizin",
  "reasoning": "...",
  "urgencyNote": "...",
  "isChild": false,
  "isElderly": false,
  "isDental": false
}`;

    try {
        const ctrl = new AbortController();
        const tmr = setTimeout(() => ctrl.abort(), 20000);
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: ctrl.signal,
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `${systemPrompt}\n\nPatient schreibt: "${symptoms}"` }]
                    }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
                })
            }
        ).finally(() => clearTimeout(tmr));

        if (!geminiRes.ok) {
            const err = await geminiRes.text();
            console.error('Gemini API Fehler:', err);
            return res.status(502).json({ error: 'gemini_fehler', message: 'Gemini API nicht erreichbar' });
        }

        const geminiData = await geminiRes.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // JSON aus Antwort extrahieren (Gemini packt es manchmal in ```json ... ```)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(502).json({ error: 'parse_fehler', raw: rawText });
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Aus Datenbank passende Praxis holen
        const db = getDb();
        try {
            let practices = [];
            if (parsed.recommendedSpecialty) {
                practices = db.prepare(
                    'SELECT * FROM practices WHERE specialty = ? ORDER BY wait_minutes ASC LIMIT 3'
                ).all(parsed.recommendedSpecialty);
            }
            res.json({ ...parsed, practices, source: 'gemini' });
        } finally {
            db.close();
        }

    } catch (e) {
        console.error('Gemini Fehler:', e.message);
        res.status(500).json({ error: 'server_fehler', message: e.message });
    }
});

// POST /api/triage/chat — conversational multi-turn AI
router.post('/chat', async (req, res) => {
    const { messages, availableSlots } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages fehlt' });
    }

    const key = process.env.GEMINI_API_KEY;

    // ── Local fallback (no API key) ──────────────────────────────────────────
    if (!key || key === 'HIER_DEINEN_KEY_EINFUEGEN') {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        const userText = lastUser?.content || '';
        const analysis = analyzeSymptoms(userText);
        const suggestedTime = (availableSlots || [])[0] || null;
        const needsAllgemed = !analysis.recommendedSpecialty || analysis.recommendedSpecialty === 'Allgemeinmedizin';

        const specLabel = {
            'Orthopädie':      'einem Orthopäden',
            'Dermatologie':    'einem Hautarzt',
            'Innere Medizin':  'einem Internisten',
            'Kinderheilkunde': 'einem Kinderarzt',
            'Gynäkologie':     'einem Frauenarzt',
            'Augenheilkunde':  'einem Augenarzt',
            'Zahnheilkunde':   'einem Zahnarzt',
            'HNO':             'einem HNO-Arzt',
            'Allgemeinmedizin':'einem Hausarzt',
        };
        const dein = specLabel[analysis.recommendedSpecialty] || 'einem Arzt';
        const lo = userText.toLowerCase();
        const symptomRef =
            has(lo,'kopfweh','kopfschmerz') ? 'Das Kopfweh' :
            has(lo,'rücken','kreuzweh') ? 'Die Rückenschmerzen' :
            has(lo,'fieber') ? 'Das Fieber' :
            has(lo,'haut','ausschlag','fleck','juck') ? 'Das Hautproblem' :
            has(lo,'bauch','magen','übelkeit','speiben') ? 'Die Bauchbeschwerden' :
            has(lo,'ohr','ohrweh') ? 'Die Ohrenschmerzen' :
            has(lo,'zahn','zahnweh') ? 'Die Zahnschmerzen' :
            has(lo,'auge','sehen') ? 'Das Augenproblem' :
            has(lo,'hals','schlucken','schluck') ? 'Die Halsschmerzen' :
            has(lo,'knie','schulter','gelenk','hüfte') ? 'Die Gelenksbeschwerden' :
            null;
        let msg;
        if (analysis.triageLevel === 'red') {
            msg = `${symptomRef ? symptomRef + ' klingt' : 'Das klingt'} nach einem Notfall — bitte rufen Sie sofort die 144 an!`;
        } else if (analysis.triageLevel === 'orange') {
            msg = `${symptomRef || 'Diese Beschwerden'} sollten Sie noch heute bei ${dein} vorstellen.`;
            if (needsAllgemed && suggestedTime) msg += ` Bei Dr. Sabine Holzer wäre ${suggestedTime} frei — soll ich buchen?`;
        } else {
            msg = `${symptomRef ? symptomRef + ' — am' : 'Am'} besten einen Termin bei ${dein} machen.`;
            if (needsAllgemed && suggestedTime) msg += ` Dr. Sabine Holzer hat am ${suggestedTime} Zeit — soll ich reservieren?`;
        }

        return res.json({
            action: 'triage',
            message: msg,
            triageLevel: analysis.triageLevel,
            recommendedSpecialty: analysis.recommendedSpecialty,
            recommendedDistrict: analysis.recommendedDistrict,
            recommendedDocId: (analysis.triageLevel !== 'red' && needsAllgemed) ? 500 : null,
            suggestedTime: (analysis.triageLevel !== 'red' && needsAllgemed) ? suggestedTime : null,
            urgency: analysis.triageLevel === 'red' ? 'Sofort 144 anrufen!' : null,
            source: 'lokal'
        });
    }

    // ── Gemini chat ──────────────────────────────────────────────────────────
    const slotList = (availableSlots || []).slice(0, 6).join(' | ');

    const systemInstruction = `Du bist WaitLess-KI, ein einfühlsamer medizinischer Triage-Assistent für Wien.
Antworte kurz, direkt, warm — auf natürlichem Österreichisch. Nie klinisch, nie generisch.

═══════════════════════════════════════════════
PARTNER-PRAXIS (einzige Online-Buchungsmöglichkeit)
  Dr. Sabine Holzer | Allgemeinmedizin | Wien 5.
  Freie Termine: ${slotList || '(keine verfügbar)'}
  → Bei Allgemeinmedizin + Wien 5. (oder kein Bezirk): IMMER zuerst Dr. Sabine Holzer nennen!
  → suggestedTime auf ersten freien Slot setzen, wenn Allgemeinmedizin empfohlen wird.
═══════════════════════════════════════════════

ANTWORTFORMAT — NUR JSON, kein Text davor/danach:
{
  "action": "chat"|"triage"|"confirmBooking",
  "message": "...",
  "triageLevel": null|"red"|"orange"|"green",
  "recommendedSpecialty": null|"...",
  "recommendedDistrict": null|"Wien X.",
  "suggestedTime": null|"...",
  "urgency": null|"..."
}

══════════════════ WANN WELCHE ACTION ══════════════════

► "chat"  — nur für:
  • Begrüßung ("hallo", "guten tag")
  • Echte Rückfrage wenn Symptom wirklich unklar ist (max. 1 Frage!)
  • Allgemeine Fragen ohne Bezug zu Symptomen/Ärzten

► "triage"  — für ALLES andere:
  • Jede Symptombeschreibung: Schmerzen, Fieber, Ausschlag, Husten usw.
  • Direkte Arzt-/Facharztnachfrage ("ich brauch einen Hautarzt", "Augenarzt gesucht")
  • Körperteil-Nennung ("Rücken", "Knie", "Magen") → gleich Specialty setzen
  • Arzt im Bezirk ("Ordination im 10.", "Hausarzt Favoriten")
  • Auch kurze Nachrichten wie "Rücken tut weh", "Fieber seit gestern"

► "confirmBooking"  — NUR wenn explizit bestätigt:
  "ja", "ok", "gerne", "bitte", "nehme ich", "super", "passt", "buchen", "ja bitte", "mach das"

══════════════════ FELDER BEI TRIAGE ══════════════════

triageLevel:
  "red"    → Lebensgefahr: Brustschmerz, Atemnot, Schlaganfall, Bewusstlosigkeit → sofort 144!
  "orange" → Heute noch: starke Schmerzen, Fieber >39°, Zahnabszess, akute Ohrenschmerzen
  "green"  → Regulär: chronische/leichtere Beschwerden, Vorsorge

recommendedSpecialty — exakt eines von:
  Allgemeinmedizin | Innere Medizin | Kinderheilkunde | Orthopädie | Dermatologie
  Gynäkologie | Augenheilkunde | Zahnheilkunde | HNO

  Schnellreferenz:
  Rücken/Knie/Gelenk/Knochen → Orthopädie
  Haut/Ausschlag/Jucken/Flecken → Dermatologie
  Magen/Darm/Bauch/Übelkeit → Innere Medizin
  Zahn/Zahnfleisch/Kiefer → Zahnheilkunde
  Ohr/Hals/Nase/Mandeln → HNO (leicht) oder Allgemeinmedizin
  Auge/Sehen/Bindehaut → Augenheilkunde
  Kind/Baby/Säugling → Kinderheilkunde
  Unterleib/Periode/Schwangerschaft → Gynäkologie
  Alles andere → Allgemeinmedizin

recommendedDistrict — "Wien X." wenn Bezirk irgendwie erwähnt, sonst null:
  Innere Stadt=1  Leopoldstadt=2  Landstraße=3   Wieden=4      Margareten=5
  Mariahilf=6     Neubau=7        Josefstadt=8   Alsergrund=9  Favoriten=10
  Simmering=11    Meidling=12     Hietzing=13    Penzing=14    Rudolfsheim=15
  Ottakring=16    Hernals=17      Währing=18     Döbling=19    Brigittenau=20
  Floridsdorf=21  Donaustadt=22   Liesing=23
  PLZ: 10xx → Wien X. (1100→Wien 10., 1030→Wien 3., 1160→Wien 16.)
  Auch aus früheren Nachrichten im Gesprächsverlauf übernehmen!

suggestedTime — nur bei Allgemeinmedizin + green/orange:
  Ersten freien Slot aus der Terminliste oben nehmen. Sonst null.

urgency — 1 kurzer Satz was der Patient jetzt tun soll (kein Fachjargon).

══════════════════ QUALITÄT VON "message" ══════════════════

REGEL 1: Immer die genauen Wörter des Patienten wiederverwenden!
  Patient schreibt "Rückenschmerzen seit 3 Tagen"
  ✗ FALSCH:  "Basierend auf Ihren Angaben empfehle ich einen Facharzt."
  ✓ RICHTIG: "Rückenschmerzen die schon 3 Tage andauern — das gehört zu einem Orthopäden."

  Patient schreibt "ich hab einen Fleck auf der Haut"
  ✗ FALSCH:  "Ich habe Ihre Beschwerden analysiert."
  ✓ RICHTIG: "Einen Fleck auf der Haut sollte ein Hautarzt anschauen — oft harmlos, aber gut zu checken."

REGEL 2: Maximal 2-3 Sätze. Kein Medizinjargon.
REGEL 3: Österreichisch: "Ordination" statt "Praxis", "Hausarzt" statt "Allgemeinmediziner".
REGEL 4: Bei Direktanfrage ("ich brauch einen Hautarzt") → KEINE Rückfrage nach Symptomen.
REGEL 5: Bei Buchungsvorschlag immer den konkreten Termin nennen.
  ✓ "Dr. Sabine Holzer hat ${(availableSlots||[])[0]||'bald'} Zeit — soll ich buchen?"

GESPRÄCHSGEDÄCHTNIS: Ganzer Verlauf ist sichtbar.
  Bezirk aus früherer Nachricht → recommendedDistrict auch jetzt setzen.
  Wenn Patient früher Symptome nannte → nicht nochmal fragen.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`;
    const geminiBody = JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        })),
        generationConfig: { temperature: 0.6, maxOutputTokens: 1000 }
    });

    async function callGemini() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const r = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: geminiBody,
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (r.status === 503 || r.status === 529) {
                const controller2 = new AbortController();
                const timeout2 = setTimeout(() => controller2.abort(), 20000);
                try {
                    const r2 = await fetch(geminiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: geminiBody,
                        signal: controller2.signal
                    });
                    clearTimeout(timeout2);
                    return r2;
                } catch {
                    clearTimeout(timeout2);
                    throw new Error('Gemini timeout');
                }
            }
            return r;
        } catch (e) {
            clearTimeout(timeout);
            throw e;
        }
    }

    try {
        const geminiRes = await callGemini();

        if (!geminiRes.ok) {
            throw new Error(`Gemini HTTP ${geminiRes.status}`);
        }

        const geminiData = await geminiRes.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Extract JSON (Gemini sometimes wraps it in ```json```)
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.json({ action: 'chat', message: rawText.trim() || 'Können Sie Ihre Beschwerden genauer beschreiben?', source: 'gemini' });
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ ...parsed, source: 'gemini' });

    } catch (e) {
        console.error('Chat Fehler:', e.message);
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        const userText = lastUser?.content || '';
        const analysis = analyzeSymptoms(userText);
        const suggestedTime = (availableSlots || [])[0] || null;
        const needsAllgemed = !analysis.recommendedSpecialty || analysis.recommendedSpecialty === 'Allgemeinmedizin';
        const specLabel = {
            'Orthopädie':'einem Orthopäden','Dermatologie':'einem Hautarzt',
            'Innere Medizin':'einem Internisten','Kinderheilkunde':'einem Kinderarzt',
            'Gynäkologie':'einem Frauenarzt','Augenheilkunde':'einem Augenarzt',
            'Zahnheilkunde':'einem Zahnarzt','HNO':'einem HNO-Arzt','Allgemeinmedizin':'einem Hausarzt',
        };
        const dein = specLabel[analysis.recommendedSpecialty] || 'einem Arzt';
        const lo = userText.toLowerCase();
        const symptomRef =
            has(lo,'kopfweh','kopfschmerz') ? 'Das Kopfweh' :
            has(lo,'rücken','kreuzweh') ? 'Die Rückenschmerzen' :
            has(lo,'fieber') ? 'Das Fieber' :
            has(lo,'haut','ausschlag','fleck','juck') ? 'Das Hautproblem' :
            has(lo,'bauch','magen','übelkeit','speiben') ? 'Die Bauchbeschwerden' :
            has(lo,'ohr','ohrweh') ? 'Die Ohrenschmerzen' :
            has(lo,'zahn','zahnweh') ? 'Die Zahnschmerzen' :
            has(lo,'auge','sehen') ? 'Das Augenproblem' :
            has(lo,'hals','schlucken','schluck') ? 'Die Halsschmerzen' :
            has(lo,'knie','schulter','gelenk','hüfte') ? 'Die Gelenksbeschwerden' :
            null;
        let msg;
        if (analysis.triageLevel === 'red') {
            msg = `${symptomRef ? symptomRef + ' klingt' : 'Das klingt'} nach einem Notfall — bitte rufen Sie sofort die 144 an!`;
        } else if (analysis.triageLevel === 'orange') {
            msg = `${symptomRef || 'Diese Beschwerden'} sollten Sie noch heute bei ${dein} vorstellen.`;
            if (needsAllgemed && suggestedTime) msg += ` Bei Dr. Sabine Holzer wäre ${suggestedTime} frei — soll ich buchen?`;
        } else {
            msg = `${symptomRef ? symptomRef + ' — am' : 'Am'} besten einen Termin bei ${dein} machen.`;
            if (needsAllgemed && suggestedTime) msg += ` Dr. Sabine Holzer hat am ${suggestedTime} Zeit — soll ich reservieren?`;
        }
        return res.json({
            action: 'triage',
            message: msg,
            triageLevel: analysis.triageLevel,
            recommendedSpecialty: analysis.recommendedSpecialty,
            recommendedDistrict: analysis.recommendedDistrict,
            recommendedDocId: (analysis.triageLevel !== 'red' && needsAllgemed) ? 500 : null,
            suggestedTime: (analysis.triageLevel !== 'red' && needsAllgemed) ? suggestedTime : null,
            urgency: analysis.triageLevel === 'red' ? 'Sofort 144 anrufen!' : null,
            source: 'lokal'
        });
    }
});

module.exports = router;
