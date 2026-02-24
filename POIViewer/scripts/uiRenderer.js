export class UiRenderer {
    constructor() {
        // --- FULL SCREEN CHART CONTAINERS ---
        this.fsOverlay = null; // Will be created in init
        this.fsChartContainer = null;

        this.macroStats = document.getElementById('macro-stats');
        this.poiList = document.getElementById('poi-list');
        this.microSidebar = document.getElementById('micro-sidebar');
        this.closeMicroBtn = document.getElementById('close-micro-view');
        this.categoryFilter = document.getElementById('category-filter');

        this.toggleFiltersBtn = document.getElementById('toggle-filters-btn');
        this.deselectAllBtn = document.getElementById('deselect-all-btn');
        this.macroFiltersContent = document.getElementById('macro-filters-content');

        this.deselectAllPathsBtn = document.getElementById('deselect-all-paths-btn');

        this.poiSearchInput = document.getElementById('poi-search-input');
        this.subCategoryContainer = document.getElementById('sub-category-filter-container');
        this.selectedSubCategory = null;
        this.excludedSubCategories = new Set();

        this.onFilterChange = null;
        this.onSubCategoryFilterChange = null;
        this.onPoiSelected = null;

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
        // --- Tab Logic ---
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                // Add active to clicked
                tab.classList.add('active');
                const targetId = tab.getAttribute('data-tab');
                document.getElementById(`${targetId}-content`).classList.add('active');
            });
        });


        // --- 1. Parcs Nationaux (Statique) ---
        const nationalContainer = document.getElementById('national-list');
        if (nationalContainer) {
            nationalContainer.innerHTML = '';
            this.nationalParks.forEach(park => {
                const btn = document.createElement('button');
                btn.className = 'preset-btn';
                btn.textContent = park.name;
                btn.addEventListener('click', () => {
                    if (this.onPresetSelected) this.onPresetSelected(park);
                    this.minimizePresetsPanel();
                });
                nationalContainer.appendChild(btn);
            });
        }

        // --- 2. Parcs Régionaux (Dynamique) ---
        this._populateDynamicList('regional-list', () => this.apiService.fetchFrenchPNRs());

        // --- 3. Régions (Dynamique) ---
        this._populateDynamicList('regions-list', () => this.apiService.fetchFrenchRegions());

        // --- 4. Départements (Dynamique) ---
        this._populateDynamicList('departments-list', () => this.apiService.fetchFrenchDepartments());

        // --- 5. Villes (Recherche) ---
        this.initCitySearch();
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

        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<span class="loading-text" style="color:var(--color-text-muted); font-size:0.9rem;">Aucun élément trouvé (ou erreur).</span>';
        } else {
            items.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'preset-btn';
                btn.textContent = item.name;
                btn.addEventListener('click', () => {
                    if (this.onPresetSelected) this.onPresetSelected(item);
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

        // --- INIT FULL SCREEN OVERLAY ---
        this._initFullScreenOverlay();

        if (this.closeMicroBtn) {
            this.closeMicroBtn.addEventListener('click', () => {
                this.toggleMicroSidebar(false);
            });
        }

        if (this.categoryFilter) {
            this.categoryFilter.addEventListener('change', (e) => {
                this.selectedSubCategory = null; // Reset sub-cat when main cat changes
                this.filterList();
                this.updateSidebarFilterOptions(this.lastPois); // Refresh sub-cats
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
                checkbox.checked = true;
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

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(`${this.getCategoryEmoji(cat.id)} ${cat.label}`));

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
                checkbox.checked = true;
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
            });
            this.updatePathFilterButtonText();
        }
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
        const content = document.getElementById('path-filters-content');
        if (!btn || !content) return;
        const checkedCount = content.querySelectorAll('input:checked').length;
        const total = this.pathCategories.length;
        btn.textContent = `🗺️ Choisir les chemins (${checkedCount}/${total})`;
    }

    getSelectedPathCategories() {
        const content = document.getElementById('path-filters-content');
        if (!content) return []; // If not init, assume all? or none?
        const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
        if (checkboxes.length === 0) return ['none'];
        return Array.from(checkboxes).map(cb => cb.value);
    }

    updateFilterButtonText() {
        if (!this.macroFiltersContent) return;
        // Count only main category checkboxes (not sub-cat ones)
        const mainCheckboxes = this.macroFiltersContent.querySelectorAll(':scope > div > div > label > input[type="checkbox"]');
        const checkedCount = Array.from(mainCheckboxes).filter(cb => cb.checked).length;
        const total = this.categories.length;
        this.toggleFiltersBtn.textContent = `🛠️ Choisir les catégories (${checkedCount}/${total})`;
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

    clear() {
        this.macroStats.innerHTML = `
            <div class="stat-item empty">
                <span class="stat-value">--</span>
                <span class="stat-label">Points d'Intérêt</span>
            </div>`;
        this.poiList.innerHTML = '<p class="empty-state">Sélectionnez une zone pour voir les lieux.</p>';
        this.toggleMicroSidebar(false);
    }

    renderMacroStats(pois) {
        const total = pois.length;
        if (total === 0) {
            this.macroStats.innerHTML = `<div class="stat-item empty"><span class="stat-value">--</span><span class="stat-label">Aucun lieu trouvé</span></div>`;
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

        this.macroStats.innerHTML = '';

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
    }

    renderMicroList(pois) {
        if (pois.length === 0) {
            this.poiList.innerHTML = '<p class="empty-state">Aucun point d\'intérêt trouvé dans cette zone.</p>';
            return;
        }
        this.updateSidebarFilterOptions(this.lastPois);
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

    updateSidebarFilterOptions(pois) {
        if (!this.categoryFilter) return;
        const categoriesPresent = new Set(pois.map(p => p.category));
        const currentVal = this.categoryFilter.value;
        this.categoryFilter.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = '🌎 Toutes catégories';
        this.categoryFilter.appendChild(allOption);

        this.categories.forEach(cat => {
            if (categoriesPresent.has(cat.id)) {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = `${this.getCategoryEmoji(cat.id)} ${cat.label}`;
                this.categoryFilter.appendChild(option);
            }
        });

        if (categoriesPresent.has(currentVal) || currentVal === 'all') {
            this.categoryFilter.value = currentVal;
        } else {
            this.categoryFilter.value = 'all';
        }

        this.renderSubCategoryFilters(pois, this.categoryFilter.value);
    }

    renderSubCategoryFilters(pois, category) {
        if (!this.subCategoryContainer) return;

        // Filter POIs by standard category first to get relevant types
        let filteredPois = pois;
        if (category !== 'all') {
            filteredPois = pois.filter(p => p.category === category);
        }

        // Count Types
        const typeCounts = {};
        filteredPois.forEach(p => {
            if (!typeCounts[p.type]) typeCounts[p.type] = 0;
            typeCounts[p.type]++;
        });

        // Convert to array and sort
        const sortedTypes = Object.entries(typeCounts)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count);

        this.subCategoryContainer.innerHTML = '';

        // "All" Chip
        const allBtn = document.createElement('button');
        allBtn.className = `preset-btn ${this.selectedSubCategory === null ? 'active' : ''}`;
        allBtn.style.fontSize = '0.75rem';
        allBtn.style.padding = '4px 8px';
        allBtn.textContent = `Tout (${filteredPois.length})`;
        allBtn.addEventListener('click', () => {
            this.selectedSubCategory = null;
            this.filterList();
            this.renderSubCategoryFilters(pois, category); // Re-render to update active state
        });
        this.subCategoryContainer.appendChild(allBtn);

        // Type Chips
        sortedTypes.forEach(item => {
            const btn = document.createElement('button');
            const isActive = this.selectedSubCategory === item.type;
            btn.className = `preset-btn ${isActive ? 'active' : ''}`;
            btn.style.fontSize = '0.75rem';
            btn.style.padding = '4px 8px';
            // Use translation
            const label = this.translateType(item.type);
            btn.textContent = `${label} (${item.count})`;
            btn.addEventListener('click', () => {
                this.selectedSubCategory = isActive ? null : item.type; // Toggle
                this.filterList();
                this.renderSubCategoryFilters(pois, category); // Re-render to update active state
            });
            this.subCategoryContainer.appendChild(btn);
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
        this.categoryFilter.parentElement.style.display = 'none';
        const website = poi.tags.website || poi.tags['contact:website'] || poi.tags.url;
        const phone = poi.tags.phone || poi.tags['contact:phone'];
        const address = this.formatAddress(poi.tags);
        const openingHours = poi.tags.opening_hours;
        const wheelchair = poi.tags.wheelchair;
        const color = this.getCategoryColor(poi.category);
        const typeStyle = `background: ${color}33; color: ${color};`;

        const html = `
            <div class="detail-view">
                <div class="detail-header">
                    <button class="back-btn" id="back-to-list">← Retour</button>
                    ${website ? `<a href="${website}" target="_blank" class="icon-btn" title="Site Web">🌐</a>` : ''}
                </div>
                <h2 class="detail-title" style="color: ${color}">${this.getCategoryEmoji(poi.category)} ${poi.name}</h2>
                <span class="detail-type" style="${typeStyle}">${this.translateType(poi.type)}</span>
                <div id="poi-image-container" style="width: 100%; height: 200px; background: #eee; border-radius: 8px; margin: 15px 0; display: none; overflow: hidden;">
                    <img id="poi-image" src="" alt="${poi.name}" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div class="detail-info">
                    ${poi.tags.description ? `<div class="info-row"><span class="info-label">Description (OSM)</span><span class="info-value" id="poi-description-text">${poi.tags.description}</span></div>` : `<div id="poi-description-text"></div>`}
                    ${address ? `<div class="info-row"><span class="info-label">Adresse</span><span class="info-value">${address}</span></div>` : ''}
                    ${phone ? `<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value"><a href="tel:${phone}" style="color:${color}">${phone}</a></span></div>` : ''}
                    ${openingHours ? `<div class="info-row"><span class="info-label">Horaires</span><span class="info-value">${openingHours}</span></div>` : ''}
                    ${wheelchair ? `<div class="info-row"><span class="info-label">Accessibilité</span><span class="info-value">${wheelchair === 'yes' ? 'Accessible Fauteuil' : 'Non spécifié'}</span></div>` : ''}
                    ${poi.tags.ele ? `<div class="info-row"><span class="info-label">Altitude</span><span class="info-value">${poi.tags.ele} m</span></div>` : ''}
                    ${poi.tags.capacity ? `<div class="info-row"><span class="info-label">Capacité</span><span class="info-value">${poi.tags.capacity} personnes</span></div>` : ''}
                    ${poi.tags.start_date ? `<div class="info-row"><span class="info-label">Date de création</span><span class="info-value">${poi.tags.start_date}</span></div>` : ''}
                     ${poi.tags.wikipedia ? `<div class="info-row"><span class="info-label">Wikipedia</span><span class="info-value"><a href="https://fr.wikipedia.org/wiki/${poi.tags.wikipedia.replace(/^fr:/, '')}" target="_blank">Voir l'article</a></span></div>` : ''}
                    <div class="info-row"><span class="info-label">Coordonnées</span><span class="info-value">${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}</span></div>
                </div>
            </div>
        `;

        this.poiList.innerHTML = html;
        document.getElementById('back-to-list').addEventListener('click', () => {
            this.categoryFilter.parentElement.style.display = 'block';
            this.filterList();
        });

        const imgContainer = document.getElementById('poi-image-container');
        const imgElement = document.getElementById('poi-image');

        // --- 1. Load Image (Wikimedia Commons via GeoSearch or Wikidata) ---
        // Defaults to existing geosearch if no specific wikidata image is found later
        if (this.apiService) {
            this.apiService.fetchPoiImage(poi.lat, poi.lng).then(url => {
                if (url && !imgElement.src.startsWith('http')) { // Only if not already set by wikidata
                    imgElement.src = url;
                    imgElement.style.opacity = '1';
                    imgContainer.style.display = 'block';
                }
            });
        }

        // --- 2. Fetch Wikidata & Enrich OSM Details ---
        if (poi.tags.wikidata && this.apiService) {
            // Show loading indicator in description or similar?
            // For now, we update asynchronously
            this.apiService.fetchWikidata(poi.tags.wikidata).then(data => {
                if (!data) return;

                // A. Description
                if (data.description) {
                    const descEl = document.getElementById('poi-description-text');
                    if (descEl) descEl.textContent = data.description.charAt(0).toUpperCase() + data.description.slice(1);
                    else {
                        // Inject description if logic allows
                        const container = document.querySelector('.detail-info');
                        const div = document.createElement('div');
                        div.className = 'info-row';
                        div.innerHTML = `<span class="info-label">Description (Wikidata)</span><span class="info-value">${data.description}</span>`;
                        container.prepend(div);
                    }
                }

                // B. Website
                if (data.website && !website) { // Only if not already in OSM
                    const container = document.querySelector('.detail-header');
                    const link = document.createElement('a');
                    link.href = data.website;
                    link.target = "_blank";
                    link.className = "icon-btn";
                    link.title = "Site Officiel (Wikidata)";
                    link.textContent = "🌐";
                    container.appendChild(link);
                }

                // C. Image (Wikidata P18 often better than GeoSearch)
                if (data.image) {
                    imgElement.src = data.image;
                    imgElement.style.opacity = '1';
                    imgContainer.style.display = 'block';
                }

                // D. Wikipedia Link
                if (data.wikipedia) {
                    const container = document.querySelector('.detail-header');
                    const link = document.createElement('a');
                    link.href = data.wikipedia;
                    link.target = "_blank";
                    link.className = "icon-btn";
                    link.title = "Article Wikipédia";
                    link.textContent = "📖"; // Book emoji for Wikipedia
                    container.appendChild(link);
                }
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
        const category = this.categoryFilter ? this.categoryFilter.value : 'all';
        const searchQuery = this.poiSearchInput ? this.poiSearchInput.value.toLowerCase() : '';
        const subCat = this.selectedSubCategory;

        let filtered = this.lastPois;

        // 1. Category
        if (category !== 'all') {
            filtered = filtered.filter(p => p.category === category);
        }

        // 2. Sub-Category
        if (subCat) {
            filtered = filtered.filter(p => p.type === subCat);
        }

        // 3. Search
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
}
