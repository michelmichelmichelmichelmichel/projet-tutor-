export class UiRenderer {
    constructor() {
        // --- FULL SCREEN CHART CONTAINERS ---
        this.fsOverlay = null; // Will be created in init
        this.fsChartContainer = null;
        this.loadNeighborsBtn = document.getElementById('load-neighbors-btn');
        this.onLoadNeighbors = null;
        this.macroStats = document.getElementById('macro-stats');
        this.poiList = document.getElementById('poi-list');
        this.microSidebar = document.getElementById('micro-sidebar');
        this.closeMicroBtn = document.getElementById('close-micro-view');

        this.toggleFiltersBtn = document.getElementById('toggle-filters-btn');
        this.deselectAllBtn = document.getElementById('deselect-all-btn');
        this.macroFiltersContent = document.getElementById('macro-filters-content');

        this.deselectAllPathsBtn = document.getElementById('deselect-all-paths-btn');

        this.poiSearchInput = document.getElementById('poi-search-input');
        this.excludedSubCategories = new Set();

        this.onFilterChange = null;
        this.onSubCategoryFilterChange = null;
        this.onPoiSelected = null;
        this.onServerChange = null;

        this.categories = [
            { id: 'tourism', label: 'Tourisme' },
            { id: 'sustenance', label: 'Restauration' },
            { id: 'accommodation', label: 'Hébergement' },
            { id: 'leisure', label: 'Loisirs' },
            { id: 'sport', label: 'Sport' },
            { id: 'historic', label: 'Histoire' },
            { id: 'natural', label: 'Nature' },
            { id: 'shop', label: 'Commerces' },
            { id: 'amenity', label: 'Services' },
            { id: 'transport', label: 'Transport' },
            { id: 'healthcare', label: 'Santé' },
            { id: 'emergency', label: 'Urgence' },
            { id: 'office', label: 'Bureaux' },
            { id: 'craft', label: 'Artisanat' },
            { id: 'man_made', label: 'Infras' },
            { id: 'power', label: 'Énergie' },
            { id: 'barrier', label: 'Barrières' },
            { id: 'place', label: 'Lieux' }
        ];

        this.lastPois = [];

        // Definir les parcs nationaux (Coordonnées approximatives des bounding boxes + OSM Relation ID)
        this.nationalParks = [
            { name: "Pyrénées", relationId: 1024513, bounds: [[42.70, -0.70], [43.00, 0.10]] },
            { name: "Vanoise", relationId: 1024507, bounds: [[45.20, 6.60], [45.55, 7.10]] },
            { name: "Écrins", relationId: 1024508, bounds: [[44.50, 6.00], [45.10, 6.60]] },
            { name: "Mercantour", relationId: 1024511, bounds: [[43.90, 6.80], [44.40, 7.20]] },
            { name: "Cévennes", relationId: 1024512, bounds: [[44.00, 3.40], [44.50, 4.00]] },
            { name: "Calanques", relationId: 3080199, bounds: [[43.15, 5.30], [43.25, 5.60]] },
            { name: "Port-Cros", relationId: 1776695, bounds: [[42.98, 6.35], [43.03, 6.45]] }
        ];

        this.onPresetSelected = null;
    }

    async initPresets() {
        // --- 1. Logique de changement d'onglets (Tabs) ---
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Retirer la classe active de tous les boutons et contenus
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Ajouter la classe active au bouton cliqué
                btn.classList.add('active');

                // Afficher le contenu correspondant
                const tabId = btn.getAttribute('data-tab');
                const content = document.getElementById(`${tabId}-content`);
                if (content) {
                    content.classList.add('active');
                }
            });
        });

        // --- 2. Parcs Nationaux (Statique) ---
        const nationalList = document.getElementById('national-list');
        if (nationalList) {
            nationalList.innerHTML = ''; // Nettoyer avant
            this.nationalParks.forEach(park => {
                const btn = document.createElement('button');
                btn.className = 'preset-btn';
                btn.textContent = park.name;
                btn.addEventListener('click', () => {
                    if (this.onPresetSelected) this.onPresetSelected(park);
                    this.minimizePresetsPanel();
                });
                nationalList.appendChild(btn);
            });
        }

        // --- 3. Listes dynamiques avec l'API (Séquentiel pour éviter l'erreur 429) ---
        const loadDynamicLists = async () => {
            await this._populateDynamicList('regional-list', () => this.apiService.fetchParks());
            await this._populateDynamicList('regions-list', () => this.apiService.fetchRegions());
            await this._populateDynamicList('departments-list', () => this.apiService.fetchDepartments());
        };
        loadDynamicLists();

        // --- 4. Recherches dynamiques (Villes et Pays) ---
        this.initCitySearch();
        this.initCountrySearch();
    }

    // Ajoutez cette nouvelle méthode dans la classe UiRenderer
    initCountrySearch() {
        const input = document.getElementById('country-search-input');
        const resultsContainer = document.getElementById('countries-results');

        if (!input || !resultsContainer) return;

        let timeout;
        input.addEventListener('input', (e) => {
            const query = e.target.value;
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                if (query.length < 3) {
                    resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Tapez au moins 3 caractères...</p>';
                    return;
                }

                resultsContainer.innerHTML = '<div class="loading-container"><span class="spinner"></span><span>Recherche...</span></div>';

                try {
                    const results = await this.apiService.searchCountries(query);
                    resultsContainer.innerHTML = '';

                    if (results.length === 0) {
                        resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Aucun pays trouvé.</p>';
                        return;
                    }

                    results.forEach(country => {
                        const btn = document.createElement('button');
                        btn.className = 'preset-btn';
                        btn.style.width = '100%';
                        btn.style.textAlign = 'left';
                        btn.style.display = 'block';
                        btn.innerHTML = `<strong>${country.name}</strong>`;

                        btn.addEventListener('click', async () => { // <-- AJOUT DE async
                            // 1. Définir le pays actif dans l'API
                            this.apiService.setCountry(country.name, country.countryCode, country.areaId);

                            // 2. Feedback visuel de chargement immédiat
                            resultsContainer.innerHTML = `<div class="loading-container"><span class="spinner"></span><span style="color: var(--color-primary); font-size: 0.9rem;">Chargement des données pour ${country.name}...</span></div>`;

                            // 3. Modifier le placeholder de la ville
                            const cityInput = document.getElementById('city-search-input');
                            if (cityInput) cityInput.placeholder = `Rechercher une ville en ${country.name}...`;

                            // 4. Zoomer tout de suite sur la carte pour fluidifier l'expérience
                            if (this.onCountrySelected) this.onCountrySelected(country.bounds);

                            // 5. Rafraichir les listes SÉQUENTIELLEMENT (avec await)
                            try {
                                await this._populateDynamicList('regional-list', () => this.apiService.fetchParks());
                                await this._populateDynamicList('regions-list', () => this.apiService.fetchRegions());
                                await this._populateDynamicList('departments-list', () => this.apiService.fetchDepartments());

                                resultsContainer.innerHTML = `<p style="color: var(--color-primary); font-size: 0.9rem; padding: 10px;">✅ Filtre Pays appliqué : <b>${country.name}</b></p>`;
                            } catch (err) {
                                console.error(err);
                                resultsContainer.innerHTML = `<p style="color: #fbbf24; font-size: 0.9rem; padding: 10px;">⚠️ Pays appliqué, mais le serveur est surchargé (certaines listes peuvent être vides).</p>`;
                            }
                        });
                        resultsContainer.appendChild(btn);
                    });

                } catch (e) {
                    console.error(e);
                    resultsContainer.innerHTML = '<p class="empty-state" style="color:var(--color-danger)">Erreur de recherche.</p>';
                }
            }, 500);
        });
    }

    initCitySearch() {
        const input = document.getElementById('city-search-input');
        const resultsContainer = document.getElementById('cities-results');

        if (!input || !resultsContainer) return;

        // Debounce input
        let timeout;
        input.addEventListener('input', (e) => {
            const query = e.target.value;
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                if (query.length < 3) {
                    resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Tapez au moins 3 caractères...</p>';
                    return;
                }

                resultsContainer.innerHTML = '<div class="loading-container"><span class="spinner"></span><span>Recherche...</span></div>';

                try {
                    const results = await this.apiService.searchCommunes(query);
                    resultsContainer.innerHTML = '';

                    if (results.length === 0) {
                        resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Aucune ville trouvée.</p>';
                        return;
                    }

                    results.forEach(city => {
                        const btn = document.createElement('button');
                        btn.className = 'preset-btn';
                        btn.style.width = '100%';
                        btn.style.textAlign = 'left';
                        btn.style.display = 'block';
                        btn.innerHTML = `<strong>${city.name}</strong><br><span style="font-size:0.75rem; opacity:0.7">${city.fullName}</span>`;

                        btn.addEventListener('click', () => {
                            if (this.onPresetSelected) this.onPresetSelected(city);
                            this.minimizePresetsPanel();
                        });
                        resultsContainer.appendChild(btn);
                    });

                } catch (e) {
                    console.error(e);
                    resultsContainer.innerHTML = '<p class="empty-state" style="color:var(--color-danger)">Erreur de recherche.</p>';
                }
            }, 500); // 500ms debounce
        });
    }

    async _populateDynamicList(containerId, fetchMethod) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Show loading state
        container.innerHTML = '<div class="loading-container"><span class="spinner"></span><span>Chargement...</span></div>';

        let items = [];
        if (this.apiService) {
            items = await fetchMethod();
        } else {
            console.warn(`ApiService not available for ${containerId}`);
        }

        // Déduire le type administratif selon le conteneur pour les voisins
        const adminType = containerId === 'departments-list' ? 'dept'
            : containerId === 'regions-list' ? 'region'
                : null;

        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<span class="loading-text" style="color:var(--color-text-muted); font-size:0.9rem;">Aucun élément trouvé (ou erreur).</span>';
        } else {
            items.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'preset-btn';
                btn.textContent = item.name;
                btn.addEventListener('click', () => {
                    // Enrichir avec adminType et code pour la détection des voisins
                    const enrichedItem = adminType
                        ? { ...item, adminType, code: item.ref || item.code }
                        : item;
                    if (this.onPresetSelected) this.onPresetSelected(enrichedItem);
                    this.minimizePresetsPanel();
                });
                container.appendChild(btn);
            });
        }
    }

    // --- NOUVELLE MÉTHODE POUR L'EFFET DE DÉGRADÉ ---
    adjustColor(hex, amount) {
        hex = hex.replace('#', '');
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);

        r = Math.min(255, Math.max(0, r + amount));
        g = Math.min(255, Math.max(0, g + amount));
        b = Math.min(255, Math.max(0, b + amount));

        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    minimizePresetsPanel() {
        const panel = document.getElementById('presets-panel');
        const btn = document.getElementById('minimize-presets-btn');
        if (panel && btn) {
            panel.classList.add('minimized');
            btn.textContent = '+';
        }
    }

    init() {
        // --- MINIMIZE LOGIC ---
        const setupMinimize = (btnId, panelId) => {
            const btn = document.getElementById(btnId);
            const panel = document.getElementById(panelId);
            if (btn && panel) {
                btn.addEventListener('click', () => {
                    panel.classList.toggle('minimized');
                    const isMin = panel.classList.contains('minimized');
                    btn.textContent = isMin ? '+' : '−';
                });
            }
        };

        setupMinimize('minimize-macro-btn', 'macro-overlay');
        setupMinimize('minimize-presets-btn', 'presets-panel');

        // --- APPEARANCE SETTINGS PANEL (floating) ---
        const settingsBtn = document.getElementById('settings-toggle-btn');
        const settingsPanel = document.getElementById('appearance-settings-panel');
        const closeSettingsBtn = document.getElementById('close-settings');

        if (settingsBtn && settingsPanel) {
            settingsBtn.addEventListener('click', () => {
                const isOpening = settingsPanel.classList.contains('hidden');
                settingsPanel.classList.toggle('hidden');

                // Feedback visuel actif sur le bouton (Point 2)
                if (isOpening) {
                    settingsBtn.style.background = 'var(--color-primary)';
                    settingsBtn.style.color = 'white';
                    settingsBtn.style.borderColor = 'var(--color-primary)';
                } else {
                    settingsBtn.style.background = '';
                    settingsBtn.style.color = '';
                    settingsBtn.style.borderColor = '';
                }
            });

            // Fermeture au clic extérieur (Point 1)
            document.addEventListener('click', (e) => {
                if (!settingsPanel.classList.contains('hidden') &&
                    !settingsPanel.contains(e.target) &&
                    !settingsBtn.contains(e.target)) {
                    this.closeSettings();
                }
            });
        }
        if (closeSettingsBtn && settingsPanel) {
            closeSettingsBtn.addEventListener('click', () => {
                this.closeSettings();
            });
        }

        const serverSelect = document.getElementById('overpass-server-select');
        if (serverSelect) {
            serverSelect.addEventListener('change', (e) => {
                console.log('%c[Test API] Connexion à : ' + e.target.value, 'color: #3388ff; font-weight: bold;');
                fetch(e.target.value + "?data=[out:json];node(42.7,0.5,42.8,0.6)[amenity];out 1;").then(r => console.log('%c[Test API] Réponse OK (' + r.status + ') du serveur ' + e.target.value, 'color: lime; font-weight: bold;')).catch(err => console.error('[Test API] Erreur : ', err));
                if (this.onServerChange) {
                    this.onServerChange(e.target.value);
                }
            });
        }

        // --- INIT FULL SCREEN OVERLAY ---
        this._initFullScreenOverlay();
        // --- BOUTON CHARGER VOISINS ---
        if (this.loadNeighborsBtn) {
            this.loadNeighborsBtn.addEventListener('click', () => {
                const originalText = this.loadNeighborsBtn.innerHTML;
                // Animation de chargement dans le bouton
                this.loadNeighborsBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:8px;vertical-align:middle;"></span> Chargement...';
                this.loadNeighborsBtn.style.pointerEvents = 'none'; // Désactiver pendant le chargement

                if (this.onLoadNeighbors) {
                    this.onLoadNeighbors().finally(() => {
                        this.loadNeighborsBtn.innerHTML = originalText;
                        this.loadNeighborsBtn.style.pointerEvents = 'auto';
                    });
                }
            });
        }
        if (this.closeMicroBtn) {
            this.closeMicroBtn.addEventListener('click', () => {
                this.toggleMicroSidebar(false);
            });
        }

        if (this.categoryFilter) {
            this.categoryFilter.addEventListener('change', (e) => {
                this.selectedSubCategory = null; // Reset sub-cat when main cat changes
                this.filterList();
            });
        }

        if (this.poiSearchInput) {
            this.poiSearchInput.addEventListener('input', () => {
                this.filterList();
            });
        }

        const slider = document.getElementById('path-weight-slider');
        const valueLabel = document.getElementById('path-weight-value');
        if (slider && valueLabel) {
            slider.addEventListener('input', (e) => {
                const val = e.target.value;
                valueLabel.textContent = val + '%';
                if (this.onPathWeightChange) {
                    this.onPathWeightChange(parseInt(val, 10) / 100);
                }
            });
        }

        const colorPicker = document.getElementById('polygon-color-picker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                if (this.onPolygonColorChange) {
                    this.onPolygonColorChange(e.target.value);
                }
            });
        }

        if (this.macroFiltersContent && this.toggleFiltersBtn) {
            this.categories.forEach(cat => {
                const wrapper = document.createElement('div');
                wrapper.style.marginBottom = '6px';
                wrapper.dataset.catId = cat.id;

                const headerRow = document.createElement('div');
                headerRow.style.display = 'flex';
                headerRow.style.alignItems = 'center';
                headerRow.style.gap = '4px';

                // Expand arrow
                const arrow = document.createElement('span');
                arrow.textContent = '▸';
                arrow.style.cursor = 'pointer';
                arrow.style.fontSize = '0.8rem';
                arrow.style.color = 'var(--color-text-muted)';
                arrow.style.width = '12px';
                arrow.style.userSelect = 'none';
                arrow.style.transition = 'transform 0.2s';
                arrow.className = 'sub-cat-arrow';

                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '8px';
                label.style.fontSize = '0.9rem';
                label.style.cursor = 'pointer';
                label.style.color = 'var(--color-text)';
                label.style.flex = '1';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = cat.id;
                checkbox.checked = false;
                checkbox.style.accentColor = 'var(--color-primary)';
                checkbox.addEventListener('change', () => {
                    this.updateFilterButtonText();
                    // When unchecking a parent, also exclude all sub-cats visually
                    const subContainer = wrapper.querySelector('.sub-cat-list');
                    if (subContainer) {
                        subContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            cb.checked = checkbox.checked;
                            if (!checkbox.checked) {
                                this.excludedSubCategories.add(cb.value);
                            } else {
                                this.excludedSubCategories.delete(cb.value);
                            }
                        });
                    }
                    if (this.onFilterChange) this.onFilterChange();
                });

                // Color dot matching the POI marker color
                const colorDot = document.createElement('span');
                const catColor = this.getCategoryColor(cat.id);
                colorDot.style.display = 'inline-block';
                colorDot.style.width = '12px';
                colorDot.style.height = '12px';
                colorDot.style.borderRadius = '50%';
                colorDot.style.background = catColor;
                colorDot.style.boxShadow = `0 0 4px ${catColor}88`;
                colorDot.style.flexShrink = '0';

                label.appendChild(checkbox);
                label.appendChild(colorDot);
                label.appendChild(document.createTextNode(` ${cat.label}`));

                // Sub-category container (initially hidden and empty)
                const subContainer = document.createElement('div');
                subContainer.className = 'sub-cat-list';
                subContainer.dataset.catId = cat.id;
                subContainer.style.display = 'none';
                subContainer.style.marginLeft = '28px';
                subContainer.style.marginTop = '4px';
                subContainer.style.paddingLeft = '8px';
                subContainer.style.borderLeft = '2px solid rgba(255,255,255,0.15)';

                arrow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isHidden = subContainer.style.display === 'none';
                    subContainer.style.display = isHidden ? 'block' : 'none';
                    arrow.textContent = isHidden ? '▾' : '▸';
                    arrow.style.transform = isHidden ? 'none' : 'none';
                });

                headerRow.appendChild(arrow);
                headerRow.appendChild(label);
                wrapper.appendChild(headerRow);
                wrapper.appendChild(subContainer);
                this.macroFiltersContent.appendChild(wrapper);
            });

            this.toggleFiltersBtn.addEventListener('click', () => {
                const isHidden = this.macroFiltersContent.style.display === 'none';
                this.macroFiltersContent.style.display = isHidden ? 'block' : 'none';
                this.toggleFiltersBtn.classList.toggle('is-open', isHidden);
            });
        }

        if (this.deselectAllBtn) {
            this.deselectAllBtn.addEventListener('click', () => {
                const inputs = this.macroFiltersContent.querySelectorAll('input[type="checkbox"]');
                const anyChecked = Array.from(inputs).some(i => i.checked);
                inputs.forEach(input => input.checked = !anyChecked);
                this.updateFilterButtonText();
                if (this.onFilterChange) this.onFilterChange();
            });
        }

        if (this.deselectAllPathsBtn) {
            this.deselectAllPathsBtn.addEventListener('click', () => {
                const inputs = document.getElementById('path-filters-content').querySelectorAll('input[type="checkbox"]');
                const anyChecked = Array.from(inputs).some(i => i.checked);
                inputs.forEach(input => input.checked = !anyChecked);
                this.updatePathFilterButtonText();
                if (this.onPathFilterChange) this.onPathFilterChange();
            });
        }

        // --- INIT FULL SCREEN OVERLAY ---
        this._initFullScreenOverlay();

        // --- PATH FILTERS INITIALIZATION ---
        const pathFiltersContent = document.getElementById('path-filters-content');
        const togglePathFiltersBtn = document.getElementById('toggle-path-filters-btn');

        this.pathCategories = [
            { id: 'hiking_routes', label: 'Randonnée (GR)', color: '#a855f7' },
            { id: 'hiking_hard', label: 'Rando Difficile (T4+)', color: '#000000' },
            { id: 'hiking_medium', label: 'Rando Interm. (T2/T3)', color: '#ef4444' },
            { id: 'hiking_easy', label: 'Rando Facile (T1)', color: '#facc15' },
            { id: 'paths', label: 'Sentier / Piéton', color: '#059669' },
            { id: 'bicycle_routes', label: 'VTT / Vélo', color: '#f97316' },
            { id: 'cycleways', label: 'Piste Cyclable', color: '#3b82f6' },
            { id: 'tracks', label: 'Piste (Track)', color: '#854d0e' },
            { id: 'railways', label: 'Chemin de fer', color: '#4b5563' },
            { id: 'aerialways', label: 'Remontées (Ski/Télé)', color: '#1e293b' },
            { id: 'pistes', label: 'Piste de Ski', color: '#0ea5e9' },
            { id: 'via_ferrata', label: 'Via Ferrata / Escalade', color: '#57534e' },
            { id: 'bridleways', label: 'Cavaliers', color: '#d97706' },
            { id: 'waterways', label: 'Voie d\'Eau', color: '#06b6d4' },
            { id: 'others', label: 'Autres / Inconnu', color: '#94a3b8' }
        ];

        if (pathFiltersContent && togglePathFiltersBtn) {
            this.pathCategories.forEach(cat => {
                const div = document.createElement('div');
                div.style.marginBottom = '6px';
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '8px';
                label.style.fontSize = '0.9rem';
                label.style.cursor = 'pointer';
                label.style.color = 'var(--color-text)';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = cat.id;
                checkbox.checked = false;
                checkbox.style.accentColor = 'var(--color-primary)';
                checkbox.addEventListener('change', () => {
                    this.updatePathFilterButtonText();
                    if (this.onPathFilterChange) this.onPathFilterChange(); // Use same callback or distinct?
                    // Ideally distinct or generic "onFilterChange"
                    // For now lets assume app binds to onPathFilterSelectionChange or reuses onFilterChange
                    if (this.onFilterChange) this.onFilterChange();
                });

                // Color Indicator
                const colorBox = document.createElement('span');
                colorBox.style.width = '15px';
                colorBox.style.height = '15px';
                colorBox.style.borderRadius = '3px';
                colorBox.style.background = cat.color;
                if (cat.id === 'railways') {
                    colorBox.style.border = '1px dashed #fff';
                }

                label.appendChild(checkbox);
                label.appendChild(colorBox);
                label.appendChild(document.createTextNode(`${cat.label}`));
                div.appendChild(label);
                pathFiltersContent.appendChild(div);
            });

            togglePathFiltersBtn.addEventListener('click', () => {
                const isHidden = pathFiltersContent.style.display === 'none';
                pathFiltersContent.style.display = isHidden ? 'block' : 'none';
                togglePathFiltersBtn.classList.toggle('is-open', isHidden);
            });
            this.updatePathFilterButtonText();
        }
        this.updateFilterButtonText();
    }

    // Ferme le panneau d'apparence et réinitialise le style du bouton
    closeSettings() {
        const settingsBtn = document.getElementById('settings-toggle-btn');
        const settingsPanel = document.getElementById('appearance-settings-panel');
        if (settingsPanel) settingsPanel.classList.add('hidden');
        if (settingsBtn) {
            settingsBtn.style.background = '';
            settingsBtn.style.color = '';
            settingsBtn.style.borderColor = '';
        }
    }

    updatePathFilterButtonText() {
        const btn = document.getElementById('toggle-path-filters-btn');
        const badge = document.getElementById('filter-badge-paths');
        const content = document.getElementById('path-filters-content');
        if (!btn || !content) return;
        const checkedCount = content.querySelectorAll('input:checked').length;
        const total = this.pathCategories.length;
        // Update badge text
        if (badge) {
            badge.textContent = `${checkedCount}/${total}`;
            badge.className = 'filter-badge ' + (
                checkedCount === total ? 'badge--all' :
                    checkedCount === 0 ? 'badge--none' : 'badge--partial'
            );
        }
        // Update button border state
        btn.classList.remove('state--all', 'state--partial');
        if (checkedCount === total) btn.classList.add('state--all');
        else if (checkedCount > 0) btn.classList.add('state--partial');
    }

    getSelectedPathCategories() {
        const content = document.getElementById('path-filters-content');
        if (!content) return []; // If not init, assume all? or none?
        const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
        if (checkboxes.length === 0) return ['none'];
        return Array.from(checkboxes).map(cb => cb.value);
    }

    updateFilterButtonText() {
        const total = this.categories.length;
        const btn = this.toggleFiltersBtn;
        const badge = document.getElementById('filter-badge-categories');

        // Count checked boxes only if the panel has been populated
        let checkedCount = total; // default: all checked (before injection)
        if (this.macroFiltersContent) {
            const mainCheckboxes = this.macroFiltersContent.querySelectorAll(':scope > div > div > label > input[type="checkbox"]');
            if (mainCheckboxes.length > 0) {
                checkedCount = Array.from(mainCheckboxes).filter(cb => cb.checked).length;
            }
        }

        // Update badge
        if (badge) {
            badge.textContent = `${checkedCount}/${total}`;
            badge.className = 'filter-badge ' + (
                checkedCount === total ? 'badge--all' :
                    checkedCount === 0 ? 'badge--none' : 'badge--partial'
            );
        }
        // Update button border state
        if (btn) {
            btn.classList.remove('state--all', 'state--partial');
            if (checkedCount === total) btn.classList.add('state--all');
            else if (checkedCount > 0) btn.classList.add('state--partial');
        }
    }


    getSelectedCategories() {
        if (!this.macroFiltersContent) return [];
        // Only main category checkboxes (direct children of wrapper > headerRow > label)
        const mainCheckboxes = this.macroFiltersContent.querySelectorAll(':scope > div > div > label > input[type="checkbox"]');
        const checked = Array.from(mainCheckboxes).filter(cb => cb.checked);
        if (checked.length === 0) return ['none'];
        return checked.map(cb => cb.value);
    }

    populateSubCategoryCheckboxes(pois) {
        if (!this.macroFiltersContent) return;

        // Reset excluded sub-categories
        this.excludedSubCategories.clear();

        // Count types per category
        const typesByCategory = {};
        pois.forEach(p => {
            if (!typesByCategory[p.category]) typesByCategory[p.category] = {};
            if (!typesByCategory[p.category][p.type]) typesByCategory[p.category][p.type] = 0;
            typesByCategory[p.category][p.type]++;
        });

        // Populate each sub-category container
        const subContainers = this.macroFiltersContent.querySelectorAll('.sub-cat-list');
        subContainers.forEach(container => {
            const catId = container.dataset.catId;
            container.innerHTML = '';

            const types = typesByCategory[catId];
            if (!types || Object.keys(types).length === 0) {
                container.innerHTML = '<span style="font-size: 0.75rem; color: var(--color-text-muted); opacity: 0.6;">Aucun POI</span>';
                return;
            }

            // Sort by count descending
            const sortedTypes = Object.entries(types)
                .sort((a, b) => b[1] - a[1]);

            // "Tout" toggle button
            const allDiv = document.createElement('div');
            allDiv.style.marginBottom = '4px';
            const allLabel = document.createElement('label');
            allLabel.style.display = 'flex';
            allLabel.style.alignItems = 'center';
            allLabel.style.gap = '6px';
            allLabel.style.fontSize = '0.8rem';
            allLabel.style.cursor = 'pointer';
            allLabel.style.color = 'var(--color-text-muted)';
            allLabel.style.fontStyle = 'italic';

            const allCb = document.createElement('input');
            allCb.type = 'checkbox';
            allCb.checked = true;
            allCb.style.accentColor = 'var(--color-primary)';
            allCb.addEventListener('change', () => {
                const subCbs = container.querySelectorAll('input[type="checkbox"].sub-cat-cb');
                subCbs.forEach(cb => {
                    cb.checked = allCb.checked;
                    if (!allCb.checked) {
                        this.excludedSubCategories.add(cb.value);
                    } else {
                        this.excludedSubCategories.delete(cb.value);
                    }
                });
                if (this.onSubCategoryFilterChange) this.onSubCategoryFilterChange();
            });

            allLabel.appendChild(allCb);
            allLabel.appendChild(document.createTextNode('Tout'));
            allDiv.appendChild(allLabel);
            container.appendChild(allDiv);

            sortedTypes.forEach(([typeName, count]) => {
                const div = document.createElement('div');
                div.style.marginBottom = '2px';

                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '6px';
                label.style.fontSize = '0.8rem';
                label.style.cursor = 'pointer';
                label.style.color = 'var(--color-text)';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'sub-cat-cb';
                cb.value = typeName;
                cb.checked = true;
                cb.style.accentColor = 'var(--color-primary)';
                cb.addEventListener('change', () => {
                    if (!cb.checked) {
                        this.excludedSubCategories.add(typeName);
                    } else {
                        this.excludedSubCategories.delete(typeName);
                    }
                    if (this.onSubCategoryFilterChange) this.onSubCategoryFilterChange();
                });

                const translated = this.translateType(typeName);
                label.appendChild(cb);
                label.appendChild(document.createTextNode(`${translated} (${count})`));
                div.appendChild(label);
                container.appendChild(div);
            });
        });
    }

    getExcludedSubCategories() {
        return this.excludedSubCategories;
    }

    toggleMicroSidebar(show) {
        if (show) this.microSidebar.classList.add('visible');
        else this.microSidebar.classList.remove('visible');
    }

    showLoading(isLoading) {
        if (isLoading) {
            this.macroStats.innerHTML = '<div class="stat-item"><div class="loading-container"><span class="spinner"></span><span>Chargement</span></div></div>';
            this.poiList.innerHTML = '<div class="loading-container"><span class="spinner"></span><span>Chargement des données...</span></div>';
        }
    }

    /**
     * Affiche un message d'erreur avec un bouton "Réessayer".
     * @param {string} message  Texte d'erreur à afficher
     * @param {Function} onRetry  Callback appelé au clic sur "Réessayer"
     */
    showError(message = 'Impossible de charger les données.', onRetry = null) {
        const errorBlock = (small = false) => `
            <div class="load-error-block${small ? ' load-error-block--small' : ''}">
                <span class="load-error-block__icon">⚠️</span>
                <p class="load-error-block__msg">${message}</p>
                ${onRetry ? `<button class="load-error-block__retry-btn">🔄 Réessayer</button>` : ''}
            </div>`;

        this.macroStats.innerHTML = errorBlock(true);
        this.poiList.innerHTML = errorBlock();

        if (onRetry) {
            this.macroStats.querySelector('.load-error-block__retry-btn')
                ?.addEventListener('click', onRetry);
            this.poiList.querySelector('.load-error-block__retry-btn')
                ?.addEventListener('click', onRetry);
        }
    }

    clear() {
        this.macroStats.innerHTML = `
            <div class="stat-item empty">
                <span class="stat-value">--</span>
                <span class="stat-label">Points d'Intérêt</span>
            </div>`;
        this.poiList.innerHTML = '<p class="empty-state">Sélectionnez une zone pour voir les lieux.</p>';
        this.toggleMicroSidebar(false);
    }
    generateDemographicsKPI(history, zoneName) {
        if (!history || history.length === 0) return '';

        const latest = history[history.length - 1];
        let variationHtml = '';

        if (history.length > 1) {
            // Comparer avec l'année précédente disponible
            const previous = history[history.length - 2];
            const diff = latest.population - previous.population;
            const percent = ((diff / previous.population) * 100).toFixed(2);
            const isPositive = diff >= 0;
            const color = isPositive ? '#34d399' : '#f87171'; // Vert ou Rouge
            const sign = isPositive ? '+' : '';

            variationHtml = `
                <div style="text-align: right;">
                    <div style="font-size: 1.1rem; color: ${color}; font-weight: bold;">${sign}${percent}%</div>
                    <div style="font-size: 0.75rem; color: var(--color-text-muted);">depuis ${previous.year}</div>
                </div>
            `;
        }

        return `
            <div class="kpi-card glass-panel" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">👥 Résidents (${latest.year})</div>
                    <div style="font-size: 1.8rem; font-weight: 700; color: #fff; line-height: 1;">${latest.population.toLocaleString('fr-FR')}</div>
                    <div style="font-size: 0.8rem; color: var(--color-primary); margin-top: 4px;">${zoneName}</div>
                </div>
                ${variationHtml}
            </div>
        `;
    }
    renderMacroStats(pois, demoHtml = '', networks = [], areaKm2 = 0) {
        const total = pois.length;

        // ── Calcul des KPI hébergement & sentiers (toujours, même si pois filtrés = 0) ──
        const accommodationTypes = new Set([
            'hotel', 'guest_house', 'hostel', 'camp_site', 'chalet',
            'alpine_hut', 'apartment', 'motel', 'caravan_site', 'shelter'
        ]);
        let accommodationCount = 0;
        let totalBeds = 0;
        let totalRooms = 0;
        pois.forEach(p => {
            if (p.category === 'accommodation' || accommodationTypes.has(p.type)) {
                accommodationCount++;
                if (p.tags && p.tags.beds) totalBeds += parseInt(p.tags.beds, 10) || 0;
                if (p.tags && p.tags.rooms) totalRooms += parseInt(p.tags.rooms, 10) || 0;
            }
        });

        // Sentiers piétons (inclut randonnée) / vélo depuis networks
        const pedestrianTypes = new Set(['path', 'footway', 'pedestrian', 'living_street']);
        const cyclingTypes = new Set(['cycleway']);
        let pedestrianTrailCount = 0;
        let cyclingTrailCount = 0;
        networks.forEach(net => {
            const t = net.type;
            const route = net.relationRoute;
            // Piéton = sentiers classiques + randonnée (hiking/foot/sac_scale)
            if (pedestrianTypes.has(t) || route === 'hiking' || route === 'foot' || (net.tags && net.tags.sac_scale)) {
                pedestrianTrailCount++;
            }
            // Vélo
            if (cyclingTypes.has(t) || route === 'bicycle' || route === 'mtb') {
                cyclingTrailCount++;
            }
        });

        // ── KPI Cards HTML ─────────────────────────────────────────────────
        const kpiCardStyle = `background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;`;
        const kpiValueStyle = `font-size:1.6rem;font-weight:700;color:#fff;line-height:1;`;
        const kpiLabelStyle = `font-size:0.75rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;`;
        const kpiSubStyle = `font-size:0.8rem;color:var(--color-text-muted);margin-top:4px;`;

        const kpiCardsHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                <div class="kpi-card glass-panel" style="${kpiCardStyle}border-color:rgba(167,139,250,0.35);background:rgba(167,139,250,0.08);">
                    <div>
                        <div style="${kpiLabelStyle}">🏨 Hébergements</div>
                        <div style="${kpiValueStyle}">${accommodationCount.toLocaleString('fr-FR')}</div>
                        <div style="${kpiSubStyle}">dans la zone OSM</div>
                    </div>
                </div>
                <div class="kpi-card glass-panel" style="${kpiCardStyle}border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.08);">
                    <div>
                        <div style="${kpiLabelStyle}">🛏️ Capacité d'accueil</div>
                        <div style="${kpiValueStyle}">${totalRooms.toLocaleString('fr-FR')} <span style="font-size:0.85rem;font-weight:400;color:var(--color-text-muted);">chambres</span></div>
                        <div style="${kpiSubStyle}">🛏️ ${totalBeds.toLocaleString('fr-FR')} lits</div>
                    </div>
                </div>
                <div class="kpi-card glass-panel" style="${kpiCardStyle}border-color:rgba(5,150,105,0.35);background:rgba(5,150,105,0.08);">
                    <div>
                        <div style="${kpiLabelStyle}">🚶 Sentiers piétons</div>
                        <div style="${kpiValueStyle}">${pedestrianTrailCount.toLocaleString('fr-FR')}</div>
                        <div style="${kpiSubStyle}">chemins & randos confondus</div>
                    </div>
                </div>
                <div class="kpi-card glass-panel" style="${kpiCardStyle}border-color:rgba(59,130,246,0.35);background:rgba(59,130,246,0.08);">
                    <div>
                        <div style="${kpiLabelStyle}">🚴 Pistes cyclables</div>
                        <div style="${kpiValueStyle}">${cyclingTrailCount.toLocaleString('fr-FR')}</div>
                        <div style="${kpiSubStyle}">voies dans la zone</div>
                    </div>
                </div>
            </div>
        `;

        // ── Densité Heatmap ────────────────────────────────────────────────
        let densityHtml = '';
        if (areaKm2 > 0) {
            const accomDensity = accommodationCount / areaKm2;
            const pedDensity = pedestrianTrailCount / areaKm2;
            const cycleDensity = cyclingTrailCount / areaKm2;

            // Fonction pour limiter la barre entre 0 et 100%
            // On utilise un seuil adaptatif : le max des 3 densités or 1 minimum
            const maxDensity = Math.max(accomDensity, pedDensity, cycleDensity, 0.1);

            const densityBar = (label, emoji, value, color, colorRgb) => {
                const pct = Math.min((value / maxDensity) * 100, 100);
                const formatted = value < 0.01 ? value.toExponential(1) : value.toFixed(2);
                return `
                    <div style="margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
                            <span style="font-size:0.8rem;color:#fff;">${emoji} ${label}</span>
                            <span style="font-size:0.85rem;font-weight:600;color:${color};">${formatted} <span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted);">/ km²</span></span>
                        </div>
                        <div style="background:rgba(255,255,255,0.08);border-radius:6px;height:8px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;border-radius:6px;background:linear-gradient(90deg, rgba(${colorRgb},0.4), rgba(${colorRgb},1));transition:width 0.6s ease;"></div>
                        </div>
                    </div>`;
            };

            densityHtml = `
                <div id="density-heatmap-panel" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px 16px;margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
                        <span style="font-size:0.8rem;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.04em;">🗺️ Densité par km²</span>
                        <span style="font-size:0.75rem;color:var(--color-text-muted);">Surface : ${areaKm2.toFixed(1)} km²</span>
                    </div>
                    ${densityBar('Hébergements', '🏨', accomDensity, '#a78bfa', '167,139,250')}
                    ${densityBar('Sentiers piétons', '🚶', pedDensity, '#34d399', '5,150,105')}
                    ${densityBar('Pistes cyclables', '🚴', cycleDensity, '#60a5fa', '59,130,246')}
                    <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
                        <div style="font-size:0.75rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">🔥 Heatmap sur la carte</div>
                        <div style="display:flex;gap:12px;flex-wrap:wrap;">
                            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.8rem;color:#fff;">
                                <input type="checkbox" class="heatmap-toggle" data-heat="accommodation" checked style="accent-color:#a78bfa;">
                                <span style="width:8px;height:8px;border-radius:50%;background:#a78bfa;display:inline-block;"></span>
                                Héberg.
                            </label>
                            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.8rem;color:#fff;">
                                <input type="checkbox" class="heatmap-toggle" data-heat="pedestrian" checked style="accent-color:#34d399;">
                                <span style="width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;"></span>
                                Piétons
                            </label>
                            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.8rem;color:#fff;">
                                <input type="checkbox" class="heatmap-toggle" data-heat="cycling" checked style="accent-color:#60a5fa;">
                                <span style="width:8px;height:8px;border-radius:50%;background:#60a5fa;display:inline-block;"></span>
                                Vélo
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }

        // Si aucun POI après filtrage, afficher quand même les KPI + densité + message vide
        if (total === 0) {
            this.macroStats.innerHTML = demoHtml + kpiCardsHtml + densityHtml + `<div class="stat-item empty"><span class="stat-value">--</span><span class="stat-label">Aucun lieu trouvé</span></div>`;
            this._bindHeatmapToggles();
            return;
        }

        const rootId = 'All';
        const labels = ['Total'];
        const parents = [''];
        const ids = [rootId];
        const values = [total];
        const colors = ['#ffffff'];

        const categoryCounts = {};
        const typeCounts = {};

        pois.forEach(p => {
            if (!categoryCounts[p.category]) categoryCounts[p.category] = 0;
            categoryCounts[p.category]++;
            const typeKey = `${p.category}__${p.type}`;
            if (!typeCounts[typeKey]) typeCounts[typeKey] = 0;
            typeCounts[typeKey]++;
        });

        // Ajout des catégories (Parents)
        Object.keys(categoryCounts).forEach(catId => {
            const catDef = this.categories.find(c => c.id === catId);
            const label = catDef ? catDef.label : catId;
            const color = this.getCategoryColor(catId);

            ids.push(catId);
            labels.push(`<b style="font-size:16px">${this.getCategoryEmoji(catId)} ${label.toUpperCase()}</b>`); parents.push(rootId);
            values.push(categoryCounts[catId]);
            colors.push(color); // Couleur pleine pour le parent
        });

        // Ajout des types (Enfants/Feuilles) avec effet de dégradé
        Object.keys(typeCounts).forEach(typeKey => {
            const [catId, typeName] = typeKey.split('__');
            const count = typeCounts[typeKey];
            const label = this.translateType(typeName);
            const baseColor = this.getCategoryColor(catId);

            ids.push(typeKey);
            labels.push(`${label} (${count})`);
            parents.push(catId);
            values.push(count);

            // MODIFICATION ICI : Éclaircissement (+35) pour simuler le dégradé de l'image
            colors.push(this.adjustColor(baseColor, 35));
        });

        const data = [{
            type: "treemap",
            ids: ids,
            labels: labels,
            parents: parents,
            values: values,
            marker: {
                colors: colors,
                // Bordure blanche fine pour l'effet "vitré" de l'image
                line: { width: 1.5, color: "rgba(255,255,255,0.6)" },
                pad: { b: 5, l: 5, r: 5, t: 15 }
            },
            textfont: { family: "Outfit, sans-serif", color: "#ffffff" },
            textposition: "top left",
            textinfo: "label+value",
            hoverinfo: "label+value+percent parent",
            branchvalues: "total"
        }];

        const layout = {
            margin: { t: 0, l: 0, r: 0, b: 0 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: "Outfit, sans-serif", color: "#ffffff", size: 12 }
        };

        const config = { responsive: true, displayModeBar: false };

        this.macroStats.innerHTML = demoHtml + kpiCardsHtml + densityHtml; // Injecte démographie + KPI + densité en premier
        this._bindHeatmapToggles();

        // --- LEGEND ADDITION ---
        const legendDiv = document.createElement('div');
        legendDiv.className = 'network-legend';
        legendDiv.style.marginBottom = '15px';
        legendDiv.style.padding = '10px';
        legendDiv.style.background = 'rgba(255, 255, 255, 0.1)';
        legendDiv.style.borderRadius = '8px';
        legendDiv.style.fontSize = '0.85rem';
        legendDiv.style.color = '#fff';

        legendDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">Légende des Chemins</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #a855f7; display: inline-block;"></span>
                    <span>Randonnée (GR)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #f97316; display: inline-block;"></span>
                    <span>VTT / Vélo</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #059669; display: inline-block;"></span>
                    <span>Sentier / Piéton</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #854d0e; display: inline-block;"></span>
                    <span>Piste (Track)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #3b82f6; display: inline-block;"></span>
                    <span>Piste Cyclable</span>
                </div>
                 <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #facc15; display: inline-block;"></span>
                    <span>Rando Facile (T1)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #ef4444; display: inline-block;"></span>
                    <span>Rando Interm. (T2/T3)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #000000; display: inline-block;"></span>
                    <span>Rando Difficile (T4+)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="width: 15px; height: 3px; background: #4b5563; border-top: 1px dashed #fff; display: inline-block;"></span>
                    <span>Chemin de fer</span>
                </div>
            </div>
        `;
        this.macroStats.appendChild(legendDiv);

        this.macroStats.style.height = 'auto'; // Let it grow

        // Header for Chart + Maximize Button
        const chartHeader = document.createElement('div');
        chartHeader.style.display = 'flex';
        chartHeader.style.justifyContent = 'space-between';
        chartHeader.style.alignItems = 'center';
        chartHeader.style.marginBottom = '5px';

        const chartTitle = document.createElement('span');
        chartTitle.style.fontSize = '0.9rem';
        chartTitle.style.fontWeight = '600';
        chartTitle.style.color = '#fff';
        chartTitle.textContent = 'Répartition';

        const maxBtn = document.createElement('button');
        maxBtn.className = 'maximize-btn';
        maxBtn.innerHTML = '⤢ Agrandir';
        maxBtn.title = 'Voir en plein écran';
        maxBtn.addEventListener('click', () => {
            this._toggleFullScreenChart(data, layout);
        });

        chartHeader.appendChild(chartTitle);
        chartHeader.appendChild(maxBtn);
        this.macroStats.appendChild(chartHeader);

        const chartDiv = document.createElement('div');
        chartDiv.style.height = '350px';
        // Give it an ID to easily identify it
        chartDiv.id = 'mini-chart-div';
        this.macroStats.appendChild(chartDiv);

        Plotly.newPlot(chartDiv, data, layout, config);
        this.lastPois = pois;

        // ── 3 MINI TREEMAPS ────────────────────────────────────────────────
        const miniLayout = {
            margin: { t: 0, l: 0, r: 0, b: 0 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: "Outfit, sans-serif", color: "#ffffff", size: 11 }
        };
        const miniConfig = { responsive: true, displayModeBar: false };

        const addMiniTreemap = (titleText, emoji, treemapData) => {
            if (!treemapData || treemapData.values.length <= 1) return; // Rien à afficher

            const section = document.createElement('div');
            section.style.cssText = 'margin-top:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;';

            // Header + bouton Agrandir
            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

            const header = document.createElement('span');
            header.style.cssText = 'font-size:0.8rem;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.04em;';
            header.textContent = `${emoji} ${titleText}`;
            headerRow.appendChild(header);

            const miniDiv = document.createElement('div');
            miniDiv.style.height = '220px';

            const plotData = [{
                type: 'treemap',
                ids: treemapData.ids,
                labels: treemapData.labels,
                parents: treemapData.parents,
                values: treemapData.values,
                marker: {
                    colors: treemapData.colors,
                    line: { width: 1.5, color: 'rgba(255,255,255,0.5)' },
                    pad: { b: 4, l: 4, r: 4, t: 12 }
                },
                textfont: { family: 'Outfit, sans-serif', color: '#ffffff' },
                textposition: 'top left',
                textinfo: 'label+value',
                hoverinfo: 'label+value+percent parent',
                branchvalues: 'total'
            }];

            const maxBtn = document.createElement('button');
            maxBtn.className = 'maximize-btn';
            maxBtn.innerHTML = '⤢ Agrandir';
            maxBtn.title = 'Voir en plein écran';
            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(plotData, miniLayout));
            headerRow.appendChild(maxBtn);

            section.appendChild(headerRow);
            section.appendChild(miniDiv);
            this.macroStats.appendChild(section);

            Plotly.newPlot(miniDiv, plotData, miniLayout, miniConfig);
        };

        // ─── 1. Treemap Hébergements par catégorie ────────────────────────
        const accomTags = {
            'hotel': 'Hôtel', 'hostel': 'Auberge', 'motel': 'Motel',
            'guest_house': 'Maison d\'hôtes', 'bed_and_breakfast': 'B&B',
            'holiday_flat': 'Meublé de tourisme', 'chalet': 'Chalet',
            'apartment': 'Appartement', 'camp_site': 'Camping',
            'caravan_site': 'Aire camping-car', 'camp_pitch': 'Emplacement',
            'alpine_hut': 'Refuge alpin', 'wilderness_hut': 'Refuge nature',
            'shelter': 'Abri'
        };
        const accomCounts = {};
        pois.forEach(p => {
            const t = p.tags?.tourism || p.type;
            if (accomTags[t]) {
                accomCounts[t] = (accomCounts[t] || 0) + 1;
            }
        });
        if (Object.keys(accomCounts).length > 0) {
            const totalAccom = Object.values(accomCounts).reduce((a, b) => a + b, 0);
            const accomTreemap = {
                ids: ['AccomRoot'], labels: [`Total (${totalAccom})`], parents: [''], values: [totalAccom],
                colors: ['#a78bfa']
            };
            const baseColors = ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#ddd6fe', '#ede9fe', '#e9d5ff', '#d8b4fe', '#b794f4', '#9f7aea', '#805ad5'];
            let ci = 0;
            Object.entries(accomCounts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
                accomTreemap.ids.push(key);
                accomTreemap.labels.push(`${accomTags[key]} (${count})`);
                accomTreemap.parents.push('AccomRoot');
                accomTreemap.values.push(count);
                accomTreemap.colors.push(baseColors[ci % baseColors.length]);
                ci++;
            });
            addMiniTreemap('Hébergements par type', '🏨', accomTreemap);
        }

        // ─── 2. Treemap Sentiers piétons par sac_scale ────────────────────
        const sacLabels = {
            'hiking': 'Randonnée (T1)',
            'mountain_hiking': 'Montagne (T2)',
            'demanding_mountain_hiking': 'Montagne exigeante (T3)',
            'alpine_hiking': 'Alpin (T4)',
            'demanding_alpine_hiking': 'Alpin exigeant (T5)'
        };
        const sacCounts = {};
        networks.forEach(net => {
            const sac = net.tags?.sac_scale;
            if (sac && sacLabels[sac]) {
                sacCounts[sac] = (sacCounts[sac] || 0) + 1;
            }
        });
        if (Object.keys(sacCounts).length > 0) {
            const totalSac = Object.values(sacCounts).reduce((a, b) => a + b, 0);
            const sacTreemap = {
                ids: ['SacRoot'], labels: [`Total (${totalSac})`], parents: [''], values: [totalSac],
                colors: ['#34d399']
            };
            const sacColors = { 'hiking': '#facc15', 'mountain_hiking': '#ef4444', 'demanding_mountain_hiking': '#dc2626', 'alpine_hiking': '#1e1e1e', 'demanding_alpine_hiking': '#000000' };
            Object.entries(sacCounts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
                sacTreemap.ids.push(key);
                sacTreemap.labels.push(`${sacLabels[key]} (${count})`);
                sacTreemap.parents.push('SacRoot');
                sacTreemap.values.push(count);
                sacTreemap.colors.push(sacColors[key] || '#6ee7b7');
            });
            addMiniTreemap('Sentiers piétons par difficulté', '🚶', sacTreemap);
        }

        // ─── 3. Treemap Chemins vélo par catégorie ────────────────────────
        const cycleCats = {
            'bicycle_routes': 'VTT / Vélo (itinéraires)',
            'cycleways': 'Piste Cyclable',
            'tracks': 'Piste (Track)'
        };
        const cycleCounts = {};
        networks.forEach(net => {
            const t = net.type;
            const route = net.relationRoute;
            if (route === 'bicycle' || route === 'mtb') {
                cycleCounts['bicycle_routes'] = (cycleCounts['bicycle_routes'] || 0) + 1;
            } else if (t === 'cycleway') {
                cycleCounts['cycleways'] = (cycleCounts['cycleways'] || 0) + 1;
            } else if (t === 'track') {
                cycleCounts['tracks'] = (cycleCounts['tracks'] || 0) + 1;
            }
        });
        if (Object.keys(cycleCounts).length > 0) {
            const totalCycle = Object.values(cycleCounts).reduce((a, b) => a + b, 0);
            const cycleTreemap = {
                ids: ['CycleRoot'], labels: [`Total (${totalCycle})`], parents: [''], values: [totalCycle],
                colors: ['#60a5fa']
            };
            const cycleColors = { 'bicycle_routes': '#f97316', 'cycleways': '#3b82f6', 'tracks': '#854d0e' };
            Object.entries(cycleCounts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
                cycleTreemap.ids.push(key);
                cycleTreemap.labels.push(`${cycleCats[key]} (${count})`);
                cycleTreemap.parents.push('CycleRoot');
                cycleTreemap.values.push(count);
                cycleTreemap.colors.push(cycleColors[key] || '#93c5fd');
            });
            addMiniTreemap('Chemins vélo par type', '🚴', cycleTreemap);
        }

        // ── SLOPE CHART : Ratio Sentiers Piétons vs Vélo ──────────────────
        const totalTrails = pedestrianTrailCount + cyclingTrailCount;
        if (totalTrails > 0) {
            const slopeSection = document.createElement('div');
            slopeSection.style.cssText = 'margin-top:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;';

            // Header + bouton Agrandir
            const slopeHeaderRow = document.createElement('div');
            slopeHeaderRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';

            const slopeHeader = document.createElement('span');
            slopeHeader.style.cssText = 'font-size:0.8rem;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.04em;';
            slopeHeader.textContent = '📊 Slope Chart — Randonnée vs Cyclisme';
            slopeHeaderRow.appendChild(slopeHeader);

            const slopeDiv = document.createElement('div');
            slopeDiv.style.height = '200px';

            // Slope line color based on dominant side
            let slopeColor;
            if (pedestrianTrailCount > cyclingTrailCount) slopeColor = '#34d399';
            else if (cyclingTrailCount > pedestrianTrailCount) slopeColor = '#60a5fa';
            else slopeColor = '#fbbf24';

            const slopeData = [
                // The connecting line
                {
                    x: ['Randonnée 🚶', 'Cyclisme 🚴'],
                    y: [pedestrianTrailCount, cyclingTrailCount],
                    mode: 'lines+markers+text',
                    type: 'scatter',
                    line: { color: slopeColor, width: 4 },
                    marker: {
                        size: 20,
                        color: ['#34d399', '#60a5fa'],
                        line: { color: '#fff', width: 2 }
                    },
                    text: [
                        `${pedestrianTrailCount.toLocaleString('fr-FR')}`,
                        `${cyclingTrailCount.toLocaleString('fr-FR')}`
                    ],
                    textposition: ['top center', 'top center'],
                    textfont: { color: '#fff', size: 14, family: 'Outfit, sans-serif' },
                    hoverinfo: 'x+y'
                }
            ];

            const slopeLayout = {
                margin: { t: 25, l: 40, r: 40, b: 35 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { family: 'Outfit, sans-serif', color: '#fff', size: 12 },
                xaxis: {
                    showgrid: false,
                    zeroline: false,
                    tickfont: { size: 12, color: '#fff' }
                },
                yaxis: {
                    showgrid: true,
                    gridcolor: 'rgba(255,255,255,0.08)',
                    zeroline: false,
                    tickfont: { size: 10, color: 'rgba(255,255,255,0.5)' }
                },
                showlegend: false
            };

            // Bouton Agrandir pour le slope chart
            const slopeMaxBtn = document.createElement('button');
            slopeMaxBtn.className = 'maximize-btn';
            slopeMaxBtn.innerHTML = '⤢ Agrandir';
            slopeMaxBtn.title = 'Voir en plein écran';
            slopeMaxBtn.addEventListener('click', () => this._toggleFullScreenChart(slopeData, slopeLayout));
            slopeHeaderRow.appendChild(slopeMaxBtn);

            slopeSection.appendChild(slopeHeaderRow);
            slopeSection.appendChild(slopeDiv);
            this.macroStats.appendChild(slopeSection);

            Plotly.newPlot(slopeDiv, slopeData, slopeLayout, miniConfig);
        }
    }

    /** Lie les checkboxes heatmap après injection dans le DOM */
    _bindHeatmapToggles() {
        const panel = document.getElementById('density-heatmap-panel');
        if (!panel) return;
        panel.querySelectorAll('.heatmap-toggle').forEach(cb => {
            cb.addEventListener('change', () => {
                if (this.onHeatmapToggle) {
                    this.onHeatmapToggle(cb.dataset.heat, cb.checked);
                }
            });
        });
    }

    renderMicroList(pois) {
        if (pois.length === 0) {
            this.poiList.innerHTML = '<p class="empty-state">Aucun point d\'intérêt trouvé dans cette zone.</p>';
            return;
        }

        // C'est ici que la ligne fautive a été supprimée !

        this.poiList.innerHTML = pois.map(poi => this.createPoiCard(poi)).join('');
        this.poiList.querySelectorAll('.poi-card').forEach(card => {
            card.addEventListener('click', () => {
                const poiId = card.getAttribute('data-id');
                const poi = this.lastPois.find(p => p.id == poiId);
                if (poi) {
                    this.renderPoiDetails(poi);
                    if (this.onPoiSelected) this.onPoiSelected(poi);
                }
            });
        });
    }

    createPoiCard(poi) {
        const color = this.getCategoryColor(poi.category);
        const bgStyle = `background: ${color}33; color: ${color};`;
        return `
            <div class="poi-card" data-id="${poi.id}" style="border-left: 3px solid ${color}">
                <span class="poi-category-tag" style="${bgStyle}">${this.translateType(poi.type)}</span>
                <div class="poi-name">${poi.name}</div>
                <div class="poi-desc">Catégorie: ${this.getCategoryEmoji(poi.category)} ${poi.category}</div>
            </div>
        `;
    }

    renderPoiDetails(poi) {
        const filtersContainer = document.getElementById('micro-filters-container');
        if (filtersContainer) filtersContainer.style.display = 'none';
        const color = this.getCategoryColor(poi.category);
        const typeStyle = `background: ${color}22; color: ${color}; border: 1px solid ${color}55;`;

        // ── Skeleton displayed immediately ────────────────────────────────────
        this.poiList.innerHTML = `
            <div class="detail-view" id="poi-detail-root">
                <div class="detail-header">
                    <button class="back-btn" id="back-to-list">← Retour</button>
                    <div id="detail-header-links" style="display:flex;gap:6px;align-items:center;"></div>
                </div>
                <h2 class="detail-title" style="color:${color}">${this.getCategoryEmoji(poi.category)} ${poi.name}</h2>
                <span class="detail-type" style="${typeStyle}">${this.translateType(poi.type)}</span>

                <!-- Image Gallery Skeleton -->
                <div id="poi-gallery" class="poi-gallery poi-gallery--loading">
                    <div class="poi-gallery__skeleton"></div>
                </div>

                <!-- OSM Static Block -->
                <div class="poi-section">
                    <div class="poi-section__title">📍 Informations</div>
                    <div class="detail-info" id="poi-osm-block">
                        ${this._buildOsmRows(poi, color)}
                    </div>
                </div>

                <!-- Wikidata Block (skeleton then replaced) -->
                <div class="poi-section" id="poi-wikidata-section" style="display:none">
                    <div class="poi-section__title">
                        <img src="https://www.wikidata.org/static/favicon/wikidata.ico" width="14" height="14" style="vertical-align:middle;margin-right:5px;" alt="">
                        Wikidata
                    </div>
                    <div id="poi-wikidata-block" class="detail-info"></div>
                </div>

                <!-- OSM Source Link -->
                <div style="margin-top:16px;text-align:center;">
                    <a href="https://www.openstreetmap.org/node/${poi.id}" target="_blank"
                       style="font-size:0.75rem;color:var(--color-text-muted);text-decoration:none;opacity:0.7;">
                       🗺️ Voir sur OpenStreetMap
                    </a>
                </div>
            </div>`;

        // Back button
        // Back button
        document.getElementById('back-to-list').addEventListener('click', () => {
            const filtersContainer = document.getElementById('micro-filters-container');
            if (filtersContainer) filtersContainer.style.display = 'block';
            this.filterList();
        });

        // ── Async enrichment ──────────────────────────────────────────────────
        if (!this.apiService) return;

        // Run both fetches in parallel
        Promise.all([
            this.apiService.fetchWikimediaImages(poi.lat, poi.lng, 5),
            poi.tags.wikidata ? this.apiService.fetchWikidata(poi.tags.wikidata) : Promise.resolve(null)
        ]).then(([images, wikidataInfo]) => {

            // If Wikidata has a main image, prepend it to the list
            if (wikidataInfo?.image) {
                images = [{ url: wikidataInfo.image, thumbUrl: wikidataInfo.image, title: poi.name }, ...images];
            }
            // Deduplicate by URL
            const seen = new Set();
            images = images.filter(img => {
                if (seen.has(img.url)) return false;
                seen.add(img.url);
                return true;
            });

            this._renderGallery(images, poi.name);

            // ── Header links ─────────────────────────────────────────────────
            const linksContainer = document.getElementById('detail-header-links');
            if (linksContainer) {
                const website = poi.tags.website || poi.tags['contact:website'] || poi.tags.url || wikidataInfo?.website;
                if (website) {
                    linksContainer.insertAdjacentHTML('beforeend',
                        `<a href="${website}" target="_blank" class="icon-btn" title="Site Web">🌐</a>`);
                }
                if (wikidataInfo?.wikipedia) {
                    linksContainer.insertAdjacentHTML('beforeend',
                        `<a href="${wikidataInfo.wikipedia}" target="_blank" class="icon-btn" title="Article Wikipédia">📖</a>`);
                }
            }

            // ── Wikidata block ────────────────────────────────────────────────
            if (wikidataInfo) {
                const rows = [];
                if (wikidataInfo.description) {
                    rows.push(`<div class="info-row info-row--highlight">
                        <span class="info-value" style="font-style:italic;color:var(--color-text-muted);line-height:1.5;">"${wikidataInfo.description}"</span>
                    </div>`);
                }
                if (wikidataInfo.population != null)
                    rows.push(this._infoRow('👥 Population', wikidataInfo.population.toLocaleString('fr-FR') + ' hab.'));
                if (wikidataInfo.elevation != null)
                    rows.push(this._infoRow('⛰️ Altitude (Wikidata)', wikidataInfo.elevation + ' m'));
                if (wikidataInfo.area != null)
                    rows.push(this._infoRow('📐 Superficie', wikidataInfo.area.toLocaleString('fr-FR') + ' km²'));
                if (wikidataInfo.inception)
                    rows.push(this._infoRow('📅 Fondé en', wikidataInfo.inception));
                if (wikidataInfo.heritage)
                    rows.push(this._infoRow('🏛️ Classement', wikidataInfo.heritage));
                if (wikidataInfo.architect)
                    rows.push(this._infoRow('✏️ Architecte', wikidataInfo.architect));

                if (rows.length > 0) {
                    const section = document.getElementById('poi-wikidata-section');
                    const block = document.getElementById('poi-wikidata-block');
                    if (section && block) {
                        block.innerHTML = rows.join('');
                        section.style.display = '';
                    }
                }
            }
        }).catch(err => console.warn('POI enrichment error:', err));
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Build all OSM info rows from poi.tags */
    _buildOsmRows(poi, color) {
        const t = poi.tags;
        const rows = [];

        const address = this.formatAddress(t);
        if (address) rows.push(this._infoRow('📬 Adresse', address));

        const phone = t.phone || t['contact:phone'];
        if (phone) rows.push(this._infoRow('📞 Téléphone',
            `<a href="tel:${phone}" style="color:${color}">${phone}</a>`));

        const email = t.email || t['contact:email'];
        if (email) rows.push(this._infoRow('✉️ Email',
            `<a href="mailto:${email}" style="color:${color}">${email}</a>`));

        if (t.opening_hours) rows.push(this._infoRow('🕐 Horaires', this._renderOpeningHours(t.opening_hours)));

        const website = t.website || t['contact:website'] || t.url;
        if (website) rows.push(this._infoRow('🌐 Site Web',
            `<a href="${website}" target="_blank" style="color:${color}">Ouvrir ↗</a>`));

        if (t.cuisine) rows.push(this._infoRow('🍽️ Cuisine', t.cuisine.replace(/_/g, ' ')));
        if (t.stars) rows.push(this._infoRow('⭐ Étoiles', t.stars));
        if (t.operator) rows.push(this._infoRow('🏢 Opérateur', t.operator));
        if (t.brand) rows.push(this._infoRow('🏷️ Enseigne', t.brand));
        if (t.ele) rows.push(this._infoRow('⛰️ Altitude', t.ele + ' m'));
        if (t.capacity) rows.push(this._infoRow('👤 Capacité', t.capacity + ' pers.'));
        if (t.start_date) rows.push(this._infoRow('📅 Création', t.start_date));
        if (t.fee) rows.push(this._infoRow('💰 Tarif', t.fee === 'yes' ? 'Payant' : t.fee === 'no' ? 'Gratuit' : t.fee));
        if (t.access) rows.push(this._infoRow('🔒 Accès', t.access));
        if (t.wheelchair) rows.push(this._infoRow('♿ Accessibilité',
            t.wheelchair === 'yes' ? '✅ Accessible PMR' :
                t.wheelchair === 'limited' ? '⚠️ Accès limité' : '❌ Non accessible'));
        if (t.description) rows.push(this._infoRow('📝 Description', t.description));
        if (t.wikipedia && !t.wikidata) {
            const wikiTitle = t.wikipedia.replace(/^fr:/, '');
            rows.push(this._infoRow('📖 Wikipédia',
                `<a href="https://fr.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}" target="_blank" style="color:${color}">Voir l'article ↗</a>`));
        }

        rows.push(this._infoRow('🌐 Coordonnées',
            `${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}`));

        return rows.join('') || '<p style="color:var(--color-text-muted);font-size:0.85rem;">Aucune donnée OSM disponible.</p>';
    }

    /** Generates a single info-row HTML string */
    _infoRow(label, value) {
        return `<div class="info-row">
            <span class="info-label">${label}</span>
            <span class="info-value">${value}</span>
        </div>`;
    }

    /** Parses raw opening_hours string and adds open/closed badge */
    _renderOpeningHours(raw) {
        if (!raw) return '';
        // Simple heuristic: check if "24/7"
        if (raw === '24/7') return `<span class="oh-badge oh-badge--open">24h/24</span>`;
        return `<span class="oh-value">${raw}</span>`;
    }

    /** Renders the image gallery section */
    _renderGallery(images, altText) {
        const galleryEl = document.getElementById('poi-gallery');
        if (!galleryEl) return;

        if (!images || images.length === 0) {
            galleryEl.style.display = 'none';
            return;
        }

        galleryEl.classList.remove('poi-gallery--loading');

        if (images.length === 1) {
            galleryEl.innerHTML = `
                <div class="poi-gallery__main">
                    <img src="${images[0].url}" alt="${altText}"
                         class="poi-gallery__img"
                         onerror="this.closest('.poi-gallery').style.display='none'">
                </div>`;
        } else {
            const thumbsHtml = images.map((img, i) => `
                <img src="${img.thumbUrl}" alt="${img.title || altText}"
                     class="poi-gallery__thumb ${i === 0 ? 'active' : ''}"
                     data-full="${img.url}"
                     onerror="this.style.display='none'">`).join('');

            galleryEl.innerHTML = `
                <div class="poi-gallery__main">
                    <img id="poi-gallery-main-img" src="${images[0].url}" alt="${altText}"
                         class="poi-gallery__img"
                         onerror="this.src=''; this.style.display='none'">
                </div>
                <div class="poi-gallery__thumbs">${thumbsHtml}</div>`;

            // Thumb click → change main image
            galleryEl.querySelectorAll('.poi-gallery__thumb').forEach(thumb => {
                thumb.addEventListener('click', () => {
                    const mainImg = document.getElementById('poi-gallery-main-img');
                    if (mainImg) mainImg.src = thumb.dataset.full;
                    galleryEl.querySelectorAll('.poi-gallery__thumb').forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });
            });
        }
    }



    setApiService(apiService) {
        this.apiService = apiService;
    }

    formatAddress(tags) {
        const parts = [];
        if (tags['addr:street']) parts.push(tags['addr:street']);
        if (tags['addr:housenumber']) parts.unshift(tags['addr:housenumber']);
        if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
        if (tags['addr:city']) parts.push(tags['addr:city']);
        return parts.length > 0 ? parts.join(', ') : null;
    }

    filterList() {
        const searchQuery = this.poiSearchInput ? this.poiSearchInput.value.toLowerCase() : '';
        let filtered = this.lastPois;

        // On ne filtre plus que par la recherche textuelle
        if (searchQuery.length > 0) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(searchQuery) ||
                (p.tags.type && p.tags.type.toLowerCase().includes(searchQuery))
            );
        }

        this.renderMicroList(filtered);
    }
    getCategoryEmoji(category) {
        const emojis = {
            'tourism': '📷', 'sustenance': '🍴', 'accommodation': '🛏️', 'amenity': '🚻',
            'natural': '🌳', 'historic': '🏛️', 'leisure': '🎡', 'shop': '🛒',
            'transport': '🚌', 'craft': '🎨', 'office': '💼', 'emergency': '🚨',
            'man_made': '🏗️', 'place': '📍', 'sport': '⚽', 'healthcare': '⚕️',
            'power': '⚡', 'barrier': '🚧', 'other': '❓'
        };
        return emojis[category] || emojis['other'];
    }

    translateType(type) {
        const translations = {
            'peak': 'Sommet', 'saddle': 'Col', 'volcano': 'Volcan', 'spring': 'Source',
            'cave_entrance': 'Entrée de grotte', 'tree': 'Arbre', 'rock': 'Rocher',
            'cliff': 'Falaise', 'ridge': 'Crête', 'arete': 'Arête', 'mountain_pass': 'Col de montagne',
            'water': 'Eau', 'wetland': 'Zone humide', 'glacier': 'Glacier', 'scree': 'Éboulis',
            'viewpoint': 'Point de vue', 'information': 'Information', 'hotel': 'Hôtel',
            'guest_house': 'Maison d\'hôtes', 'hostel': 'Auberge de jeunesse', 'chalet': 'Chalet',
            'camp_site': 'Camping', 'alpine_hut': 'Refuge de montagne', 'apartment': 'Appartement',
            'museum': 'Musée', 'artwork': 'Œuvre d\'art', 'attraction': 'Attraction',
            'picnic_site': 'Aire de pique-nique', 'parking': 'Parking', 'bench': 'Banc',
            'shelter': 'Abri', 'restaurant': 'Restaurant', 'cafe': 'Café', 'bar': 'Bar',
            'pub': 'Pub', 'fast_food': 'Restauration rapide', 'drinking_water': 'Eau potable',
            'toilets': 'Toilettes', 'place_of_worship': 'Lieu de culte', 'school': 'École',
            'pharmacy': 'Pharmacie', 'hospital': 'Hôpital', 'post_office': 'Poste',
            'recycling': 'Recyclage', 'waste_basket': 'Corbeille', 'memorial': 'Mémorial',
            'ruins': 'Ruines', 'monument': 'Monument', 'castle': 'Château',
            'archaeological_site': 'Site archéologique', 'wayside_shrine': 'Oratoire',
            'wayside_cross': 'Croix de chemin', 'village': 'Village', 'hamlet': 'Hameau',
            'locality': 'Lieu-dit', 'isolated_dwelling': 'Habitation isolée', 'town': 'Ville',
            'city': 'Grande ville', 'pitch': 'Terrain de sport', 'playground': 'Aire de jeux',
            'swimming_pool': 'Piscine', 'park': 'Parc', 'garden': 'Jardin',
            'nature_reserve': 'Réserve naturelle', 'convenience': 'Supérette', 'bakery': 'Boulangerie',
            'supermarket': 'Supermarché', 'clothes': 'Vêtements', 'hairdresser': 'Coiffeur',
            'yes': 'Oui', 'antenna': 'Antenne', 'mast': 'Mât', 'tower': 'Tour'
        };
        const normalizedType = type.toLowerCase().replace(/-/g, '_');
        return translations[normalizedType] || type.replace(/_/g, ' ');
    }

    getCategoryColor(category) {
        const colors = {
            'tourism': '#fbbf24', 'sustenance': '#f87171', 'accommodation': '#a78bfa',
            'amenity': '#60a5fa', 'natural': '#34d399', 'historic': '#d97706',
            'leisure': '#f472b6', 'shop': '#c084fc', 'transport': '#9ca3af',
            'craft': '#e879f9', 'office': '#64748b', 'emergency': '#ef4444',
            'man_made': '#78716c', 'place': '#facc15', 'sport': '#14b8a6',
            'healthcare': '#f43f5e', 'power': '#a8a29e', 'barrier': '#57534e', 'other': '#94a3b8'
        };
        return colors[category] || colors['other'];
    }

    _initFullScreenOverlay() {
        if (document.getElementById('fullscreen-chart-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'fullscreen-chart-overlay';
        overlay.innerHTML = `
            <div class="header">
                 <div class="title">Statistiques Détaillées (Treemap)</div>
                 <button id="fullscreen-chart-button-close">Fermer ✕</button>
            </div>
            <div id="fullscreen-chart-container" class="chart-container"></div>
        `;
        document.body.appendChild(overlay);

        this.fsOverlay = overlay;
        this.fsChartContainer = document.getElementById('fullscreen-chart-container');

        document.getElementById('fullscreen-chart-button-close').addEventListener('click', () => {
            this.fsOverlay.classList.remove('visible');
            setTimeout(() => {
                this.fsOverlay.style.display = 'none';
            }, 300);
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.fsOverlay.style.display === 'flex') {
                document.getElementById('fullscreen-chart-button-close').click();
            }
        });
    }

    _toggleFullScreenChart(data, layout) {
        if (!this.fsOverlay) this._initFullScreenOverlay();

        this.fsOverlay.style.display = 'flex';
        // Force reflow
        void this.fsOverlay.offsetWidth;
        this.fsOverlay.classList.add('visible');

        const fsLayout = {
            ...layout,
            font: { ...layout.font, size: 16 }, // Bigger font
            margin: { t: 0, l: 0, r: 0, b: 0 }
        };

        Plotly.newPlot(this.fsChartContainer, data, fsLayout, { responsive: true, displayModeBar: false });
    }

    toggleLoadNeighborsBtn(show) {
        if (this.loadNeighborsBtn) {
            if (show) this.loadNeighborsBtn.classList.remove('hidden');
            else this.loadNeighborsBtn.classList.add('hidden');
        }
    }
}
