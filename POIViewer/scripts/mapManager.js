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
        // Helper to get bounding box string for Overpass (south, west, north, east)
        if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
            // Overpass needs a polygon string usually, but bounds are easier for simple queries.
            // For exact polygon query we need a poly string.
            // Let's rely on simple bbox for now or poly filter if needed.
            // Returning raw LatLngs for API module to handle.
            return layer.getLatLngs()[0];
        }
        return null;
    }

    zoomToLocation(lat, lng, zoomLevel = 18) {
        this.map.flyTo([lat, lng], zoomLevel, {
            animate: true,
            duration: 1.5
        });
    }
}
