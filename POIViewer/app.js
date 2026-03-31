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
        this.currentWikivoyageData = null; // Cache des données Wikivoyage
        this.heatmapVisibility = {
            accommodation: false, pedestrian: false, cycling: false,
            overtourism_cities: false, overtourism_pois: false
        };
        this.digitalHighlight = null; // 'website' | 'social' | null
        this.accomHighlight = null; // 'hotel' | 'auberge' | 'camping' | 'caravan' | 'collectif' | null
        this.infraHighlight = null; // 'bus' | 'gare' | 'aeroport' | 'parking' | 'sanitaire' | 'recharge' | null
        this.treemapHighlight = null; // { id, parent, source }
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
        this.apiService.loadOvertourismData();

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
            this.selectedPoiType = null;
            if (this.currentPOIs && this.currentPOIs.length > 0) {
                const filtered = this.getFilteredPOIs();
                this.uiRenderer.renderMacroStats(filtered, '', this.currentNetworks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats(), this.activeZone?.hierarchy || null, this.activeZone?.population || null);
                if (this.currentWikivoyageData) this.uiRenderer.updateWikivoyagePanel(this.currentWikivoyageData);
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

        // Connecter le toggle heatmap (appelé quand l'utilisateur coche/décoche)
        this.uiRenderer.onHeatmapToggle = (key, checked) => {
            this.heatmapVisibility[key] = checked;
            if (key.startsWith('overtourism_')) {
                this.updateOvertourismHeatmaps();
                // Si on a des POIs chargés, on met à jour les marqueurs pour le highlight
                if (key === 'overtourism_pois' && this.currentPOIs.length > 0) {
                    this.addMarkersToMap(this.getFilteredPOIs());
                }
            } else {
                // Pour les heatmaps classiques, on ne met à jour que si on a des données de zone
                if (this.currentPOIs.length > 0 || this.currentNetworks.length > 0) {
                    this.updateHeatmaps();
                }
            }
        };

        // Mettre à jour la heatmap d'overtourism quand la carte bouge (si activée)
        this.mapManager.map.on('moveend', () => {
            if (this.heatmapVisibility.overtourism_cities || this.heatmapVisibility.overtourism_pois) {
                this.updateOvertourismHeatmaps();
            }
        });

        // Bind Sub-Category Filter Change (Client-side only, no API refetch)
        this.uiRenderer.onSubCategoryFilterChange = () => {
            this.selectedPoiType = null;
            if (this.currentPOIs && this.currentPOIs.length > 0) {
                const filtered = this.getFilteredPOIs();
                this.uiRenderer.renderMacroStats(filtered, '', this.currentNetworks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats(), this.activeZone?.hierarchy || null, this.activeZone?.population || null);
                if (this.currentWikivoyageData) this.uiRenderer.updateWikivoyagePanel(this.currentWikivoyageData);
                this.uiRenderer.renderMicroList(filtered);
                this.addMarkersToMap(filtered);
            }
        };

        // Bind POI Selection (List Click)
        this.uiRenderer.onPoiSelected = (poi) => {
            this.selectedPoiType = poi.type;
            this.selectedPoi = poi; // Mémoriser le POI sélectionné
            this.digitalHighlight = null;
            this.accomHighlight = null;
            this.infraHighlight = null;
            this.treemapHighlight = null;
            this.addMarkersToMap(this.getFilteredPOIs());

            this.mapManager.zoomToLocation(poi.lat, poi.lng);
            // Afficher le marqueur de sélection après le début du vol (1.6 s = durée flyTo + petite marge)
            setTimeout(() => {
                this.mapManager.showSelectionMarker(poi.lat, poi.lng, poi.name);
            }, 1600);
        };

        // Bind Digital Filter Click ("Site web" / "Réseaux sociaux")
        this.uiRenderer.onDigitalFilterClick = (filterType) => {
            this.digitalHighlight = filterType;
            this.accomHighlight = null;
            this.infraHighlight = null;
            this.treemapHighlight = null;
            this.selectedPoiType = null;
            this.selectedPoi = null; // Clear specific focus
            this.mapManager.clearTransitLine();
            this.addMarkersToMap(this.getFilteredPOIs());
        };

        // Bind Accommodation Filter Click ("Hôtels" / "Campings" / etc.)
        this.uiRenderer.onAccomFilterClick = (filterType) => {
            this.accomHighlight = filterType;
            this.digitalHighlight = null;
            this.infraHighlight = null;
            this.treemapHighlight = null;
            this.selectedPoiType = null;
            this.selectedPoi = null; // Clear specific focus
            this.mapManager.clearTransitLine();
            this.addMarkersToMap(this.getFilteredPOIs());
        };

        // Bind Infrastructure Filter Click ("Arrêts de bus" / "Gares" / etc.)
        this.uiRenderer.onInfraFilterClick = (filterType) => {
            this.infraHighlight = filterType;
            this.digitalHighlight = null;
            this.accomHighlight = null;
            this.treemapHighlight = null;
            this.selectedPoiType = null;
            this.addMarkersToMap(this.getFilteredPOIs());
        };

        // Bind Treemap Item Click
        this.uiRenderer.onTreemapItemClick = (id, parent, source) => {
            if (this.treemapHighlight && this.treemapHighlight.id === id) {
                this.treemapHighlight = null;
            } else {
                this.treemapHighlight = { id, parent, source };
                this.selectedPoiType = null;
                this.digitalHighlight = null;
                this.accomHighlight = null;
                this.infraHighlight = null;
                this.uiRenderer._clearAllHighlightFilters();

                // Alert user if paths are hidden by checkbox filters
                if (source === 'mini') {
                    const sacIds = ['SacRoot', 'Sentiers piétons', 'hiking', 'mountain_hiking', 'demanding_mountain_hiking', 'alpine_hiking', 'demanding_alpine_hiking'];
                    const cycleIds = ['CycleRoot', 'Offre cyclable', 'bicycle_routes', 'cycleways', 'tracks'];

                    if (sacIds.includes(id) || cycleIds.includes(id) || sacIds.includes(parent) || cycleIds.includes(parent)) {
                        const selectedCats = this.uiRenderer.getSelectedPathCategories ? this.uiRenderer.getSelectedPathCategories() : [];
                        const showAll = selectedCats.length === 0 || selectedCats.includes('all');

                        if (!showAll) {
                            let expectedCats = [];
                            if (sacIds.includes(id) || sacIds.includes(parent)) {
                                if (id === 'hiking') expectedCats = ['hiking_easy'];
                                else if (id === 'mountain_hiking' || id === 'demanding_mountain_hiking') expectedCats = ['hiking_medium'];
                                else if (id === 'alpine_hiking' || id === 'demanding_alpine_hiking') expectedCats = ['hiking_hard'];
                                else expectedCats = ['hiking_easy', 'hiking_medium', 'hiking_hard', 'hiking_routes'];
                            } else if (cycleIds.includes(id) || cycleIds.includes(parent)) {
                                if (id === 'bicycle_routes') expectedCats = ['bicycle_routes'];
                                else if (id === 'cycleways') expectedCats = ['cycleways'];
                                else if (id === 'tracks') expectedCats = ['tracks'];
                                else expectedCats = ['bicycle_routes', 'cycleways', 'tracks'];
                            }

                            const isVisible = expectedCats.some(cat => selectedCats.includes(cat));
                            if (!isVisible && expectedCats.length > 0) {
                                this.uiRenderer.showToast("Tracé masqué : Cochez ce type dans le menu 'Chemins' pour l'afficher sur la carte.", "warning", 5000);
                            }
                        }
                    }
                }
            }
            this.addMarkersToMap(this.getFilteredPOIs());
            if (this.currentNetworks && this.currentNetworks.length > 0) {
                this.renderNetworks(this.currentNetworks);
            }
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
                    codeRegion: park.codeRegion || null,
                    hierarchy: park.hierarchy || null,
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
        this.currentWikivoyageData = null;
        this.selectedPoiType = null;
        this.selectedPoi = null; // POI spécifique sélectionné (pour le trait de transport)
        this.digitalHighlight = null;
        this.accomHighlight = null;
        this.infraHighlight = null;
        this.treemapHighlight = null;

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

        // Redraw overtourism heatmaps if active (they are global)
        if (this.heatmapVisibility.overtourism_cities || this.heatmapVisibility.overtourism_pois) {
            this.updateOvertourismHeatmaps();
        }
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

                // Pré-calcul de la distance à l'arrêt le plus proche pour chaque POI
                const isBusStop = (p) => p.type === 'bus_stop' || p.type === 'bus_station' || p.type === 'platform' || (p.tags && (p.tags.highway === 'bus_stop' || p.tags.bus === 'yes')) || p.category === 'public_transport';
                const busStops = pois.filter(isBusStop);

                if (busStops.length > 0) {
                    pois.forEach(poi => {
                        if (!isBusStop(poi)) {
                            const poiLatLng = L.latLng(poi.lat, poi.lng);
                            let minD = Infinity;
                            busStops.forEach(bs => {
                                const d = poiLatLng.distanceTo(L.latLng(bs.lat, bs.lng));
                                if (d < minD) minD = d;
                            });
                            poi.nearestBusStopDist = minD;
                        }
                    });
                }

                this.currentNetworks = networks;

                // Render Networks (Affiche les tracés immédiatement)
                this.renderNetworks(networks);

                // Populate sub-category checkboxes from loaded POIs
                this.uiRenderer.populateSubCategoryCheckboxes(this.currentPOIs);

                // Get filtered POIs (respecting sub-category exclusions)
                const filteredPOIs = this.getFilteredPOIs();

                // Add Markers to Map (Affiche les POIs sur la carte immédiatement)
                this.selectedPoi = null;
                this.mapManager.clearTransitLine();
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
                this.uiRenderer.renderMacroStats(filteredPOIs, initialDemoHtml, networks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats(), this.activeZone?.hierarchy || null, this.activeZone?.population || null);

                // Construire et afficher les heatmaps
                this.updateHeatmaps();

                // --- CHARGEMENT ASYNCHRONE DES ARTICLES WIKIVOYAGE ---
                {
                    // Calculer le centre et le rayon de la zone
                    const bounds = this.mapManager.map.getBounds();
                    const center = bounds.getCenter();
                    const ne = bounds.getNorthEast();
                    // Rayon approximatif = distance du centre au coin NE (capé à 10km par l'API)
                    const radiusM = center.distanceTo(ne);

                    this.apiService.fetchWikivoyageArticles(center.lat, center.lng, radiusM)
                        .then(wikivoyageData => {
                            this.currentWikivoyageData = wikivoyageData;
                            this.uiRenderer.updateWikivoyagePanel(wikivoyageData);
                        })
                        .catch(err => {
                            console.warn('Erreur chargement Wikivoyage:', err);
                            this.uiRenderer.updateWikivoyagePanel(null);
                        });
                }

                // --- CHARGEMENT ASYNCHRONE DES PAGEVIEWS WIKIPEDIA ---
                {
                    const poisSnapshot = this.currentPOIs;
                    this.currentPageviewsData = null; // Reset cache
                    this.apiService.fetchPageviewsForPOIs(poisSnapshot)
                        .then(pageviewsData => {
                            this.currentPageviewsData = pageviewsData;
                            this.uiRenderer.updatePageviewsPanel(pageviewsData);
                        })
                        .catch(err => {
                            console.warn('Erreur chargement Pageviews Wikipedia:', err);
                            this.uiRenderer.updatePageviewsPanel(null);
                        });
                }

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

                                    this.uiRenderer.renderMacroStats(this.getFilteredPOIs(), currentZone.demoHtml || fallbackHtml, this.currentNetworks, this.currentAreaKm2, this.currentPOIs.length, this._getInseeStats(), currentZone.hierarchy || null, currentZone.population || null);
                                    if (this.currentWikivoyageData) this.uiRenderer.updateWikivoyagePanel(this.currentWikivoyageData);
                                    if (this.currentPageviewsData !== undefined) this.uiRenderer.updatePageviewsPanel(this.currentPageviewsData);
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

    /** Met à jour les heatmaps de sur-fréquentation */
    updateOvertourismHeatmaps() {
        const bounds = this.mapManager.map.getBounds();
        const overData = this.apiService.getOvertourismData(bounds);
        this.mapManager.updateOvertourismHeatmaps(overData, this.heatmapVisibility, this.activeZone);
    }

    renderNetworks(networks) {
        if (!this.mapManager.networkGroup) {
            this.mapManager.networkGroup = L.layerGroup().addTo(this.mapManager.map);
        }
        this.mapManager.networkGroup.clearLayers();

        const selectedCategories = this.uiRenderer.getSelectedPathCategories ? this.uiRenderer.getSelectedPathCategories() : [];
        const showAll = selectedCategories.length === 0 || selectedCategories.includes('all');

        const hasActiveFilter = !!(this.selectedPoiType || this.digitalHighlight || this.accomHighlight || this.infraHighlight || this.treemapHighlight);

        const sacLabels = {
            'hiking': 'Randonnée (T1)', 'mountain_hiking': 'Montagne (T2)',
            'demanding_mountain_hiking': 'Montagne exigeante (T3)',
            'alpine_hiking': 'Alpin (T4)', 'demanding_alpine_hiking': 'Alpin exigeant (T5)'
        };
        const cycleCats = {
            'bicycle_routes': 'VTT / Vélo (itinéraires)',
            'cycleways': 'Piste Cyclable',
            'tracks': 'Piste (Track)'
        };

        const networksData = [];
        let hasNetworkMatch = false;

        networks.forEach(net => {
            const netCat = this.getNetworkCategory(net.type, net.tags, net.relationRef, net.relationRoute);

            // Check visibility
            if (!showAll && !selectedCategories.includes(netCat)) {
                return; // Skip if not selected
            }

            const latLngs = net.geometry.map(pt => [pt.lat, pt.lon]);
            const baseStyle = this.getNetworkStyle(net.type, net.tags, net.relationRef, net.relationRoute);
            let style = { ...baseStyle };

            let isNetworkHighlighted = false;

            if (this.treemapHighlight && this.treemapHighlight.source === 'mini') {
                const { id } = this.treemapHighlight;

                // Sentiers piétons
                if (id === 'SacRoot' || id === 'Sentiers piétons') {
                    if (net.tags?.sac_scale && sacLabels[net.tags.sac_scale]) isNetworkHighlighted = true;
                } else if (sacLabels[id] || Object.values(sacLabels).includes(id)) {
                    if (net.tags?.sac_scale === id || sacLabels[net.tags?.sac_scale] === id) isNetworkHighlighted = true;
                }

                // Chemins vélo
                if (id === 'CycleRoot' || id === 'Offre cyclable') {
                    if (net.relationRoute === 'bicycle' || net.relationRoute === 'mtb' || net.type === 'cycleway' || net.type === 'track') isNetworkHighlighted = true;
                } else if (cycleCats[id] || Object.values(cycleCats).includes(id)) {
                    let matchKey = null;
                    if (net.relationRoute === 'bicycle' || net.relationRoute === 'mtb') matchKey = 'bicycle_routes';
                    else if (net.type === 'cycleway') matchKey = 'cycleways';
                    else if (net.type === 'track') matchKey = 'tracks';

                    if (matchKey === id || cycleCats[matchKey] === id) isNetworkHighlighted = true;
                }
            }

            if (isNetworkHighlighted) hasNetworkMatch = true;
            networksData.push({ net, isNetworkHighlighted, style, latLngs });
        });

        const shouldDimNetworks = hasActiveFilter && (
            (this.lastFilterTargetedNetworks ? hasNetworkMatch : true) &&
            (!this.lastFilterTargetedNetworks ? (this.lastPoiMatchCount > 0) : true)
        ) && (hasNetworkMatch || this.lastPoiMatchCount > 0);

        networksData.forEach(data => {
            let { net, isNetworkHighlighted, style, latLngs } = data;

            if (hasActiveFilter) {
                if (isNetworkHighlighted) {
                    style.opacity = 1;
                    style.weight = (style.weight || 3) + 3; // Make it significantly thicker to glow
                } else {
                    style.opacity = shouldDimNetworks ? 0.15 : style.opacity; // Dim others if dimming is needed
                }
            }

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
            case 'bridleway':
            case 'steps':
            case 'corridor':
            case 'platform': return 'paths';
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
                return 'paths';
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

        const markersData = [];
        this.lastPoiMatchCount = 0;
        
        // Si un POI est sélectionné, on met à jour sa ligne de transport (au cas où le filtre a changé)
        if (this.selectedPoi) {
            const nearestStop = this._findNearestTransitStop(this.selectedPoi);
            if (nearestStop) {
                this.mapManager.drawTransitLine([this.selectedPoi.lat, this.selectedPoi.lng], [nearestStop.lat, nearestStop.lng]);
            } else {
                this.mapManager.clearTransitLine();
            }
        }
        pois.forEach(poi => {
            let isHighlighted = this.selectedPoiType && poi.type === this.selectedPoiType;

            // Digital highlight: is this POI matching the current digital filter?
            let isDigitalMatch = false;
            if (this.digitalHighlight && poi.digital) {
                if (this.digitalHighlight === 'website' && poi.digital.hasWebsite) isDigitalMatch = true;
                if (this.digitalHighlight === 'social' && poi.digital.hasSocialMedia) isDigitalMatch = true;
                if (this.digitalHighlight === 'all' && (poi.digital.hasWebsite || poi.digital.hasSocialMedia)) isDigitalMatch = true;
                if (this.digitalHighlight === 'wikipedia' && poi.tags && poi.tags.wikipedia) isDigitalMatch = true;
            }

            // Accommodation highlight
            let isAccomMatch = false;
            if (this.accomHighlight) {
                if (this.accomHighlight.startsWith('star-')) {
                    const targetStar = this.accomHighlight.split('-')[1];
                    if (poi.type === 'hotel') {
                        const stars = poi.tags && poi.tags.stars ? poi.tags.stars : null;
                        if (targetStar === 'NC') {
                            if (!stars || isNaN(parseInt(stars, 10))) isAccomMatch = true;
                        } else {
                            if (stars && parseInt(stars, 10) === parseInt(targetStar, 10)) isAccomMatch = true;
                        }
                    }
                } else {
                    const accomTypeMap = {
                        hotel: ['hotel'],
                        auberge: ['hostel', 'guest_house', 'bed_and_breakfast', 'motel'],
                        camping: ['camp_site'],
                        caravan: ['caravan_site', 'camp_pitch'],
                        collectif: ['chalet', 'alpine_hut', 'wilderness_hut', 'shelter', 'apartment', 'holiday_flat'],
                        all: ['hotel', 'hostel', 'guest_house', 'bed_and_breakfast', 'motel', 'camp_site', 'caravan_site', 'camp_pitch', 'chalet', 'alpine_hut', 'wilderness_hut', 'shelter', 'apartment', 'holiday_flat']
                    };
                    const matchTypes = accomTypeMap[this.accomHighlight] || [];
                    if (matchTypes.includes(poi.type)) isAccomMatch = true;
                }
            }

            // Infrastructure highlight
            let isInfraMatch = false;
            if (this.infraHighlight) {
                const pType = poi.type || '';
                const t = poi.tags || {};
                switch (this.infraHighlight) {
                    case 'bus':
                        isInfraMatch = ['bus_stop', 'bus_station', 'platform'].includes(pType) || t.bus === 'yes' || t.highway === 'bus_stop';
                        break;
                    case 'gare':
                        isInfraMatch = ['station', 'halt', 'tram_stop', 'subway_entrance'].includes(pType) || t.railway === 'station' || t.railway === 'halt';
                        break;
                    case 'aeroport':
                        isInfraMatch = ['aerodrome', 'aeroway', 'airport'].includes(pType) || t.aeroway === 'aerodrome';
                        break;
                    case 'transport':
                        isInfraMatch = ['bus_stop', 'bus_station', 'platform'].includes(pType) || t.bus === 'yes' || t.highway === 'bus_stop'
                            || ['station', 'halt', 'tram_stop', 'subway_entrance'].includes(pType) || t.railway === 'station' || t.railway === 'halt'
                            || ['aerodrome', 'aeroway', 'airport'].includes(pType) || t.aeroway === 'aerodrome';
                        break;
                    case 'parking':
                        isInfraMatch = ['parking', 'parking_space', 'bicycle_parking'].includes(pType) || t.amenity === 'parking';
                        break;
                    case 'sanitaire':
                        isInfraMatch = ['toilets', 'shower', 'drinking_water'].includes(pType) || t.amenity === 'toilets' || t.amenity === 'shower' || t.amenity === 'drinking_water';
                        break;
                    case 'recharge':
                        isInfraMatch = pType === 'charging_station' || t.amenity === 'charging_station';
                        break;
                    case 'services':
                        isInfraMatch = ['parking', 'parking_space', 'bicycle_parking'].includes(pType) || t.amenity === 'parking'
                            || ['toilets', 'shower', 'drinking_water'].includes(pType) || t.amenity === 'toilets' || t.amenity === 'shower' || t.amenity === 'drinking_water'
                            || pType === 'charging_station' || t.amenity === 'charging_station';
                        break;
                }
            }

            // Treemap highlight
            let isTreemapMatch = false;
            let treemapGlowColor = '#ffffff';

            if (this.treemapHighlight) {
                const { id, parent, source } = this.treemapHighlight;
                if (source === 'main') {
                    if (id === 'All' || id === 'Total') {
                        isTreemapMatch = true;
                    } else if (parent === 'All' || parent === 'Total') { // Category
                        // Check if it matches raw ID ('tourism'), translated ID ('Tourisme'), or label with emoji ('📸 Tourisme')
                        const catDef = this.uiRenderer.categories ? this.uiRenderer.categories.find(c => c.id === poi.category) : null;
                        const labelNoEmoji = catDef ? catDef.label : poi.category;
                        const labelWithEmoji = catDef ? `${catDef.emoji} ${labelNoEmoji}` : poi.category;

                        if (poi.category === id || labelNoEmoji === id || labelWithEmoji === id || id.includes(labelNoEmoji)) {
                            isTreemapMatch = true;
                            treemapGlowColor = this.uiRenderer.getCategoryColor(poi.category);
                        }
                    } else if (parent !== '') { // Type
                        const parts = id.split('__');
                        if (parts.length === 2 && poi.category === parts[0] && poi.type === parts[1]) {
                            isTreemapMatch = true;
                            treemapGlowColor = this.uiRenderer.getCategoryColor(poi.category);
                        } else if (poi.type === id || id.includes(poi.type) || (this.uiRenderer.getTypeTranslation && id.includes(this.uiRenderer.getTypeTranslation(poi.type)))) {
                            // Fallback if ID is just the type or label
                            // Just check if the clicked label matches the POI's type translation
                            isTreemapMatch = true;
                            treemapGlowColor = this.uiRenderer.getCategoryColor(poi.category);
                        }
                    }
                } else if (source === 'mini') {
                    if (id === 'AccomRoot' || id === 'Hébergements') {
                        if (poi.category === 'accommodation') {
                            isTreemapMatch = true;
                            treemapGlowColor = '#a78bfa';
                        }
                    } else {
                        const t = poi.tags && poi.tags.tourism ? poi.tags.tourism : poi.type;
                        // Sometimes Plotly might pass the label instead of the id, or the parent is missing
                        // so we just confidently check if it's an accommodation and either type matches
                        const accomTags = {
                            'hotel': 'Hôtel', 'hostel': 'Auberge', 'motel': 'Motel',
                            'guest_house': "Maison d'hôtes", 'bed_and_breakfast': 'B&B',
                            'holiday_flat': 'Meublé de tourisme', 'chalet': 'Chalet',
                            'apartment': 'Appartement', 'camp_site': 'Camping',
                            'caravan_site': 'Aire camping-car', 'camp_pitch': 'Emplacement',
                            'alpine_hut': 'Refuge alpin', 'wilderness_hut': 'Refuge nature',
                            'shelter': 'Abri'
                        };
                        const translated = accomTags[t] || t;
                        if (poi.category === 'accommodation' && (t === id || translated === id)) {
                            isTreemapMatch = true;
                            treemapGlowColor = '#a78bfa';
                        }
                    }
                }
            }

            const isMatched = isHighlighted || isDigitalMatch || isAccomMatch || isInfraMatch || isTreemapMatch;
            if (isMatched) this.lastPoiMatchCount++;

            markersData.push({
                poi, isMatched, isHighlighted, isDigitalMatch, isAccomMatch, isInfraMatch, isTreemapMatch, treemapGlowColor
            });
        });

        let targetsNetworks = false;
        let targetsPois = true;
        if (this.treemapHighlight && this.treemapHighlight.source === 'mini') {
            const id = this.treemapHighlight.id;
            const parent = this.treemapHighlight.parent;
            const sacIds = ['SacRoot', 'Sentiers piétons', 'hiking', 'mountain_hiking', 'demanding_mountain_hiking', 'alpine_hiking', 'demanding_alpine_hiking'];
            const cycleIds = ['CycleRoot', 'Offre cyclable', 'bicycle_routes', 'cycleways', 'tracks'];
            if (sacIds.includes(id) || cycleIds.includes(id) || sacIds.includes(parent) || cycleIds.includes(parent)) {
                targetsNetworks = true;
                targetsPois = false;
            }
        }
        this.lastFilterTargetedNetworks = targetsNetworks;

        const hasActiveFilter = !!(this.selectedPoiType || this.digitalHighlight || this.accomHighlight || this.infraHighlight || this.treemapHighlight);
        const shouldDimPois = hasActiveFilter && (targetsNetworks || this.lastPoiMatchCount > 0);

        markersData.forEach(data => {
            const { poi, isMatched, isHighlighted, isDigitalMatch, isAccomMatch, isInfraMatch, isTreemapMatch, treemapGlowColor } = data;

            let marker;

            if (isHighlighted) {
                const catCol = this.uiRenderer.getCategoryColor(poi.category);
                const iconHtml = `<div class="poi-category-highlight" style="background-color: ${catCol}; --pulse-color: ${catCol}">${this.uiRenderer.getCategoryEmoji(poi.category)}</div>`;
                const icon = L.divIcon({
                    className: '',
                    html: iconHtml,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                marker = L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 500 });
            } else if (this.digitalHighlight && isDigitalMatch) {
                // Highlighted via digital filter — glowing marker
                const digitalColors = { website: '#34d399', social: '#ec4899', all: '#38bdf8', wikipedia: '#a78bfa' };
                const glowColor = digitalColors[this.digitalHighlight] || '#38bdf8';
                const iconHtml = `<div class="poi-digital-highlight" style="--glow-color: ${glowColor}">${this.uiRenderer.getCategoryEmoji(poi.category)}</div>`;
                const icon = L.divIcon({
                    className: '',
                    html: iconHtml,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });
                marker = L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 400 });
            } else if (this.accomHighlight && isAccomMatch) {
                const isStarFilter = this.accomHighlight.startsWith('star-');
                const glowColor = isStarFilter ? '#fcd34d' : '#a78bfa';
                const iconHtml = `<div class="poi-digital-highlight" style="--glow-color: ${glowColor}">${this.uiRenderer.getCategoryEmoji(poi.category)}</div>`;
                const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [22, 22], iconAnchor: [11, 11] });
                marker = L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 400 });
            } else if (this.infraHighlight && isInfraMatch) {
                const infraColors = { bus: '#fbbf24', gare: '#8b5cf6', aeroport: '#0ea5e9', transport: '#f59e0b', parking: '#64748b', sanitaire: '#06b6d4', recharge: '#22c55e', services: '#14b8a6' };
                const glowColor = infraColors[this.infraHighlight] || '#fbbf24';
                const iconHtml = `<div class="poi-digital-highlight" style="--glow-color: ${glowColor}">${this.uiRenderer.getCategoryEmoji(poi.category)}</div>`;
                const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [22, 22], iconAnchor: [11, 11] });
                marker = L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 400 });
            } else if (this.treemapHighlight && isTreemapMatch) {
                const iconHtml = `<div class="poi-digital-highlight" style="--glow-color: ${treemapGlowColor}">${this.uiRenderer.getCategoryEmoji(poi.category)}</div>`;
                const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [22, 22], iconAnchor: [11, 11] });
                marker = L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 400 });
            } else {
                let opacity = shouldDimPois ? 0.3 : 1;
                let fillOpacity = shouldDimPois ? 0.3 : 1;

                // --- SUR-FRÉQUENTATION : Highlight special palette ---
                let overOpaque = false;
                let overColor = null;
                if (this.heatmapVisibility.overtourism_pois) {
                    const overData = this.apiService.getOvertourismData();
                    const overPoi = overData.pois.find(ovp => ovp.name === poi.name);
                    if (overPoi) {
                        overOpaque = true;
                        // Palette Intensity (POI) - Extended Yellow/Amber range
                        if (overPoi.intensity >= 0.95) overColor = '#450a0a';      // dark maroon 950
                        else if (overPoi.intensity >= 0.88) overColor = '#7f1d1d'; // Red 900
                        else if (overPoi.intensity >= 0.82) overColor = '#dc2626'; // Red 600
                        else if (overPoi.intensity >= 0.75) overColor = '#ea580c'; // Orange 600
                        else if (overPoi.intensity >= 0.68) overColor = '#f97316'; // Orange 500
                        else if (overPoi.intensity >= 0.60) overColor = '#fbbf24'; // Amber 400 (Warm yellow)
                        else if (overPoi.intensity >= 0.52) overColor = '#facc15'; // Yellow 400
                        else if (overPoi.intensity >= 0.44) overColor = '#fde047'; // Yellow 300
                        else if (overPoi.intensity >= 0.35) overColor = '#fef08a'; // Yellow 200
                        else overColor = '#fef9c3';                               // Yellow 100
                    }
                }

                marker = L.circleMarker([poi.lat, poi.lng], {
                    radius: overOpaque ? 8 : 6,
                    fillColor: overColor || this.uiRenderer.getCategoryColor(poi.category),
                    color: overOpaque ? '#ffeb3b' : '#fff',
                    weight: overOpaque ? 2 : 1,
                    opacity: opacity,
                    fillOpacity: fillOpacity
                });
            }

            marker.on('click', () => {
                this.uiRenderer.renderPoiDetails(poi);
                this.uiRenderer.toggleMicroSidebar(true);

                // Trigger the highlight update
                this.selectedPoiType = poi.type;
                this.selectedPoi = poi; // Mémoriser le POI sélectionné
                
                this.addMarkersToMap(this.getFilteredPOIs());

                this.mapManager.zoomToLocation(poi.lat, poi.lng);
                
                // Le trait est dessiné via addMarkersToMap -> _findNearestTransitStop

                setTimeout(() => {
                    this.mapManager.showSelectionMarker(poi.lat, poi.lng, poi.name);
                }, 1600);
            });

            // Bind original tooltip
            marker.bindTooltip(`<b>${this.uiRenderer.getCategoryEmoji(poi.category)} ${poi.name}</b><br>${poi.type}`, { direction: 'top' });
            this.mapManager.markerGroup.addLayer(marker);
        });
    }

    // getCategoryColor has been moved to UiRenderer

    /**
     * Trouve l'arrêt de transport le plus proche du POI donné.
     * @param {Object} poi 
     * @returns {Object|null}
     */
    _findNearestTransitStop(poi) {
        if (!this.currentPOIs || this.currentPOIs.length === 0) return null;

        const transitTypes = ['bus_stop', 'bus_station', 'platform', 'station', 'halt', 'tram_stop', 'subway_entrance', 'aerodrome', 'aeroway', 'airport'];
        
        // Si un filtre infra est actif, on restreint la recherche à ce filtre
        let candidates = this.currentPOIs.filter(p => {
            const pType = p.type || '';
            const t = p.tags || {};
            
            // On vérifie si c'est un transport
            const isTransport = transitTypes.includes(pType) || 
                                t.bus === 'yes' || t.highway === 'bus_stop' ||
                                t.railway === 'station' || t.railway === 'halt' ||
                                t.aeroway === 'aerodrome';
            
            if (!isTransport) return false;

            // Si un filtre spécifique est actif (bus, gare...), on restreint
            if (this.infraHighlight) {
                switch (this.infraHighlight) {
                    case 'bus': return ['bus_stop', 'bus_station', 'platform'].includes(pType) || t.bus === 'yes' || t.highway === 'bus_stop';
                    case 'gare': return ['station', 'halt', 'tram_stop', 'subway_entrance'].includes(pType) || t.railway === 'station' || t.railway === 'halt';
                    case 'aeroport': return ['aerodrome', 'aeroway', 'airport'].includes(pType) || t.aeroway === 'aerodrome';
                    case 'transport': return true; // N'importe quel transport
                    default: return true; // On garde tout si c'est un autre filtre (ex: parking) mais on reste sur du transport
                }
            }
            return true;
        });

        if (candidates.length === 0) return null;

        // Calculer la distance la plus courte (Euclidienne simple car échelle locale)
        let minDistance = Infinity;
        let nearest = null;

        const poiLatLng = L.latLng(poi.lat, poi.lng);

        candidates.forEach(stop => {
            if (stop === poi) return; // Éviter de se lier à soi-même si le POI est l'arrêt
            const dist = poiLatLng.distanceTo(L.latLng(stop.lat, stop.lng));
            if (dist < minDistance) {
                minDistance = dist;
                nearest = stop;
            }
        });

        return nearest;
    }
}

// Start App
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});

