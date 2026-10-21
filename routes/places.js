require('dotenv').config();
const express = require('express');
const router = express.Router();

// Maps German specialty names to search-friendly terms
const SPECIALTY_QUERIES = {
    'Allgemeinmedizin':  'Allgemeinmediziner Hausarzt',
    'Innere Medizin':    'Internist',
    'Kinderheilkunde':   'Kinderarzt Pädiater',
    'Orthopädie':        'Orthopäde',
    'Dermatologie':      'Hautarzt Dermatologe',
    'Gynäkologie':       'Frauenarzt Gynäkologe',
    'Augenheilkunde':    'Augenarzt Ophthalmologe',
    'Zahnheilkunde':     'Zahnarzt',
    'HNO':               'HNO Arzt Hals Nasen Ohren',
};

// POST /api/places/doctors
// Body: { specialty, district, limit }
router.post('/doctors', async (req, res) => {
    const { specialty, district, limit = 5 } = req.body;
    const key = process.env.GOOGLE_PLACES_API_KEY;

    if (!key || key.startsWith('HIER_')) {
        return res.status(503).json({ error: 'kein_key', message: 'Kein Google Places API-Key konfiguriert.' });
    }

    const term = SPECIALTY_QUERIES[specialty] || specialty || 'Arzt';
    // Normalize district: "Wien 10." or "10." or "10" → "10. Bezirk Wien"
    let location = 'Wien';
    if (district) {
        const num = district.replace(/Wien\s*/i, '').replace(/\.$/, '').trim();
        location = `${num}. Bezirk Wien`;
    }
    const textQuery = `${term} ${location}`;

    try {
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': [
                    'places.displayName',
                    'places.formattedAddress',
                    'places.nationalPhoneNumber',
                    'places.internationalPhoneNumber',
                    'places.rating',
                    'places.userRatingCount',
                    'places.googleMapsUri',
                    'places.regularOpeningHours',
                    'places.id',
                ].join(','),
            },
            body: JSON.stringify({
                textQuery,
                languageCode: 'de',
                regionCode: 'AT',
                maxResultCount: Math.min(limit, 10),
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('Places API Fehler:', err);
            return res.status(502).json({ error: 'places_fehler', detail: err });
        }

        const data = await response.json();
        const places = (data.places || []).map(p => ({
            name: p.displayName?.text ?? 'Unbekannt',
            address: p.formattedAddress ?? '',
            phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
            rating: p.rating ?? null,
            ratingCount: p.userRatingCount ?? 0,
            mapsUri: p.googleMapsUri ?? null,
            placeId: p.id ?? null,
            isOpen: p.regularOpeningHours?.openNow ?? null,
        }));

        res.json({ places, query: textQuery, source: 'google' });
    } catch (e) {
        console.error('Places Fehler:', e.message);
        res.status(500).json({ error: 'server_fehler', message: e.message });
    }
});

module.exports = router;
