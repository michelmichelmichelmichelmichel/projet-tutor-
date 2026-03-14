import { getAdminLevels } from './adminLevels.js';

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
            { id: 'accommodation', label: 'Refuges, abris' },
            { id: 'leisure', label: 'Loisirs' },
            { id: 'sport', label: 'Sport' },
            { id: 'historic', label: 'Histoire' },
            { id: 'natural', label: 'Nature' },
            { id: 'shop', label: 'Commerces' },
            { id: 'amenity', label: 'Services' },
            { id: 'transport', label: 'Transport' },
            { id: 'healthcare', label: 'Santé' },
            { id: 'office', label: 'Bureaux' },
            { id: 'craft', label: 'Artisanat' }
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
        this.onCountrySelected = null;
        this.selectedCountry = null;
        // Static tabs that depend on a country being selected
        this.staticCountryDependentTabIds = ['national', 'cities'];
        // Dynamic admin tabs built per country; populated by rebuildAdminTabs()
        this.currentAdminTabIds = [];
        this.loadedPresetCountryByTab = new Map();
        this.loadingPresetTabs = new Map();
    }

    async initPresets() {
        this._initPresetTabs();
        this._hidePresetTab('regional');
        this.setCountryWorkflowState(null);
        this.initCitySearch();
        this.initCountrySearch();
    }

    _initPresetTabs() {
        // Use event delegation on the tabs row so dynamically added admin tabs work too
        const tabsRow = document.querySelector('.presets-tabs > div');
        if (tabsRow) {
            tabsRow.addEventListener('click', (e) => {
                const btn = e.target.closest('.tab-btn');
                if (!btn || btn.disabled || btn.classList.contains('is-disabled')) return;

                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab');
                const content = document.getElementById(`${tabId}-content`);
                if (content) content.classList.add('active');

                this.loadPresetTab(tabId);
            });
        }

        this.activatePresetTab('countries');
    }

    // Ajoutez cette nouvelle méthode dans la classe UiRenderer
    _hidePresetTab(tabId) {
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const content = document.getElementById(`${tabId}-content`);

        if (btn) btn.style.display = 'none';
        if (content) content.style.display = 'none';
    }

    activatePresetTab(tabId) {
        const btns = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const targetContent = document.getElementById(`${tabId}-content`);

        if (!targetBtn || !targetContent || targetBtn.disabled) return;

        btns.forEach(btn => btn.classList.remove('active'));
        contents.forEach(content => content.classList.remove('active'));

        targetBtn.classList.add('active');
        targetContent.classList.add('active');
    }

    setPresetTabEnabled(tabId, enabled) {
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (!btn) return;

        btn.disabled = !enabled;
        btn.classList.toggle('is-disabled', !enabled);
    }

    /**
     * Build (or clear) the dynamic admin-level tabs for the selected country.
     * Creates one tab button + one content div per level defined in adminLevels.js.
     */
    rebuildAdminTabs(countryCode) {
        const levels = countryCode ? getAdminLevels(countryCode) : [];
        this.currentAdminTabIds = levels.map(l => `admin_${l.adminLevel}`);

        const btnsContainer = document.getElementById('admin-tabs-btns');
        const contentsContainer = document.getElementById('admin-tabs-contents');
        if (!btnsContainer || !contentsContainer) return;

        btnsContainer.innerHTML = '';
        contentsContainer.innerHTML = '';

        levels.forEach(level => {
            const tabId = `admin_${level.adminLevel}`;

            const btn = document.createElement('button');
            btn.className = 'tab-btn is-disabled';
            btn.setAttribute('data-tab', tabId);
            btn.textContent = level.label;
            btn.disabled = true;
            btnsContainer.appendChild(btn);

            const content = document.createElement('div');
            content.id = `${tabId}-content`;
            content.className = 'tab-content';
            content.innerHTML = `<div id="${tabId}-list" class="presets-list"></div>`;
            contentsContainer.appendChild(content);
        });
    }

    clearPresetContainers(containerIds = []) {
        containerIds.forEach((containerId) => {
            const container = document.getElementById(containerId);
            if (container) container.innerHTML = '';
        });
    }

    setCountryWorkflowState(country) {
        const cityInput = document.getElementById('city-search-input');
        this.loadedPresetCountryByTab.clear();

        if (!country) {
            this.selectedCountry = null;
            this.rebuildAdminTabs(null);
            this.renderSelectedCountrySummary(null);
            this.staticCountryDependentTabIds.forEach(tabId => this.setPresetTabEnabled(tabId, false));
            this.activatePresetTab('countries');

            if (cityInput) {
                cityInput.disabled = true;
                cityInput.value = '';
                cityInput.placeholder = "Choisissez d'abord un pays...";
            }

            this.clearPresetContainers(['national-list', 'cities-results']);
            return;
        }

        this.selectedCountry = country;
        this.rebuildAdminTabs(country.countryCode);
        this.renderSelectedCountrySummary(country);
        this.staticCountryDependentTabIds.forEach(tabId => this.setPresetTabEnabled(tabId, true));
        // Enable the dynamic admin tabs just created
        this.currentAdminTabIds.forEach(tabId => this.setPresetTabEnabled(tabId, true));

        if (cityInput) {
            cityInput.disabled = false;
            cityInput.value = '';
            cityInput.placeholder = `Rechercher une ville en ${country.name}...`;
        }

        this.clearPresetContainers(['national-list', 'cities-results']);
        // No preloading — tabs load lazily when the user clicks them
    }

    _renderPresetMessage(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">${message}</p>`;
    }

    _renderPresetError(containerId, message, onRetry = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="load-error-block load-error-block--small">
                <span class="load-error-block__icon">⚠️</span>
                <p class="load-error-block__msg">${this.escapeHtml(message)}</p>
                ${onRetry ? '<button class="load-error-block__retry-btn">Reessayer</button>' : ''}
            </div>
        `;

        if (onRetry) {
            container.querySelector('.load-error-block__retry-btn')
                ?.addEventListener('click', onRetry);
        }
    }

    _renderPresetLoading(containerId, message = 'Chargement...') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `<div class="loading-container"><span class="spinner"></span><span>${message}</span></div>`;
    }

    countryCodeToFlagEmoji(countryCode) {
        const code = (countryCode || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return '🌍';

        const base = 127397;
        return String.fromCodePoint(...Array.from(code).map((char) => base + char.charCodeAt(0)));
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getCountryFlagUrl(countryCode, width = 40, height = 30) {
        const code = (countryCode || '').trim().toLowerCase();
        if (!/^[a-z]{2}$/.test(code)) return null;

        return {
            src: `https://flagcdn.com/${width}x${height}/${code}.png`,
            srcSet: `https://flagcdn.com/${width * 2}x${height * 2}/${code}.png 2x`
        };
    }

    renderCountryFlag(country, imageClass, width = 40, height = 30) {
        const flagUrl = this.getCountryFlagUrl(country?.countryCode, width, height);
        const fallback = this.escapeHtml((country?.countryCode || 'OSM').toUpperCase());

        if (!flagUrl) {
            return `<span class="country-flag-fallback">${fallback}</span>`;
        }

        return `<img class="${imageClass}" src="${flagUrl.src}" srcset="${flagUrl.srcSet}" alt="" loading="lazy" width="${width}" height="${height}">`;
    }

    renderSelectedCountrySummary(country) {
        const summary = document.getElementById('selected-country-summary');
        if (!summary) return;

        if (!country) {
            summary.innerHTML = '';
            summary.classList.add('hidden');
            return;
        }

        const safeName = this.escapeHtml(country.name);
        const code = this.escapeHtml((country.countryCode || '').toUpperCase());
        const flagMarkup = this.renderCountryFlag(country, 'country-active-flag-image', 48, 36);

        summary.innerHTML = `
            <div class="country-active-copy">
                <span class="country-active-label">Pays actif</span>
                <span class="country-active-name">${safeName}</span>
                <span class="country-active-meta">${code || 'OSM'}</span>
            </div>
            <div class="country-active-flag" aria-hidden="true">${flagMarkup}</div>
        `;
        summary.classList.remove('hidden');
    }

    getPresetTabConfig(tabId) {
        const countryName = this.selectedCountry ? this.selectedCountry.name : 'ce pays';

        if (tabId === 'national') {
            return {
                containerId: 'national-list',
                loadingMessage: `Chargement des zones protégées pour ${countryName}...`,
                emptyMessage: 'Aucune zone protégée trouvée.',
                fetchMethod: () => this.apiService.fetchParks()
            };
        }

        if (tabId.startsWith('admin_')) {
            const adminLevel = tabId.replace('admin_', '');
            const levels = getAdminLevels(this.selectedCountry?.countryCode);
            const levelCfg = levels.find(l => l.adminLevel === adminLevel);
            const label = levelCfg ? levelCfg.label : `Admin ${adminLevel}`;
            return {
                containerId: `${tabId}-list`,
                loadingMessage: `Chargement de ${label.toLowerCase()} pour ${countryName}...`,
                emptyMessage: `Aucun(e) ${label.toLowerCase()} trouvé(e).`,
                fetchMethod: () => this.apiService.fetchAdminLevel(adminLevel)
            };
        }

        return null;
    }

    loadPresetTab(tabId, { force = false } = {}) {
        if (!this.apiService || !this.selectedCountry) return Promise.resolve();
        if (tabId === 'countries' || tabId === 'cities') return Promise.resolve();

        const config = this.getPresetTabConfig(tabId);
        const currentCountryAreaId = this.apiService.currentCountryAreaId;
        if (!config || !currentCountryAreaId) return Promise.resolve();

        if (!force && this.loadedPresetCountryByTab.get(tabId) === currentCountryAreaId) {
            return Promise.resolve();
        }

        const requestKey = `${tabId}:${currentCountryAreaId}`;
        if (this.loadingPresetTabs.has(requestKey)) {
            return this.loadingPresetTabs.get(requestKey);
        }

        const request = this._populateDynamicList(config.containerId, config.fetchMethod, {
            loadingMessage: config.loadingMessage,
            emptyMessage: config.emptyMessage,
            countryAreaId: currentCountryAreaId
        }).then((didRender) => {
            if (didRender !== false) {
                this.loadedPresetCountryByTab.set(tabId, currentCountryAreaId);
            }
            return didRender;
        }).catch((error) => {
            console.error(error);
            if (currentCountryAreaId !== this.apiService.currentCountryAreaId) {
                return false;
            }

            this._renderPresetError(
                config.containerId,
                this._getPresetLoadErrorMessage(error),
                () => this.loadPresetTab(tabId, { force: true })
            );
            return false;
        }).finally(() => {
            this.loadingPresetTabs.delete(requestKey);
        });

        this.loadingPresetTabs.set(requestKey, request);
        return request;
    }

    _getPresetLoadErrorMessage(error) {
        const message = error?.message || '';

        if (message === 'API Timeout') {
            return 'Le serveur Overpass a expire avant de repondre.';
        }
        if (message === 'API Limit Reached') {
            return 'Le serveur Overpass refuse temporairement la requete.';
        }
        if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
            return 'Impossible de joindre le serveur Overpass.';
        }

        return 'Chargement impossible pour le moment.';
    }

    initCountrySearch() {
        const input = document.getElementById('country-search-input');
        const resultsContainer = document.getElementById('countries-results');

        if (!input || !resultsContainer) return;

        let timeout;
        input.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                if (query.length < 2) {
                    resultsContainer.innerHTML = '';
                    return;
                }

                resultsContainer.innerHTML = '<div class="loading-container"><span class="spinner"></span><span>Recherche...</span></div>';

                try {
                    const results = await this.apiService.searchCountries(query);
                    resultsContainer.innerHTML = '';

                    if (results.length === 0) {
                        resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Aucun pays trouve.</p>';
                        return;
                    }

                    const fragment = document.createDocumentFragment();
                    results.forEach(country => {
                        const safeName = this.escapeHtml(country.name);
                        const code = this.escapeHtml((country.countryCode || '').toUpperCase());
                        const flagMarkup = this.renderCountryFlag(country, 'country-flag-image');
                        const btn = document.createElement('button');
                        btn.className = 'preset-btn country-option-btn';
                        btn.innerHTML = `
                            <span class="country-flag" aria-hidden="true">${flagMarkup}</span>
                            <span class="country-option-copy">
                                <span class="country-option-name">${safeName}</span>
                                <span class="country-option-meta">${code || 'OSM'}</span>
                            </span>
                        `;

                        btn.addEventListener('click', () => {
                            this.apiService.setCountry(country.name, country.countryCode, country.areaId, country.bounds);
                            this.setCountryWorkflowState(country);
                            if (this.onCountrySelected) this.onCountrySelected(country);
                            input.value = country.name;
                            resultsContainer.innerHTML = '';
                        });
                        fragment.appendChild(btn);
                    });
                    resultsContainer.appendChild(fragment);

                } catch (e) {
                    console.error(e);
                    resultsContainer.innerHTML = '<p class="empty-state" style="color:var(--color-danger)">Erreur de recherche.</p>';
                }
            }, 300);
        });
    }

    initCitySearch() {
        const input = document.getElementById('city-search-input');
        const resultsContainer = document.getElementById('cities-results');

        if (!input || !resultsContainer) return;

        let timeout;
        input.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                if (!this.apiService || !this.apiService.currentCountryCode) {
                    resultsContainer.innerHTML = '';
                    return;
                }
                if (query.length < 2) {
                    resultsContainer.innerHTML = '';
                    return;
                }

                resultsContainer.innerHTML = '<div class="loading-container"><span class="spinner"></span><span>Recherche...</span></div>';

                try {
                    const results = await this.apiService.searchCommunes(query);
                    resultsContainer.innerHTML = '';

                    if (results.length === 0) {
                        resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Aucune ville trouvee.</p>';
                        return;
                    }

                    const fragment = document.createDocumentFragment();
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
                        fragment.appendChild(btn);
                    });
                    resultsContainer.appendChild(fragment);

                } catch (e) {
                    console.error(e);
                    resultsContainer.innerHTML = '<p class="empty-state" style="color:var(--color-danger)">Erreur de recherche.</p>';
                }
            }, 250);
        });
    }

    async _populateDynamicList(containerId, fetchMethod, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const loadingMessage = options.loadingMessage || 'Chargement...';
        const emptyMessage = options.emptyMessage || 'Aucun element trouve.';
        const requestCountryAreaId = options.countryAreaId || this.apiService?.currentCountryAreaId;

        this._renderPresetLoading(containerId, loadingMessage);

        let items = [];
        if (this.apiService) {
            items = await fetchMethod();
            if (requestCountryAreaId !== this.apiService.currentCountryAreaId) {
                return false;
            }
        } else {
            console.warn(`ApiService not available for ${containerId}`);
        }

        // Déduire le type administratif selon le conteneur
        // Pour la France, mapper les niveaux OSM aux types "region"/"dept" utilisés par l'API GéoGouv
        let adminType = null;
        let adminLevel = null;
        if (containerId.startsWith('admin_') && containerId.endsWith('-list')) {
            adminLevel = containerId.replace('admin_', '').replace('-list', '');
            const isFr = this.apiService?.currentCountryCode === 'fr';
            adminType = isFr && adminLevel === '4' ? 'region'
                : isFr && adminLevel === '6' ? 'dept'
                    : 'admin';
        }

        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = `<span class="loading-text" style="color:var(--color-text-muted); font-size:0.9rem;">${emptyMessage}</span>`;
        } else {
            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'preset-btn';
                btn.textContent = item.name;
                btn.addEventListener('click', () => {
                    const enrichedItem = adminType
                        ? { ...item, adminType, adminLevel, code: item.ref || item.code }
                        : item;
                    if (this.onPresetSelected) this.onPresetSelected(enrichedItem);
                    this.minimizePresetsPanel();
                });
                fragment.appendChild(btn);
            });
            container.appendChild(fragment);
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
                const mainCheckboxes = this.macroFiltersContent.querySelectorAll(':scope > div > div > label > input[type="checkbox"]');
                const anyChecked = Array.from(mainCheckboxes).some(i => i.checked);
                const newState = !anyChecked;

                mainCheckboxes.forEach(checkbox => {
                    checkbox.checked = newState;
                    // Trigger manual change to sync sub-categories
                    const wrapper = checkbox.closest('[data-cat-id]');
                    const subContainer = wrapper ? wrapper.querySelector('.sub-cat-list') : null;
                    if (subContainer) {
                        subContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            cb.checked = newState;
                            if (!newState) {
                                this.excludedSubCategories.add(cb.value);
                            } else {
                                this.excludedSubCategories.delete(cb.value);
                            }
                        });
                    }
                });

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

            // Trouver la flèche et la checkbox parentes (le subContainer est enfant direct du wrapper)
            const wrapper = container.parentElement;
            const arrow = wrapper ? wrapper.querySelector('.sub-cat-arrow') : null;
            const parentCb = wrapper ? wrapper.querySelector(':scope > div > label > input[type="checkbox"]') : null;
            const parentChecked = parentCb ? parentCb.checked : true;

            const types = typesByCategory[catId];
            if (!types || Object.keys(types).length === 0) {
                container.innerHTML = '<span style="font-size: 0.75rem; color: var(--color-text-muted); opacity: 0.6;">Aucun POI</span>';
                container.style.display = 'none';
                if (arrow) arrow.textContent = '▸';
                return;
            }

            // Sort by count descending
            const sortedTypes = Object.entries(types)
                .sort((a, b) => b[1] - a[1]);


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
                cb.checked = parentChecked; // Hérite de l'état du parent
                // Si le parent est décoché, exclure immédiatement la sous-catégorie
                if (!parentChecked) this.excludedSubCategories.add(typeName);
                cb.style.accentColor = 'var(--color-primary)';
                cb.addEventListener('change', () => {
                    if (!cb.checked) {
                        this.excludedSubCategories.add(typeName);
                    } else {
                        this.excludedSubCategories.delete(typeName);
                    }

                    // Sync avec la catégorie parente
                    const allSubCbs = container.querySelectorAll('input[type="checkbox"].sub-cat-cb');
                    const anyChecked = Array.from(allSubCbs).some(c => c.checked);
                    const allChecked = Array.from(allSubCbs).every(c => c.checked);

                    if (cb.checked && parentCb && !parentCb.checked) {
                        // Une sous-cat cochée alors que le parent est décoché → cocher le parent
                        parentCb.checked = true;
                        if (this.onFilterChange) this.onFilterChange();
                    } else if (!anyChecked && parentCb && parentCb.checked) {
                        // Toutes les sous-cats décochées → décocher le parent
                        parentCb.checked = false;
                        if (this.onFilterChange) this.onFilterChange();
                    }


                    if (this.onSubCategoryFilterChange) this.onSubCategoryFilterChange();
                });

                const translated = this.translateType(typeName);
                label.appendChild(cb);
                label.appendChild(document.createTextNode(`${translated} (${count})`));
                div.appendChild(label);
                container.appendChild(div);
            });

            // Auto-déplier le panneau dès que des sous-catégories sont disponibles
            container.style.display = 'block';
            if (arrow) arrow.textContent = '▾';
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
                <span class="load-error-block__icon"></span>
                <p class="load-error-block__msg">${message}</p>
                ${onRetry ? `<button class="load-error-block__retry-btn">Réessayer</button>` : ''}
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
    generateDemographicsKPI(history, osmPopulation, zoneName) {
        if ((!history || history.length === 0) && !osmPopulation) return '';

        let variationHtml = '';
        let sparklineHtml = '';
        let displayedPopulation = '';
        let yearText = '';

        this.currentDemoHistory = history;

        if (history && history.length > 0) {
            const latest = history[history.length - 1];
            displayedPopulation = latest.population.toLocaleString('fr-FR');
            yearText = `(${latest.year})`;

            if (history.length > 1) {
                const previous = history[history.length - 2];
                const diff = latest.population - previous.population;
                const percent = ((diff / previous.population) * 100).toFixed(2);
                const isPositive = diff >= 0;
                const color = isPositive ? '#34d399' : '#f87171';
                const sign = isPositive ? '+' : '';

                variationHtml = `
                    <div class="demo-kpi__variation">
                        <div class="demo-kpi__pct" style="color:${color};">${sign}${percent}%</div>
                        <div class="demo-kpi__since">depuis ${previous.year}</div>
                    </div>`;
                sparklineHtml = `<div id="sparkline-container" style="width:100px;height:40px;margin-left:16px;"></div>`;
            }
        } else if (osmPopulation) {
            displayedPopulation = osmPopulation.toLocaleString('fr-FR');
            yearText = `(Source OpenStreetMap)`;
            variationHtml = `
                <div class="demo-kpi__variation" style="opacity:0.7;font-style:italic;">
                    <div class="demo-kpi__since">Aucun historique<br>disponible</div>
                </div>`;
        } else {
            return '';
        }

        return `
            <div class="demo-kpi">
                <div class="demo-kpi__main">
                    <div class="demo-kpi__label">👥 Résidents <span style="font-size:0.66rem">${yearText}</span></div>
                    <div class="demo-kpi__value">${displayedPopulation}</div>
                    <div class="demo-kpi__zone">${zoneName}</div>
                </div>
                ${sparklineHtml}
                ${variationHtml}
            </div>`;
    }

    /**
     * Rend le graphique type "Sparkline" à l'intérieur du conteneur injecté par \`generateDemographicsKPI\`.
     */
    renderSparkline() {
        const container = document.getElementById('sparkline-container');
        if (!container || !this.currentDemoHistory || this.currentDemoHistory.length < 2) return;

        const xValues = this.currentDemoHistory.map(h => h.year);
        const yValues = this.currentDemoHistory.map(h => h.population);

        // Déterminer la coloration de la ligne selon la tendance globale (dernière vs première)
        const firstVal = yValues[0];
        const lastVal = yValues[yValues.length - 1];
        const lineColor = lastVal >= firstVal ? '#34d399' : '#f87171';

        const data = [{
            x: xValues,
            y: yValues,
            type: 'scatter',
            mode: 'lines',
            line: {
                color: lineColor,
                width: 3,
                shape: 'spline'
            },
            fill: 'tozeroy', // Remplit vers le bas
            fillcolor: lineColor + '22', // Translucide (equivalent rgba ... , 0.13)
            hoverinfo: 'x+y'
        }];

        const layout = {
            margin: { t: 5, b: 5, l: 0, r: 0 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: { visible: false, fixedrange: true },
            yaxis: { visible: false, fixedrange: true },
            showlegend: false,
            hovermode: 'x closest'
        };

        const config = { staticPlot: false, displayModeBar: false, responsive: true };

        Plotly.newPlot(container, data, layout, config);
    }
    renderMacroStats(pois, demoHtml = '', networks = [], areaKm2 = 0, totalRaw = 0, inseeStats = null) {
        const total = pois.length;

        // ── Calcul des KPI hébergement & sentiers (toujours, même si pois filtrés = 0) ──
        const accommodationTypes = new Set([
            'hotel', 'guest_house', 'hostel', 'camp_site', 'chalet',
            'alpine_hut', 'apartment', 'motel', 'caravan_site', 'shelter'
        ]);
        let accommodationCount = 0;
        let totalBeds = 0;
        let totalRooms = 0;
        let websiteCount = 0;
        let socialMediaCount = 0;
        let wikivoyageCount = 0;
        // Infrastructures KPIs
        let busStopCount = 0;
        let trainStationCount = 0;
        let airportCount = 0;
        let parkingCount = 0;
        let sanitaryCount = 0;
        let chargingCount = 0;

        const busTypes = new Set(['bus_stop', 'bus_station', 'platform']);
        const trainTypes = new Set(['station', 'halt', 'tram_stop', 'subway_entrance']);
        const airportTypes = new Set(['aerodrome', 'aeroway', 'airport']);

        pois.forEach(p => {
            if (p.category === 'accommodation' || accommodationTypes.has(p.type)) {
                accommodationCount++;
                if (p.tags && p.tags.beds) totalBeds += parseInt(p.tags.beds, 10) || 0;
                if (p.tags && p.tags.rooms) totalRooms += parseInt(p.tags.rooms, 10) || 0;
            }
            if (p.digital) {
                if (p.digital.hasWebsite) websiteCount++;
                if (p.digital.hasSocialMedia) socialMediaCount++;
                if (p.digital.hasWikivoyage) wikivoyageCount++;
            }
            // Transport
            const pType = p.type || '';
            if (busTypes.has(pType) || (p.tags && p.tags.bus === 'yes') || (p.tags && p.tags.highway === 'bus_stop')) busStopCount++;
            if (trainTypes.has(pType) || (p.tags && p.tags.railway === 'station') || (p.tags && p.tags.railway === 'halt')) trainStationCount++;
            if (airportTypes.has(pType) || (p.tags && p.tags.aeroway === 'aerodrome')) airportCount++;
            // Parking
            if (pType === 'parking' || pType === 'parking_space' || pType === 'bicycle_parking' || (p.tags && p.tags.amenity === 'parking')) parkingCount++;
            // Sanitaire
            if (pType === 'toilets' || pType === 'shower' || pType === 'drinking_water' || (p.tags && (p.tags.amenity === 'toilets' || p.tags.amenity === 'shower' || p.tags.amenity === 'drinking_water'))) sanitaryCount++;
            // Bornes de recharge
            if (pType === 'charging_station' || (p.tags && p.tags.amenity === 'charging_station')) chargingCount++;
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

        // ── HELPERS ────────────────────────────────────────────────────────
        // Barre horizontale proportionnelle avec label, valeur, couleur
        const pBar = (label, value, max, color, suffix = '') => {
            const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
            const fmt = typeof value === 'number' ? (Number.isInteger(value) ? value.toLocaleString('fr-FR') : value.toFixed(2)) : value;
            return `<div class="ind-row">
                <div class="ind-row__head">
                    <span class="ind-row__label">${label}</span>
                    <span class="ind-row__val" style="color:${color};">${fmt}${suffix}</span>
                </div>
                <div class="ind-row__track"><div class="ind-row__fill" style="width:${pct}%;background:${color};"></div></div>
            </div>`;
        };

        // Stat inline compacte
        const inlineStat = (label, value, color) => {
            return `<div class="ind-inline">
                <span class="ind-inline__label">${label}</span>
                <span class="ind-inline__val" style="color:${color};">${typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</span>
            </div>`;
        };

        const formatChartMetric = (value) => {
            if (!Number.isFinite(value) || value <= 0) return '0';
            if (value >= 100) return value.toFixed(0);
            if (value >= 10) return value.toFixed(1);
            if (value >= 1) return value.toFixed(2);
            if (value >= 0.1) return value.toFixed(2);
            return value.toFixed(3);
        };

        const buildTreemapTrace = (treemapData, valueLabel = 'elements') => ([{
            type: 'treemap',
            ids: treemapData.ids,
            labels: treemapData.labels,
            parents: treemapData.parents,
            values: treemapData.values,
            branchvalues: 'total',
            sort: false,
            marker: {
                colors: treemapData.colors,
                line: { width: 2, color: 'rgba(255,255,255,0.34)' },
                pad: { b: 5, l: 5, r: 5, t: 16 }
            },
            tiling: {
                packing: 'squarify',
                squarifyratio: 1.15
            },
            pathbar: { visible: false },
            root: { color: 'rgba(255,255,255,0.025)' },
            textfont: { family: 'Outfit, sans-serif', color: '#ffffff', size: 12 },
            textposition: 'middle center',
            texttemplate: '%{label}<br><span style="font-size:11px">%{value}</span>',
            hovertemplate: `<b>%{label}</b><br>%{value} ${valueLabel}<extra></extra>`
        }]);

        // ── SECTION 3 : Tourisme ──────────────────────────────────────────
        let accommodationHtml = '';
        if (inseeStats) {
            const totalBeds = inseeStats.hotel_beds + inseeStats.camping_beds + inseeStats.collective_beds;
            const maxBeds = Math.max(inseeStats.hotel_beds, inseeStats.camping_beds, inseeStats.collective_beds, 1);
            let starsHtml = Object.entries(inseeStats.hotel_stars).filter(([k, v]) => v > 0)
                .map(([k, v]) => `<span class="kpi-star-badge">${k === 'NC' ? 'NC' : k + '★'} ${v}</span>`).join('')
                || '<span class="kpi-sub">Aucun classement</span>';
            const starEntries = Object.entries(inseeStats.hotel_stars)
                .filter(([, value]) => value > 0)
                .sort(([a], [b]) => {
                    const aRank = a === 'NC' ? -1 : Number(a);
                    const bRank = b === 'NC' ? -1 : Number(b);
                    return bRank - aRank;
                });
            starsHtml = starEntries.length > 0
                ? `<div class="kpi-stars__title">Classement des hotels</div>${starEntries.map(([rank, count]) => {
                    const isUnclassified = rank === 'NC';
                    const tierText = isUnclassified ? 'NC' : '★'.repeat(Number(rank));
                    const labelText = isUnclassified
                        ? 'Non classes'
                        : `${rank} etoile${Number(rank) > 1 ? 's' : ''}`;
                    const countText = `${count} hotel${count > 1 ? 's' : ''}`;
                    return `
                        <div class="kpi-star-badge">
                            <span class="kpi-star-badge__tier">${tierText}</span>
                            <span class="kpi-star-badge__label">${labelText}</span>
                            <span class="kpi-star-badge__count">${countText}</span>
                        </div>`;
                }).join('')}`
                : '<span class="kpi-sub">Aucun classement</span>';
            accommodationHtml = `
                <div class="ind-block ind-block--purple">
                    <div class="ind-block__header">
                        <span class="ind-block__title">INSEE 2026</span>
                        <span class="ind-block__big">${inseeStats.total_loc.toLocaleString('fr-FR')} <span class="ind-block__unit">hebergements</span></span>
                    </div>
                    ${pBar('Lits hotels', inseeStats.hotel_beds, maxBeds, '#c4b5fd', ' lits')}
                    ${pBar('Lits campings', inseeStats.camping_beds, maxBeds, '#a78bfa', ' lits')}
                    ${pBar('Lits collectifs', inseeStats.collective_beds, maxBeds, '#8b5cf6', ' lits')}
                    <div class="ind-block__footer">
                        <span class="ind-block__total">${totalBeds.toLocaleString('fr-FR')} lits au total</span>
                        <div class="kpi-stars">${starsHtml}</div>
                    </div>
                </div>`;
        } else {
            accommodationHtml = `
                <div class="ind-block ind-block--purple" style="opacity:0.5;">
                    <div class="ind-block__header">
                        <span class="ind-block__title">INSEE 2026</span>
                        <span class="ind-block__big" style="opacity:0.4;">Indisponible</span>
                    </div>
                    <div class="kpi-sub" style="padding:6px 0;">Donnees INSEE non disponibles pour cette zone</div>
                </div>`;
        }

        // Sentiers : ratio visuel piétons vs vélo (stacked bar)
        const totalTrailsCount = pedestrianTrailCount + cyclingTrailCount;
        const pedPct = totalTrailsCount > 0 ? (pedestrianTrailCount / totalTrailsCount * 100) : 50;
        const trailsHtml = `
            <div class="ind-block ind-block--green" style="margin-top:6px;">
                <div class="ind-block__header">
                    <span class="ind-block__title">Sentiers & pistes</span>
                    <span class="ind-block__big">${totalTrailsCount.toLocaleString('fr-FR')} <span class="ind-block__unit">traces</span></span>
                </div>
                <div class="ind-stacked">
                    <div class="ind-stacked__bar">
                        <div class="ind-stacked__seg" style="width:${pedPct}%;background:#34d399;" title="Pietons ${pedestrianTrailCount}"></div>
                        <div class="ind-stacked__seg" style="width:${100 - pedPct}%;background:#60a5fa;" title="Velo ${cyclingTrailCount}"></div>
                    </div>
                    <div class="ind-stacked__legend">
                        <span><span class="heatmap-dot" style="background:#34d399;"></span> Pietons <b>${pedestrianTrailCount.toLocaleString('fr-FR')}</b></span>
                        <span><span class="heatmap-dot" style="background:#60a5fa;"></span> Velo <b>${cyclingTrailCount.toLocaleString('fr-FR')}</b></span>
                    </div>
                </div>
            </div>`;
        const section3Html = accommodationHtml + trailsHtml;

        // ── SECTION 4 : Marketing digital ─────────────────────────────────
        const webPct = total > 0 ? (websiteCount / total * 100) : 0;
        const socPct = total > 0 ? (socialMediaCount / total * 100) : 0;
        const wikiPct = total > 0 ? (wikivoyageCount / total * 100) : 0;
        const section4Html = `
            <div class="ind-block">
                <div class="ind-block__header">
                    <span class="ind-block__title">Presence numerique</span>
                    <span class="ind-block__big">${total.toLocaleString('fr-FR')} <span class="ind-block__unit">POIs analyses</span></span>
                </div>
                ${pBar('Site web', webPct, 100, '#34d399', '%')}
                ${pBar('Reseaux sociaux', socPct, 100, '#ec4899', '%')}
                ${pBar('Wikivoyage', wikiPct, 100, '#fbbf24', '%')}
                <div class="ind-row__head" style="margin-top:4px;opacity:0.6;">
                    <span class="ind-row__label">${websiteCount + socialMediaCount + wikivoyageCount} POIs avec au moins 1 presence</span>
                </div>
            </div>`;

        // ── Collapsible Section Helper ────────────────────────────────────
        const buildCollapsibleSection = (title, contentHtml, sectionId, defaultOpen = true) => {
            return `
                <div class="macro-section">
                    <button class="macro-section-toggle" data-section="${sectionId}">
                        <span>${title}</span>
                        <span class="macro-section-chevron" ${defaultOpen ? 'style="transform:rotate(180deg)"' : ''}>▾</span>
                    </button>
                    <div class="macro-section-body" id="${sectionId}" ${defaultOpen ? '' : 'style="display:none"'}>
                        ${contentHtml}
                    </div>
                </div>`;
        };

        // ── Densité Heatmap ────────────────────────────────────────────────
        let densityHtml = '';
        if (areaKm2 > 0) {
            const accomDensity = accommodationCount / areaKm2;
            const pedDensity = pedestrianTrailCount / areaKm2;
            const cycleDensity = cyclingTrailCount / areaKm2;
            const maxDensity = Math.max(accomDensity, pedDensity, cycleDensity, 0.1);

            const densityBar = (label, value, color, colorRgb) => {
                const pct = Math.min((value / maxDensity) * 100, 100);
                const formatted = value < 0.01 ? value.toExponential(1) : value.toFixed(2);
                return `
                    <div class="density-bar">
                        <div class="density-bar__header">
                            <span class="density-bar__label">${label}</span>
                            <span class="density-bar__value" style="color:${color};">${formatted} <span class="density-bar__unit">/ km²</span></span>
                        </div>
                        <div class="density-bar__track">
                            <div class="density-bar__fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(${colorRgb},0.4),rgba(${colorRgb},1));"></div>
                        </div>
                    </div>`;
            };

            densityHtml = `
                <div id="density-heatmap-panel" class="density-panel">
                    <div class="density-panel__title">
                        <span>Densite par km²</span>
                        <span class="density-bar__unit">Surface : ${areaKm2.toFixed(1)} km²</span>
                    </div>
                    ${densityBar('Hebergements', accomDensity, '#a78bfa', '167,139,250')}
                    ${densityBar('Sentiers pietons', pedDensity, '#34d399', '5,150,105')}
                    ${densityBar('Pistes cyclables', cycleDensity, '#60a5fa', '59,130,246')}
                    <div class="heatmap-toggles">
                        <div class="heatmap-toggles__title">Heatmap sur la carte</div>
                        <div class="heatmap-toggles__row">
                            <label class="heatmap-toggle-label">
                                <input type="checkbox" class="heatmap-toggle" data-heat="accommodation" style="accent-color:#a78bfa;">
                                <span class="heatmap-dot" style="background:#a78bfa;"></span> Héberg.
                            </label>
                            <label class="heatmap-toggle-label">
                                <input type="checkbox" class="heatmap-toggle" data-heat="pedestrian" style="accent-color:#34d399;">
                                <span class="heatmap-dot" style="background:#34d399;"></span> Piétons
                            </label>
                            <label class="heatmap-toggle-label">
                                <input type="checkbox" class="heatmap-toggle" data-heat="cycling" style="accent-color:#60a5fa;">
                                <span class="heatmap-dot" style="background:#60a5fa;"></span> Vélo
                            </label>
                        </div>
                    </div>
                </div>`;
        }

        // ── Helper: infra KPI block (réutilisé dans les 2 branches) ──────
        const transportTotal = busStopCount + trainStationCount + airportCount;
        const servicesTotal = parkingCount + sanitaryCount + chargingCount;

        const buildInfraKpis = () => {
            const maxTransport = Math.max(busStopCount, trainStationCount, airportCount, 1);
            const maxServices = Math.max(parkingCount, sanitaryCount, chargingCount, 1);

            let html = `
                <div class="ind-block" style="margin-bottom:6px;">
                    <div class="ind-block__header">
                        <span class="ind-block__title">Transports</span>
                        <span class="ind-block__big">${transportTotal.toLocaleString('fr-FR')} <span class="ind-block__unit">points d'acces</span></span>
                    </div>
                    ${pBar('Arrets de bus', busStopCount, maxTransport, '#fbbf24')}
                    ${pBar('Gares', trainStationCount, maxTransport, '#8b5cf6')}
                    ${pBar('Aeroports', airportCount, maxTransport, '#0ea5e9')}
                </div>
                <div class="ind-block" style="margin-bottom:6px;">
                    <div class="ind-block__header">
                        <span class="ind-block__title">Services & equipements</span>
                        <span class="ind-block__big">${servicesTotal.toLocaleString('fr-FR')} <span class="ind-block__unit">installations</span></span>
                    </div>
                    ${pBar('Stationnements', parkingCount, maxServices, '#64748b')}
                    ${pBar('Sanitaires', sanitaryCount, maxServices, '#06b6d4')}
                    ${pBar('Bornes recharge', chargingCount, maxServices, '#22c55e')}
                </div>`;
            return html;
        };

        // Si aucun POI après filtrage
        if (total === 0) {
            const areaHtml = areaKm2 > 0 ? `<div class="ind-block" style="margin-bottom:6px;"><div class="ind-block__header"><span class="ind-block__title">Superficie</span><span class="ind-block__big">${areaKm2.toFixed(2)} <span class="ind-block__unit">km²</span></span></div></div>` : '';
            const section1Html = areaHtml + demoHtml + densityHtml;
            const infraKpisHtml = buildInfraKpis() + '<div id="section-infra-content"></div>';
            const countLabel = totalRaw > 0
                ? `${totalRaw.toLocaleString('fr-FR')} POI${totalRaw > 1 ? 's' : ''} trouvé${totalRaw > 1 ? 's' : ''}`
                : 'POIs disponibles';
            this.macroStats.innerHTML =
                buildCollapsibleSection('Informations generales', section1Html, 'section-info', true) +
                buildCollapsibleSection('Infrastructure & activites', infraKpisHtml, 'section-infra', true) +
                buildCollapsibleSection('Tourisme', section3Html, 'section-tourisme', true) +
                buildCollapsibleSection('Marketing digital', section4Html, 'section-marketing', true) +
                `<div class="stat-item empty">
                    <span style="font-size:1.5rem;"></span>
                    <div class="kpi-label" style="margin-top:6px;font-size:0.82rem;font-weight:600;color:var(--color-text);">${countLabel} — aucun affiché</div>
                    <div class="kpi-sub">Activez une catégorie dans les filtres.</div>
                </div>`;
            this._bindCollapsibleSections();
            this._bindHeatmapToggles();
            this.lastPois = pois; // SYNC: Even if empty, update lastPois reference
            if (totalRaw > 0) {
                this.showToast(`${countLabel} — activez les filtres pour les afficher`, 'info', 5000);
            }
            return;
        }

        const rootId = 'All';
        const labels = ['Total'];
        const parents = [''];
        const ids = [rootId];
        const values = [total];
        const colors = ['rgba(255,255,255,0.08)'];

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
        Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).forEach(([catId, categoryCount]) => {
            const catDef = this.categories.find(c => c.id === catId);
            const label = catDef ? catDef.label : catId;
            const color = this.getCategoryColor(catId);

            ids.push(catId);
            labels.push(`${this.getCategoryEmoji(catId)} ${label}`);
            parents.push(rootId);
            values.push(categoryCount);
            colors.push(color);
        });

        // Ajout des types (Enfants/Feuilles) avec effet de dégradé
        Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([typeKey, count]) => {
            const [catId, typeName] = typeKey.split('__');
            const label = this.translateType(typeName);
            const baseColor = this.getCategoryColor(catId);

            ids.push(typeKey);
            labels.push(label);
            parents.push(catId);
            values.push(count);

            // MODIFICATION ICI : Éclaircissement (+35) pour simuler le dégradé de l'image
            colors.push(this.adjustColor(baseColor, 24));
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
            margin: { t: 6, l: 0, r: 0, b: 0 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: "Outfit, sans-serif", color: "#ffffff", size: 12 },
            hoverlabel: {
                bgcolor: 'rgba(5,10,18,0.92)',
                bordercolor: 'rgba(255,255,255,0.14)',
                font: { family: 'Outfit, sans-serif', color: '#ffffff', size: 12 }
            }
        };

        const config = { responsive: true, displayModeBar: false };
        const mainTreemapData = buildTreemapTrace({ ids, labels, parents, values, colors }, 'POI');

        // ── Assemble the 4 sections ────────────────────────────────────────
        const areaHtml = areaKm2 > 0 ? `<div class="ind-block" style="margin-bottom:6px;"><div class="ind-block__header"><span class="ind-block__title">Superficie</span><span class="ind-block__big">${areaKm2.toFixed(2)} <span class="ind-block__unit">km²</span></span></div></div>` : '';
        const section1Html = areaHtml + demoHtml + densityHtml;
        const infraKpisHtml = buildInfraKpis() + `<div id="section-infra-content"></div>`;
        this.macroStats.innerHTML =
            buildCollapsibleSection('Informations generales', section1Html, 'section-info', true) +
            buildCollapsibleSection('Infrastructure & activites', infraKpisHtml, 'section-infra', true) +
            buildCollapsibleSection('Tourisme', section3Html, 'section-tourisme', true) +
            buildCollapsibleSection('Marketing digital', section4Html, 'section-marketing', true);

        this._bindCollapsibleSections();
        this._bindHeatmapToggles();

        this.macroStats.style.height = 'auto'; // Let it grow

        // ── Section 2: Infrastructures & activités (injected via DOM) ──────
        const infraContainer = document.getElementById('section-infra-content');

        // Header for Chart + Maximize Button
        const chartHeader = document.createElement('div');
        chartHeader.className = 'mini-treemap-header';

        const chartTitle = document.createElement('span');
        chartTitle.className = 'mini-treemap-title';
        chartTitle.textContent = 'Répartition';

        const chartTitleGroup = document.createElement('div');
        chartTitleGroup.className = 'mini-treemap-title-group';
        chartTitle.textContent = 'Repartition des POI';

        const chartMeta = document.createElement('span');
        chartMeta.className = 'mini-treemap-meta';
        chartMeta.textContent = `${Object.keys(categoryCounts).length} categories`;

        const maxBtn = document.createElement('button');
        maxBtn.className = 'maximize-btn';
        maxBtn.innerHTML = '⤢ Agrandir';
        maxBtn.title = 'Voir en plein écran';
        maxBtn.addEventListener('click', () => {
            this._toggleFullScreenChart(mainTreemapData, layout);
        });

        chartTitleGroup.appendChild(chartTitle);
        chartTitleGroup.appendChild(chartMeta);
        chartHeader.appendChild(chartTitleGroup);
        chartHeader.appendChild(maxBtn);
        infraContainer.appendChild(chartHeader);

        const chartDiv = document.createElement('div');
        chartDiv.style.height = '300px';
        chartDiv.id = 'mini-chart-div';
        chartDiv.className = 'mini-chart-canvas mini-chart-canvas--lg';
        infraContainer.appendChild(chartDiv);

        Plotly.newPlot(chartDiv, mainTreemapData, layout, config);
        this.lastPois = pois;

        // ── 3 MINI TREEMAPS ────────────────────────────────────────────────
        const miniLayout = {
            margin: { t: 6, l: 0, r: 0, b: 0 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: "Outfit, sans-serif", color: "#ffffff", size: 11 },
            hoverlabel: {
                bgcolor: 'rgba(5,10,18,0.92)',
                bordercolor: 'rgba(255,255,255,0.14)',
                font: { family: 'Outfit, sans-serif', color: '#ffffff', size: 11 }
            }
        };
        const miniConfig = { responsive: true, displayModeBar: false };

        const addMiniTreemap = (titleText, treemapData, metaText = '') => {
            if (!treemapData || treemapData.values.length <= 1) return;

            const section = document.createElement('div');
            section.className = 'mini-treemap-section';

            const headerRow = document.createElement('div');
            headerRow.className = 'mini-treemap-header';

            const headerGroup = document.createElement('div');
            headerGroup.className = 'mini-treemap-title-group';

            const header = document.createElement('span');
            header.className = 'mini-treemap-title';
            header.textContent = titleText;
            headerGroup.appendChild(header);

            if (metaText) {
                const meta = document.createElement('span');
                meta.className = 'mini-treemap-meta';
                meta.textContent = metaText;
                headerGroup.appendChild(meta);
            }

            const miniDiv = document.createElement('div');
            miniDiv.style.height = '200px';
            miniDiv.className = 'mini-chart-canvas';

            const plotData = buildTreemapTrace(treemapData);

            const maxBtn = document.createElement('button');
            maxBtn.className = 'maximize-btn';
            maxBtn.innerHTML = '⤢ Agrandir';
            maxBtn.title = 'Voir en plein écran';
            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(plotData, miniLayout));
            headerRow.appendChild(headerGroup);
            headerRow.appendChild(maxBtn);

            section.appendChild(headerRow);
            section.appendChild(miniDiv);
            infraContainer.appendChild(section);

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
                ids: ['AccomRoot'], labels: ['Hebergements'], parents: [''], values: [totalAccom],
                colors: ['rgba(167,139,250,0.25)']
            };
            const baseColors = ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#ddd6fe', '#ede9fe', '#e9d5ff', '#d8b4fe', '#b794f4', '#9f7aea', '#805ad5'];
            let ci = 0;
            Object.entries(accomCounts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
                accomTreemap.ids.push(key);
                accomTreemap.labels.push(accomTags[key]);
                accomTreemap.parents.push('AccomRoot');
                accomTreemap.values.push(count);
                accomTreemap.colors.push(baseColors[ci % baseColors.length]);
                ci++;
            });
            addMiniTreemap('Hebergements par type', accomTreemap, `${Object.keys(accomCounts).length} types`);
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
                ids: ['SacRoot'], labels: ['Sentiers pietons'], parents: [''], values: [totalSac],
                colors: ['rgba(52,211,153,0.25)']
            };
            const sacColors = { 'hiking': '#facc15', 'mountain_hiking': '#ef4444', 'demanding_mountain_hiking': '#dc2626', 'alpine_hiking': '#1e1e1e', 'demanding_alpine_hiking': '#000000' };
            Object.entries(sacCounts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
                sacTreemap.ids.push(key);
                sacTreemap.labels.push(sacLabels[key]);
                sacTreemap.parents.push('SacRoot');
                sacTreemap.values.push(count);
                sacTreemap.colors.push(sacColors[key] || '#6ee7b7');
            });
            addMiniTreemap('Sentiers pietons par difficulte', sacTreemap, `${Object.keys(sacCounts).length} niveaux`);
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
                ids: ['CycleRoot'], labels: ['Offre cyclable'], parents: [''], values: [totalCycle],
                colors: ['rgba(96,165,250,0.25)']
            };
            const cycleColors = { 'bicycle_routes': '#f97316', 'cycleways': '#3b82f6', 'tracks': '#854d0e' };
            Object.entries(cycleCounts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
                cycleTreemap.ids.push(key);
                cycleTreemap.labels.push(cycleCats[key]);
                cycleTreemap.parents.push('CycleRoot');
                cycleTreemap.values.push(count);
                cycleTreemap.colors.push(cycleColors[key] || '#93c5fd');
            });
            addMiniTreemap('Chemins velo par type', cycleTreemap, `${Object.keys(cycleCounts).length} segments`);
        }

        // ── SLOPE CHART : Ratio Sentiers Piétons vs Vélo ──────────────────
        const totalTrails = pedestrianTrailCount + cyclingTrailCount;
        if (false && totalTrails > 0) {
            const slopeSection = document.createElement('div');
            slopeSection.className = 'mini-treemap-section';

            const slopeHeaderRow = document.createElement('div');
            slopeHeaderRow.className = 'mini-treemap-header';

            const slopeHeader = document.createElement('span');
            slopeHeader.className = 'mini-treemap-title';
            slopeHeader.textContent = 'Randonnee vs Cyclisme';
            slopeHeaderRow.appendChild(slopeHeader);

            const slopeDiv = document.createElement('div');
            slopeDiv.style.height = '180px';

            // Slope line color based on dominant side
            let slopeColor;
            if (pedestrianTrailCount > cyclingTrailCount) slopeColor = '#34d399';
            else if (cyclingTrailCount > pedestrianTrailCount) slopeColor = '#60a5fa';
            else slopeColor = '#fbbf24';

            const slopeData = [
                // The connecting line
                {
                    x: ['Randonnee', 'Cyclisme'],
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
                    autorange: 'reversed',
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
            infraContainer.appendChild(slopeSection);

            Plotly.newPlot(slopeDiv, slopeData, slopeLayout, miniConfig);
        }

        const offerMetrics = [
            { label: 'Sentiers pietons', raw: pedestrianTrailCount, color: '#34d399' },
            { label: 'Offre cyclable', raw: cyclingTrailCount, color: '#60a5fa' },
            { label: 'Hebergements', raw: accommodationCount, color: '#a78bfa' },
            { label: 'Acces transport', raw: transportTotal, color: '#fbbf24' },
            { label: 'Services visiteurs', raw: servicesTotal, color: '#06b6d4' }
        ]
            .filter(item => item.raw > 0)
            .map(item => ({
                ...item,
                metric: areaKm2 > 0 ? (item.raw / areaKm2) : item.raw
            }))
            .sort((a, b) => b.metric - a.metric);

        if (offerMetrics.length > 1) {
            const offerSection = document.createElement('div');
            offerSection.className = 'mini-treemap-section';

            const offerHeaderRow = document.createElement('div');
            offerHeaderRow.className = 'mini-treemap-header';

            const offerHeaderGroup = document.createElement('div');
            offerHeaderGroup.className = 'mini-treemap-title-group';

            const offerHeader = document.createElement('span');
            offerHeader.className = 'mini-treemap-title';
            offerHeader.textContent = areaKm2 > 0 ? 'Intensite de l offre' : 'Volume de l offre';
            offerHeaderGroup.appendChild(offerHeader);

            const offerMeta = document.createElement('span');
            offerMeta.className = 'mini-treemap-meta';
            offerMeta.textContent = areaKm2 > 0 ? 'normalise par km2' : 'comparaison brute';
            offerHeaderGroup.appendChild(offerMeta);

            const offerDiv = document.createElement('div');
            offerDiv.style.height = '220px';
            offerDiv.className = 'mini-chart-canvas';

            const offerData = [{
                type: 'bar',
                orientation: 'h',
                x: offerMetrics.map(item => item.metric),
                y: offerMetrics.map(item => item.label),
                marker: {
                    color: offerMetrics.map(item => item.color),
                    line: { color: 'rgba(255,255,255,0.18)', width: 1.2 }
                },
                text: offerMetrics.map(item => areaKm2 > 0
                    ? `${formatChartMetric(item.metric)}/km2`
                    : item.raw.toLocaleString('fr-FR')),
                textposition: 'outside',
                cliponaxis: false,
                hovertemplate: areaKm2 > 0
                    ? '<b>%{y}</b><br>%{x:.2f} / km2<br>%{customdata[0]} elements recenses<extra></extra>'
                    : '<b>%{y}</b><br>%{x} elements recenses<extra></extra>',
                customdata: offerMetrics.map(item => [item.raw.toLocaleString('fr-FR')])
            }];

            const offerLayout = {
                margin: { t: 6, l: 108, r: 34, b: 28 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { family: 'Outfit, sans-serif', color: '#fff', size: 11 },
                xaxis: {
                    showgrid: true,
                    gridcolor: 'rgba(255,255,255,0.08)',
                    zeroline: false,
                    tickfont: { size: 10, color: 'rgba(255,255,255,0.55)' },
                    title: areaKm2 > 0
                        ? { text: 'elements / km2', font: { size: 10, color: 'rgba(255,255,255,0.5)' } }
                        : undefined
                },
                yaxis: {
                    automargin: true,
                    autorange: 'reversed',
                    tickfont: { size: 11, color: '#fff' }
                },
                bargap: 0.28,
                showlegend: false,
                hoverlabel: {
                    bgcolor: 'rgba(5,10,18,0.92)',
                    bordercolor: 'rgba(255,255,255,0.14)',
                    font: { family: 'Outfit, sans-serif', color: '#ffffff', size: 11 }
                }
            };

            const offerMaxBtn = document.createElement('button');
            offerMaxBtn.className = 'maximize-btn';
            offerMaxBtn.innerHTML = '⤢ Agrandir';
            offerMaxBtn.title = 'Voir en plein écran';
            offerMaxBtn.addEventListener('click', () => this._toggleFullScreenChart(offerData, offerLayout));
            offerHeaderRow.appendChild(offerHeaderGroup);
            offerHeaderRow.appendChild(offerMaxBtn);

            const offerCaption = document.createElement('div');
            offerCaption.className = 'mini-chart-caption';
            offerCaption.textContent = areaKm2 > 0
                ? 'Lecture normalisee pour comparer des zones de tailles differentes.'
                : 'Comparaison directe des volumes recenses dans la zone active.';

            offerSection.appendChild(offerHeaderRow);
            offerSection.appendChild(offerDiv);
            offerSection.appendChild(offerCaption);
            infraContainer.appendChild(offerSection);

            Plotly.newPlot(offerDiv, offerData, offerLayout, miniConfig);
        }
    }

    /** Bind collapsible section toggles */
    _bindCollapsibleSections() {
        document.querySelectorAll('.macro-section-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const sectionId = btn.dataset.section;
                const body = document.getElementById(sectionId);
                const chevron = btn.querySelector('.macro-section-chevron');
                if (!body) return;
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                if (chevron) {
                    chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
                }
            });
        });
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

        this.lastPois = pois; // SYNC: Update the source of truth for the list

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
                    <div class="poi-section__title">Informations</div>
                    <div class="detail-info" id="poi-osm-block">
                        ${this._buildOsmRows(poi, color)}
                    </div>
                </div>

                <!-- Digital Data Block -->
                <div class="poi-section">
                    <div class="poi-section__title">Données Digitales</div>
                    <div class="detail-info" id="poi-digital-block">
                        ${this._buildDigitalRows(poi, color)}
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

                <!-- Source Links -->
                <div style="margin-top:16px;text-align:center;display:flex;justify-content:center;gap:15px;">
                    <a href="https://www.openstreetmap.org/node/${poi.id}" target="_blank"
                       style="font-size:0.75rem;color:var(--color-text-muted);text-decoration:none;opacity:0.7;">
                       Voir sur OpenStreetMap
                    </a>
                    <span id="poi-wikipedia-bottom-link-container">
                        ${this._getWikipediaUrl(poi.tags) ? `
                            <a href="${this._getWikipediaUrl(poi.tags)}" target="_blank"
                               style="font-size:0.75rem;color:var(--color-text-muted);text-decoration:none;opacity:0.7;">
                               Voir sur Wikipédia
                            </a>
                        ` : ''}
                    </span>
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

        // Fetch Wikidata only (no geographic image search)
        (poi.tags.wikidata ? this.apiService.fetchWikidata(poi.tags.wikidata) : Promise.resolve(null))
            .then((wikidataInfo) => {

                // Only show images if Wikidata provides one
                let images = [];
                if (wikidataInfo?.image) {
                    images = [{ url: wikidataInfo.image, thumbUrl: wikidataInfo.image, title: poi.name }];
                }

                this._renderGallery(images, poi.name);

                // ── Header links ─────────────────────────────────────────────────
                const linksContainer = document.getElementById('detail-header-links');
                if (linksContainer) {
                    const website = poi.tags.website || poi.tags['contact:website'] || poi.tags.url || wikidataInfo?.website;
                    if (website) {
                        linksContainer.insertAdjacentHTML('beforeend',
                            `<a href="${website}" target="_blank" class="icon-btn" title="Site Web">Site web</a>`);
                    }
                    if (wikidataInfo?.wikipedia) {
                        linksContainer.insertAdjacentHTML('beforeend',
                            `<a href="${wikidataInfo.wikipedia}" target="_blank" class="icon-btn" title="Article Wikipédia">Wikipédia</a>`);

                        // Update bottom link if it was missing or different
                        const bottomContainer = document.getElementById('poi-wikipedia-bottom-link-container');
                        if (bottomContainer) {
                            bottomContainer.innerHTML = `
                                <a href="${wikidataInfo.wikipedia}" target="_blank"
                                   style="font-size:0.75rem;color:var(--color-text-muted);text-decoration:none;opacity:0.7;">
                                   Voir sur Wikipédia
                                </a>`;
                        }
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
                        rows.push(this._infoRow('Population', wikidataInfo.population.toLocaleString('fr-FR') + ' hab.'));
                    if (wikidataInfo.elevation != null)
                        rows.push(this._infoRow('Altitude', wikidataInfo.elevation + ' m'));
                    if (wikidataInfo.area != null)
                        rows.push(this._infoRow('Superficie', wikidataInfo.area.toLocaleString('fr-FR') + ' km²'));
                    if (wikidataInfo.inception)
                        rows.push(this._infoRow('Fondé en', wikidataInfo.inception));
                    if (wikidataInfo.heritage)
                        rows.push(this._infoRow('Classement', wikidataInfo.heritage));
                    if (wikidataInfo.architect)
                        rows.push(this._infoRow('Architecte', wikidataInfo.architect));

                    if (rows.length > 0) {
                        const section = document.getElementById('poi-wikidata-section');
                        const block = document.getElementById('poi-wikidata-block');
                        if (section && block) {
                            block.innerHTML = rows.join('');
                            section.style.display = '';
                        }
                    }
                }

                // --- Mise à jour du bloc des Données Digitales ---
                if (poi.digital) {
                    if (wikidataInfo) {
                        poi.digital.wikidataLanguagesCount = wikidataInfo.wikidataLanguagesCount || 0;
                        if (wikidataInfo.wikidataHasWikivoyage) {
                            poi.digital.hasWikivoyage = true;
                        }
                    } else {
                        poi.digital.wikidataLanguagesCount = 0;
                    }
                    const digitalBlock = document.getElementById('poi-digital-block');
                    if (digitalBlock) {
                        digitalBlock.innerHTML = this._buildDigitalRows(poi, color);
                    }
                }
            }).catch(err => {
                console.warn('POI enrichment error:', err);
                if (poi.digital) {
                    poi.digital.wikidataLanguagesCount = 0;
                    const digitalBlock = document.getElementById('poi-digital-block');
                    if (digitalBlock) {
                        digitalBlock.innerHTML = this._buildDigitalRows(poi, color);
                    }
                }
            });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _buildDigitalRows(poi, color) {
        const d = poi.digital || {};
        const rows = [];

        const yesLabel = `<span style="color:#10b981;font-weight:bold;">Oui</span>`;
        const noLabel = `<span style="color:var(--color-text-muted);opacity:0.8;">Non</span>`;

        rows.push(this._infoRow('Site Web', d.hasWebsite ? yesLabel : noLabel));
        rows.push(this._infoRow('Réseaux Sociaux', d.hasSocialMedia ? yesLabel : noLabel));
        rows.push(this._infoRow('Wikivoyage', d.hasWikivoyage ? yesLabel : noLabel));

        let langLabel = '';
        if (d.wikidataLanguagesCount === null || d.wikidataLanguagesCount === undefined) {
            if (poi.tags.wikidata) {
                langLabel = `<span style="color:var(--color-text-muted);font-style:italic;">Chargement...</span>`;
            } else {
                langLabel = noLabel;
            }
        } else if (d.wikidataLanguagesCount === 0) {
            langLabel = noLabel;
        } else {
            langLabel = `<span style="color:${color};font-weight:bold;">${d.wikidataLanguagesCount} langue(s)</span>`;
        }

        rows.push(this._infoRow('Langues', langLabel));

        return rows.join('');
    }

    /** Build all OSM info rows from poi.tags */
    _buildOsmRows(poi, color) {
        const t = poi.tags;
        const rows = [];

        const address = this.formatAddress(t);
        if (address) rows.push(this._infoRow('Adresse', address));

        const phone = t.phone || t['contact:phone'];
        if (phone) rows.push(this._infoRow('Téléphone',
            `<a href="tel:${phone}" style="color:${color}">${phone}</a>`));

        const email = t.email || t['contact:email'];
        if (email) rows.push(this._infoRow('Email',
            `<a href="mailto:${email}" style="color:${color}">${email}</a>`));

        if (t.opening_hours) rows.push(this._infoRow('Horaires', this._renderOpeningHours(t.opening_hours)));

        const website = t.website || t['contact:website'] || t.url;
        if (website) rows.push(this._infoRow('Site Web',
            `<a href="${website}" target="_blank" style="color:${color}">Ouvrir ↗</a>`));

        if (t.cuisine) rows.push(this._infoRow('Cuisine', t.cuisine.replace(/_/g, ' ')));
        if (t.stars) rows.push(this._infoRow('Étoiles', t.stars));
        if (t.operator) rows.push(this._infoRow('Opérateur', t.operator));
        if (t.brand) rows.push(this._infoRow('Enseigne', t.brand));
        if (t.ele) rows.push(this._infoRow('Altitude', t.ele + ' m'));
        if (t.capacity) rows.push(this._infoRow('Capacité', t.capacity + ' pers.'));
        if (t.start_date) rows.push(this._infoRow('Création', t.start_date));
        if (t.fee) rows.push(this._infoRow('Tarif', t.fee === 'yes' ? 'Payant' : t.fee === 'no' ? 'Gratuit' : t.fee));
        if (t.access) rows.push(this._infoRow('Accès', t.access));
        if (t.wheelchair) rows.push(this._infoRow('Accessibilité',
            t.wheelchair === 'yes' ? 'Accessible PMR' :
                t.wheelchair === 'limited' ? 'Accès limité' : 'Non accessible'));
        if (t.description) rows.push(this._infoRow('Description', t.description));
        if (t.wikipedia && !t.wikidata) {
            const wikiTitle = t.wikipedia.replace(/^fr:/, '');
            rows.push(this._infoRow('Wikipédia',
                `<a href="https://fr.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}" target="_blank" style="color:${color}">Voir l'article ↗</a>`));
        }

        rows.push(this._infoRow('Coordonnées',
            `${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}`));

        return rows.join('') || '<p style="color:var(--color-text-muted);font-size:0.85rem;">Aucune donnée OSM disponible.</p>';
    }

    /** Generates a WP URL from OSM tags if existing */
    _getWikipediaUrl(tags) {
        if (!tags || !tags.wikipedia) return null;
        const parts = tags.wikipedia.split(':');
        if (parts.length < 2) return null;
        const lang = parts[0];
        const title = parts.slice(1).join(':').replace(/ /g, '_');
        return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
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
        this.syncOverpassServerSelect(apiService?.overpassUrl);
    }

    syncOverpassServerSelect(url, { notify = false, previousUrl = null } = {}) {
        const serverSelect = document.getElementById('overpass-server-select');
        if (!serverSelect || !url) return;

        if (serverSelect.value !== url) {
            serverSelect.value = url;
        }

        if (notify) {
            const nextLabel = serverSelect.selectedOptions?.[0]?.textContent?.trim() || url;
            const previousOption = previousUrl
                ? Array.from(serverSelect.options).find(option => option.value === previousUrl)
                : null;
            const previousLabel = previousOption?.textContent?.trim() || previousUrl || 'ancien serveur';
            this.showToast(`Serveur Overpass bascule vers ${nextLabel} apres echec de ${previousLabel}.`, 'warning', 5000);
        }
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
                (p.type && p.type.toLowerCase().includes(searchQuery))
            );
        }

        this.renderMicroList(filtered);
    }
    getCategoryEmoji(category) {
        return "";
        // const emojis = {
        //     'tourism': '📷', 'sustenance': '🍴', 'accommodation': '🛏️', 'amenity': '🚻',
        //     'natural': '🌳', 'historic': '🏛️', 'leisure': '🎡', 'shop': '🛒',
        //     'transport': '🚌', 'craft': '🎨', 'office': '💼',
        //     'place': '📍', 'sport': '⚽', 'healthcare': '⚕️',
        //     'other': '❓'
        // };
        // return emojis[category] || emojis['other'];
    }

    translateType(type) {
        const translations = {
            'peak': 'Sommet', 'saddle': 'Col', 'volcano': 'Volcan', 'spring': 'Source',
            'cave_entrance': 'Entrée de grotte', 'tree': 'Arbre', 'rock': 'Rocher',
            'cliff': 'Falaise', 'ridge': 'Crête', 'arete': 'Arête', 'mountain_pass': 'Col de montagne',
            'water': 'Plan d\'eau', 'lake': 'Lac', 'pond': 'Étang', 'reservoir': 'Retenue d\'eau',
            'waterfall': 'Cascade', 'dam': 'Barrage',
            'wetland': 'Zone humide', 'glacier': 'Glacier', 'scree': 'Éboulis',
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
            'craft': '#e879f9', 'office': '#64748b',
            'place': '#facc15', 'sport': '#14b8a6',
            'healthcare': '#f43f5e', 'other': '#94a3b8'
        };
        return colors[category] || colors['other'];
    }

    _initFullScreenOverlay() {
        if (document.getElementById('fullscreen-chart-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'fullscreen-chart-overlay';
        overlay.innerHTML = `
            <div class="header">
                 <div class="title">Vue détaillé</div>
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

    /**
     * Affiche une notification toast temporaire en bas de l'écran.
     * @param {string} message - Texte à afficher
     * @param {'info'|'success'|'warning'|'error'} type - Style de la notification
     * @param {number} duration - Durée en ms (défaut 4000)
     */
    showToast(message, type = 'info', duration = 4000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 99999;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const colors = {
            info: { bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.5)', text: '#93c5fd' },
            success: { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.5)', text: '#6ee7b7' },
            warning: { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.5)', text: '#fcd34d' },
            error: { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.5)', text: '#fca5a5' },
        };
        const c = colors[type] || colors.info;

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: ${c.bg};
            border: 1px solid ${c.border};
            color: ${c.text};
            padding: 12px 22px;
            border-radius: 12px;
            font-size: 0.88rem;
            font-weight: 500;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 4px 24px rgba(0,0,0,0.35);
            pointer-events: auto;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            transform: translateY(10px);
            max-width: 440px;
            text-align: center;
            cursor: pointer;
            white-space: nowrap;
        `;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        const fadeOut = () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        };

        toast.addEventListener('click', fadeOut);
        setTimeout(fadeOut, duration);
    }
}

