import { MapManager } from './scripts/mapManager.js';
import { ApiService } from './scripts/api.js';
import { UiRenderer } from './scripts/uiRenderer.js';

class App {
    constructor() {
        this.mapManager = new MapManager('map');
        this.apiService = new ApiService();
        this.uiRenderer = new UiRenderer();

        this.currentPOIs = [];
    }

    init() {
        this.mapManager.init();
        this.uiRenderer.init();

        // Bind Drawing Event
        this.mapManager.onPolygonCreated = async (layer) => {
            this.handleAreaSelection(layer);
        };

        // Bind Filter Change
        this.uiRenderer.onFilterChange = () => {
            if (this.currentLayer) {
                // Determine if this is a "valid" layer to refresh
                // handleAreaSelection re-fetches data.
                this.handleAreaSelection(this.currentLayer);
            }
        };

        this.mapManager.onPolygonCleared = () => {
            this.currentPOIs = [];
            this.currentLayer = null;
            this.uiRenderer.clear();
            if (this.mapManager.networkGroup) this.mapManager.networkGroup.clearLayers();
            if (this.mapManager.markerGroup) this.mapManager.markerGroup.clearLayers();
        };
    }

    async handleAreaSelection(layer) {
        this.currentLayer = layer;
        this.uiRenderer.showLoading(true);

        const latLngs = this.mapManager.getBoundsFromLayer(layer);

        // Retrieve selected categories from the new menu
        const selectedCategories = this.uiRenderer.getSelectedCategories();

        if (latLngs) {
            try {
                // Fetch Data with Filters
                const { pois, networks } = await this.apiService.fetchPOIs(latLngs, selectedCategories);
                this.currentPOIs = pois;

                // Render Networks
                this.renderNetworks(networks);

                // Update UI (Macro Stats)
                this.uiRenderer.renderMacroStats(this.currentPOIs);

                // Update UI (Micro List)
                this.uiRenderer.renderMicroList(this.currentPOIs);

                // Add Markers to Map (Micro support)
                this.addMarkersToMap(this.currentPOIs);

                // Show Sidebar
                if (this.currentPOIs.length > 0) {
                    this.uiRenderer.toggleMicroSidebar(true);
                } else {
                    this.uiRenderer.toggleMicroSidebar(true);
                }

            } catch (err) {
                console.error("Error handling selection", err);
                alert("Erreur lors de la récupération des données.");
            } finally {
                this.uiRenderer.showLoading(false);
            }
        }
    }

    renderNetworks(networks) {
        if (!this.mapManager.networkGroup) {
            this.mapManager.networkGroup = L.layerGroup().addTo(this.mapManager.map);
        }
        this.mapManager.networkGroup.clearLayers();

        networks.forEach(net => {
            const latLngs = net.geometry.map(pt => [pt.lat, pt.lon]);
            const style = this.getNetworkStyle(net.type);

            L.polyline(latLngs, style).addTo(this.mapManager.networkGroup);
        });
    }

    getNetworkStyle(type) {
        switch (type) {
            case 'motorway':
            case 'trunk':
            case 'primary':
                return { color: '#f59e0b', weight: 4, opacity: 0.8 }; // Amber
            case 'secondary':
            case 'tertiary':
                return { color: '#ffffff', weight: 3, opacity: 0.6 };
            case 'residential':
            case 'unclassified':
            case 'service':
                return { color: '#cbd5e1', weight: 2, opacity: 0.5 };
            case 'path':
            case 'track':
            case 'footway':
            case 'cycleway':
                return { color: '#10b981', weight: 2, dashArray: '5,5', opacity: 0.7 }; // Emerald dashed
            default:
                return { color: '#64748b', weight: 1, opacity: 0.5 };
        }
    }

    addMarkersToMap(pois) {
        // Remove existing markers if any (need to track them)
        // For this simple version, we'll let MapManager handle a marker layer if we want
        // But for now, we leave it visual only via polygon, or add markers? 
        // Spec says "Vue micro : un POI spécifique apparaît..."
        // Lets add a layer group for markers in MapManager
        if (!this.mapManager.markerGroup) {
            this.mapManager.markerGroup = L.layerGroup().addTo(this.mapManager.map);
        }
        this.mapManager.markerGroup.clearLayers();

        pois.forEach(poi => {
            const marker = L.circleMarker([poi.lat, poi.lng], {
                radius: 6,
                fillColor: this.uiRenderer.getCategoryColor(poi.category),
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });

            marker.on('click', () => {
                this.uiRenderer.renderPoiDetails(poi);
                this.uiRenderer.toggleMicroSidebar(true);
            });

            // Marker tooltip is fine, but click should do more now
            marker.bindTooltip(`<b>${this.uiRenderer.getCategoryEmoji(poi.category)} ${poi.name}</b><br>${poi.type}`, { direction: 'top' });
            this.mapManager.markerGroup.addLayer(marker);
        });
    }

    // getCategoryColor has been moved to UiRenderer
}

// Start App
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
