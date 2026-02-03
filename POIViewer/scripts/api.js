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
              relation["route"="hiking"](poly:"${polyCoords}");
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
                    type: el.tags.highway,
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
}
