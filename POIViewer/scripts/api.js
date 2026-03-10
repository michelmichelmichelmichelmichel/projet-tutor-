export class ApiService {
    constructor() {
        this.overpassUrl = 'https://overpass.private.coffee/api/interpreter';
        this.nominatimUrl = 'https://nominatim.openstreetmap.org/search';
        this.geoGouvUrl = 'https://geo.api.gouv.fr/communes';
        this.wikidataUrl = 'https://query.wikidata.org/sparql';

        this._dbPromise = null;

        // État du pays actuel (France par défaut)
        this.currentCountryAreaId = 3601403916;
        this.currentCountryCode = 'fr';
        this.currentCountryName = 'France';

        // Anti-spam lock for concurrent requests on the same area
        this._pendingFetches = new Map();
        this.wikidataCache = new Map();
        // Optionnel : un autre proxy si besoin, par ex: "https://corsproxy.io/?" 
        this.corsProxy = "https://api.allorigins.win/raw?url=";
        this.inseeData = null;
    }

    setCountry(name, code, areaId) {
        this.currentCountryName = name;
        this.currentCountryCode = code;
        this.currentCountryAreaId = areaId;
    }

    /**
     * Charge les données INSEE pré-calculées une seule fois
     */
    async loadInseeData() {
        if (this.inseeData) return this.inseeData;
        try {
            console.log("Loading INSEE data...");
            const response = await fetch('./data/insee_data.json');
            if (response.ok) {
                this.inseeData = await response.json();
                console.log("INSEE data loaded successfully.");
            } else {
                console.warn("Could not load INSEE data. Status:", response.status);
            }
        } catch (error) {
            console.error("Error loading INSEE data:", error);
        }
        return this.inseeData;
    }

    /**
     * Récupère les stats INSEE pour une ou plusieurs zones (si on passe un tableau de codes INSEE)
     * Actuellement, on suppose un seul code INSEE (ex: "06088" pour Nice)
     */
    getInseeStats(inseeCode) {
        if (!this.inseeData || !inseeCode) return null;
        return this.inseeData[inseeCode] || null;
    }

    async fetchPOIs(latLngs, selectedCategories = []) {
        // --- Cache IndexedDB ---
        // Clé basée UNIQUEMENT sur le polygone (pas les catégories).
        // On stocke toujours TOUTES les données, le filtrage par catégorie est côté client.
        const cacheKey = this._buildPOICacheKey(latLngs);
        const POI_CACHE_DURATION = 60 * 60 * 1000; // 1 heure
        let cachedEntry = null;

        // 1. Check if a network request is already ongoing for this exact polygon
        if (this._pendingFetches.has(cacheKey)) {
            console.log("⏳ Requête déjà en cours pour cette zone, attente...");
            try {
                // Wait for the ongoing fetch to finish, then we filter the result
                const fullResult = await this._pendingFetches.get(cacheKey);
                return this._filterByCategories(fullResult, selectedCategories);
            } catch (e) {
                // Ignore the error here, it will be handled by the original fetcher
            }
        }

        try {
            cachedEntry = await this._idbGet(cacheKey);
            if (cachedEntry && (Date.now() - cachedEntry.timestamp < POI_CACHE_DURATION)) {
                console.log("✅ Chargement des POIs depuis le cache IndexedDB");
                // Filtrage côté client par catégories sélectionnées
                return this._filterByCategories(cachedEntry.data, selectedCategories);
            }
        } catch (e) {
            console.warn("Lecture cache IndexedDB échouée:", e);
        }

        // Handle both simple arrays [pt] and multi-polygon arrays [[pt], [pt]]
        const rings = (latLngs && latLngs.length > 0 && Array.isArray(latLngs[0]) && !('lat' in latLngs[0])) ? latLngs : [latLngs];

        // ANTI-PLANTAGE "400 Bad Request" (XML) :
        // Si la région est composées de centaines de micro-îles (MultiPolygone massif),
        // On ne conserve que les 5 plus gros morceaux pour interroger Overpass.
        const topRings = [...rings]
            .sort((a, b) => b.length - a.length)
            .slice(0, 5);

        // Convert Leaflet LatLngs to Overpass Poly Strings array
        let polyCoordsArray = topRings.map(ring => {
            let points = [...ring];

            // ANTI-PLANTAGE "413 Request Entity Too Large" :
            // Overpass refuse les requêtes dont le body POST est trop massif.
            // Si la frontière géographique téléchargée a des dizaines de milliers de points
            // on sous-échantillonne pour diviser drastiquement le poids du string géométrique.
            const maxPointsPerRing = 150;
            if (points.length > maxPointsPerRing) {
                const step = Math.ceil(points.length / maxPointsPerRing);
                points = points.filter((_, index) => index % step === 0);
            }

            if (points.length > 0) {
                const first = points[0];
                const last = points[points.length - 1];
                if (first.lat !== last.lat || first.lng !== last.lng) {
                    points.push(first);
                }
            }

            // Un polygone valide pour Overpass nécessite au moins 3 points distincts
            if (points.length >= 3) {
                return points.map(pt => `${pt.lat} ${pt.lng}`).join(' ');
            }
            return null;
        }).filter(Boolean);

        if (polyCoordsArray.length === 0) {
            console.warn("⚠️ Polygones invalides ou trop petits, requête annulée.");
            return { pois: [], networks: [] };
        }

        // Define the network fetch operation as a single Promise we can share
        const fetchPromise = (async () => {
            const categoryToKeys = {
                'tourism': ['tourism'],
                'sustenance': ['amenity'],
                'accommodation': ['amenity', 'tourism'],
                'leisure': ['leisure'],
                'sport': ['sport'],
                'historic': ['historic'],
                'natural': ['natural', 'mountain_pass', 'waterway'],
                'shop': ['shop'],
                'amenity': ['amenity'],
                'transport': ['public_transport', 'railway'],
                'healthcare': ['amenity', 'healthcare'],
                'office': ['office'],
                'craft': ['craft']
            };

            const allKeys = new Set();
            Object.values(categoryToKeys).flat().forEach(k => allKeys.add(k));
            const keysRegex = Array.from(allKeys).join('|');

            // Build queries for multiple polygons (if MultiPolygon)
            const nodeQuery = polyCoordsArray.map(polyCoords =>
                `node[~"^(${keysRegex})$"~"."](poly:"${polyCoords}");`
            ).join('\n              ');

            const wayQuery = polyCoordsArray.map(polyCoords => `
                  way["highway"](poly:"${polyCoords}");
                  way["railway"](poly:"${polyCoords}");
                  way["aerialway"](poly:"${polyCoords}");
                  way["piste:type"](poly:"${polyCoords}");
                  way["waterway"](poly:"${polyCoords}");
                  relation["waterway"](poly:"${polyCoords}");
                  way["natural"="water"](poly:"${polyCoords}");
                  relation["natural"="water"](poly:"${polyCoords}");
                  way["landuse"="reservoir"](poly:"${polyCoords}");
                  relation["landuse"="reservoir"](poly:"${polyCoords}");
                  way["landuse"="basin"](poly:"${polyCoords}");
                  relation["route"~"hiking|foot|bicycle|mtb|ski|piste"](poly:"${polyCoords}");
            `).join('');

            const query = `
                [out:json][timeout:60];
                (
                  ${nodeQuery}
                  ${wayQuery}
                );
                out geom;
            `;

            console.log("🌍 Téléchargement des POIs depuis Overpass...");
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`
            });

            if (!response.ok) throw new Error(`Overpass API Error: ${response.statusText}`);

            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error("The Overpass server returned an invalid format (likely an XML error page). Try switching servers.");
            }

            // Format and save to cache
            const fullResult = this.processData(data.elements, []);
            try {
                await this._idbPut(cacheKey, { timestamp: Date.now(), data: fullResult });
                await this._cleanupPOICache();
                console.log("💾 POIs sauvegardés dans le cache IndexedDB");
            } catch (e) {
                console.warn("Impossible d'écrire le cache POI:", e);
            }
            return fullResult;
        })();

        // Store promise to block concurrent requests
        this._pendingFetches.set(cacheKey, fetchPromise);

        try {
            const fullResult = await fetchPromise;
            return this._filterByCategories(fullResult, selectedCategories);
        } catch (error) {
            console.error("API Error:", error);
            if (cachedEntry) {
                console.warn("⚠️ Utilisation du cache POI expiré (fallback réseau)");
                return this._filterByCategories(cachedEntry.data, selectedCategories);
            }
            throw error;
        } finally {
            this._pendingFetches.delete(cacheKey);
        }

    }

    /**
     * Filtre les POIs par catégories sélectionnées (côté client).
     * Les networks ne sont jamais filtrés par catégorie.
     */
    _filterByCategories(data, selectedCategories) {
        // Robustesse : si data est de l'ancien format (tableau de POIs)
        if (Array.isArray(data)) {
            data = { pois: data, networks: [] };
        }

        // Sécurité supplémentaire
        if (!data || !data.pois) return { pois: [], networks: [] };

        const explicitlyNone = selectedCategories.length === 1 && selectedCategories[0] === 'none';
        if (selectedCategories.length === 0) {
            // Pas de filtre = tout retourner
            return data;
        }
        if (explicitlyNone) {
            return { pois: [], networks: data.networks || [] };
        }
        return {
            pois: data.pois.filter(p => selectedCategories.includes(p.category)),
            networks: data.networks || []
        };
    }

    // Calcule la distance en mètres entre deux points (Formule de Haversine)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Rayon de la terre en mètres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    processData(elements, selectedCategories = []) {
        const pois = [];
        const networks = [];

        // Dictionnaire de dédoublonnage géographique
        // Structure : { "nom_catégorie": [{lat, lng}, ...], ... }
        const seenPois = {};

        elements.forEach(el => {
            if (el.type === 'node' && el.tags) {
                const info = this.detectCategoryAndType(el.tags);
                const isSelected = selectedCategories.length === 0 || selectedCategories.includes(info.category);

                if (info.category !== 'unknown' && isSelected) {
                    // FILTRE : On ignore les entités administratives (villes, villages...)
                    // dans la liste des POIs car ce ne sont pas des points d'intérêt.
                    if (info.category === 'place') return;

                    const poiName = el.tags.name || info.type.replace(/_/g, ' ') || "Lieu sans nom";
                    // Clé unique = nom (minuscule) + catégorie
                    // Évite de comparer une boulangerie et une pharmacie homonymes
                    const uniqueKey = `${poiName.toLowerCase()}_${info.category}`;

                    // Logique de dédoublonnage géographique (seuil : 500 m)
                    let isTooClose = false;
                    if (seenPois[uniqueKey]) {
                        isTooClose = seenPois[uniqueKey].some(existingLoc => {
                            const dist = this.calculateDistance(el.lat, el.lon, existingLoc.lat, existingLoc.lng);
                            return dist < 500;
                        });
                    }

                    if (!isTooClose) {
                        if (!seenPois[uniqueKey]) seenPois[uniqueKey] = [];
                        seenPois[uniqueKey].push({ lat: el.lat, lng: el.lon });

                        // --- Extraction des données digitales OSM ---
                        const hasWebsite = !!(el.tags.website || el.tags['contact:website'] || el.tags.url);
                        
                        const socialMediaKeys = ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'tiktok'];
                        const hasSocialMedia = Object.keys(el.tags).some(key => 
                            socialMediaKeys.some(sm => key.includes(sm) || (key.startsWith('contact:') && key.includes(sm)))
                        );

                        const hasWikivoyage = !!el.tags.wikivoyage;

                        pois.push({
                            id: el.id,
                            lat: el.lat,
                            lng: el.lon,
                            name: poiName,
                            category: info.category,
                            type: info.type,
                            tags: el.tags,
                            digital: {
                                hasWebsite,
                                hasSocialMedia,
                                hasWikivoyage,
                                wikidataLanguagesCount: null, // Sera rempli plus tard si fetchWikidata est appelé
                                wikidataHasWikivoyage: false
                            }
                        });
                    }
                }
            } else if (el.type === 'way' && el.tags && el.geometry) {
                // Extraire un centroïde pour les plans d'eau (lacs, étangs) et les afficher comme POIs
                if (el.tags.natural === 'water' && el.geometry.length >= 4) {
                    const lats = el.geometry.map(p => p.lat);
                    const lngs = el.geometry.map(p => p.lon);
                    const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
                    const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
                    const waterType = el.tags.water || 'water';
                    const waterName = el.tags.name || (waterType === 'lake' ? 'Lac' : waterType === 'pond' ? 'Étang' : 'Plan d\'eau');
                    pois.push({
                        id: el.id,
                        lat: centerLat,
                        lng: centerLng,
                        name: waterName,
                        category: 'natural',
                        type: waterType,
                        tags: el.tags
                    });
                }
                networks.push({
                    id: el.id,
                    type: el.tags.highway || el.tags.railway || el.tags.aerialway || el.tags['piste:type'] || 'unknown',
                    tags: el.tags,
                    geometry: el.geometry
                });
            } else if (el.type === 'relation' && el.tags && el.members) {
                el.members.forEach(m => {
                    if (m.type === 'way' && m.geometry) {
                        networks.push({
                            id: m.ref || el.id + '_' + Math.random(),
                            type: 'relation',
                            relationName: el.tags.name,
                            relationRef: el.tags.ref,
                            relationRoute: el.tags.route,
                            tags: el.tags,
                            geometry: m.geometry
                        });
                    }
                });
            }
        });

        return { pois, networks };
    }

    detectCategoryAndType(tags) {
        // ... existing code ...
        // Order matters for priority
        if (tags.tourism) return { category: 'tourism', type: tags.tourism };
        // ... (abbreviated for context, actually just appending method to class)
        if (tags.historic) return { category: 'historic', type: tags.historic };
        if (tags.natural) return { category: 'natural', type: tags.natural };
        if (tags.leisure) return { category: 'leisure', type: tags.leisure };
        if (tags.shop) return { category: 'shop', type: tags.shop };
        if (tags.craft) return { category: 'craft', type: tags.craft };
        if (tags.office) return { category: 'office', type: tags.office };
        if (tags.healthcare) return { category: 'healthcare', type: tags.healthcare };
        if (tags.waterway && ['waterfall', 'spring', 'dam'].includes(tags.waterway)) return { category: 'natural', type: tags.waterway };
        if (tags.mountain_pass) return { category: 'natural', type: 'mountain_pass' };

        if (tags.public_transport || tags.railway) return { category: 'transport', type: tags.railway || tags.public_transport };

        if (tags.amenity) {
            const val = tags.amenity;
            if (['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream'].includes(val)) return { category: 'sustenance', type: val };
            if (['shelter', 'hotel', 'guest_house', 'hostel', 'camp_site', 'apartment'].includes(val)) return { category: 'accommodation', type: val };
            if (['clinic', 'hospital', 'doctors', 'pharmacy'].includes(val)) return { category: 'healthcare', type: val };
            return { category: 'amenity', type: val };
        }

        if (tags.sport) return { category: 'sport', type: tags.sport };
        if (tags.place && ['village', 'hamlet', 'city', 'town', 'locality'].includes(tags.place)) return { category: 'place', type: tags.place };

        return { category: 'unknown', type: 'unknown' };
    }

    async fetchPoiImage(lat, lng) {
        // ggsnamespace=6 restricts search to 'File:' namespace (Images/Medias)
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lng}&ggsradius=1000&ggsnamespace=6&prop=imageinfo&iiprop=url&format=json&origin=*&ggslimit=1`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.query && data.query.pages) {
                const pageId = Object.keys(data.query.pages)[0];
                const page = data.query.pages[pageId];
                if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
                    return page.imageinfo[0].url;
                }
            }
        } catch (error) {
            console.warn("Wikimedia Image Fetch Error:", error);
        }
        return null;
    }


    async fetchParkBoundary(relationId) {
        // Fetch simplified GeoJSON from polygons.openstreetmap.fr
        // params=0 means default simplification
        const url = `http://polygons.openstreetmap.fr/get_geojson.py?id=${relationId}&params=0`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Network response was not ok");
            return await response.json();
        } catch (error) {
            console.error("Error fetching park boundary:", error);
            return null;
        }
    }

    async fetchParksFromCollection(collectionId) {
        const query = `
            [out:json][timeout:25];
            relation(${collectionId});
            relation(r);
            out tags bb;
        `;

        try {
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`
            });

            if (!response.ok) throw new Error(`Overpass API Error: ${response.statusText}`);

            const data = await response.json();

            const parks = data.elements.map(el => ({
                name: el.tags.name,
                relationId: el.id,
                bounds: [
                    [el.bounds.minlat, el.bounds.minlon],
                    [el.bounds.maxlat, el.bounds.maxlon]
                ]
            }));

            // Sort by name
            return parks.sort((a, b) => a.name.localeCompare(b.name));

        } catch (error) {
            console.error("Error fetching parks from collection:", error);
            return [];
        }
    }

    async searchCountries(query) {
        if (!query || query.length < 3) return [];
        // AJOUT DE &addressdetails=1 à la fin de l'URL pour forcer Nominatim à renvoyer le code pays
        const url = `https://nominatim.openstreetmap.org/search?country=${encodeURIComponent(query)}&format=json&featuretype=country&limit=5&addressdetails=1`;

        try {
            const resp = await fetch(url);
            const data = await resp.json();

            return data.filter(d => d.osm_type === 'relation').map(d => ({
                // On nettoie le nom pour avoir juste "Italie" au lieu de "Italie, Europe"
                name: d.name || d.display_name.split(',')[0],

                // On va chercher le code pays au bon endroit (dans d.address)
                countryCode: (d.address && d.address.country_code) ? d.address.country_code : 'fr',

                areaId: 3600000000 + parseInt(d.osm_id),
                bounds: [
                    [parseFloat(d.boundingbox[0]), parseFloat(d.boundingbox[2])],
                    [parseFloat(d.boundingbox[1]), parseFloat(d.boundingbox[3])]
                ]
            }));
        } catch (e) {
            console.error("Erreur recherche pays:", e);
            return [];
        }
    }

    async fetchParks() {
        const CACHE_KEY = `parks_cache_${this.currentCountryAreaId}`;
        const CACHE_DURATION = 24 * 60 * 60 * 1000;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) return data;
            } catch (e) { }
        }

        const query = `
            [out:json][timeout:50];
            area(${this.currentCountryAreaId})->.searchArea;
            (
              relation["boundary"="national_park"](area.searchArea);
              relation["boundary"="protected_area"]["protect_class"~"2|5"](area.searchArea);
            );
            out tags bb;
        `;

        try {
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`
            });
            if (!response.ok) throw new Error(`Erreur Overpass: ${response.status}`);
            const data = await response.json();
            const parks = data.elements
                .filter(el => el.tags && el.tags.name)
                .map(el => ({
                    name: el.tags.name,
                    relationId: el.id,
                    wikidata: el.tags.wikidata || null,
                    population: el.tags.population ? parseInt(el.tags.population, 10) : null,
                    bounds: [[el.bounds.minlat, el.bounds.minlon], [el.bounds.maxlat, el.bounds.maxlon]]
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: parks }));
            return parks;
        } catch (error) {
            console.error("Erreur chargement parcs:", error);
            if (cached) return JSON.parse(cached).data;
            return [];
        }
    }

    async fetchRegions() {
        return this._fetchAdminArea(`regions_cache_${this.currentCountryAreaId}`, '4');
    }

    async fetchDepartments() {
        return this._fetchAdminArea(`depts_cache_${this.currentCountryAreaId}`, '6');
    }

    // Helper for Regions/Departments
    async _fetchAdminArea(cacheKey, adminLevel) {
        const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) return data;
            } catch (e) { }
        }

        const query = `
            [out:json][timeout:90];
            area(${this.currentCountryAreaId})->.searchArea;
            relation["boundary"="administrative"]["admin_level"="${adminLevel}"](area.searchArea);
            out tags bb;
        `;

        try {
            console.log(`🌍 Téléchargement admin_level=${adminLevel} depuis Overpass (Area)...`);
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`
            });

            if (response.status === 429) {
                console.warn("⚠️ Trop de requêtes (429).");
                if (cached) return JSON.parse(cached).data;
                throw new Error("API Limit Reached");
            }
            if (response.status === 504) {
                console.warn("⚠️ Timeout Overpass (504).");
                if (cached) return JSON.parse(cached).data;
                throw new Error("API Timeout");
            }
            if (!response.ok) throw new Error(`Erreur Overpass: ${response.status}`);

            const data = await response.json();

            const results = data.elements
                .filter(el => el.tags && el.tags.name)
                .map(el => ({
                    name: el.tags.name,
                    ref: el.tags['ref:INSEE'] || el.tags.ref,
                    relationId: el.id,
                    wikidata: el.tags.wikidata || null,
                    population: el.tags.population ? parseInt(el.tags.population, 10) : null,
                    bounds: [
                        [el.bounds.minlat, el.bounds.minlon],
                        [el.bounds.maxlat, el.bounds.maxlon]
                    ]
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: results
            }));

            return results;

        } catch (error) {
            console.error(`Erreur chargement admin_level=${adminLevel}:`, error);
            if (cached) return JSON.parse(cached).data;
            return [];
        }
    }

    async searchCommunes(query) {
        if (!query || query.length < 3) return [];

        if (this.currentCountryCode === 'fr') {
            // API GeoGouv pour la France (très rapide et précise)
            const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,code,codeDepartement,codesPostaux,population&format=geojson&geometry=contour&boost=population&limit=10`;
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error("GeoAPI Error");
                const data = await response.json();
                if (!data.features) return [];
                return data.features.map(feature => {
                    const props = feature.properties;
                    const geometry = feature.geometry;

                    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
                    const allPoints = [];
                    if (geometry.type === 'Polygon') geometry.coordinates[0].forEach(p => allPoints.push(p));
                    else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(poly => poly[0].forEach(p => allPoints.push(p)));

                    allPoints.forEach(pt => {
                        const [lon, lat] = pt;
                        if (lon < minLon) minLon = lon;
                        if (lon > maxLon) maxLon = lon;
                        if (lat < minLat) minLat = lat;
                        if (lat > maxLat) maxLat = lat;
                    });

                    return {
                        name: props.nom,
                        fullName: `${props.nom} (${props.codesPostaux ? props.codesPostaux[0] : props.code})`,
                        type: 'city',
                        code: props.code,
                        ref: props.code, // NOUVEAU: on expose aussi `ref` (Code INSEE)
                        codeDepartement: props.codeDepartement || null,
                        geometry: geometry,
                        bounds: [[minLat, minLon], [maxLat, maxLon]],
                        lat: (minLat + maxLat) / 2,
                        lon: (minLon + maxLon) / 2,
                        population: props.population || null
                    };
                });
            } catch (error) { console.error(error); return []; }
        } else {
            // Nominatim OSM pour l'international avec polygones
            const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(query)}&country=${encodeURIComponent(this.currentCountryName)}&format=json&polygon_geojson=1&extratags=1&limit=10`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                return data.map(d => {
                    const bbox = d.boundingbox;
                    const minLat = parseFloat(bbox[0]);
                    const maxLat = parseFloat(bbox[1]);
                    const minLon = parseFloat(bbox[2]);
                    const maxLon = parseFloat(bbox[3]);
                    return {
                        name: d.name || d.display_name.split(',')[0],
                        fullName: d.display_name,
                        type: 'city',
                        code: d.osm_id,
                        ref: d.osm_id,
                        wikidata: d.extratags ? d.extratags.wikidata : null, // Capture le wikidata
                        geometry: d.geojson,
                        bounds: [[minLat, minLon], [maxLat, maxLon]],
                        lat: parseFloat(d.lat),
                        lon: parseFloat(d.lon),
                        population: d.extratags ? parseInt(d.extratags.population, 10) : null
                    };
                }).filter(d => d.geometry && (d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon'));
            } catch (error) {
                console.error("Erreur recherche ville internationale:", error);
                return [];
            }
        }
    }

    async fetchWikidata(wikidataId) {
        if (!wikidataId) return null;
        const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&format=json&props=descriptions|claims|sitelinks&languages=fr|en&origin=*`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            const entity = data.entities[wikidataId];
            if (!entity) return null;

            // --- Helper: extract first claim value ---
            const claim = (prop) => entity.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value ?? null;

            // Description (fr fallback en)
            const description =
                entity.descriptions?.fr?.value ||
                entity.descriptions?.en?.value ||
                null;

            // P856 — Site officiel
            const website = claim('P856');

            // P18 — Image principale
            let image = null;
            if (entity.claims?.P18?.[0]?.mainsnak?.datavalue) {
                const imageName = entity.claims.P18[0].mainsnak.datavalue.value.replace(/ /g, '_');
                image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName)}?width=800`;
            }

            // Wikipedia fr link
            let wikipedia = null;
            if (entity.sitelinks?.frwiki) {
                const title = entity.sitelinks.frwiki.title;
                wikipedia = `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
            }

            // P1082 — Population
            let population = null;
            if (entity.claims?.P1082) {
                // Take the most recent (last in list, often has rank preferred)
                const popClaims = entity.claims.P1082;
                const preferred = popClaims.find(c => c.rank === 'preferred') || popClaims[popClaims.length - 1];
                if (preferred?.mainsnak?.datavalue?.value?.amount) {
                    population = parseInt(preferred.mainsnak.datavalue.value.amount, 10);
                }
            }

            // P2044 — Altitude (m)
            let elevation = null;
            const elClaim = claim('P2044');
            if (elClaim?.amount) elevation = Math.round(parseFloat(elClaim.amount));

            // P571 — Date de fondation/création
            let inception = null;
            const incClaim = claim('P571');
            if (incClaim?.time) {
                // format: +1850-00-00T00:00:00Z → "1850"
                const match = incClaim.time.match(/^\+?(\d{4})/);
                if (match) inception = match[1];
            }

            // P1435 — Classement patrimoine (label de l'item QID)
            let heritage = null;
            const herClaim = entity.claims?.P1435?.[0]?.mainsnak?.datavalue?.value?.id;
            if (herClaim) {
                // Common known QIDs → readable label (avoid extra API call)
                const heritageMap = {
                    Q916334: 'Monument historique classé',
                    Q2562402: 'Monument historique inscrit',
                    Q111643416: 'Site classé',
                    Q60023: 'Patrimoine mondial UNESCO',
                    Q1194071: 'Site inscrit UNESCO'
                };
                heritage = heritageMap[herClaim] || 'Classé patrimoine';
            }

            // P84 — Architecte
            let architect = null;
            const archClaim = entity.claims?.P84?.[0]?.mainsnak?.datavalue?.value?.id;
            if (archClaim) {
                // We'll resolve the label with a minimal extra request
                try {
                    const archResp = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${archClaim}&format=json&props=labels&languages=fr|en&origin=*`);
                    const archData = await archResp.json();
                    const archEntity = archData.entities[archClaim];
                    architect = archEntity?.labels?.fr?.value || archEntity?.labels?.en?.value || null;
                } catch (_) { /* ignore */ }
            }

            // P2046 — Superficie (km²)
            let area = null;
            const areaClaim = claim('P2046');
            if (areaClaim?.amount) {
                area = parseFloat(parseFloat(areaClaim.amount).toFixed(2));
            }

            // --- Données digitales (Sitelinks) ---
            let wikidataLanguagesCount = 0;
            let wikidataHasWikivoyage = false;

            if (entity.sitelinks) {
                const slKeys = Object.keys(entity.sitelinks);
                // Compter le nombre de pages Wikipedia (clés terminant par 'wiki')
                wikidataLanguagesCount = slKeys.filter(k => k.endsWith('wiki')).length;
                // Vérifier si une page Wikivoyage existe (clés terminant par 'wikivoyage')
                wikidataHasWikivoyage = slKeys.some(k => k.endsWith('wikivoyage'));
            }

            return { description, website, image, wikipedia, population, elevation, inception, heritage, architect, area, wikidataLanguagesCount, wikidataHasWikivoyage };

        } catch (error) {
            console.warn("Wikidata fetch error:", error);
            return null;
        }
    }

    /**
     * Fetch up to `limit` thumbnail image URLs from Wikimedia Commons
     * for a given Commons category or file page title.
     * Falls back to geocoordinate search if no title is provided.
     * @param {number} lat
     * @param {number} lng
     * @param {number} limit
     */
    async fetchWikimediaImages(lat, lng, limit = 5) {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lng}&ggsradius=500&ggsnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=600&format=json&origin=*&ggslimit=${limit}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!data.query?.pages) return [];
            return Object.values(data.query.pages)
                .filter(p => p.imageinfo?.[0]?.url)
                .map(p => ({
                    url: p.imageinfo[0].url,
                    thumbUrl: p.imageinfo[0].thumburl || p.imageinfo[0].url,
                    title: p.imageinfo[0].extmetadata?.ObjectName?.value || p.title?.replace('File:', '') || ''
                }));
        } catch (error) {
            console.warn("Wikimedia images fetch error:", error);
            return [];
        }
    }



    // ---- VOISINS ----

    /**
     * Récupère les communes du même département et retourne celles qui
     * intersectent la vue écran.
     * @param {string} deptCode  Code département (ex: "64")
     * @param {object} screenBounds  { minLat, minLng, maxLat, maxLng }
     * @param {string} excludeCode  Code INSEE de la commune active à exclure
     */
    async fetchNeighborCommunes(deptCode, screenBounds, excludeCode = null) {
        const url = `https://geo.api.gouv.fr/departements/${deptCode}/communes?fields=nom,code,codeDepartement&format=geojson&geometry=contour`;
        return this._fetchAndFilterNeighbors(url, screenBounds, excludeCode, 'commune');
    }

    /**
     * Récupère tous les départements et retourne ceux qui intersectent la vue écran.
     * @param {object} screenBounds  { minLat, minLng, maxLat, maxLng }
     * @param {string} excludeCode  Code du département actif à exclure
     */
    async fetchNeighborDepts(screenBounds, excludeCode = null) {
        const url = `https://geo.api.gouv.fr/departements?fields=nom,code&format=geojson&geometry=contour`;
        return this._fetchAndFilterNeighbors(url, screenBounds, excludeCode, 'dept');
    }

    /**
     * Récupère toutes les régions et retourne celles qui intersectent la vue écran.
     * @param {object} screenBounds  { minLat, minLng, maxLat, maxLng }
     * @param {string} excludeCode  Code de la région active à exclure
     */
    async fetchNeighborRegions(screenBounds, excludeCode = null) {
        const url = `https://geo.api.gouv.fr/regions?fields=nom,code&format=geojson&geometry=contour`;
        return this._fetchAndFilterNeighbors(url, screenBounds, excludeCode, 'region');
    }

    /** Fetch un FeatureCollection GéoGouv et filtre par bbox écran. */
    async _fetchAndFilterNeighbors(url, screenBounds, excludeCode, type) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`GéoGouv error: ${response.status}`);
            const data = await response.json();
            if (!data.features) return [];

            return data.features
                .filter(feature => {
                    const props = feature.properties;
                    if (excludeCode && props.code === excludeCode) return false;

                    const coords = this._extractAllCoords(feature.geometry);
                    if (coords.length === 0) return false;

                    let minLat = Infinity, maxLat = -Infinity;
                    let minLng = Infinity, maxLng = -Infinity;
                    coords.forEach(([lng, lat]) => {
                        if (lat < minLat) minLat = lat;
                        if (lat > maxLat) maxLat = lat;
                        if (lng < minLng) minLng = lng;
                        if (lng > maxLng) maxLng = lng;
                    });

                    // Test d'intersection de bbox
                    return !(maxLat < screenBounds.minLat ||
                        minLat > screenBounds.maxLat ||
                        maxLng < screenBounds.minLng ||
                        minLng > screenBounds.maxLng);
                })
                .map(feature => ({
                    name: feature.properties.nom,
                    code: feature.properties.code,
                    codeDepartement: feature.properties.codeDepartement || null,
                    type: type,
                    geometry: feature.geometry
                }));
        } catch (error) {
            console.error('Erreur fetchNeighbors:', error);
            return [];
        }
    }

    /** Extrait tous les points [lng, lat] d'une géométrie GeoJSON. */
    _extractAllCoords(geometry) {
        if (!geometry) return [];
        const flatten = (arr) => {
            if (!Array.isArray(arr[0])) return [arr]; // Point [lng, lat]
            return arr.reduce((acc, val) => acc.concat(flatten(val)), []);
        };
        return flatten(geometry.coordinates);
    }

    /**
     * Génère une clé de cache déterministe à partir du polygone.
     * Les coordonnées sont arrondies à 2 décimales pour tolérer les micro-écarts.
     */
    _buildPOICacheKey(latLngs) {
        const rings = (latLngs && latLngs.length > 0 && Array.isArray(latLngs[0]) && !('lat' in latLngs[0])) ? latLngs : [latLngs];

        const coordStr = rings
            .map(ring => ring.map(pt => `${pt.lat.toFixed(2)},${pt.lng.toFixed(2)}`).join('|'))
            .join('||');

        // Hash simple (djb2) pour garder la clé courte
        let hash = 5381;
        for (let i = 0; i < coordStr.length; i++) {
            hash = ((hash << 5) + hash) + coordStr.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `pois_cache_${Math.abs(hash).toString(36)}`;
    }

    // ========== IndexedDB helpers pour le cache POI ==========

    /** Ouvre (ou crée) la base IndexedDB pour le cache POI. */
    _openPOICacheDB() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('POIViewerCache', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('pois')) {
                    db.createObjectStore('pois'); // clé fournie via put(value, key)
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return this._dbPromise;
    }

    /** Lit une entrée du cache IndexedDB. */
    async _idbGet(key) {
        const db = await this._openPOICacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('pois', 'readonly');
            const req = tx.objectStore('pois').get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    /** Écrit une entrée dans le cache IndexedDB. */
    async _idbPut(key, value) {
        const db = await this._openPOICacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('pois', 'readwrite');
            const req = tx.objectStore('pois').put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /** Supprime une entrée du cache IndexedDB. */
    async _idbDelete(key) {
        const db = await this._openPOICacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('pois', 'readwrite');
            const req = tx.objectStore('pois').delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Limite le nombre d'entrées POI en cache à 20.
     * Supprime les plus anciennes si le seuil est dépassé.
     */
    async _cleanupPOICache() {
        const MAX_POI_CACHE_ENTRIES = 20;
        const db = await this._openPOICacheDB();

        const entries = await new Promise((resolve, reject) => {
            const tx = db.transaction('pois', 'readonly');
            const store = tx.objectStore('pois');
            const req = store.openCursor();
            const results = [];
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    results.push({ key: cursor.key, timestamp: cursor.value.timestamp || 0 });
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            req.onerror = () => reject(req.error);
        });

        if (entries.length > MAX_POI_CACHE_ENTRIES) {
            entries.sort((a, b) => a.timestamp - b.timestamp);
            const toRemove = entries.slice(0, entries.length - MAX_POI_CACHE_ENTRIES);
            for (const e of toRemove) {
                await this._idbDelete(e.key);
                console.log(`🗑️ Cache POI supprimé : ${e.key}`);
            }
        }
    }

    /** Vide le cache POI pour une zone spécifique (par ses coordonnées polygone). */
    async clearZoneCache(latLngs) {
        if (!latLngs) return;
        const cacheKey = this._buildPOICacheKey(latLngs);
        try {
            await this._idbDelete(cacheKey);
            console.log(`🗑️ Cache POI zone supprimé : ${cacheKey}`);
        } catch (e) {
            console.warn('Erreur suppression cache zone:', e);
        }
    }

    /** Vide TOUT le cache : IndexedDB POIs + localStorage (parcs, régions, départements). */
    async clearAllCaches() {
        // 1. Vider IndexedDB (POIs)
        try {
            const db = await this._openPOICacheDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction('pois', 'readwrite');
                const req = tx.objectStore('pois').clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
            console.log('🗑️ Cache IndexedDB POI entièrement vidé');
        } catch (e) {
            console.warn('Erreur vidage IndexedDB:', e);
        }
        // 2. Vider les caches localStorage (parcs, régions, départements)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('parks_cache_') || key.startsWith('regions_cache_') ||
                key.startsWith('depts_cache_') || key.startsWith('pois_cache_'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => {
            localStorage.removeItem(k);
            console.log(`🗑️ localStorage supprimé : ${k}`);
        });
        console.log(`🗑️ Reset complet : ${keysToRemove.length} entrées localStorage + IndexedDB vidé`);
    }

    /**
     * Retrouve l'identifiant Wikidata d'une zone administrative active
     * S'appuie sur le nom et/ou le code pour fonctionner à l'international
     */
    async getZoneDemographics(activeZone) {
        if (!activeZone) return null;

        let result = {
            wikidata: activeZone.wikidata || null,
            osmPopulation: activeZone.population || null
        };

        // Si on a déjà tout, on retourne directement
        if (result.wikidata && result.osmPopulation) return result;

        let query = '';
        const safeName = activeZone.name ? activeZone.name.replace(/"/g, '\\"') : '';

        // Optimisation : Utiliser relationId si dispo, sinon chercher par nom/admin_level dans la zone pays
        if (activeZone.relationId) {
            query = `[out:json][timeout:15];relation(${activeZone.relationId});out tags;`;
        } else if (activeZone.type === 'commune') {
            if (activeZone.code && this.currentCountryCode === 'fr') {
                // Pour la France, ref:INSEE est très fiable
                query = `[out:json][timeout:15];area(${this.currentCountryAreaId})->.searchArea;relation["boundary"="administrative"]["ref:INSEE"="${activeZone.code}"](area.searchArea);out tags;`;
            } else if (safeName) {
                // À l'international, on cherche par nom + admin_level=8 (souvent ville/commune)
                query = `[out:json][timeout:15];area(${this.currentCountryAreaId})->.searchArea;relation["boundary"="administrative"]["name"~"^${safeName}$", i]["admin_level"~"8|7"](area.searchArea);out tags;`;
            }
        } else if (activeZone.type === 'dept') {
            query = `[out:json][timeout:15];area(${this.currentCountryAreaId})->.searchArea;relation["boundary"="administrative"]["name"~"^${safeName}$", i]["admin_level"="6"](area.searchArea);out tags;`;
        } else if (activeZone.type === 'region') {
            query = `[out:json][timeout:15];area(${this.currentCountryAreaId})->.searchArea;relation["boundary"="administrative"]["name"~"^${safeName}$", i]["admin_level"="4"](area.searchArea);out tags;`;
        }

        if (!query && !result.wikidata) return null;

        if (query) {
            try {
                const response = await fetch(this.overpassUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `data=${encodeURIComponent(query)}`
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.elements && data.elements.length > 0) {
                        // Prendre le premier élément pertinent
                        const el = data.elements[0];
                        if (el.tags) {
                            if (!result.wikidata && el.tags.wikidata) result.wikidata = el.tags.wikidata;
                            if (!result.osmPopulation && el.tags.population) result.osmPopulation = parseInt(el.tags.population, 10);
                        }
                    }
                } else {
                    console.warn(`⚠️ Overpass a refusé la requête (Statut ${response.status}) pour la démo.`);
                }
            } catch (e) {
                console.error("Erreur getZoneDemographics Overpass:", e);
            }
        }

        return result;
    }

    /**
     * Récupère l'historique de population depuis Wikidata (Propriété P1082 + Date P585)
     */
    async fetchPopulationHistory(wikidataId) {
        if (!wikidataId) return null;
        const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&format=json&props=claims&origin=*`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            const entity = data.entities[wikidataId];
            if (!entity || !entity.claims || !entity.claims.P1082) return null;

            const popClaims = entity.claims.P1082;
            const history = [];

            popClaims.forEach(claim => {
                const pop = claim.mainsnak?.datavalue?.value?.amount;
                const date = claim.qualifiers?.P585?.[0]?.datavalue?.value?.time; // Point in time

                if (pop && date) {
                    const yearMatch = date.match(/^\+?(\d{4})/);
                    if (yearMatch) {
                        history.push({
                            year: parseInt(yearMatch[1], 10),
                            population: parseInt(pop.replace(/\D/g, ''), 10)
                        });
                    }
                }
            });

            if (history.length === 0) return null;
            // Trier par année croissante
            history.sort((a, b) => a.year - b.year);
            return history;
        } catch (e) {
            console.error("Erreur fetchPopulationHistory:", e);
            return null;
        }
    }
}
