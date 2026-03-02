export class ApiService {
    constructor() {
        this.overpassUrl = 'https://overpass-api.de/api/interpreter';
    }

    async fetchPOIs(latLngs, selectedCategories = []) {
        // Convert Leaflet LatLngs to Overpass Poly String: "lat1 lon1 lat2 lon2 ..."
        // Ensure the polygon is closed (first point == last point)
        const points = [...latLngs];
        if (points.length > 0) {
            const first = points[0];
            const last = points[points.length - 1];
            if (first.lat !== last.lat || first.lng !== last.lng) {
                points.push(first);
            }
        }

        const polyCoords = points.map(pt => `${pt.lat} ${pt.lng}`).join(' ');

        // Map categories to Overpass Keys
        const categoryToKeys = {
            'tourism': ['tourism'],
            'sustenance': ['amenity'],
            'accommodation': ['amenity', 'tourism'],
            'leisure': ['leisure'],
            'sport': ['sport'],
            'historic': ['historic'],
            'natural': ['natural', 'mountain_pass'],
            'shop': ['shop'],
            'amenity': ['amenity'],
            'transport': ['public_transport', 'railway'],
            'healthcare': ['amenity', 'healthcare'],
            'emergency': ['emergency'],
            'office': ['office'],
            'craft': ['craft'],
            'man_made': ['man_made'],
            'power': ['power'],
            'barrier': ['barrier'],
            'place': ['place']
        };

        // Determine which keys to query
        const keysToFetch = new Set();
        // If 'none' is in the list, we don't fetch any POI keys, but we still want networks
        const explicitlyNone = selectedCategories.length === 1 && selectedCategories[0] === 'none';

        if (selectedCategories.length === 0) {
            // Fallback if empty (api call without args) -> fetch all
            Object.values(categoryToKeys).flat().forEach(k => keysToFetch.add(k));
        } else if (!explicitlyNone) {
            selectedCategories.forEach(cat => {
                if (categoryToKeys[cat]) categoryToKeys[cat].forEach(k => keysToFetch.add(k));
            });
        }

        const keysRegex = Array.from(keysToFetch).join('|');
        const nodeQuery = keysRegex ? `node[~"^(${keysRegex})$"~"."](poly:"${polyCoords}");` : '';

        // POI Query (Nodes) + Network Query (Ways with Geometry)
        const query = `
            [out:json][timeout:60];
            (
              ${nodeQuery}
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
            );
            out geom;
        `;

        try {
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `data=${encodeURIComponent(query)}`
            });

            if (!response.ok) throw new Error(`Overpass API Error: ${response.statusText}`);

            const data = await response.json();
            return this.processData(data.elements, selectedCategories);

        } catch (error) {
            console.error("API Error:", error);
            throw error; // Propagate error to App for handling
        }
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

                        pois.push({
                            id: el.id,
                            lat: el.lat,
                            lng: el.lon,
                            name: poiName,
                            category: info.category,
                            type: info.type,
                            tags: el.tags
                        });
                    }
                }
            } else if (el.type === 'way' && el.tags && el.geometry) {
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
        if (tags.emergency) return { category: 'emergency', type: tags.emergency };
        if (tags.man_made) return { category: 'man_made', type: tags.man_made };
        if (tags.power) return { category: 'power', type: tags.power };
        if (tags.barrier) return { category: 'barrier', type: tags.barrier };
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

    async fetchFrenchPNRs() {
        const CACHE_KEY = 'pnr_cache_v1';
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures

        // 1. Vérification du cache
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    console.log("✅ Chargement des PNR depuis le cache local");
                    return data;
                }
            } catch (e) {
                console.warn("Cache invalide");
            }
        }

        // 2. Requête API (si pas de cache valide)
        const query = `
            [out:json][timeout:25];
            relation(9091001); 
            relation(r); 
            out tags bb;
        `;

        try {
            console.log("🌍 Téléchargement de la liste des PNR depuis Overpass...");
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`
            });

            if (response.status === 429) {
                console.warn("⚠️ Trop de requêtes (429). Utilisation du cache si possible.");
                if (cached) return JSON.parse(cached).data;
                throw new Error("API Limit Reached");
            }

            if (!response.ok) throw new Error(`Erreur Overpass: ${response.status}`);

            const data = await response.json();

            const pnrs = data.elements.map(el => ({
                name: el.tags.name,
                relationId: el.id,
                bounds: [
                    [el.bounds.minlat, el.bounds.minlon],
                    [el.bounds.maxlat, el.bounds.maxlon]
                ]
            })).sort((a, b) => a.name.localeCompare(b.name));

            // 3. Sauvegarde dans le cache
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: pnrs
            }));

            return pnrs;

        } catch (error) {
            console.error("Erreur chargement PNR:", error);
            // En dernier recours, on renvoie le cache même vieux s'il existe
            if (cached) return JSON.parse(cached).data;
            return [];
        }
    }

    async fetchFrenchRegions() {
        const CACHE_KEY = 'regions_cache_v1';
        return this._fetchAdminArea(CACHE_KEY, '4');
    }

    async fetchFrenchDepartments() {
        const CACHE_KEY = 'depts_cache_v1';
        return this._fetchAdminArea(CACHE_KEY, '6');
    }

    // Helper for Regions/Departments
    async _fetchAdminArea(cacheKey, adminLevel) {
        // ... (existing code) ...
        // (Keeping existing code identical, just appending new method after it or before end of class)
        const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 jours (ça change rarement)

        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    console.log(`✅ Chargement admin_level=${adminLevel} depuis le cache local`);
                    return data;
                }
            } catch (e) {
                console.warn("Cache invalide");
            }
        }

        // OPTIMISATION: Utiliser searchArea "France Métropolitaine" (ID 1403916 => Area 3601403916)
        // Plutôt que la BBox qui est lourde.
        // On augmente le timeout à 90s pour éviter les 504.
        const query = `
            [out:json][timeout:90];
            area(3601403916)->.searchArea;
            relation["boundary"="administrative"]["admin_level"="${adminLevel}"]["ref:INSEE"](area.searchArea);
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

        // Utilisation de l'API GéoGouv au format GeoJSON pour avoir le contour précis
        const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,code,codeDepartement,codesPostaux&format=geojson&geometry=contour&boost=population&limit=10`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("GeoAPI Error");
            const data = await response.json(); // data is a FeatureCollection

            if (!data.features) return [];

            return data.features.map(feature => {
                const props = feature.properties;
                const geometry = feature.geometry;

                // Calculate bounds from geometry (Polygon or MultiPolygon)
                let latLngs = [];
                // Simple helper to extract coords
                const extractCoords = (coords) => {
                    if (typeof coords[0] === 'number') return [coords]; // Point [lon, lat]
                    return coords.reduce((acc, val) => acc.concat(extractCoords(val)), []);
                };

                // For Polygon: [[ [lon, lat], ... ]]
                // For MultiPolygon: [[[ [lon, lat], ... ]]]
                // Leaflet expects [lat, lon], GeoJSON is [lon, lat]

                // Quick bounds calculation
                let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
                const flatCoords = extractCoords(geometry.coordinates);

                // flatCoords will be array of [lon, lat] (or single numbers if I messed up recursion, but reduce handles arrays)
                // Actually recursion above flattens to [lon, lat, lon, lat...] ? No.
                // Let's use specific logic for Polygon/MultiPolygon
                const allPoints = [];
                if (geometry.type === 'Polygon') {
                    geometry.coordinates[0].forEach(p => allPoints.push(p));
                } else if (geometry.type === 'MultiPolygon') {
                    geometry.coordinates.forEach(poly => poly[0].forEach(p => allPoints.push(p)));
                }

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
                    codeDepartement: props.codeDepartement || null,
                    geometry: geometry, // GeoJSON Geometry Object (Polygon/MultiPolygon)
                    bounds: [[minLat, minLon], [maxLat, maxLon]],
                    lat: (minLat + maxLat) / 2, // Centroid approx
                    lon: (minLon + maxLon) / 2
                };
            });

        } catch (error) {
            console.error("Erreur recherche commune:", error);
            return [];
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

            return { description, website, image, wikipedia, population, elevation, inception, heritage, architect, area };

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
}
