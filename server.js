// Mengimpor library yang dibutuhkan
const express = require('express');
const { Client } = require('pg');

// Mengatur konfigurasi database
const client = new Client({ 
    user: 'postgres', 
    host: 'localhost',
    database: 'PomMidi', 
    password: '1234', 
    port: 5432,
});

// Menghubungkan ke database
client.connect()
    .then(() => console.log('Terhubung ke database PostgreSQL'))
    .catch(err => console.error('Koneksi database gagal', err));

// Inisialisasi server Express
const app = express();
const port = 3000;

// Tambahan: Melayani file statis, dengan LANDING.HTML sebagai halaman utama
app.use(express.static('public_front', { index: 'landing.html' }));

// Membuat API untuk mendapatkan data pom
app.get('/api/poms', async (req, res) => {
    try {
        const { bbm, jamBuka, pembayaran, delivery, harga, search } = req.query;
        
        let whereClauses = [];
        let queryParams = [];
        let paramIndex = 1;

        // Logika untuk filter BBM
        if (bbm) {
            const bbmArray = bbm.split(',');
            const placeholders = bbmArray.map(() => `$${paramIndex++}`).join(',');
            whereClauses.push(`EXISTS (SELECT 1 FROM public.pom_bbm pb_sub JOIN public.bbm b_sub ON pb_sub.id_bbm = b_sub.id_bbm WHERE pb_sub.id_pom = p.id_pom AND b_sub.jenis_bbm ILIKE ANY(ARRAY[${placeholders}]))`);
            queryParams = queryParams.concat(bbmArray);
        }

        // Logika untuk filter Pembayaran
        if (pembayaran) {
            const pembayaranArray = pembayaran.split(',');
            const placeholders = pembayaranArray.map(() => `$${paramIndex++}`).join(',');
            whereClauses.push(`EXISTS (SELECT 1 FROM public.pom_payment pp_sub JOIN public.payment pa_sub ON pp_sub.id_payment = pa_sub.id_payment WHERE pp_sub.id_pom = p.id_pom AND pa_sub.tipe_payment ILIKE ANY(ARRAY[${placeholders}]))`);
            queryParams = queryParams.concat(pembayaranArray);
        }

        // Logika untuk filter Jam Buka
        if (jamBuka) {
            const jamBukaArray = jamBuka.split(',');
            const has24Jam = jamBukaArray.includes('true');
            const hasJamTertentu = jamBukaArray.includes('false');
            let jamClauses = [];
            if (has24Jam) {
                jamClauses.push(`j.jam_24_jam = TRUE`);
            }
            if (hasJamTertentu) {
                jamClauses.push(`j.jam_24_jam = FALSE`);
            }
            if (jamClauses.length > 0) {
                whereClauses.push(`(${jamClauses.join(' OR ')})`);
            }
        }
        
        // Logika untuk filter Delivery
        if (delivery) {
            const hasTersedia = delivery.includes('true');
            const hasTidakTersedia = delivery.includes('false');
            let deliveryClauses = [];
            if (hasTersedia) {
                deliveryClauses.push(`p.delivery = TRUE`);
            }
            if (hasTidakTersedia) {
                deliveryClauses.push(`p.delivery = FALSE`);
            }
            if (deliveryClauses.length > 0) {
                whereClauses.push(`(${deliveryClauses.join(' OR ')})`);
            }
        }

        // Logika untuk filter Range Harga per Liter
        // support formats: old tokens or new min-max (e.g., 0-15000)
        if (harga) {
            if (harga.includes('-')) {
                const parts = harga.split('-');
                const min = parseInt(parts[0]) || 0;
                const max = parseInt(parts[1]) || 999999;
                whereClauses.push(`EXISTS (SELECT 1 FROM public.pom_bbm pb_h JOIN public.bbm b_h ON pb_h.id_bbm = b_h.id_bbm WHERE pb_h.id_pom = p.id_pom AND CAST(b_h.harga_bbm AS INTEGER) BETWEEN $${paramIndex} AND $${paramIndex+1})`);
                queryParams.push(min, max);
                paramIndex += 2;
            } else {
                const hargaArray = harga.split(',');
                let hargaClauses = [];
                if (hargaArray.includes('<10000')) {
                    hargaClauses.push(`EXISTS (SELECT 1 FROM public.pom_bbm pb_h JOIN public.bbm b_h ON pb_h.id_bbm = b_h.id_bbm WHERE pb_h.id_pom = p.id_pom AND CAST(b_h.harga_bbm AS INTEGER) < 10000)`);
                }
                if (hargaArray.includes('>12000')) {
                    hargaClauses.push(`EXISTS (SELECT 1 FROM public.pom_bbm pb_h JOIN public.bbm b_h ON pb_h.id_bbm = b_h.id_bbm WHERE pb_h.id_pom = p.id_pom AND CAST(b_h.harga_bbm AS INTEGER) > 12000)`);
                }
                if (hargaClauses.length > 0) {
                    whereClauses.push(`(${hargaClauses.join(' OR ')})`);
                }
            }
        }

        // Logika untuk jam range: jamRange=HH:MM-HH:MM -> find poms where opening interval overlaps
        const jamRange = req.query.jamRange;
        if (jamRange) {
            try {
                const parts = jamRange.split('-');
                const start = parts[0];
                const end = parts[1];
                // compare times by casting strings to time
                whereClauses.push(`(j.jam_24_jam = TRUE OR (CAST(j.jam_buka AS time) <= $${paramIndex}::time AND CAST(j.jam_tutup AS time) >= $${paramIndex+1}::time) OR (CAST(j.jam_buka AS time) <= $${paramIndex+1}::time AND CAST(j.jam_tutup AS time) >= $${paramIndex}::time))`);
                queryParams.push(start, end);
                paramIndex += 2;
            } catch (e) {
                // ignore parsing errors
            }
        }

        // Logika untuk fitur pencarian lokasi
        if (search) {
            whereClauses.push(`p.nama_pom ILIKE $${paramIndex++}`);
            queryParams.push(`%${search}%`);
        }
        
        let query = `
            SELECT
                p.nama_pom,
                ST_AsGeoJSON(p.koordinat_pom) AS geom,
                p.no_wa,
                p.delivery,
                p.url_gambar, 
                string_agg(DISTINCT b.jenis_bbm, ', ') AS jenis_bbm_tersedia,
                string_agg(DISTINCT pa.tipe_payment, ', ') AS metode_pembayaran,
                j.jam_24_jam,
                j.jam_buka,
                j.jam_tutup
            FROM
                public.pom p
            JOIN
                public.pom_bbm pb ON p.id_pom = pb.id_pom
            JOIN
                public.bbm b ON pb.id_bbm = b.id_bbm
            JOIN
                public.pom_payment pp ON p.id_pom = pp.id_pom
            JOIN
                public.payment pa ON pp.id_payment = pa.id_payment
            JOIN
                public.pom_jam pj ON p.id_pom = pj.id_pom
            JOIN
                public.jam j ON pj.id_jam = j.id_jam
        `;

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += `
            GROUP BY
                p.nama_pom, p.koordinat_pom, p.no_wa, p.delivery, p.url_gambar, j.jam_24_jam, j.jam_buka, j.jam_tutup;
        `;

        const result = await client.query(query, queryParams);

        const features = result.rows.map(row => ({
            type: 'Feature',
            geometry: JSON.parse(row.geom),
            properties: {
                nama_pom: row.nama_pom,
                no_wa: row.no_wa,
                delivery: row.delivery, 
                url_gambar: row.url_gambar,
                jenis_bbm_tersedia: row.jenis_bbm_tersedia,
                metode_pembayaran: row.metode_pembayaran,
                jam_24_jam: row.jam_24_jam,
                jam_buka: row.jam_buka,
                jam_tutup: row.jam_tutup
            },
        }));

        const geojson = {
            type: 'FeatureCollection',
            features: features,
        };

        res.json(geojson);
    } catch (err) {
        console.error('Error saat menjalankan query', err);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Jalankan server
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});

// API: list all bbm types
app.get('/api/bbm', async (req, res) => {
    try {
        const r = await client.query('SELECT id_bbm, jenis_bbm, harga_bbm FROM public.bbm ORDER BY jenis_bbm');
        res.json(r.rows);
    } catch (e) {
        console.error('Error fetching bbm list', e);
        res.status(500).json({ error: 'server error' });
    }
});

// API: list payment types
app.get('/api/payments', async (req, res) => {
    try {
        const r = await client.query('SELECT id_payment, tipe_payment FROM public.payment ORDER BY tipe_payment');
        res.json(r.rows);
    } catch (e) {
        console.error('Error fetching payment list', e);
        res.status(500).json({ error: 'server error' });
    }
});