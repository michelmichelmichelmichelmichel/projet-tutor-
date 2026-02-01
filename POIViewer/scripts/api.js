export class ApiService {
    constructor() {
        this.overpassUrl = 'https://overpass-api.de/api/interpreter';
    }

    async fetchPOIs(latLngs, selectedCategories = []) {
        // Convert Leaflet LatLngs to Overpass Poly String: "lat1 lon1 lat2 lon2 ..."
        const polyCoords = latLngs.map(pt => `${pt.lat} ${pt.lng}`).join(' ');

        if (selectedCategories.length === 1 && selectedCategories[0] === 'none') {
            return { pois: [], networks: [] };
        }

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
        if (selectedCategories.length === 0) {
            // Fallback if empty (api call without args) -> fetch all
            Object.values(categoryToKeys).flat().forEach(k => keysToFetch.add(k));
        } else {
            selectedCategories.forEach(cat => {
                if (categoryToKeys[cat]) categoryToKeys[cat].forEach(k => keysToFetch.add(k));
            });
        }

        const keysRegex = Array.from(keysToFetch).join('|');

        // POI Query (Nodes) + Network Query (Ways with Geometry)
        const query = `
            [out:json][timeout:60];
            (
              node[~"^(${keysRegex})$"~"."](poly:"${polyCoords}");
              way["highway"](poly:"${polyCoords}");
            );
            out geom;
        `;

        try {
            const response = await fetch(this.overpassUrl, {
                method: 'POST',
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
                    type: el.tags.highway,
                    geometry: el.geometry // Array of {lat, lon}
                });
                console.log(networks);
            }
        });

        return { pois, networks };
    }

    detectCategoryAndType(tags) {
        // Order matters for priority
        if (tags.tourism) return { category: 'tourism', type: tags.tourism };
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
}
