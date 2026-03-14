import { MapManager } from './scripts/mapManager.js';
import { ApiService } from './scripts/api.js';
import { UiRenderer } from './scripts/uiRenderer.js';

// Global fix for Leaflet.heat Canvas readback performance issue
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, contextAttributes) {
    if (type === '2d') {
        contextAttributes = contextAttributes || {};
        contextAttributes.willReadFrequently = true;
    }
    return originalGetContext.call(this, type, contextAttributes);
};

class App {
    constructor() {
        this.mapManager = new MapManager('map');
        this.apiService = new ApiService();
        this.uiRenderer = new UiRenderer();

        this.currentPOIs = [];
        this.currentNetworks = [];
        this.pathWeight = 1;
        this.activeZone = null; // Contexte de la zone administrative active
        this.currentAreaKm2 = 0;
        this.heatmapVisibility = { accommodation: false, pedestrian: false, cycling: false };
    }

    init() {
        // Connecter le bouton des voisins
        this.uiRenderer.onLoadNeighbors = async () => {
            await this.loadNeighbors();
        };
        this.mapManager.init();
        this.uiRenderer.init();
        this.uiRenderer.setApiService(this.apiService);

        this.uiRenderer.onServerChange = (newUrl) => {
            this.apiService.overpassUrl = newUrl;
        };
        this.apiService.onOverpassServerChange = (newUrl, meta = {}) => {
            this.uiRenderer.syncOverpassServerSelect(newUrl, {
                notify: meta.reason === 'fallback-success',
                previousUrl: meta.previousUrl || null
            });
        };

        // Load INSEE Data on app start
        this.apiService.loadInseeData();

        // Bind Force Refresh Button (zone-specific)
        const forceRefreshBtn = document.getElementById('force-refresh-btn');
        if (forceRefreshBtn) {
            forceRefreshBtn.addEventListener('click', async () => {
                if (!this.currentLayer) {
                    forceRefreshBtn.innerHTML = '⚠️ Aucune zone active';
                    setTimeout(() => { forceRefreshBtn.innerHTML = '🔄 Rafraîchir cette zone'; }, 1500);
                    return;
                }
                forceRefreshBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Rafraîchissement...';
                forceRefreshBtn.style.pointerEvents = 'none';
                const latLngs = this.mapManager.getBoundsFromLayer(this.currentLayer);
                await this.apiService.clearZoneCache(latLngs);
                // Re-call handleAreaSelection with the stored activeZone context
                if (this.activeZone) {
                    await this.handleAreaSelection(this.currentLayer, this.activeZone.name, this.activeZone.type, this.activeZone.code || this.activeZone.ref);
                } else {
                    await this.handleAreaSelection(this.currentLayer);
                }
                forceRefreshBtn.innerHTML = '✅ Zone rafraîchie !';
                forceRefreshBtn.style.borderColor = 'rgba(34,197,94,0.5)';
                forceRefreshBtn.style.color = '#86efac';
                setTimeout(() => {
                    forceRefreshBtn.innerHTML = '🔄 Rafraîchir cette zone';
                    forceRefreshBtn.style.pointerEvents = 'auto';
                    forceRefreshBtn.style.borderColor = '';
                    forceRefreshBtn.style.color = '';
                }, 2000);
            });
        }

        // Bind Full Reset Button (everything)
        const forceResetAllBtn = document.getElementById('force-reset-all-btn');
        if (forceResetAllBtn) {
            forceResetAllBtn.addEventListener('click', async () => {
                forceResetAllBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Reset en cours...';
                forceResetAllBtn.style.pointerEvents = 'none';
                await this.apiService.clearAllCaches();
                forceResetAllBtn.innerHTML = 'OK - cache vide';
                forceResetAllBtn.style.borderColor = 'rgba(34,197,94,0.5)';
                forceResetAllBtn.style.color = '#86efac';
                if (this.currentLayer) {
                    if (this.activeZone) {
                        await this.handleAreaSelection(this.currentLayer, this.activeZone.name, this.activeZone.type, this.activeZone.code || this.activeZone.ref);
                    } else {
                        await this.handleAreaSelection(this.currentLayer);
                    }
                }
                setTimeout(() => {
                    forceResetAllBtn.innerHTML = 'Reset complet (tout le cache)';
                    forceResetAllBtn.style.pointerEvents = 'auto';
                    forceResetAllBtn.style.borderColor = '';
                    forceResetAllBtn.style.color = '';
                }, 2000);
            });
        }

        // Bind Drawing Event
        this.mapManager.onPolygonCreated = async (layer) => {
            this.uiRenderer.closeSettings(); // Ferme le panneau dès qu'une zone est validée
            this.handleAreaSelection(layer); // For drawn polygons, activeZone remains null
            this.uiRenderer.toggleLoadNeighborsBtn(false);
        };

        // Fermer le panneau dès que l'utilisateur commence à dessiner
        this.mapManager.map.on('draw:drawstart', () => {
            this.uiRenderer.closeSettings();
        });

        // Bind Filter Change (client-side only — no re-fetch needed since all POIs are always loaded)
        this.uiRenderer.onFilterChange = () => {
            if (this.currentPOIs && this.currentPOIs.length > 0) {
                const filtered = this.getFilteredPOIs();
                this.uiRenderer.renderMacroStats(filtered, '', this.currentNetworks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats());
                this.uiRenderer.renderMicroList(filtered);
                this.addMarkersToMap(filtered);
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
                this.uiRenderer.renderMacroStats(filtered, '', this.currentNetworks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats());
                this.uiRenderer.renderMicroList(filtered);
                this.addMarkersToMap(filtered);
            }
        };

        // Bind POI Selection (List Click)
        this.uiRenderer.onPoiSelected = (poi) => {
            this.mapManager.zoomToLocation(poi.lat, poi.lng);
            // Afficher le marqueur de sélection après le début du vol (1.6 s = durée flyTo + petite marge)
            setTimeout(() => {
                this.mapManager.showSelectionMarker(poi.lat, poi.lng, poi.name);
            }, 1600);
        };

        this.mapManager.onPolygonCleared = () => {
            this.resetZoneSelection({ clearDrawnLayer: false });
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
        // NOUVEAU: Zoomer sur la carte lors de la sélection d'un pays
        this.uiRenderer.onCountrySelected = (country) => {
            this.resetZoneSelection();
            if (country && country.bounds) {
                this.mapManager.map.fitBounds(country.bounds);
                const presetsPanel = document.getElementById('presets-panel');
                const presetsBtn = document.getElementById('minimize-presets-btn');
                if (presetsPanel && presetsBtn) {
                    presetsPanel.classList.remove('minimized');
                    presetsBtn.textContent = '-';
                }
            }
        }
        this.uiRenderer.onPresetSelected = async (park) => {
            this.uiRenderer.showLoading(true);
            let layer = null;

            // Déterminer le type de zone et sauvegarder le contexte
            if (park.geometry) {
                // Commune (via GéoAPI)
                this.activeZone = {
                    type: 'commune',
                    code: park.code,
                    codeDepartement: park.codeDepartement || (park.code ? String(park.code).substring(0, 2) : null),
                    name: park.name,
                    wikidata: park.wikidata || null,
                    population: park.population || null
                };
                layer = this.mapManager.drawBoundary(park.geometry);
            } else if (park.adminType === 'dept' || park.adminType === 'region' || park.adminType === 'admin') {
                this.activeZone = { type: park.adminType, code: park.ref || park.code, name: park.name, wikidata: park.wikidata || null, population: park.population || null };
                if (park.relationId) {
                    const geoJson = await this.apiService.fetchParkBoundary(park.relationId);
                    if (geoJson) layer = this.mapManager.drawBoundary(geoJson);
                }
            } else if (park.relationId) {
                this.activeZone = null;
                const geoJson = await this.apiService.fetchParkBoundary(park.relationId);
                if (geoJson) layer = this.mapManager.drawBoundary(geoJson);
            } else {
                this.activeZone = null;
            }

            if (!layer && park.bounds) {
                layer = this.mapManager.drawRectangle(park.bounds);
            }

            if (layer) {
                await this.handleAreaSelection(layer, park.name, this.activeZone ? this.activeZone.type : null, this.activeZone ? (this.activeZone.code || this.activeZone.ref) : null);
                this.uiRenderer.toggleLoadNeighborsBtn(this.canLoadNeighborsForActiveZone());
            } else {
                this.uiRenderer.showLoading(false);
            }
        };
    }

    resetZoneSelection({ clearDrawnLayer = true } = {}) {
        this.currentPOIs = [];
        this.currentNetworks = [];
        this.currentLayer = null;
        this.activeZone = null;
        this.currentAreaKm2 = 0;

        this.uiRenderer.clear();
        this.uiRenderer.toggleLoadNeighborsBtn(false);

        if (clearDrawnLayer && this.mapManager.drawnItems) {
            this.mapManager.drawnItems.clearLayers();
        }
        if (this.mapManager.networkGroup) this.mapManager.networkGroup.clearLayers();
        if (this.mapManager.markerGroup) this.mapManager.markerGroup.clearLayers();
        this.mapManager.clearNeighborZones();
        this.mapManager.clearSelectionMarker();
        this.mapManager.clearHeatmapLayers();
    }

    canLoadNeighborsForActiveZone() {
        if (!this.activeZone) return false;
        if (this.apiService.currentCountryCode !== 'fr') return false;

        return ['commune', 'dept', 'region'].includes(this.activeZone.type);
    }

    _getInseeStats() {
        if (this.activeZone && this.activeZone.type === 'commune' && this.activeZone.ref) {
            const stats = this.apiService.getInseeStats(this.activeZone.ref);
            if (stats) console.log(`Données INSEE trouvées pour ${this.activeZone.name} (${this.activeZone.ref}):`, stats);
            return stats;
        }
        return null;
    }

    async handleAreaSelection(layer, name = null, type = null, ref = null) {
        this.currentLayer = layer;
        this.uiRenderer.showLoading(true);

        // Enregistrer la zone active si elle vient d'un preset avec name/type/ref
        if (name && type) {
            // Fusionner avec l'activeZone existante pour ne pas perdre code/codeDepartement
            this.activeZone = { ...this.activeZone, name, type, ref: ref || null };
            console.log(`[AreaSelected] Name: ${name}, Type: ${type}, Ref: ${ref}`);
        } else if (!this.activeZone) {
            // If it's a drawn polygon and no activeZone is set yet
            this.activeZone = null;
        }


        const latLngs = this.mapManager.getBoundsFromLayer(layer);

        // Calcul de la surface de la zone en km²
        try {
            let areaM2 = 0;
            if (latLngs && latLngs.length > 0 && Array.isArray(latLngs[0])) {
                latLngs.forEach(ring => {
                    areaM2 += L.GeometryUtil.geodesicArea(ring);
                });
            } else if (latLngs && latLngs.length > 0) {
                areaM2 = L.GeometryUtil.geodesicArea(latLngs);
            }
            this.currentAreaKm2 = areaM2 / 1e6;
        } catch (e) {
            console.warn("Calcul de surface échoué:", e);
            this.currentAreaKm2 = 0;
        }

        if (latLngs) {
            try {
                // Fetch ALL POIs (no category filter at API level — filtering is client-side)
                // This ensures sub-categories are always populated regardless of active filters
                const { pois, networks } = await this.apiService.fetchPOIs(latLngs, []);
                this.currentPOIs = pois;
                this.currentNetworks = networks;

                // Render Networks (Affiche les tracés immédiatement)
                this.renderNetworks(networks);

                // Populate sub-category checkboxes from loaded POIs
                this.uiRenderer.populateSubCategoryCheckboxes(this.currentPOIs);

                // Get filtered POIs (respecting sub-category exclusions)
                const filteredPOIs = this.getFilteredPOIs();

                // Add Markers to Map (Affiche les POIs sur la carte immédiatement)
                this.addMarkersToMap(filteredPOIs);

                // --- PRÉPARATION DE L'AFFICHAGE DÉMOGRAPHIQUE ---
                let initialDemoHtml = '';

                if (this.activeZone) {
                    if (this.activeZone.demoHtml !== undefined) {
                        // Les données sont déjà en cache
                        initialDemoHtml = this.activeZone.demoHtml;
                    } else {
                        // Les données ne sont pas encore là : on prépare un spinner de chargement avec le même style que la carte KPI
                        initialDemoHtml = `
                            <div class="kpi-card glass-panel" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 12px;">
                                <span class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></span>
                                <span style="font-size: 0.9rem; color: var(--color-primary); font-weight: 600;">Recherche de la population...</span>
                            </div>
                        `;
                    }
                }

                // Update UI (Macro Stats) - Affiche les POIs, chemins, et soit la démo en cache, soit le spinner
                this.uiRenderer.renderMacroStats(filteredPOIs, initialDemoHtml, networks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats());

                // Construire et afficher les heatmaps
                this.updateHeatmaps();

                // Connecter le toggle heatmap (appelé quand l'utilisateur coche/décoche)
                this.uiRenderer.onHeatmapToggle = (key, checked) => {
                    this.heatmapVisibility[key] = checked;
                    this.updateHeatmaps();
                };

                // On met à jour la liste du panneau de droite !
                this.uiRenderer.renderMicroList(filteredPOIs);
                // --- CHARGEMENT ASYNCHRONE DE LA DÉMOGRAPHIE ---
                if (this.activeZone) {
                    const currentZone = this.activeZone;

                    if (currentZone.demoHtml === undefined) {
                        // Lancement de la requête
                        if (!currentZone._demoPromise) {
                            currentZone._demoPromise = this.apiService.getZoneDemographics(currentZone).then(async demoData => {
                                // 1. On enrichit avec les données d'Overpass si elles existent
                                if (demoData) {
                                    currentZone.wikidata = demoData.wikidata || currentZone.wikidata;
                                    currentZone.population = demoData.osmPopulation || currentZone.population;
                                }

                                // 2. On tente de récupérer l'historique avec le wikidata 
                                const history = await this.apiService.fetchPopulationHistory(currentZone.wikidata);

                                // 3. ON GÉNÈRE TOUJOURS LE HTML (pour ne pas perdre la population déjà connue via la recherche de la ville)
                                currentZone.demoHtml = this.uiRenderer.generateDemographicsKPI(history, currentZone.population, currentZone.name);

                            }).catch(e => {
                                console.warn("Erreur chargement démographie:", e);
                                // Fallback : En cas de plantage réseau, on affiche au moins la population de base qu'on avait
                                currentZone.demoHtml = this.uiRenderer.generateDemographicsKPI(null, currentZone.population, currentZone.name);
                            });
                        }

                        // Quand la promesse est terminée (succès ou échec)
                        currentZone._demoPromise.finally(() => {
                            if (this.activeZone === currentZone) {
                                try {
                                    // S'il n'y a absolument aucune donnée recensée (ni API, ni recherche), on met un encart gris au lieu d'un trou noir
                                    const fallbackHtml = `
                                        <div class="kpi-card glass-panel" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; text-align: center;">
                                            <span style="font-size: 0.85rem; color: var(--color-text-muted); font-style: italic;">ℹ️ Aucune donnée démographique recensée pour cette zone.</span>
                                        </div>
                                    `;

                                    this.uiRenderer.renderMacroStats(this.getFilteredPOIs(), currentZone.demoHtml || fallbackHtml, this.currentNetworks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats());
                                    this.uiRenderer.renderSparkline();
                                } catch (err) {
                                    console.error("Erreur lors de l'affichage final de la macro:", err);
                                }
                            }
                        });
                    } else {
                        // Si l'information est déjà en cache
                        this.uiRenderer.renderSparkline();
                    }
                }
                // Show Sidebar
                if (filteredPOIs.length > 0) {
                    this.uiRenderer.toggleMicroSidebar(true);
                } else {
                    this.uiRenderer.toggleMicroSidebar(true);
                }

            } catch (err) {
                console.error("Error handling selection", err);
                this.uiRenderer.showError(
                    'Erreur lors de la récupération des données.',
                    () => this.handleAreaSelection(layer)
                );
            } finally {
                this.uiRenderer.showLoading(false);
            }
        }
    }

    getFilteredPOIs() {
        const selectedCategories = this.uiRenderer.getSelectedCategories();
        const excluded = this.uiRenderer.getExcludedSubCategories();
        return this.currentPOIs.filter(p => {
            // Filtre par catégorie principale
            if (selectedCategories.length > 0 && selectedCategories[0] !== 'none') {
                if (!selectedCategories.includes(p.category)) return false;
            } else if (selectedCategories[0] === 'none') {
                return false;
            }
            // Filtre par sous-catégorie exclue
            if (excluded.size > 0 && excluded.has(p.type)) return false;
            return true;
        });
    }

    /** Construit les données de coordonnées pour les 3 heatmaps */
    buildHeatmapData() {
        const accommodationTypes = new Set([
            'hotel', 'guest_house', 'hostel', 'camp_site', 'chalet',
            'alpine_hut', 'apartment', 'motel', 'caravan_site', 'shelter'
        ]);
        const pedestrianTypes = new Set(['path', 'footway', 'pedestrian', 'living_street']);
        const cyclingTypes = new Set(['cycleway']);

        const accommodation = [];
        const pedestrian = [];
        const cycling = [];

        // Points d'hébergement depuis les POIs
        this.currentPOIs.forEach(p => {
            if (p.category === 'accommodation' || accommodationTypes.has(p.type)) {
                accommodation.push([p.lat, p.lng, 1]);
            }
        });

        // Points de sentiers depuis les networks (milieu du tracé)
        this.currentNetworks.forEach(net => {
            if (!net.geometry || net.geometry.length === 0) return;
            const mid = net.geometry[Math.floor(net.geometry.length / 2)];
            const t = net.type;
            const route = net.relationRoute;

            if (pedestrianTypes.has(t) || route === 'hiking' || route === 'foot' || (net.tags && net.tags.sac_scale)) {
                pedestrian.push([mid.lat, mid.lon, 1]);
            }
            if (cyclingTypes.has(t) || route === 'bicycle' || route === 'mtb') {
                cycling.push([mid.lat, mid.lon, 1]);
            }
        });

        return { accommodation, pedestrian, cycling };
    }

    /** Met à jour les heatmaps sur la carte */
    updateHeatmaps() {
        const heatData = this.buildHeatmapData();
        this.mapManager.updateHeatmapLayers(heatData, this.heatmapVisibility);
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
        const scale = (w) => w * (this.pathWeight ?? 1);

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
        if (!this.canLoadNeighborsForActiveZone()) return;

        const mapBounds = this.mapManager.map.getBounds();
        const screenBounds = {
            minLat: mapBounds.getSouth(),
            maxLat: mapBounds.getNorth(),
            minLng: mapBounds.getWest(),
            maxLng: mapBounds.getEast()
        };

        try {
            let neighbors = [];
            const { type, code, ref, codeDepartement } = this.activeZone;
            const zoneCode = code || ref; // code ou ref selon la source

            if (type === 'commune') {
                const deptCode = codeDepartement || (zoneCode ? String(zoneCode).substring(0, 2) : null);
                if (deptCode) {
                    neighbors = await this.apiService.fetchNeighborCommunes(deptCode, screenBounds, zoneCode);
                }
            } else if (type === 'dept') {
                neighbors = await this.apiService.fetchNeighborDepts(screenBounds, zoneCode);
            } else if (type === 'region') {
                neighbors = await this.apiService.fetchNeighborRegions(screenBounds, zoneCode);
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
                setTimeout(() => {
                    this.mapManager.showSelectionMarker(poi.lat, poi.lng, poi.name);
                }, 1600);
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

