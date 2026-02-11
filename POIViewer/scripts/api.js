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

    processData(elements, selectedCategories = []) {
        const pois = [];
        const networks = [];

        elements.forEach(el => {
            if (el.type === 'node' && el.tags) {
                const info = this.detectCategoryAndType(el.tags);

                // Filter by Category if specific categories were requested
                const isSelected = selectedCategories.length === 0 || selectedCategories.includes(info.category);

                if (info.category !== 'unknown' && isSelected) {
                    pois.push({
                        id: el.id,
                        lat: el.lat,
                        lng: el.lon,
                        name: el.tags.name || info.type.replace(/_/g, ' ') || "Lieu sans nom",
                        category: info.category,
                        type: info.type,
                        tags: el.tags
                    });
                }
            } else if (el.type === 'way' && el.tags && el.geometry) {
                networks.push({
                    id: el.id,
                    type: el.tags.highway || el.tags.railway || el.tags.aerialway || el.tags['piste:type'] || 'unknown',
                    tags: el.tags, // Pass all tags for styling (sac_scale, etc.)
                    geometry: el.geometry // Array of {lat, lon}
                });
            } else if (el.type === 'relation' && el.tags && el.members) {
                // For relations, we need geometry. Overpass 'out geom' on relation returns geometry in members
                // We'll treat relation segments as networks or specialized
                // Extract geometry from members that are ways
                const relationGeometry = [];
                el.members.forEach(m => {
                    if (m.type === 'way' && m.geometry) {
                        // Push each way segment as a separate network item, or combine?
                        // Easiest is to push them as separate items but with relation tags
                        networks.push({
                            id: m.ref || el.id + '_' + Math.random(), // Unique ID
                            type: 'relation',
                            relationName: el.tags.name,
                            relationRef: el.tags.ref, // e.g. "GR 10"
                            relationRoute: el.tags.route,
                            tags: el.tags,
                            geometry: m.geometry
                        });
                    }
                });
                console.log(networks);
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
        const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&format=geojson&geometry=contour&boost=population&limit=10`;

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
                    geometry: geometry,
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
}
