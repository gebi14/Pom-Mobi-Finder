// main.js
// Marker lokasi user
let userMarker = null;
let userLocation = null; // {lat, lng}
let currentRouteLayer = null;
let lastGeojsonFeatures = []; // store latest fetched features

function detectUserLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation tidak didukung browser Anda');
        return;
    }
    navigator.geolocation.getCurrentPosition(function(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    userLocation = { lat, lng };
        if (userMarker) {
            map.removeLayer(userMarker);
        }
        userMarker = L.marker([lat, lng], {
            icon: L.icon({
                iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(map);
        userMarker.bindPopup('Lokasi Anda').openPopup();
        map.setView([lat, lng], 14);
    }, function(error) {
        alert('Gagal mendapatkan lokasi: ' + error.message);
    });
}

// Tombol deteksi lokasi user (bisa dipanggil dari HTML atau otomatis)
window.detectUserLocation = detectUserLocation;

const map = L.map('map', { zoomControl: false }).setView([-6.9932, 110.4208], 13);
let geojsonLayer = null;

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// add zoom control at bottomright per user preference
L.control.zoom({ position: 'bottomright' }).addTo(map);

const runButton = document.getElementById('run-filter');
const resetButton = document.getElementById('reset-filter');
const searchInput = document.getElementById('search-input');
const routeNearestButton = document.getElementById('btn-route-nearest');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebarEl = document.querySelector('.sidebar');
const aboutBtn = document.getElementById('btn-about');
const feedbackBtn = document.getElementById('btn-feedback');
const modalAbout = document.getElementById('modal-about');
const modalFeedback = document.getElementById('modal-feedback');
const sendFeedbackBtn = document.getElementById('send-feedback');
let selectedRating = 0;

// Definisikan ikon kustom untuk pin peta
const redMarkerIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});


function updateMap() {
    const bbm = document.getElementById('bbm-select') ? (document.getElementById('bbm-select').value ? [document.getElementById('bbm-select').value] : []) : [];
    const pembayaran = document.getElementById('payment-select') ? (document.getElementById('payment-select').value ? [document.getElementById('payment-select').value] : []) : [];
    const delivery = Array.from(document.querySelectorAll('#delivery-group input:checked')).map(el => el.value);
    const jam24Checked = document.getElementById('jam24') ? document.getElementById('jam24').checked : false;
    const jamStart = document.getElementById('jam-start') ? document.getElementById('jam-start').value : '';
    const jamEnd = document.getElementById('jam-end') ? document.getElementById('jam-end').value : '';
    const hargaMin = document.getElementById('harga-min') ? parseInt(document.getElementById('harga-min').value) : 0;
    const hargaMax = document.getElementById('harga-max') ? parseInt(document.getElementById('harga-max').value) : 15000;
    const searchQuery = searchInput.value;

    const queryParams = new URLSearchParams();
    if (bbm.length > 0) queryParams.append('bbm', bbm.join(','));
    if (pembayaran.length > 0) queryParams.append('pembayaran', pembayaran.join(','));
    if (delivery.length > 0) queryParams.append('delivery', delivery.join(','));
    if (hargaMin != null && hargaMax != null) queryParams.append('harga', `${hargaMin}-${hargaMax}`);
    if (jam24Checked) queryParams.append('jamBuka', 'true');
    else if (jamStart && jamEnd) queryParams.append('jamRange', `${jamStart}-${jamEnd}`);
    if (searchQuery) queryParams.append('search', searchQuery);

    const apiUrl = `/api/poms?${queryParams.toString()}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (geojsonLayer) {
                map.removeLayer(geojsonLayer);
            }
            // store features for nearest calculations
            lastGeojsonFeatures = data.features || [];

            geojsonLayer = L.geoJSON(data, {
                // Menggunakan ikon kustom yang baru
                pointToLayer: function (feature, latlng) {
                    return L.marker(latlng, { icon: redMarkerIcon });
                },
                onEachFeature: function (feature, layer) {
                    const deliveryStatus = feature.properties.delivery ? 'Tersedia' : 'Tidak Tersedia';
                    const jamOp = feature.properties.jam_24_jam ? 'Buka 24 Jam' : `Buka: ${feature.properties.jam_buka} - Tutup: ${feature.properties.jam_tutup}`;

                    let imgUrl = feature.properties.url_gambar || '';
                    // Jika url_gambar hanya nama file, ambil dari /images
                    if (imgUrl && !imgUrl.startsWith('http') && !imgUrl.startsWith('/')) {
                        imgUrl = '/images/' + imgUrl;
                    }
                    // Pastikan ekstensi file benar (png/jpg/jpeg/webp/gif)
                    const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
                    let validImg = allowedExt.some(ext => imgUrl.toLowerCase().endsWith(ext));
                                        // Add a button to request routing to this pom and WhatsApp contact
                                        const waNumber = feature.properties.no_wa ? feature.properties.no_wa.replace(/[^0-9+]/g, '') : '';
                                        let waLink = '#';
                                        if (waNumber) {
                                                let normalized = waNumber;
                                                if (normalized.startsWith('0')) normalized = '62' + normalized.slice(1);
                                                if (normalized.startsWith('+')) normalized = normalized.slice(1);
                                                waLink = `https://wa.me/${normalized}`;
                                        }
                                        let popupContent = `
                                                <div style="min-width:220px">
                                                    <h4 style="margin:6px 0 8px">${feature.properties.nama_pom}</h4>
                                                    <img class="popup-image" src="${validImg ? imgUrl : '/images/pom.png'}" alt="gambar_pom" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/images/pom.png';" />
                                                    <div class="popup-row"><div style="flex:1">
                                                        <div style="font-size:0.95em;color:#333;">
                                                            <strong>⛽</strong> ${feature.properties.jenis_bbm_tersedia || '-'}<br>
                                                            <strong>💸</strong> ${feature.properties.metode_pembayaran || '-'}<br>
                                                            <strong>🕛</strong> ${jamOp}<br>
                                                            <strong>🛵</strong> ${deliveryStatus}<br>
                                                        </div>
                                                    </div></div>
                                                    <div class="popup-actions">
                                                        <button class="btn-route-popup" data-lat="${layer.getLatLng().lat}" data-lng="${layer.getLatLng().lng}">Rute</button>
                                                        <a ${waNumber ? `href="${waLink}" target="_blank" rel="noopener"` : ''} class="btn-whatsapp" ${waNumber ? '' : 'onclick="alert(\'Nomor WA tidak tersedia\')"'}>Hubungi</a>
                                                    </div>
                                                </div>
                                        `;
                    layer.bindPopup(popupContent);
                }
            }).addTo(map);
        })
        .catch(error => console.error('Error fetching data:', error));
}

