import { MapManager } from './scripts/mapManager.js';
import { ApiService } from './scripts/api.js';
import { UiRenderer } from './scripts/uiRenderer.js';

class App {
    constructor() {
        this.mapManager = new MapManager('map');
        this.apiService = new ApiService();
        this.uiRenderer = new UiRenderer();

        this.currentPOIs = [];
        this.currentNetworks = [];
        this.pathWeight = 1;
        this.activeZone = null; // Contexte de la zone administrative active
    }

    init() {
        this.mapManager.init();
        this.uiRenderer.init();
        this.uiRenderer.setApiService(this.apiService);

        // Bind Drawing Event
        this.mapManager.onPolygonCreated = async (layer) => {
            this.uiRenderer.closeSettings(); // Ferme le panneau dès qu'une zone est validée
            this.handleAreaSelection(layer);
        };

        // Fermer le panneau dès que l'utilisateur commence à dessiner
        this.mapManager.map.on('draw:drawstart', () => {
            this.uiRenderer.closeSettings();
        });

        // Bind Filter Change
        this.uiRenderer.onFilterChange = () => {
            if (this.currentLayer) {
                this.handleAreaSelection(this.currentLayer);
            }
        };

        // Bind Path Filter Change (Client-side filtering only)
        this.uiRenderer.onPathFilterChange = () => {
            if (this.currentNetworks) {
                console.log("Path filter changed, re-rendering networks...");
                this.renderNetworks(this.currentNetworks);
            }
        };

        // Bind Sub-Category Filter Change (Client-side only, no API refetch)
        this.uiRenderer.onSubCategoryFilterChange = () => {
            if (this.currentPOIs && this.currentPOIs.length > 0) {
                const filtered = this.getFilteredPOIs();
                this.uiRenderer.renderMacroStats(filtered);
                this.uiRenderer.renderMicroList(filtered);
                this.addMarkersToMap(filtered);
            }
        };

        // Bind POI Selection (List Click)
        this.uiRenderer.onPoiSelected = (poi) => {
            this.mapManager.zoomToLocation(poi.lat, poi.lng);
        };

        this.mapManager.onPolygonCleared = () => {
            this.currentPOIs = [];
            this.currentLayer = null;
            this.activeZone = null;
            this.uiRenderer.clear();
            if (this.mapManager.networkGroup) this.mapManager.networkGroup.clearLayers();
            if (this.mapManager.markerGroup) this.mapManager.markerGroup.clearLayers();
            this.mapManager.clearNeighborZones();
            this.currentNetworks = [];
        };

        this.uiRenderer.onPathWeightChange = (weight) => {
            this.pathWeight = weight;
            if (this.currentNetworks && this.currentNetworks.length > 0) {
                this.renderNetworks(this.currentNetworks);
            }
        };

        this.uiRenderer.onPolygonColorChange = (color) => {
            this.mapManager.setPolygonColor(color);
        };

        // Initialize Presets
        this.uiRenderer.initPresets();
        this.uiRenderer.onPresetSelected = async (park) => {
            this.uiRenderer.showLoading(true);
            let layer = null;

            // Déterminer le type de zone et sauvegarder le contexte
            if (park.geometry) {
                // Commune (via GéoAPI)
                this.activeZone = {
                    type: 'commune',
                    code: park.code,
                    codeDepartement: park.codeDepartement || (park.code ? park.code.substring(0, 2) : null),
                    name: park.name
                };
                layer = this.mapManager.drawBoundary(park.geometry);
            } else if (park.relationId) {
                // Parc national/régional (pas de voisins administratifs)
                this.activeZone = null;
                const geoJson = await this.apiService.fetchParkBoundary(park.relationId);
                if (geoJson) layer = this.mapManager.drawBoundary(geoJson);
            } else if (park.adminType === 'dept') {
                this.activeZone = { type: 'dept', code: park.ref || park.code, name: park.name };
                layer = park.bounds ? this.mapManager.drawRectangle(park.bounds) : null;
            } else if (park.adminType === 'region') {
                this.activeZone = { type: 'region', code: park.ref || park.code, name: park.name };
                layer = park.bounds ? this.mapManager.drawRectangle(park.bounds) : null;
            } else {
                this.activeZone = null;
            }

            // Fallback to bounds
            if (!layer && park.bounds) {
                layer = this.mapManager.drawRectangle(park.bounds);
            }

            if (layer) {
                await this.handleAreaSelection(layer);
                // Charger les voisins après le chargement des POIs
                this.loadNeighbors();
            } else {
                this.uiRenderer.showLoading(false);
            }
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
                this.currentNetworks = networks;

                // Render Networks
                this.renderNetworks(networks);

                // Populate sub-category checkboxes from loaded POIs
                this.uiRenderer.populateSubCategoryCheckboxes(this.currentPOIs);

                // Get filtered POIs (respecting sub-category exclusions)
                const filteredPOIs = this.getFilteredPOIs();

                // Update UI (Macro Stats)
                this.uiRenderer.renderMacroStats(filteredPOIs);

                // Update UI (Micro List)
                this.uiRenderer.renderMicroList(filteredPOIs);

                // Add Markers to Map (Micro support)
                this.addMarkersToMap(filteredPOIs);

                // Show Sidebar
                if (filteredPOIs.length > 0) {
                    this.uiRenderer.toggleMicroSidebar(true);
                } else {
                    this.uiRenderer.toggleMicroSidebar(true);
                }

            } catch (err) {
                console.error("Error handling selection", err);
                // alert("Erreur lors de la récupération des données."); // Too noisy for user
            } finally {
                this.uiRenderer.showLoading(false);
            }
        }
    }

    getFilteredPOIs() {
        const excluded = this.uiRenderer.getExcludedSubCategories();
        if (excluded.size === 0) return this.currentPOIs;
        return this.currentPOIs.filter(p => !excluded.has(p.type));
    }

    renderNetworks(networks) {
        if (!this.mapManager.networkGroup) {
            this.mapManager.networkGroup = L.layerGroup().addTo(this.mapManager.map);
        }
        this.mapManager.networkGroup.clearLayers();

        const selectedCategories = this.uiRenderer.getSelectedPathCategories ? this.uiRenderer.getSelectedPathCategories() : [];
        const showAll = selectedCategories.length === 0 || selectedCategories.includes('all');

        networks.forEach(net => {
            const netCat = this.getNetworkCategory(net.type, net.tags, net.relationRef, net.relationRoute);

            // Check visibility
            if (!showAll && !selectedCategories.includes(netCat)) {
                return; // Skip if not selected
            }

            const latLngs = net.geometry.map(pt => [pt.lat, pt.lon]);
            const style = this.getNetworkStyle(net.type, net.tags, net.relationRef, net.relationRoute);

            if (net.tags.natural === 'water' || net.tags.landuse === 'reservoir' || net.tags.landuse === 'basin') {
                L.polygon(latLngs, style).addTo(this.mapManager.networkGroup);
            } else {
                L.polyline(latLngs, style).addTo(this.mapManager.networkGroup);
            }
        });
    }

    getNetworkCategory(type, tags = {}, relationRef = null, relationRoute = null) {
        // Priority must match getNetworkStyle logic
        if (type === 'relation' || (relationRef && (relationRef.includes('GR') || relationRef.includes('HRP')))) {
            if (relationRoute === 'bicycle' || relationRoute === 'mtb') return 'bicycle_routes';
            return 'hiking_routes';
        }

        // Check for specific tags relative to climbing/via ferrata
        if (tags.highway === 'via_ferrata' || tags.sport === 'via_ferrata' || tags.sport === 'climbing') return 'via_ferrata';
        if (type === 'via_ferrata') return 'via_ferrata';

        if (tags.sac_scale) {
            switch (tags.sac_scale) {
                case 'hiking': return 'hiking_easy';
                case 'mountain_hiking':
                case 'demanding_mountain_hiking': return 'hiking_medium';
                default: return 'hiking_hard';
            }
        }

        switch (type) {
            case 'cycleway': return 'cycleways';
            case 'track': return 'tracks';
            case 'bridleway': return 'bridleways';
            case 'steps':
            case 'corridor':
            case 'platform': return 'others';
            case 'path':
            case 'footway':
            case 'pedestrian':
            case 'living_street': return 'paths';

            // Aerialways
            case 'cable_car':
            case 'gondola':
            case 'chair_lift':
            case 'drag_lift':
            case 't-bar':
            case 'j-bar':
            case 'platter':
            case 'rope_tow':
            case 'magic_carpet':
            case 'zip_line':
            case 'goods':
            case 'mixed_lift': return 'aerialways';

            // Pistes
            case 'downhill':
            case 'nordic':
            case 'skitour':
            case 'sled':
            case 'hike': // piste:type=hike sometimes exists
            case 'sleigh': return 'pistes';

            // Railways
            case 'rail':
            case 'narrow_gauge':
            case 'funicular':
            case 'subway':
            case 'light_rail':
            case 'preserved':
            case 'monorail': return 'railways';

            default:
                if (tags.railway) return 'railways';
                if (tags.aerialway) return 'aerialways';
                if (tags['piste:type']) return 'pistes';
                if (tags.waterway) return 'waterways';
                if (tags.waterway) return 'waterways';
                if (tags.natural === 'water' || tags.landuse === 'reservoir' || tags.landuse === 'basin') return 'waterways';
                return 'others';
        }
    }

    getNetworkStyle(type, tags = {}, relationRef = null, relationRoute = null) {
        // Priority: Relation (GR10/HRP) > Difficulty (sac_scale) > Highway Type
        const scale = (w) => w * (this.pathWeight || 1);

        // 1. Relations (HRP, GR10, etc.)
        if (type === 'relation' || (relationRef && (relationRef.includes('GR') || relationRef.includes('HRP')))) {
            if (relationRoute === 'bicycle' || relationRoute === 'mtb') {
                return { color: '#f97316', weight: scale(4), opacity: 0.9 }; // Orange
            }
            return { color: '#a855f7', weight: scale(4), opacity: 0.9 }; // Purple
        }

        // 2. Climbing / Via Ferrata
        if (tags.highway === 'via_ferrata' || tags.sport === 'via_ferrata' || tags.sport === 'climbing' || type === 'via_ferrata') {
            return { color: '#57534e', weight: scale(2.5), opacity: 1, dashArray: '2, 5' }; // Stone Grey Dashed
        }

        // 3. Hiking Difficulty (sac_scale)
        if (tags.sac_scale) {
            switch (tags.sac_scale) {
                case 'hiking': // T1
                    return { color: '#facc15', weight: scale(3), opacity: 0.9, dashArray: null }; // Yellow
                case 'mountain_hiking': // T2
                case 'demanding_mountain_hiking': // T3
                    return { color: '#ef4444', weight: scale(3), opacity: 0.9, dashArray: null }; // Red
                case 'alpine_hiking': // T4
                case 'demanding_alpine_hiking': // T5
                case 'difficult_alpine_hiking': // T6
                    return { color: '#000000', weight: scale(3), opacity: 0.9, dashArray: null }; // Black
                default:
                    // Unknown scale, fallback to path style but maybe darker?
                    return { color: '#10b981', weight: scale(2), dashArray: '5,5', opacity: 0.7 };
            }
        }

        // 4. Standard Highway & Other Types
        switch (type) {
            // -- Aerialways --
            case 'cable_car':
            case 'gondola':
            case 'chair_lift':
            case 'drag_lift':
            case 't-bar':
            case 'j-bar':
            case 'platter':
            case 'rope_tow':
            case 'magic_carpet':
            case 'zip_line':
            case 'goods':
            case 'mixed_lift':
                return { color: '#1e293b', weight: scale(2), opacity: 1, dashArray: '1, 3' }; // Dark Slate Blue Dotted

            // -- Pistes --
            case 'downhill':
            case 'nordic':
            case 'skitour':
            case 'sled':
            case 'hike':
            case 'sleigh':
                // Check difficulty if available? (piste:difficulty) - for now unified
                if (tags['piste:difficulty'] === 'novice') return { color: '#22c55e', weight: scale(3), opacity: 0.8 }; // Green
                if (tags['piste:difficulty'] === 'easy') return { color: '#3b82f6', weight: scale(3), opacity: 0.8 }; // Blue (Europe)
                if (tags['piste:difficulty'] === 'intermediate') return { color: '#ef4444', weight: scale(3), opacity: 0.8 }; // Red
                if (tags['piste:difficulty'] === 'advanced' || tags['piste:difficulty'] === 'expert') return { color: '#000000', weight: scale(3), opacity: 0.8 }; // Black
                return { color: '#0ea5e9', weight: scale(3), opacity: 0.7 }; // Sky Blue default

            case 'motorway':
            case 'trunk':
            case 'primary':
                return { color: '#f59e0b', weight: scale(4), opacity: 0.8 }; // Amber
            case 'secondary':
            case 'tertiary':
                return { color: '#ffffff', weight: scale(3), opacity: 0.6 };
            case 'residential':
            case 'unclassified':
            case 'service':
                return { color: '#cbd5e1', weight: scale(2), opacity: 0.5 };
            case 'cycleway':
                return { color: '#3b82f6', weight: scale(2), opacity: 0.8 }; // Blue
            case 'track':
                return { color: '#854d0e', weight: scale(1.5), opacity: 0.8 }; // Brown
            case 'bridleway':
                return { color: '#d97706', weight: scale(1.5), opacity: 0.8, dashArray: '5, 5' }; // Amber Dashed
            case 'steps':
                return { color: '#94a3b8', weight: scale(2), opacity: 0.8, dashArray: '2, 2' }; // Slate Dashed
            case 'path':
            case 'footway':
            case 'pedestrian':
            case 'living_street':
            case 'corridor':
            case 'platform':
                return { color: '#059669', weight: scale(1.5), opacity: 0.8 }; // Emerald Solid

            // -- Railways --
            case 'rail':
            case 'narrow_gauge':
            case 'funicular':
            case 'subway':
            case 'light_rail':
            case 'preserved':
            case 'monorail':
                return { color: '#4b5563', weight: scale(2), opacity: 1, dashArray: '10, 10' }; // Dark Gray Dashed

            default:
                if (tags.railway) return { color: '#4b5563', weight: scale(2), opacity: 1, dashArray: '10, 10' };
                if (tags.aerialway) return { color: '#1e293b', weight: scale(2), opacity: 1, dashArray: '1, 3' };
                if (tags['piste:type']) return { color: '#0ea5e9', weight: scale(3), opacity: 0.7 };

                if (tags.waterway || tags.natural === 'water' || tags.landuse === 'reservoir' || tags.landuse === 'basin') {
                    if (tags.natural === 'water' || tags.landuse === 'reservoir' || tags.landuse === 'basin') {
                        return { color: '#0ea5e9', weight: 1, opacity: 0.6, fillColor: '#0ea5e9', fillOpacity: 0.3 };
                    }
                    if (tags.waterway === 'river') return { color: '#06b6d4', weight: scale(4), opacity: 0.8 };
                    if (tags.waterway === 'stream') return { color: '#06b6d4', weight: scale(2), opacity: 0.7, dashArray: '2, 3' };
                    if (tags.waterway === 'canal') return { color: '#0891b2', weight: scale(3), opacity: 0.8 };
                    return { color: '#06b6d4', weight: scale(3), opacity: 0.6 }; // Cyan default
                }

                return { color: '#64748b', weight: scale(0.5), opacity: 0.5 };
        }
    }
    /**
     * Charge et affiche les zones voisines selon le type de zone active.
     * Ne fait rien si aucune zone administrative n'est active.
     */
    async loadNeighbors() {
        if (!this.activeZone) return;

        const mapBounds = this.mapManager.map.getBounds();
        const screenBounds = {
            minLat: mapBounds.getSouth(),
            maxLat: mapBounds.getNorth(),
            minLng: mapBounds.getWest(),
            maxLng: mapBounds.getEast()
        };

        try {
            let neighbors = [];
            const { type, code, codeDepartement } = this.activeZone;

            if (type === 'commune') {
                const deptCode = codeDepartement || (code ? code.substring(0, 2) : null);
                if (deptCode) {
                    neighbors = await this.apiService.fetchNeighborCommunes(deptCode, screenBounds, code);
                }
            } else if (type === 'dept') {
                neighbors = await this.apiService.fetchNeighborDepts(screenBounds, code);
            } else if (type === 'region') {
                neighbors = await this.apiService.fetchNeighborRegions(screenBounds, code);
            }

            if (neighbors.length === 0) return;

            this.mapManager.drawNeighborZones(neighbors, (neighbor) => {
                // Clic sur un voisin → charger comme un nouveau preset
                const neighborAsPreset = {
                    name: neighbor.name,
                    code: neighbor.code,
                    codeDepartement: neighbor.codeDepartement,
                    geometry: neighbor.geometry,
                    adminType: neighbor.type === 'commune' ? undefined : neighbor.type
                };
                this.uiRenderer.onPresetSelected(neighborAsPreset);
            });
        } catch (err) {
            console.warn('Erreur chargement voisins:', err);
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
                this.mapManager.zoomToLocation(poi.lat, poi.lng);
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
