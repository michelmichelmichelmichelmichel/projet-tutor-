export class MapManager {
    constructor(mapId) {
        this.mapId = mapId;
        this.map = null;
        this.drawnItems = null;
        this.onPolygonCreated = null;
        this.onPolygonCleared = null;

        this.layers = [];
        this.currentLayerIndex = 0;
        this.currentTileLayer = null;
        this.polygonColor = "#3388ff"; // Default color
        this.selectionMarker = null; // Marqueur de sélection visuel
    }

    init() {
        // Initialize map centered on the Pyrenees
        this.map = L.map(this.mapId, { attributionControl: false }).setView([42.7, 0.5], 8);

        // Define Layers
        this.layers = [
            {
                name: 'Satellite',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                options: {
                    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                }
            },
            {
                name: 'Gris',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
                options: {
                    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
                    maxZoom: 16
                }
            },
            {
                name: 'Dark',
                url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                options: {
                    maxZoom: 20
                }
            }
        ];




        // Set Default Layer
        this.setLayer(0);

        // Add Toggle Control
        this.addToggleControl();

        // Initialize Drawing Feature layer
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);

        // Initialize Draw Control
        const drawControl = new L.Control.Draw({
            draw: {
                polyline: false,
                circle: false,
                marker: false,
                circlemarker: false,
                rectangle: true,
                polygon: {
                    allowIntersection: false,
                    showArea: true
                }
            },
            edit: {
                featureGroup: this.drawnItems,
                remove: true
            }
        });
        this.map.addControl(drawControl);

        // Event Listeners
        this.map.on(L.Draw.Event.CREATED, (event) => {
            const layer = event.layer;
            this.drawnItems.clearLayers();
            this.drawnItems.addLayer(layer);

            if (this.onPolygonCreated) {
                this.onPolygonCreated(layer);
            }
        });

        this.map.on(L.Draw.Event.DELETED, () => {
            if (this.onPolygonCleared) {
                this.onPolygonCleared();
            }
        });

        // Initialize Geocoder Control
        if (L.Control.Geocoder) {
            L.Control.geocoder({
                defaultMarkGeocode: true // Adds marker and zooms automatically
            })
                .on('markgeocode', function (e) {
                    // e.geocode.center is the location
                })
                .addTo(this.map);
        }
    }

    setLayer(index) {
        if (this.currentTileLayer) {
            this.map.removeLayer(this.currentTileLayer);
        }

        const layerDef = this.layers[index];
        this.currentTileLayer = L.tileLayer(layerDef.url, layerDef.options).addTo(this.map);
        this.currentLayerIndex = index;
    }

    addToggleControl() {
        const ToggleControl = L.Control.extend({
            options: { position: 'topright' },

            onAdd: (map) => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                container.style.backgroundColor = 'white';
                container.style.width = '30px';
                container.style.height = '30px';
                container.style.cursor = 'pointer';
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.style.justifyContent = 'center';
                container.title = "Changer le fond de carte";

                // Icon (Simple layers icon or similar)
                container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="black" viewBox="0 0 16 16"><path d="M8.235 1.559a.5.5 0 0 0-.47 0l-7.5 4a.5.5 0 0 0 0 .882L3.188 8 .264 9.559a.5.5 0 0 0 0 .882l7.5 4a.5.5 0 0 0 .47 0l7.5-4a.5.5 0 0 0 0-.882L12.813 8l2.922-1.559a.5.5 0 0 0 0-.882l-7.5-4zM8 9.433 1.562 6 8 2.567 14.438 6 8 9.433z"/></svg>`;

                container.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nextIndex = (this.currentLayerIndex + 1) % this.layers.length;
                    this.setLayer(nextIndex);
                };

                return container;
            }
        });

        this.map.addControl(new ToggleControl());
    }

    getBoundsFromLayer(layer) {
        if (!layer) return null;

        let polygons = [];
        if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
            polygons.push(layer);
        } else if (layer instanceof L.FeatureGroup || layer instanceof L.GeoJSON) {
            // Find all polygon layers
            layer.eachLayer((l) => {
                if (l instanceof L.Polygon || l instanceof L.Rectangle) {
                    polygons.push(l);
                }
            });
        }

        if (polygons.length > 0) {
            const allRings = [];

            polygons.forEach(p => {
                const latlngs = p.getLatLngs();
                // Leaflet usually nests simple polygons: [ [LatLng...] ] or [ LatLng... ]
                if (Array.isArray(latlngs) && latlngs.length > 0) {
                    if (Array.isArray(latlngs[0]) && latlngs[0].length > 0) {
                        if ('lat' in latlngs[0] || ('lat' in latlngs[0][0])) {
                            // Single polygon or array of points
                            allRings.push(Array.isArray(latlngs[0]) ? latlngs[0] : latlngs);
                        } else if (Array.isArray(latlngs[0][0])) {
                            // MultiPolygon structure: [ [ [LatLng...] ], ... ]
                            latlngs.forEach(multiRing => {
                                if (Array.isArray(multiRing) && multiRing.length > 0 && Array.isArray(multiRing[0])) {
                                    allRings.push(multiRing[0]); // Push the outer ring
                                }
                            });
                        }
                    } else {
                        allRings.push(latlngs);
                    }
                }
            });

            return allRings.length > 0 ? allRings : null;
        }
        return null;
    }

    zoomToLocation(lat, lng, zoomLevel = 18) {
        this.map.flyTo([lat, lng], zoomLevel, {
            animate: true,
            duration: 1.5
        });
    }
    drawRectangle(bounds) {
        // bounds: [[lat1, lng1], [lat2, lng2]]
        const layer = L.rectangle(bounds, {
            color: this.polygonColor,
            weight: 4
        });

        this.drawnItems.clearLayers();
        this.drawnItems.addLayer(layer);
        this.map.fitBounds(bounds);

        return layer;
    }

    drawBoundary(geoJson) {
        // Create a GeoJSON layer
        const layer = L.geoJSON(geoJson, {
            style: {
                color: this.polygonColor,
                weight: 4,
                fillOpacity: 0.1
            }
        });

        this.drawnItems.clearLayers();
        this.drawnItems.addLayer(layer);

        const bounds = layer.getBounds();
        this.map.fitBounds(bounds);

        return layer;
    }

    setPolygonColor(color) {
        this.polygonColor = color;
        this.drawnItems.eachLayer((layer) => {
            if (layer.setStyle) {
                layer.setStyle({ color: color });
            } else if (layer.eachLayer) { // GeoJSON feature group
                layer.eachLayer((l) => {
                    if (l.setStyle) l.setStyle({ color: color });
                });
            }
        });
    }

    /**
     * Affiche les zones voisines en gris sur la carte.
     * @param {Array} neighbors  [{ name, code, type, geometry }]
     * @param {Function} onClickCallback  Appelé avec le voisin cliqué
     */
    drawNeighborZones(neighbors, onClickCallback) {
        if (!this.neighborGroup) {
            this.neighborGroup = L.layerGroup().addTo(this.map);
            this.drawnNeighborCodes = new Set(); // Mémorise ce qui est déjà dessiné
        }
        // ON NE FAIT PLUS .clearLayers() ICI !

        neighbors.forEach(neighbor => {
            // Éviter les doublons
            if (this.drawnNeighborCodes.has(neighbor.code)) return;
            this.drawnNeighborCodes.add(neighbor.code);

            const layer = L.geoJSON(neighbor.geometry, {
                style: {
                    color: '#94a3b8',
                    weight: 1.5,
                    fillColor: '#64748b',
                    fillOpacity: 0.12,
                    dashArray: '4, 4'
                }
            });

            layer.bindTooltip(`<b>${neighbor.name}</b><br><span style="font-size:0.8em;opacity:0.7">Cliquer pour explorer</span>`, {
                sticky: true,
                direction: 'top'
            });

            layer.on('click', () => {
                if (onClickCallback) onClickCallback(neighbor);
            });

            layer.on('mouseover', () => {
                layer.setStyle({ fillOpacity: 0.3, color: '#cbd5e1' });
            });

            layer.on('mouseout', () => {
                layer.setStyle({ fillOpacity: 0.12, color: '#94a3b8' });
            });

            this.neighborGroup.addLayer(layer);
        });
    }

    clearNeighborZones() {
        if (this.neighborGroup) {
            this.neighborGroup.clearLayers();
            if (this.drawnNeighborCodes) this.drawnNeighborCodes.clear();
        }
    }

    /**
     * Affiche un marqueur visuel distinctif sur le POI sélectionné.
     * @param {number} lat
     * @param {number} lng
     * @param {string} label  Nom optionnel affiché en tooltip
     */
    showSelectionMarker(lat, lng, label = '') {
        this.clearSelectionMarker();

        const icon = L.divIcon({
            className: '',
            html: `
                <div class="poi-selection-pin">
                    <div class="poi-selection-pin__head"></div>
                    <div class="poi-selection-pin__tail"></div>
                    <div class="poi-selection-pin__pulse"></div>
                </div>`,
            iconSize: [28, 42],
            iconAnchor: [14, 42],
            tooltipAnchor: [0, -44]
        });

        this.selectionMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 });

        if (label) {
            this.selectionMarker.bindTooltip(`<b>${label}</b>`, {
                permanent: false,
                direction: 'top',
                className: 'poi-selection-tooltip'
            });
        }

        this.selectionMarker.addTo(this.map);
    }

    /** Supprime le marqueur de sélection s'il existe. */
    clearSelectionMarker() {
        if (this.selectionMarker) {
            this.map.removeLayer(this.selectionMarker);
            this.selectionMarker = null;
        }
    }

    // ── Heatmap layers ────────────────────────────────────────────────────

    /**
     * Met à jour les heatmaps de densité sur la carte.
     * @param {Object} heatData  { accommodation: [[lat,lng,intensity],...], pedestrian: [...], cycling: [...] }
     * @param {Object} visibility  { accommodation: bool, pedestrian: bool, cycling: bool }
     */
    updateHeatmapLayers(heatData, visibility) {
        // Supprimer les anciennes couches
        this.clearHeatmapLayers();

        if (!heatData) return;

        const configs = {
            accommodation: { radius: 25, blur: 20, maxZoom: 17, gradient: { 0.2: '#c4b5fd', 0.5: '#a78bfa', 0.8: '#7c3aed', 1.0: '#5b21b6' } },
            pedestrian: { radius: 20, blur: 18, maxZoom: 17, gradient: { 0.2: '#a7f3d0', 0.5: '#34d399', 0.8: '#059669', 1.0: '#065f46' } },
            cycling: { radius: 20, blur: 18, maxZoom: 17, gradient: { 0.2: '#bfdbfe', 0.5: '#60a5fa', 0.8: '#2563eb', 1.0: '#1e3a8a' } }
        };

        if (!this._heatLayers) this._heatLayers = {};

        for (const [key, points] of Object.entries(heatData)) {
            if (!visibility[key] || !points || points.length === 0) continue;
            const cfg = configs[key] || configs.accommodation;
            this._heatLayers[key] = L.heatLayer(points, {
                radius: cfg.radius,
                blur: cfg.blur,
                maxZoom: cfg.maxZoom,
                gradient: cfg.gradient,
                minOpacity: 0.35
            }).addTo(this.map);
        }
    }

    /**
     * Met à jour les heatmaps spécifiques à la sur-fréquentation.
     * Distingue les villes et les POIs avec des palettes distinctes.
     */
    updateOvertourismHeatmaps(overtourismData, visibility) {
        if (!this._overLayers) this._overLayers = {};

        // Supprimer les anciennes couches de sur-fréquentation
        for (const layer of Object.values(this._overLayers)) {
            this.map.removeLayer(layer);
        }
        this._overLayers = {};

        if (!overtourismData) return;

        // Config pour les Villes (Gamme de Bleus / Cyan)
        if (visibility.overtourism_cities && overtourismData.municipalities) {
            const points = overtourismData.municipalities.map(m => [m.lat, m.lng, m.intensity]);
            this._overLayers.cities = L.heatLayer(points, {
                radius: 35,
                maxZoom: 15,
                gradient: {
                    0.1: '#bae6fd', // light blue
                    0.2: '#7dd3fc',
                    0.3: '#38bdf8',
                    0.4: '#0ea5e9',
                    0.5: '#2563eb',
                    0.6: '#1d4ed8',
                    0.7: '#1e40af',
                    0.8: '#1e3a8a',
                    0.9: '#172554',
                    1.0: '#020617'  // Slate 950 (Extremely dense)
                },
                minOpacity: 0.4
            }).addTo(this.map);
        }

        // Config pour les POIs individels (Gamme de Jaunes -> Oranges -> Rouges -> Marron foncé)
        if (visibility.overtourism_pois && overtourismData.pois) {
            const points = overtourismData.pois.map(p => [p.lat, p.lng, p.intensity]);
            this._overLayers.pois = L.heatLayer(points, {
                radius: 25,
                blur: 15,
                maxZoom: 18,
                gradient: {
                    0.1: '#fef9c3', // v. lgt yellow
                    0.2: '#fef08a',
                    0.3: '#fde047',
                    0.4: '#facc15', // Yellow 400
                    0.5: '#fbbf24', // Amber 400 (Warm yellow/orange)
                    0.6: '#f97316', // Orange 500
                    0.7: '#ea580c', // Orange 600
                    0.8: '#dc2626', // Red 600
                    0.9: '#7f1d1d', // Red 900
                    1.0: '#450a0a'  // Dark maroon 950
                },
                minOpacity: 0.5
            }).addTo(this.map);
        }
    }

    /** Supprime toutes les couches heatmap existantes */
    clearHeatmapLayers() {
        if (this._heatLayers) {
            for (const layer of Object.values(this._heatLayers)) {
                this.map.removeLayer(layer);
            }
            this._heatLayers = {};
        }
        if (this._overLayers) {
            for (const layer of Object.values(this._overLayers)) {
                this.map.removeLayer(layer);
            }
            this._overLayers = {};
        }
    }
}