runButton.addEventListener('click', updateMap);

resetButton.addEventListener('click', () => {
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.getElementById('search-input').value = ''; 
    updateMap();
});

// Helper: clear existing drawn route
function clearRoute() {
    if (currentRouteLayer) {
        map.removeLayer(currentRouteLayer);
        currentRouteLayer = null;
    }
    if (window._routePopup) {
        try { map.removeLayer(window._routePopup); } catch(e) { window._routePopup.remove(); }
        window._routePopup = null;
    }
    const infoEl = document.querySelector('.route-info');
    if (infoEl) infoEl.classList.remove('visible');
}

// Compute nearest pom from user location
function findNearestPom() {
    if (!userLocation) {
        alert('Lokasi pengguna belum dideteksi. Klik "Deteksi Lokasi Saya" terlebih dahulu.');
        return null;
    }
    if (!lastGeojsonFeatures || lastGeojsonFeatures.length === 0) {
        alert('Belum ada data pom. Jalankan filter atau muat ulang peta.');
        return null;
    }
    let minDist = Infinity;
    let nearest = null;
    lastGeojsonFeatures.forEach(f => {
        if (!f.geometry || f.geometry.type !== 'Point') return;
        const [lng, lat] = f.geometry.coordinates;
        const d = Math.hypot(lat - userLocation.lat, lng - userLocation.lng);
        if (d < minDist) {
            minDist = d;
            nearest = { feature: f, lat, lng };
        }
    });
    return nearest;
}

// Request route from OSRM and draw it. mode = 'driving' by default
async function drawRoute(fromLat, fromLng, toLat, toLng, mode = 'driving') {
    clearRoute();
    try {
        // OSRM public demo server
        const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
        const url = `https://router.project-osrm.org/route/v1/${mode}/${coords}?overview=full&geometries=geojson`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Gagal mengambil rute dari OSRM');
        const json = await resp.json();
        if (!json.routes || json.routes.length === 0) throw new Error('Rute tidak ditemukan');
        const route = json.routes[0];
        // highlight route in yellow
        currentRouteLayer = L.geoJSON(route.geometry, {
            style: { color: '#FFD600', weight: 8, opacity: 0.95 }
        }).addTo(map);
        // Fit bounds to route + markers
        const bounds = currentRouteLayer.getBounds();
        if (userMarker) bounds.extend(userMarker.getLatLng());
        map.fitBounds(bounds, { padding: [50, 50] });
        // Hide any existing route info panel
        const existingInfo = document.querySelector('.route-info');
        if (existingInfo) existingInfo.classList.remove('visible');

        // Show a popup above the route (midpoint) with vehicle durations
        const distanceKm = (route.distance / 1000).toFixed(2);
        const durationMin = Math.round(route.duration / 60);
        const motorDuration = Math.round(durationMin * 0.85); // rough estimate: motor ~15% faster in urban

        // determine midpoint coordinate of route geometry (take middle coordinate)
        let midLat = (fromLat + toLat) / 2;
        let midLng = (fromLng + toLng) / 2;
        try {
            const coords = route.geometry && route.geometry.coordinates;
            if (coords && coords.length > 0) {
                const mid = coords[Math.floor(coords.length / 2)];
                midLng = mid[0];
                midLat = mid[1];
            }
        } catch (e) { /* fallback to simple midpoint */ }

        const popupContent = `
            <div class="route-popup">
                <div class="route-header">RUTE</div>
                <div class="route-body">
                    <div>Jarak: <strong>${distanceKm} km</strong></div>
                    <div class="vehicle-row"><span>🛵 Durasi (Motor)</span><span>${motorDuration} menit</span></div>
                    <div class="vehicle-row"><span>🚗 Durasi (Mobil)</span><span>${durationMin} menit</span></div>
                    <div style="text-align:right;margin-top:8px;"><button id="popup-clear-route" style="background:linear-gradient(180deg,#ff6f90,#e91e63);color:#fff;border:none;padding:6px 10px;border-radius:6px;">Hapus Rute</button></div>
                </div>
            </div>
        `;

        // open popup at midpoint; close previous routePopup if any
        if (window._routePopup) { window._routePopup.remove(); window._routePopup = null; }
        window._routePopup = L.popup({ className: 'route-popup', closeOnClick: false, autoClose: false })
            .setLatLng([midLat, midLng])
            .setContent(popupContent)
            .openOn(map);
    } catch (err) {
        console.error(err);
        alert('Gagal membuat rute: ' + err.message);
    }
}

// Handle click on any popup's route button using event delegation on the document
document.addEventListener('click', function(e) {
    const btn = e.target.closest && e.target.closest('.btn-route-to');
    if (!btn) return;
    const toLat = parseFloat(btn.getAttribute('data-lat'));
    const toLng = parseFloat(btn.getAttribute('data-lng'));
    if (!userLocation) {
        // try to detect location automatically
        if (confirm('Lokasi belum terdeteksi. Izinkan deteksi lokasi?')) {
            detectUserLocation();
            // wait a bit for geolocation to populate (best-effort)
            setTimeout(() => {
                if (userLocation) drawRoute(userLocation.lat, userLocation.lng, toLat, toLng);
                else alert('Tidak dapat mendeteksi lokasi.');
            }, 1500);
        }
        return;
    }
    drawRoute(userLocation.lat, userLocation.lng, toLat, toLng);
});

// Delegated handler for popup clear route button
document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'popup-clear-route') {
        clearRoute();
    }
});

// Button: route to nearest pom
if (routeNearestButton) {
    routeNearestButton.addEventListener('click', () => {
        const nearest = findNearestPom();
        if (!nearest) return;
        if (!userLocation) {
            if (confirm('Lokasi belum terdeteksi. Izinkan deteksi lokasi?')) {
                detectUserLocation();
                setTimeout(() => {
                    if (userLocation) drawRoute(userLocation.lat, userLocation.lng, nearest.lat, nearest.lng);
                    else alert('Tidak dapat mendeteksi lokasi.');
                }, 1500);
            }
            return;
        }
        drawRoute(userLocation.lat, userLocation.lng, nearest.lat, nearest.lng);
    });
}

// Delegate for new popup route buttons
document.addEventListener('click', function(e) {
    const btn = e.target.closest && e.target.closest('.btn-route-popup');
    if (!btn) return;
    const toLat = parseFloat(btn.getAttribute('data-lat'));
    const toLng = parseFloat(btn.getAttribute('data-lng'));
    if (!userLocation) {
        if (confirm('Lokasi belum terdeteksi. Izinkan deteksi lokasi?')) {
            detectUserLocation();
            setTimeout(() => {
                if (userLocation) drawRoute(userLocation.lat, userLocation.lng, toLat, toLng);
                else alert('Tidak dapat mendeteksi lokasi.');
            }, 1500);
        }
        return;
    }
    drawRoute(userLocation.lat, userLocation.lng, toLat, toLng);
});

// Sidebar toggle
if (toggleSidebarBtn && sidebarEl) {
    toggleSidebarBtn.addEventListener('click', () => {
        sidebarEl.classList.toggle('collapsed');
    });
}

// Modal open/close handlers
function openModal(modal) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
}
function closeModal(modal) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
}
if (aboutBtn && modalAbout) aboutBtn.addEventListener('click', () => openModal(modalAbout));
if (feedbackBtn && modalFeedback) feedbackBtn.addEventListener('click', () => openModal(modalFeedback));
document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', (e) => { const modal = e.target.closest('.modal'); closeModal(modal); }));
// close when clicking outside content
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));

if (sendFeedbackBtn) sendFeedbackBtn.addEventListener('click', () => {
    const txt = document.getElementById('feedback-text').value || '';
    const rating = selectedRating || 0;
    alert('Terima kasih atas feedback Anda:\nRating: ' + rating + ' bintang\nPesan: ' + txt.slice(0, 300));
    closeModal(modalFeedback);
});

// star rating handlers (delegated)
document.addEventListener('click', function(e) {
    const star = e.target.closest && e.target.closest('.star');
    if (!star) return;
    const value = parseInt(star.getAttribute('data-value')) || 0;
    selectedRating = value;
    // update star visuals
    document.querySelectorAll('#rating-stars .star').forEach(s => {
        const v = parseInt(s.getAttribute('data-value')) || 0;
        if (v <= value) s.classList.add('active'); else s.classList.remove('active');
    });
});

updateMap();

// Populate BBM and payment selects from API
async function populateSelects() {
    try {
        const bbmResp = await fetch('/api/bbm');
        const bbmList = await bbmResp.json();
        const bbmSelect = document.getElementById('bbm-select');
        if (bbmSelect && Array.isArray(bbmList)) {
            bbmList.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.jenis_bbm;
                opt.textContent = `${b.jenis_bbm}`;
                bbmSelect.appendChild(opt);
            });
        }

        const payResp = await fetch('/api/payments');
        const payList = await payResp.json();
        const paySelect = document.getElementById('payment-select');
        if (paySelect && Array.isArray(payList)) {
            payList.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.tipe_payment;
                opt.textContent = `${p.tipe_payment}`;
                paySelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.warn('Gagal memuat dropdown BBM/payment', e);
    }
}

populateSelects();

// wire price range labels
document.getElementById('harga-min')?.addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    document.getElementById('harga-min-label').textContent = 'Rp ' + v.toLocaleString('id-ID');
});
document.getElementById('harga-max')?.addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    document.getElementById('harga-max-label').textContent = 'Rp ' + v.toLocaleString('id-ID');
});