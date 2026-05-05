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

        // Dashboard panel references
        this.dashboardPanel = document.getElementById('dashboard-panel');
        this.dashboardGrid = document.getElementById('dashboard-grid');
        this._dashboardWikivoyageCount = 0;
        this._dashboardPageviewsTotal = 0;
        this._dashboardPageviewsPois = 0;

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
        this.onBackToList = null;

        this.categories = [
            { id: 'tourism', label: 'Tourisme' },
            { id: 'sustenance', label: 'Restauration' },
            { id: 'accommodation', label: 'Hébergements' },
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
        this.currentSort = 'completeness_desc';
        this.groupByCategory = false;
        this.currentCatSpotlight = '';

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

    _calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    _getPathLength(geometry) {
        if (!geometry || geometry.length < 2) return 0;
        let length = 0;
        for (let i = 0; i < geometry.length - 1; i++) {
            const p1 = geometry[i];
            const p2 = geometry[i + 1];
            length += this._calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon);
        }
        return length;
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
                ${onRetry ? '<button class="load-error-block__retry-btn">Réessayer</button>' : ''}
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
                        resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Aucun pays trouvé.</p>';
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
                        resultsContainer.innerHTML = '<p class="empty-state" style="font-size: 0.85rem; color: var(--color-text-muted);">Aucune ville trouvée.</p>';
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
        const emptyMessage = options.emptyMessage || 'Aucun élément trouvé.';
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
        setupMinimize('minimize-dashboard-btn', 'dashboard-panel');
        setupMinimize('minimize-presets-btn', 'presets-panel');

        // --- "Voir les détails" BUTTON ---
        const detailsBtn = document.getElementById('dashboard-details-btn');
        if (detailsBtn) {
            detailsBtn.addEventListener('click', () => {
                // 1. Minimize dashboard
                const dashPanel = document.getElementById('dashboard-panel');
                const dashMinBtn = document.getElementById('minimize-dashboard-btn');
                if (dashPanel && !dashPanel.classList.contains('minimized')) {
                    dashPanel.classList.add('minimized');
                    if (dashMinBtn) dashMinBtn.textContent = '+';
                }

                // 2. Expand macro overlay
                const macroPanel = document.getElementById('macro-overlay');
                const macroMinBtn = document.getElementById('minimize-macro-btn');
                if (macroPanel && macroPanel.classList.contains('minimized')) {
                    macroPanel.classList.remove('minimized');
                    if (macroMinBtn) macroMinBtn.textContent = '−';
                }

                // 3. Show micro sidebar
                if (this.microSidebar) {
                    this.microSidebar.classList.add('visible');
                    this.microSidebar.classList.remove('minimized');
                    if (this.closeMicroBtn) {
                        this.closeMicroBtn.textContent = '−';
                        this.closeMicroBtn.title = 'Réduire';
                    }
                }
            });
        }

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
                const isMinimized = this.microSidebar.classList.toggle('minimized');
                this.closeMicroBtn.textContent = isMinimized ? '+' : '−';
                this.closeMicroBtn.title = isMinimized ? 'Agrandir' : 'Réduire';
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

        const sortSelect = document.getElementById('poi-sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.filterList();
            });
        }

        const catSpotlightSelect = document.getElementById('poi-cat-spotlight');
        if (catSpotlightSelect) {
            catSpotlightSelect.addEventListener('change', (e) => {
                this.currentCatSpotlight = e.target.value;
                this.filterList();
            });
        }

        const groupByCatCheckbox = document.getElementById('poi-group-by-cat');
        if (groupByCatCheckbox) {
            groupByCatCheckbox.addEventListener('change', (e) => {
                this.groupByCategory = e.target.checked;
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
            { id: 'waterways', label: 'Voie d\'Eau', color: '#06b6d4' }
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

        // --- OVERTOURISM FILTERS INITIALIZATION ---
        this._initOvertourismFilters();

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

    updateOvertourismFilterButtonText() {
        const btn = document.getElementById('toggle-overtourism-filters-btn');
        const badge = document.getElementById('filter-badge-overtourism');
        const content = document.getElementById('overtourism-filters-content');
        if (!btn || !content) return;

        const checkedCount = content.querySelectorAll('input:checked').length;
        const total = 2; // Villes + POIs

        if (badge) {
            badge.textContent = `${checkedCount}/${total}`;
            badge.className = 'filter-badge ' + (
                checkedCount === total ? 'badge--all' :
                    checkedCount === 0 ? 'badge--none' : 'badge--partial'
            );
        }

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
                container.innerHTML = '<span style="font-size: 0.75rem; color: var(--color-text-muted); opacity: 0.6;">Aucun POIs</span>';
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
        if (show) {
            this.microSidebar.classList.add('visible');
            this.microSidebar.classList.remove('minimized');
            if (this.closeMicroBtn) {
                this.closeMicroBtn.textContent = '−';
                this.closeMicroBtn.title = 'Réduire';
            }
        }
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
        
        // Reset l'affichage de la sidebar micro par défaut (agrandie et visible)
        this.toggleMicroSidebar(true);
        
        // Reset le tri par défaut
        this.currentSort = 'completeness_desc';
        const sortSelect = document.getElementById('poi-sort-select');
        if (sortSelect) sortSelect.value = 'completeness_desc';
        
        // Reset le regroupement par catégorie par défaut
        this.groupByCategory = false;
        const groupToggle = document.getElementById('poi-group-by-cat');
        if (groupToggle) groupToggle.checked = false;

        // Reset dashboard panel to enlarged (not minimized)
        if (this.dashboardPanel) {
            this.dashboardPanel.style.display = 'none';
            this.dashboardPanel.classList.remove('minimized');
            const dashMinBtn = document.getElementById('minimize-dashboard-btn');
            if (dashMinBtn) dashMinBtn.textContent = '−';
        }

        // Reset macro overlay to reduced (minimized)
        const macroPanel = document.getElementById('macro-overlay');
        const macroMinBtn = document.getElementById('minimize-macro-btn');
        if (macroPanel) {
            macroPanel.classList.add('minimized');
            if (macroMinBtn) macroMinBtn.textContent = '+';
        }
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
                sparklineHtml = `
                    <div style="display:flex; flex-direction:column; align-items:flex-end;">
                        <button id="maximize-demo-btn" class="maximize-btn" style="margin-bottom:4px; font-size:0.65rem; padding:2px 6px;">⤢ Agrandir</button>
                        <div id="sparkline-container" style="width:100px;height:40px;margin-left:16px;"></div>
                    </div>`;
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

        const maxBtn = document.getElementById('maximize-demo-btn');
        if (maxBtn) {
            const fullLayout = {
                title: 'Évolution démographique locale',
                margin: { t: 50, b: 50, l: 60, r: 30 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { family: 'Outfit, sans-serif', color: '#fff', size: 14 },
                xaxis: { title: 'Année de recensement', gridcolor: 'rgba(255,255,255,0.08)', tickfont: { color: '#aaa' } },
                yaxis: { title: 'Nombre d\'habitants', gridcolor: 'rgba(255,255,255,0.08)', tickfont: { color: '#aaa' }, rangemode: 'tozero' },
                hovermode: 'x unified',
                hoverlabel: {
                    bgcolor: 'rgba(5,10,18,0.92)', bordercolor: 'rgba(255,255,255,0.14)', font: { family: 'Outfit, sans-serif', color: '#fff' }
                }
            };
            const fullData = [{
                x: xValues, y: yValues,
                type: 'scatter', mode: 'lines+markers+text',
                line: { color: lineColor, width: 4, shape: 'spline' },
                marker: { size: 9, color: '#fff', line: { color: lineColor, width: 2 } },
                fill: 'tozeroy', fillcolor: lineColor + '22',
                name: 'Population',
                text: yValues.map(v => v.toLocaleString('fr-FR')),
                textposition: 'top center',
                textfont: { color: 'rgba(255,255,255,0.7)', size: 11 }
            }];

            maxBtn.addEventListener('click', () => {
                this._toggleFullScreenChart(fullData, fullLayout);
            });
        }
    }
    renderMacroStats(pois, demoHtml = '', networks = [], areaKm2 = 0, totalRaw = 0, inseeStats = null, hierarchy = null, population = null, romaniaStats = null, whcCount = 0, naturaCount = 0, whcSites = [], naturaSites = []) {
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
        let digitalPresenceCount = 0;
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
                if (p.digital.hasWebsite || p.digital.hasSocialMedia) digitalPresenceCount++;
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
        let pedestrianTrailLength = 0;
        let cyclingTrailCount = 0;
        let cyclingTrailLength = 0;
        networks.forEach(net => {
            const t = net.type;
            const route = net.relationRoute;
            // Piéton = sentiers classiques + randonnée (hiking/foot/sac_scale)
            if (pedestrianTypes.has(t) || route === 'hiking' || route === 'foot' || (net.tags && net.tags.sac_scale)) {
                pedestrianTrailCount++;
                pedestrianTrailLength += this._getPathLength(net.geometry);
            } else if (cyclingTypes.has(t) || route === 'bicycle' || route === 'mtb') {
                cyclingTrailCount++;
                cyclingTrailLength += this._getPathLength(net.geometry);
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
            const starEntries = Object.entries(inseeStats.hotel_stars)
                .filter(([rank, value]) => value > 0 && rank !== 'NC')
                .sort(([a], [b]) => Number(b) - Number(a));

            let starsHtml = starEntries.length > 0
                ? `<div class="kpi-stars__title">Classement des hotels</div>${starEntries.map(([rank, count]) => {
                    const tierText = '★'.repeat(Number(rank));
                    const countText = `${count} hotel${count > 1 ? 's' : ''}`;
                    return `
                        <div class="kpi-star-badge kpi-star-badge--clickable" data-accom-filter="star-${rank}" title="Mettre en surbrillance sur la carte">
                            <span class="kpi-star-badge__tier">${tierText}</span>
                            <span class="kpi-star-badge__count">${countText}</span>
                        </div>`;
                }).join('')}`
                : '<span class="kpi-sub">Aucun classement</span>';

            // Comptage OSM pour compléter les données INSEE
            const osmHotelPOIs = pois.filter(p => ['hotel', 'hostel', 'motel', 'guest_house', 'bed_and_breakfast'].includes(p.type));
            const osmCampingPOIs = pois.filter(p => ['camp_site', 'caravan_site', 'camp_pitch'].includes(p.type));
            const osmCollectifPOIs = pois.filter(p => ['chalet', 'alpine_hut', 'wilderness_hut', 'shelter', 'apartment', 'holiday_flat'].includes(p.type));

            accommodationHtml = `
                <div class="ind-block ind-block--purple">
                    <div class="ind-block__header ind-block__header--clickable" data-accom-filter="all" title="Mettre tous les hébergements en surbrillance">
                        <span class="ind-block__title">INSEE 2026</span>
                        <span class="ind-block__big">${inseeStats.total_loc.toLocaleString('fr-FR')} <span class="ind-block__unit">hebergements</span></span>
                    </div>
                    ${pBar('Lits hotels', inseeStats.hotel_beds, maxBeds, '#c4b5fd', ' lits')}
                    ${pBar('Lits campings', inseeStats.camping_beds, maxBeds, '#a78bfa', ' lits')}
                    ${pBar('Lits dans héb. collectifs', inseeStats.collective_beds, maxBeds, '#8b5cf6', ' lits')}
                    
                    <div class="accom-detail-grid">
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="hotel" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">🏨</span><span class="accom-detail-label">Hôtels</span></div>
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="auberge" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">🏠</span><span class="accom-detail-label">Auberges</span></div>
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="camping" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">⛺</span><span class="accom-detail-label">Campings</span></div>
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="collectif" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">🏔️</span><span class="accom-detail-label">Héb. collect.</span></div>
                    </div>

                    <div class="ind-block__footer">
                        <span class="ind-block__total">${totalBeds.toLocaleString('fr-FR')} lits au total</span>
                        <div class="kpi-stars">${starsHtml}</div>
                    </div>
                </div>`;
        } else {
            // Pas de données INSEE — on compte directement depuis les POIs OSM
            const osmHotelTypes = new Set(['hotel', 'hostel', 'motel', 'guest_house', 'bed_and_breakfast', 'chalet', 'apartment', 'holiday_flat', 'alpine_hut', 'wilderness_hut']);
            const osmCampingTypes = new Set(['camp_site', 'caravan_site', 'camp_pitch']);
            let osmHotels = 0;
            let osmCampings = 0;
            pois.forEach(p => {
                if (osmHotelTypes.has(p.type)) osmHotels++;
                else if (osmCampingTypes.has(p.type)) osmCampings++;
            });
            const osmTotal = osmHotels + osmCampings;
            const osmMax = Math.max(osmHotels, osmCampings, 1);

            // Détail fin par type
            const osmHotelCount = pois.filter(p => p.type === 'hotel').length;
            const osmHostelCount = pois.filter(p => ['hostel', 'guest_house', 'bed_and_breakfast', 'motel'].includes(p.type)).length;
            const osmCampCount = pois.filter(p => p.type === 'camp_site').length;
            const osmCaravanCount = pois.filter(p => ['caravan_site', 'camp_pitch'].includes(p.type)).length;
            const osmCollectCount = pois.filter(p => ['chalet', 'alpine_hut', 'wilderness_hut', 'shelter', 'apartment', 'holiday_flat'].includes(p.type)).length;

            accommodationHtml = `
                <div class="ind-block ind-block--purple">
                    <div class="ind-block__header ind-block__header--clickable" data-accom-filter="all">
                        <span class="ind-block__title">Hébergements <span style="font-size:0.6rem;opacity:0.65;font-weight:500;letter-spacing:0.05em;">Source : OSM</span></span>
                        <span class="ind-block__big">${osmTotal.toLocaleString('fr-FR')} <span class="ind-block__unit">établissements</span></span>
                    </div>
                    ${pBar('Hôtels & auberges', osmHotels, osmMax, '#c4b5fd')}
                    ${pBar('Campings & aires', osmCampings, osmMax, '#a78bfa')}
                    
                    <div class="accom-detail-grid">
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="hotel" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">🏨</span><span class="accom-detail-label">Hôtels</span></div>
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="auberge" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">🏠</span><span class="accom-detail-label">Auberges</span></div>
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="camping" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">⛺</span><span class="accom-detail-label">Campings</span></div>
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="caravan" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">🚚</span><span class="accom-detail-label">Aires CC</span></div>
                        <div class="accom-detail-item accom-detail-item--clickable" data-accom-filter="collectif" title="Mettre en surbrillance sur la carte"><span class="accom-detail-icon">🏔️</span><span class="accom-detail-label">Héb. collect.</span></div>
                    </div>
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
                        <span><span class="heatmap-dot" style="background:#34d399;"></span> Piétons <b>${pedestrianTrailCount.toLocaleString('fr-FR')}</b></span>
                        <span><span class="heatmap-dot" style="background:#60a5fa;"></span> Vélo <b>${cyclingTrailCount.toLocaleString('fr-FR')}</b></span>
                    </div>
                </div>
            </div>`;
        // ── Accommodation Intensity : beds / habitants (INSEE / INSSE / OSM) ──
        let accomIntensityHtml = '';
        if (population && population > 0) {
            let bestBeds = totalBeds; // fallback OSM
            let bedSource = 'OSM';
            if (inseeStats) {
                bestBeds = inseeStats.hotel_beds + inseeStats.camping_beds + inseeStats.collective_beds;
                bedSource = 'INSEE';
            } else if (romaniaStats?.data?.annual_capacity?.total) {
                const years = Object.keys(romaniaStats.data.annual_capacity.total).sort();
                if (years.length > 0) {
                    bestBeds = romaniaStats.data.annual_capacity.total[years[years.length - 1]];
                    bedSource = 'INSSE';
                }
            }
            const accomIntensity = bestBeds / population;
            let accomRating = '';
            if (accomIntensity < 0.05) accomRating = 'Faible';
            else if (accomIntensity < 0.15) accomRating = 'Modérée';
            else if (accomIntensity < 0.5) accomRating = 'Élevée';
            else accomRating = 'Très élevée';

            accomIntensityHtml = `
                <div class="kpi-card kpi-card--col kpi-card--amber" style="margin-top:8px;">
                    <div class="kpi-label">Accommodation Intensity (${bedSource})</div>
                    <div style="display:flex;align-items:baseline;gap:6px;">
                        <span class="kpi-value" style="color:#fb923c;">${accomIntensity.toFixed(3)}</span>
                        <span class="kpi-sub">lits / hab.</span>
                    </div>
                    <div class="kpi-sub" style="margin-top:2px;">Intensité : <b>${accomRating}</b> · ${bestBeds.toLocaleString('fr-FR')} lits / ${population.toLocaleString('fr-FR')} hab.</div>
                </div>`;
        }

        const section3Html = accommodationHtml + accomIntensityHtml + `<div id="section-tourisme-content"></div>` + `<div id="romania-tourism-section"></div>`;

        // ── SECTION 4 : Marketing digital ─────────────────────────────────
        const webPct = total > 0 ? (websiteCount / total * 100) : 0;
        const socPct = total > 0 ? (socialMediaCount / total * 100) : 0;
        const section4Html = `
            <div class="ind-block">
                <div class="ind-block__header ind-block__header--clickable" data-digital-filter="all" title="Mettre tous les POIs avec présence numérique en surbrillance">
                    <span class="ind-block__title">Présence numérique</span>
                    <span class="ind-block__big">${digitalPresenceCount.toLocaleString('fr-FR')} <span style="font-size:0.8em;opacity:0.8;">/ ${total.toLocaleString('fr-FR')}</span> <span class="ind-block__unit">POIs</span></span>
                </div>
                <div class="ind-row ind-row--clickable" data-digital-filter="website" title="Cliquer pour mettre en surbrillance sur la carte">
                    <div class="ind-row__head">
                        <span class="ind-row__label">🌐 Site web</span>
                        <span class="ind-row__val" style="color:#34d399;">${typeof webPct === 'number' ? (Number.isInteger(webPct) ? webPct.toLocaleString('fr-FR') : webPct.toFixed(2)) : webPct}%</span>
                    </div>
                    <div class="ind-row__track"><div class="ind-row__fill" style="width:${Math.min(webPct, 100)}%;background:#34d399;"></div></div>
                </div>
                <div class="ind-row ind-row--clickable" data-digital-filter="social" title="Cliquer pour mettre en surbrillance sur la carte">
                    <div class="ind-row__head">
                        <span class="ind-row__label">📱 Réseaux sociaux</span>
                        <span class="ind-row__val" style="color:#ec4899;">${typeof socPct === 'number' ? (Number.isInteger(socPct) ? socPct.toLocaleString('fr-FR') : socPct.toFixed(2)) : socPct}%</span>
                    </div>
                    <div class="ind-row__track"><div class="ind-row__fill" style="width:${Math.min(socPct, 100)}%;background:#ec4899;"></div></div>
                </div>
            </div>
            <div id="wikivoyage-panel">
                <div class="ind-block" style="margin-top:6px;">
                    <div class="ind-block__header">
                        <span class="ind-block__title">🌍 Wikivoyage</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;">
                        <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
                        <span style="font-size:0.82rem;color:var(--color-text-muted);font-style:italic;">Recherche d'articles Wikivoyage...</span>
                    </div>
                </div>
            </div>
            <div id="pageviews-panel">
                <div class="ind-block" style="margin-top:6px;">
                    <div class="ind-block__header">
                        <span class="ind-block__title">📊 Wikipedia Pageviews</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;">
                        <span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
                        <span style="font-size:0.82rem;color:var(--color-text-muted);font-style:italic;">Analyse des pages Wikipedia...</span>
                    </div>
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
            let bestTotalBeds = totalBeds; // fallback: OSM beds count
            if (inseeStats) {
                bestTotalBeds = inseeStats.hotel_beds + inseeStats.camping_beds + inseeStats.collective_beds;
            } else if (romaniaStats?.data?.annual_capacity?.total) {
                // Utiliser la dernière année disponible dans les données INSSE Roumanie
                const years = Object.keys(romaniaStats.data.annual_capacity.total).sort();
                if (years.length > 0) {
                    bestTotalBeds = romaniaStats.data.annual_capacity.total[years[years.length - 1]];
                }
            }
            const touristCapacity = (population && population > 0) ? (bestTotalBeds / population) * 100 : null;

            const pedDensity = (pedestrianTrailLength / areaKm2);
            const cycleDensity = (cyclingTrailLength / areaKm2);

            const indicatorBar = (label, value, max, color, colorRgb, heatType, suffix = ' / km²', rating = '') => {
                const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
                const formatted = value < 0.01 && value > 0 ? value.toExponential(1) : value.toFixed(2);
                const ratingHtml = rating ? `<span class="density-bar__rating">(${rating})</span>` : '';
                return `
                    <div class="density-bar density-bar--clickable" data-heatmap-trigger="${heatType}" title="Afficher/masquer la heatmap">
                        <div class="density-bar__header">
                            <span class="density-bar__label">${label}</span>
                            <div class="density-bar__metrics">
                                <span class="density-bar__value" style="color:${color};">${formatted} <span class="density-bar__unit">${suffix}</span></span>
                                ${ratingHtml}
                            </div>
                        </div>
                        <div class="density-bar__track">
                            <div class="density-bar__fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(${colorRgb},0.4),rgba(${colorRgb},1));"></div>
                        </div>
                    </div>`;
            };

            // Échelles et Ratings qualitatives
            let capacityRating = '';
            if (touristCapacity !== null) {
                if (touristCapacity < 10) capacityRating = 'Faible';
                else if (touristCapacity < 50) capacityRating = 'Modérée';
                else if (touristCapacity < 100) capacityRating = 'Élevée';
                else capacityRating = 'Saturation';
            }

            let pedRating = '';
            if (pedDensity < 1) pedRating = 'Faible';
            else if (pedDensity < 3) pedRating = 'Moyenne';
            else if (pedDensity < 7) pedRating = 'Élevée';
            else pedRating = 'Exceptionnelle';

            let cycleRating = '';
            if (cycleDensity < 0.5) cycleRating = 'Faible';
            else if (cycleDensity < 2) cycleRating = 'Moyenne';
            else if (cycleDensity < 4) cycleRating = 'Élevée';
            else cycleRating = 'Excellente';

            const touristCapacityHtml = touristCapacity !== null
                ? indicatorBar('Capacité d\'accueil', touristCapacity, 100, '#a78bfa', '167,139,250', 'accommodation', ' lits / 100 hab.', capacityRating)
                : indicatorBar('Hébergements', (accommodationCount / areaKm2), (accommodationCount / areaKm2), '#a78bfa', '167,139,250', 'accommodation');

            densityHtml = `
                <div id="density-heatmap-panel" class="density-panel">
                    <div class="density-panel__title">
                        <span>Indicateurs territoriaux</span>
                        <span class="density-bar__unit">Surface : ${areaKm2.toFixed(1)} km²</span>
                    </div>
                    ${touristCapacityHtml}
                    ${indicatorBar('Sentiers piétons', pedDensity, 10, '#34d399', '5,150,105', 'pedestrian', ' km / km²', pedRating)}
                    ${indicatorBar('Pistes cyclables', cycleDensity, 5, '#60a5fa', '59,130,246', 'cycling', ' km / km²', cycleRating)}
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
                    <div class="ind-block__header ind-block__header--clickable" data-infra-filter="transport" title="Mettre tous les transports en surbrillance">
                        <span class="ind-block__title">Transports</span>
                        <span class="ind-block__big">${transportTotal.toLocaleString('fr-FR')} <span class="ind-block__unit">points d'accès</span></span>
                    </div>
                    <div class="ind-row ind-row--clickable" data-infra-filter="bus" title="Mettre en surbrillance sur la carte">
                        <div class="ind-row__head">
                            <span class="ind-row__label">🚏 Arrêts de bus</span>
                            <span class="ind-row__val" style="color:#fbbf24;">${busStopCount.toLocaleString('fr-FR')}</span>
                        </div>
                        <div class="ind-row__track"><div class="ind-row__fill" style="width:${maxTransport > 0 ? Math.min(busStopCount / maxTransport * 100, 100) : 0}%;background:#fbbf24;"></div></div>
                    </div>
                    <div class="ind-row ind-row--clickable" data-infra-filter="gare" title="Mettre en surbrillance sur la carte">
                        <div class="ind-row__head">
                            <span class="ind-row__label">🚉 Gares</span>
                            <span class="ind-row__val" style="color:#8b5cf6;">${trainStationCount.toLocaleString('fr-FR')}</span>
                        </div>
                        <div class="ind-row__track"><div class="ind-row__fill" style="width:${maxTransport > 0 ? Math.min(trainStationCount / maxTransport * 100, 100) : 0}%;background:#8b5cf6;"></div></div>
                    </div>
                    <div class="ind-row ind-row--clickable" data-infra-filter="aeroport" title="Mettre en surbrillance sur la carte">
                        <div class="ind-row__head">
                            <span class="ind-row__label">✈️ Aéroports</span>
                            <span class="ind-row__val" style="color:#0ea5e9;">${airportCount.toLocaleString('fr-FR')}</span>
                        </div>
                        <div class="ind-row__track"><div class="ind-row__fill" style="width:${maxTransport > 0 ? Math.min(airportCount / maxTransport * 100, 100) : 0}%;background:#0ea5e9;"></div></div>
                    </div>
                </div>
                <div class="ind-block" style="margin-bottom:6px;">
                    <div class="ind-block__header ind-block__header--clickable" data-infra-filter="services" title="Mettre tous les services en surbrillance">
                        <span class="ind-block__title">Services & équipements</span>
                        <span class="ind-block__big">${servicesTotal.toLocaleString('fr-FR')} <span class="ind-block__unit">installations</span></span>
                    </div>
                    <div class="ind-row ind-row--clickable" data-infra-filter="parking" title="Mettre en surbrillance sur la carte">
                        <div class="ind-row__head">
                            <span class="ind-row__label">🅿️ Stationnements</span>
                            <span class="ind-row__val" style="color:#64748b;">${parkingCount.toLocaleString('fr-FR')}</span>
                        </div>
                        <div class="ind-row__track"><div class="ind-row__fill" style="width:${maxServices > 0 ? Math.min(parkingCount / maxServices * 100, 100) : 0}%;background:#64748b;"></div></div>
                    </div>
                    <div class="ind-row ind-row--clickable" data-infra-filter="sanitaire" title="Mettre en surbrillance sur la carte">
                        <div class="ind-row__head">
                            <span class="ind-row__label">🚿 Sanitaires</span>
                            <span class="ind-row__val" style="color:#06b6d4;">${sanitaryCount.toLocaleString('fr-FR')}</span>
                        </div>
                        <div class="ind-row__track"><div class="ind-row__fill" style="width:${maxServices > 0 ? Math.min(sanitaryCount / maxServices * 100, 100) : 0}%;background:#06b6d4;"></div></div>
                    </div>
                    <div class="ind-row ind-row--clickable" data-infra-filter="recharge" title="Mettre en surbrillance sur la carte">
                        <div class="ind-row__head">
                            <span class="ind-row__label">⚡ Bornes recharge</span>
                            <span class="ind-row__val" style="color:#22c55e;">${chargingCount.toLocaleString('fr-FR')}</span>
                        </div>
                        <div class="ind-row__track"><div class="ind-row__fill" style="width:${maxServices > 0 ? Math.min(chargingCount / maxServices * 100, 100) : 0}%;background:#22c55e;"></div></div>
                    </div>
                </div>`;
            return html;
        };

        // ── Score de Complétude Macro ──────────────────────────────────────
        const completenessHtml = this._buildMacroCompletenessHtml(pois, totalRaw);

        // Si aucun POI après filtrage
        if (total === 0) {
            const totalPoisHtml = `<div class="ind-block" style="margin-bottom:6px;"><div class="ind-block__header"><span class="ind-block__title">NB POIs</span><span class="ind-block__big">${totalRaw.toLocaleString('fr-FR')} <span class="ind-block__unit">POIs trouvés</span></span></div></div>`;
            const areaHtml = areaKm2 > 0 ? `<div class="ind-block" style="margin-bottom:6px;"><div class="ind-block__header"><span class="ind-block__title">Superficie</span><span class="ind-block__big">${areaKm2.toFixed(2)} <span class="ind-block__unit">km²</span></span></div></div>` : '';
            const envSitesHtml = this._buildEnvSitesHtml(whcCount, naturaCount, whcSites, naturaSites);
            const section1Html = totalPoisHtml + areaHtml + envSitesHtml + completenessHtml + demoHtml + densityHtml;
            const infraKpisHtml = buildInfraKpis() + trailsHtml + '<div id="section-infra-content"></div>';
            const countLabel = totalRaw > 0
                ? `${totalRaw.toLocaleString('fr-FR')} POIs trouvés`
                : 'POIs disponibles';
            this.macroStats.innerHTML =
                buildCollapsibleSection('Informations générales', section1Html, 'section-info', true) +
                buildCollapsibleSection('Infrastructures & activités', infraKpisHtml, 'section-infra', true) +
                buildCollapsibleSection('Tourisme', section3Html, 'section-tourisme', true) +
                buildCollapsibleSection('Marketing digital', section4Html, 'section-marketing', true) +
                `<div class="stat-item empty">
                    <span style="font-size:1.5rem;"></span>
                    <div class="kpi-label" style="margin-top:6px;font-size:0.82rem;font-weight:600;color:var(--color-text);">${countLabel} — aucun affiché</div>
                    <div class="kpi-sub">Activez une catégorie dans les filtres.</div>
                </div>`;
            this._bindCollapsibleSections();
            this._bindHeatmapToggles();
            this._bindDigitalFilterClicks();
            this._bindAccomFilterClicks();
            this._bindInfraFilterClicks();
            this._bindEnvSiteClicks();
            this._showExportButton();
            this.lastPois = pois; // SYNC: Even if empty, update lastPois reference
            if (totalRaw > 0) {
                this.showToast(`${countLabel} — activez les filtres pour les afficher`, 'info', 5000);
            }
            // Render Romania tourism charts even with 0 filtered POIs
            if (romaniaStats) {
                this._renderRomaniaTourismCharts(romaniaStats, areaKm2, population);
            }
            // Render the dashboard (even with 0 filtered POIs, use totalRaw pois)
            this.renderDashboard(pois, networks, areaKm2, totalRaw, inseeStats, hierarchy, population, romaniaStats);
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
        const mainTreemapData = buildTreemapTrace({ ids, labels, parents, values, colors }, 'POIs');

        // ── Assemble the 4 sections ────────────────────────────────────────
        const totalPoisHtml = `<div class="ind-block" style="margin-bottom:6px;"><div class="ind-block__header"><span class="ind-block__title">NB POIs</span><span class="ind-block__big">${totalRaw.toLocaleString('fr-FR')} <span class="ind-block__unit">POIs trouvés</span></span></div></div>`;
        const areaHtml = areaKm2 > 0 ? `<div class="ind-block" style="margin-bottom:6px;"><div class="ind-block__header"><span class="ind-block__title">Superficie</span><span class="ind-block__big">${areaKm2.toFixed(2)} <span class="ind-block__unit">km²</span></span></div></div>` : '';

        let localisationHtml = '';
        if (hierarchy && typeof hierarchy === 'object') {
            const parts = [];
            if (hierarchy.country) parts.push(`<span class="loc-item">${hierarchy.country}</span>`);
            if (hierarchy.region) parts.push(`<span class="loc-item">${hierarchy.region}</span>`);
            if (hierarchy.dept) parts.push(`<span class="loc-item">${hierarchy.dept}</span>`);
            if (hierarchy.city) parts.push(`<span class="loc-item loc-item--city">${hierarchy.city}</span>`);
            if (parts.length > 0) {
                localisationHtml = `
                    <div class="ind-block loc-block" style="margin-bottom:6px;">
                        <div class="ind-block__header" style="flex-direction:column;align-items:flex-start;">
                            <span class="ind-block__title">Localisation</span>
                            <div class="loc-breadcrumb">${parts.join('<span class="loc-sep">›</span>')}</div>
                        </div>
                    </div>`;
            }
        }

        const envSitesHtml = this._buildEnvSitesHtml(whcCount, naturaCount, whcSites, naturaSites);
        const section1Html = totalPoisHtml + areaHtml + envSitesHtml + completenessHtml + localisationHtml + demoHtml + densityHtml;
        const infraKpisHtml = buildInfraKpis() + trailsHtml + `<div id="section-infra-content"></div>`;
        this.macroStats.innerHTML =
            buildCollapsibleSection('Informations générales', section1Html, 'section-info', true) +
            buildCollapsibleSection('Infrastructures & activités', infraKpisHtml, 'section-infra', true) +
            buildCollapsibleSection('Tourisme', section3Html, 'section-tourisme', true) +
            buildCollapsibleSection('Marketing digital', section4Html, 'section-marketing', true);

        this._bindCollapsibleSections();
        this._bindHeatmapToggles();
        this._bindDigitalFilterClicks();
        this._bindAccomFilterClicks();
        this._bindInfraFilterClicks();
        this._bindEnvSiteClicks();
        this._showExportButton();

        this.macroStats.style.height = 'auto'; // Let it grow

        // Render the minimalist 6-KPI dashboard
        this.renderDashboard(pois, networks, areaKm2, totalRaw, inseeStats, hierarchy, population, romaniaStats);

        // ── Section 2: Infrastructures & activités (injected via DOM) ──────
        const infraContainer = document.getElementById('section-infra-content');
        const tourismeContainer = document.getElementById('section-tourisme-content');

        // Header for Chart + Maximize Button
        const chartHeader = document.createElement('div');
        chartHeader.className = 'mini-treemap-header';

        const chartTitle = document.createElement('span');
        chartTitle.className = 'mini-treemap-title';
        chartTitle.textContent = 'Répartition';

        const chartTitleGroup = document.createElement('div');
        chartTitleGroup.className = 'mini-treemap-title-group';
        chartTitle.textContent = 'Répartition des POIs';

        const chartMeta = document.createElement('span');
        chartMeta.className = 'mini-treemap-meta';
        chartMeta.textContent = `${Object.keys(categoryCounts).length} catégories`;

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
        chartDiv.on('plotly_click', (data) => {
            if (data.points && data.points.length > 0) {
                const point = data.points[0];
                if (this.onTreemapItemClick) this.onTreemapItemClick(point.id, point.parent, 'main');
            }
        });
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

        const addMiniTreemap = (titleText, treemapData, metaText = '', targetContainer = null) => {
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
            miniDiv.id = 'mini-treemap-' + Math.random().toString(36).substring(2, 9);
            miniDiv.style.height = '200px';
            miniDiv.className = 'mini-chart-canvas';

            const plotData = buildTreemapTrace(treemapData);

            const maxBtn = document.createElement('button');
            maxBtn.className = 'maximize-btn';
            maxBtn.innerHTML = '⤢ Agrandir';
            maxBtn.title = 'Voir en plein écran';
            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(plotData, miniLayout, 'mini'));
            headerRow.appendChild(headerGroup);
            headerRow.appendChild(maxBtn);

            section.appendChild(headerRow);
            section.appendChild(miniDiv);
            
            const container = targetContainer || infraContainer;
            if (container) container.appendChild(section);

            Plotly.newPlot(miniDiv, plotData, miniLayout, miniConfig);
            miniDiv.on('plotly_click', (data) => {
                if (data.points && data.points.length > 0) {
                    const point = data.points[0];
                    if (this.onTreemapItemClick) this.onTreemapItemClick(point.id, point.parent, 'mini');
                }
            });
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
                ids: ['AccomRoot'], labels: ['Hébergements'], parents: [''], values: [totalAccom],
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
            addMiniTreemap('Hébergements par type', accomTreemap, `${Object.keys(accomCounts).length} types`, tourismeContainer);
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
                ids: ['SacRoot'], labels: ['Sentiers piétons'], parents: [''], values: [totalSac],
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
            addMiniTreemap('Sentiers piétons par difficulté', sacTreemap, `${Object.keys(sacCounts).length} niveaux`);
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
            addMiniTreemap('Chemins vélo par type', cycleTreemap, `${Object.keys(cycleCounts).length} segments`);
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
            slopeHeader.textContent = 'Randonnée vs Cyclisme';
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
                    x: ['Randonnée', 'Cyclisme'],
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

        // ── Km total des sentiers (Text Display) ──
        const totalTrailKm = pedestrianTrailLength + cyclingTrailLength;
        const trailTotalDiv = document.createElement('div');
        trailTotalDiv.innerHTML = `
            <div class="ind-block" style="margin:10px 0;">
                <div class="ind-block__header">
                    <span class="ind-block__title">Km total des sentiers</span>
                    <span class="ind-block__big">${totalTrailKm.toFixed(1)} <span class="ind-block__unit">km</span></span>
                </div>
                <div style="display:flex;gap:12px;padding:2px 0 0;">
                    <span style="font-size:0.75rem;color:#34d399;">🥾 Piétons : ${pedestrianTrailLength.toFixed(1)} km</span>
                    <span style="font-size:0.75rem;color:#60a5fa;">🚴 Vélo : ${cyclingTrailLength.toFixed(1)} km</span>
                </div>
            </div>`;
        infraContainer.appendChild(trailTotalDiv);

        // ── Helper to add a Plotly horizontal bar chart ──
        const addBarChart = (title, metricsData, containerElement) => {
            if (metricsData.length === 0) return;

            const section = document.createElement('div');
            section.className = 'mini-treemap-section';

            const headerRow = document.createElement('div');
            headerRow.className = 'mini-treemap-header';

            const headerGroup = document.createElement('div');
            headerGroup.className = 'mini-treemap-title-group';

            const header = document.createElement('span');
            header.className = 'mini-treemap-title';
            header.textContent = title;
            headerGroup.appendChild(header);

            const meta = document.createElement('span');
            meta.className = 'mini-treemap-meta';
            meta.textContent = areaKm2 > 0 ? 'normalisé par km²' : 'comparaison brute';
            headerGroup.appendChild(meta);

            const div = document.createElement('div');
            div.id = 'chart-' + Math.random().toString(36).substring(2, 9);
            // Height dynamic based on items count
            const chartHeight = Math.max(120, metricsData.length * 28 + 55);
            div.style.height = `${chartHeight}px`;
            div.className = 'mini-chart-canvas';

            const data = [{
                type: 'bar',
                orientation: 'h',
                x: metricsData.map(item => item.metric),
                y: metricsData.map(item => item.label),
                marker: {
                    color: metricsData.map(item => item.color),
                    line: { color: 'rgba(255,255,255,0.18)', width: 1.2 }
                },
                text: metricsData.map(item => areaKm2 > 0
                    ? `${formatChartMetric(item.metric)}${item.unit === 'km' ? ' km/km²' : '/km²'}`
                    : item.raw.toLocaleString('fr-FR')),
                textposition: 'outside',
                cliponaxis: false,
                hovertemplate: areaKm2 > 0
                    ? '<b>%{y}</b><br>%{x:.2f} ' + (metricsData[0].unit === 'km' ? 'km / km²' : '/ km²') + '<br>%{customdata[0]} %{customdata[1]} recensés<extra></extra>'
                    : '<b>%{y}</b><br>%{x} %{customdata[1]} recensés<extra></extra>',
                customdata: metricsData.map(item => [item.raw.toLocaleString('fr-FR'), item.unit])
            }];

            const layout = {
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
                        ? { text: metricsData[0].unit === 'km' ? 'km / km²' : 'éléments / km²', font: { size: 10, color: 'rgba(255,255,255,0.5)' } }
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

            const maxBtn = document.createElement('button');
            maxBtn.className = 'maximize-btn';
            maxBtn.innerHTML = '⤢ Agrandir';
            maxBtn.title = 'Voir en plein écran';
            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(data, layout));
            
            headerRow.appendChild(headerGroup);
            headerRow.appendChild(maxBtn);

            section.appendChild(headerRow);
            section.appendChild(div);
            containerElement.appendChild(section);

            Plotly.newPlot(div, data, layout, miniConfig);
            
            div.on('plotly_click', (data) => {
                if (data.points && data.points.length > 0) {
                    const label = data.points[0].label || data.points[0].y;
                    if (label === 'Sentiers piétons' && this.onTreemapItemClick) {
                        this.onTreemapItemClick('SacRoot', 'SacRoot', 'mini');
                    } else if (label === 'Pistes cyclables' && this.onTreemapItemClick) {
                        this.onTreemapItemClick('CycleRoot', 'CycleRoot', 'mini');
                    } else if (label === 'Hébergements' && this.onTreemapItemClick) {
                        this.onTreemapItemClick('AccomRoot', 'AccomRoot', 'mini');
                    } else if (label === 'Transports' && this.onInfraFilterClick) {
                        this.onInfraFilterClick('transport');
                    } else if (label === 'Services' && this.onInfraFilterClick) {
                        this.onInfraFilterClick('services');
                    }
                }
            });
        };

        // ── Densité linéaire de réseau ──
        const networkMetrics = [
            { label: 'Sentiers piétons', raw: pedestrianTrailLength, color: '#34d399', unit: 'km' },
            { label: 'Pistes cyclables', raw: cyclingTrailLength, color: '#60a5fa', unit: 'km' }
        ]
            .filter(item => item.raw > 0)
            .map(item => ({
                ...item,
                metric: areaKm2 > 0 ? (item.raw / areaKm2) : item.raw
            }))
            .sort((a, b) => b.metric - a.metric);

        addBarChart('Densité linéaire de réseau', networkMetrics, infraContainer);

        // ── Densité de services ──
        const serviceCats = [
            { id: 'amenity',    label: 'Services',     colorHex: '#60a5fa' },
            { id: 'transport',  label: 'Transports',   colorHex: '#9ca3af' },
            { id: 'tourism',    label: 'Tourisme',     colorHex: '#fbbf24' },
            { id: 'sustenance', label: 'Restauration', colorHex: '#f87171' },
            { id: 'shop',       label: 'Commerces',    colorHex: '#c084fc' },
            { id: 'natural',    label: 'Nature',       colorHex: '#34d399' },
            { id: 'craft',      label: 'Artisanat',    colorHex: '#e879f9' },
            { id: 'historic',   label: 'Histoire',     colorHex: '#d97706' },
            { id: 'sport',      label: 'Sport',        colorHex: '#14b8a6' }
        ];

        const catCountsForDensity = {};
        pois.forEach(p => {
            if (!catCountsForDensity[p.category]) catCountsForDensity[p.category] = 0;
            catCountsForDensity[p.category]++;
        });

        const serviceMetrics = serviceCats
            .map(sc => ({
                label: sc.label,
                raw: catCountsForDensity[sc.id] || 0,
                color: sc.colorHex,
                unit: 'POIs'
            }))
            .filter(item => item.raw > 0)
            .map(item => ({
                ...item,
                metric: areaKm2 > 0 ? (item.raw / areaKm2) : item.raw
            }))
            .sort((a, b) => b.metric - a.metric);

        addBarChart('Densité de services', serviceMetrics, infraContainer);


        // ── ROMANIA TOURISM CHARTS (INSSE) ─────────────────────────────────
        if (romaniaStats) {
            this._renderRomaniaTourismCharts(romaniaStats, areaKm2, population);
        }
    }

    /**
     * Renders Romania INSSE tourism indicators into the #romania-tourism-section container.
     * @param {object} romaniaStats — { countyName, data, metadata } from getRomaniaStats()
     * @param {number} areaKm2 — area of selected zone in km²
     * @param {number|null} population — population of the zone
     */
    _renderRomaniaTourismCharts(romaniaStats, areaKm2 = 0, population = null) {
        const container = document.getElementById('romania-tourism-section');
        if (!container || !romaniaStats) return;

        const { countyName, data, metadata } = romaniaStats;
        const monthlyData = data.monthly_data;
        const annualCap = data.annual_capacity;
        const months = Object.keys(monthlyData).sort();

        if (months.length === 0) return;

        // ── Plotly shared config ──
        const plotConfig = { responsive: true, displayModeBar: false };
        const basePlotLayout = {
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: 'Outfit, sans-serif', color: '#fff', size: 11 },
            hoverlabel: {
                bgcolor: 'rgba(5,10,18,0.92)',
                bordercolor: 'rgba(255,255,255,0.14)',
                font: { family: 'Outfit, sans-serif', color: '#ffffff', size: 11 }
            },
            showlegend: false,
            xaxis: {
                gridcolor: 'rgba(255,255,255,0.06)',
                tickfont: { size: 9, color: 'rgba(255,255,255,0.6)' },
                tickangle: -45
            },
            yaxis: {
                gridcolor: 'rgba(255,255,255,0.06)',
                tickfont: { size: 9, color: 'rgba(255,255,255,0.5)' },
                rangemode: 'tozero'
            }
        };

        // ── Month label helper ──
        const monthLabels = {
            '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
            '05': 'Mai', '06': 'Juin', '07': 'Juil', '08': 'Août',
            '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc'
        };
        const formatMonth = (m) => {
            const [y, mo] = m.split('-');
            return `${monthLabels[mo] || mo} ${y.slice(2)}`;
        };
        const xLabels = months.map(formatMonth);

        // ── Helper: create a chart section ──
        const createChartSection = (titleText, metaText, height = '220px') => {
            const section = document.createElement('div');
            section.className = 'mini-treemap-section';
            section.style.marginTop = '8px';

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

            const chartDiv = document.createElement('div');
            chartDiv.id = 'ro-chart-' + Math.random().toString(36).substring(2, 9);
            chartDiv.style.height = height;
            chartDiv.className = 'mini-chart-canvas';

            const maxBtn = document.createElement('button');
            maxBtn.className = 'maximize-btn';
            maxBtn.innerHTML = '⤢ Agrandir';
            maxBtn.title = 'Voir en plein écran';

            headerRow.appendChild(headerGroup);
            headerRow.appendChild(maxBtn);
            section.appendChild(headerRow);
            section.appendChild(chartDiv);

            return { section, chartDiv, maxBtn };
        };

        // ── HEADER ──
        const headerBlock = document.createElement('div');
        headerBlock.className = 'ind-block';
        headerBlock.style.marginTop = '10px';
        headerBlock.innerHTML = `
            <div class="ind-block__header">
                <span class="ind-block__title">🇷🇴 INSSE Roumanie — ${countyName}</span>
                <span class="ind-block__big">${months.length} <span class="ind-block__unit">mois de données</span></span>
            </div>
            <div style="font-size:0.65rem;opacity:0.5;padding:2px 0 6px;">
                Période : ${formatMonth(months[0])} → ${formatMonth(months[months.length - 1])} · Source : TEMPO Online
            </div>
        `;
        container.appendChild(headerBlock);

        // ═══════════════════════════════════════════════════════════════════
        // 1. NUITÉES MENSUELLES (TUR105H) — Line chart
        // ═══════════════════════════════════════════════════════════════════
        {
            const yVals = months.map(m => monthlyData[m]?.overnight_stays?.total || 0);
            const { section, chartDiv, maxBtn } = createChartSection('Nuitées mensuelles (TUR105H)', countyName, '200px');

            const traceData = [{
                x: xLabels, y: yVals,
                type: 'scatter', mode: 'lines+markers',
                line: { color: '#c4b5fd', width: 3, shape: 'spline' },
                marker: { size: 5, color: '#e9d5ff' },
                fill: 'tozeroy',
                fillcolor: 'rgba(196,181,253,0.12)',
                hovertemplate: '<b>%{x}</b><br>%{y:,.0f} nuitées<extra></extra>'
            }];

            const layout = {
                ...basePlotLayout,
                margin: { t: 10, l: 50, r: 15, b: 50 },
                yaxis: { ...basePlotLayout.yaxis, title: { text: 'Nuitées', font: { size: 9, color: 'rgba(255,255,255,0.4)' } } }
            };

            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(traceData, { ...layout, margin: { t: 40, l: 60, r: 30, b: 60 }, title: `Nuitées mensuelles — ${countyName}` }));
            container.appendChild(section);
            Plotly.newPlot(chartDiv, traceData, layout, plotConfig);
        }

        // ═══════════════════════════════════════════════════════════════════
        // 2. ARRIVÉES PAR TYPE D'ÉTABLISSEMENT (TUR104H) — Line chart multi
        // ═══════════════════════════════════════════════════════════════════
        {
            const typeColors = {
                'Hotels': '#818cf8', 'Touristic boarding houses': '#f472b6',
                'Agroturistic boarding houses': '#34d399', 'Hostels': '#fbbf24',
                'Motels': '#fb923c', 'Touristic villas': '#a78bfa',
                'Touristic chalets': '#22d3ee', 'Campings': '#4ade80',
                'Apartments and rooms for rent': '#e879f9', 'Bungalows': '#f87171',
                'Holiday villages': '#38bdf8', 'Houselet type unit': '#facc15',
                'Inns': '#fb7185', 'School and pre-school camps': '#a3e635',
                'Ships accommodation spaces': '#67e8f9', 'Touristic halting places': '#c084fc',
                'Apartament hotels': '#fda4af'
            };

            // Collect all establishment types that have data
            const typeArrivals = {};
            months.forEach(m => {
                const byType = monthlyData[m]?.arrivals?.by_type || {};
                Object.entries(byType).forEach(([type, val]) => {
                    if (!typeArrivals[type]) typeArrivals[type] = {};
                    typeArrivals[type][m] = val;
                });
            });

            // Sort all types by total arrivals (descending)
            const typeTotals = Object.entries(typeArrivals).map(([type, vals]) => ({
                type,
                total: Object.values(vals).reduce((a, b) => a + b, 0)
            })).sort((a, b) => b.total - a.total);

            const allTypes = typeTotals.filter(t => t.total > 0).map(t => t.type);

            const { section, chartDiv, maxBtn } = createChartSection('Arrivées par type (TUR104H)', `${allTypes.length} types`, '300px');

            const traces = allTypes.map((type, i) => ({
                x: xLabels,
                y: months.map(m => typeArrivals[type]?.[m] || 0),
                type: 'scatter', mode: 'lines',
                name: type,
                line: { color: typeColors[type] || `hsl(${i * 21}, 70%, 65%)`, width: 2 },
                hovertemplate: `<b>${type}</b><br>%{x}: %{y:,.0f} arrivées<extra></extra>`
            }));

            const layout = {
                ...basePlotLayout,
                margin: { t: 10, l: 50, r: 15, b: 50 },
                showlegend: true,
                legend: {
                    orientation: 'h', x: 0, y: -0.3,
                    font: { size: 8, color: 'rgba(255,255,255,0.7)' },
                    bgcolor: 'rgba(0,0,0,0)'
                },
                yaxis: { ...basePlotLayout.yaxis, title: { text: 'Arrivées', font: { size: 9, color: 'rgba(255,255,255,0.4)' } } }
            };

            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(traces, { ...layout, margin: { t: 40, l: 60, r: 30, b: 80 }, title: `Arrivées par type — ${countyName}` }));
            container.appendChild(section);
            Plotly.newPlot(chartDiv, traces, layout, plotConfig);
        }

        // ═══════════════════════════════════════════════════════════════════
        // 3. CAPACITÉ MENSUELLE EN LITS (TUR103F) — Bar chart
        // ═══════════════════════════════════════════════════════════════════
        {
            const yVals = months.map(m => monthlyData[m]?.bed_capacity?.total || 0);
            const { section, chartDiv, maxBtn } = createChartSection('Capacité mensuelle — lits (TUR103F)', 'Places-jours', '200px');

            const traceData = [{
                x: xLabels, y: yVals,
                type: 'bar',
                marker: {
                    color: yVals.map((v, i) => {
                        const [yy, mm] = months[i].split('-');
                        return parseInt(mm) >= 6 && parseInt(mm) <= 9 ? '#a78bfa' : '#7c3aed';
                    }),
                    line: { color: 'rgba(255,255,255,0.12)', width: 0.5 }
                },
                hovertemplate: '<b>%{x}</b><br>%{y:,.0f} places-jours<extra></extra>'
            }];

            const layout = {
                ...basePlotLayout,
                margin: { t: 10, l: 55, r: 15, b: 50 },
                bargap: 0.15,
                yaxis: { ...basePlotLayout.yaxis, title: { text: 'Places-jours', font: { size: 9, color: 'rgba(255,255,255,0.4)' } } }
            };

            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(traceData, { ...layout, margin: { t: 40, l: 60, r: 30, b: 60 }, title: `Capacité mensuelle lits — ${countyName}` }));
            container.appendChild(section);
            Plotly.newPlot(chartDiv, traceData, layout, plotConfig);
        }

        // ═══════════════════════════════════════════════════════════════════
        // 4. CAPACITÉ ANNUELLE PAR TYPE (TUR102C) — Grouped bar chart
        // ═══════════════════════════════════════════════════════════════════
        {
            const years = Object.keys(annualCap.total || {}).sort();
            const byType = annualCap.by_type || {};

            // All types sorted by latest year value (descending)
            const typeYearTotals = Object.entries(byType).map(([type, yearVals]) => ({
                type,
                latest: yearVals[years[years.length - 1]] || 0,
                data: yearVals
            })).sort((a, b) => b.latest - a.latest);

            const allCapTypes = typeYearTotals.filter(t => t.latest > 0);
            const typeBarColors = [
                '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#fb923c',
                '#a78bfa', '#22d3ee', '#4ade80', '#e879f9', '#f87171',
                '#38bdf8', '#facc15', '#fb7185', '#a3e635', '#67e8f9',
                '#c084fc', '#fda4af'
            ];

            if (years.length > 0 && allCapTypes.length > 0) {
                const { section, chartDiv, maxBtn } = createChartSection('Capacité annuelle par type (TUR102C)', `${years[0]}–${years[years.length - 1]}`, '280px');

                const traces = allCapTypes.map((t, i) => ({
                    x: years,
                    y: years.map(yr => t.data[yr] || 0),
                    type: 'bar',
                    name: t.type,
                    marker: { color: typeBarColors[i % typeBarColors.length] },
                    hovertemplate: `<b>${t.type}</b><br>%{x}: %{y:,.0f} places<extra></extra>`
                }));

                // Add total line
                traces.push({
                    x: years,
                    y: years.map(yr => annualCap.total[yr] || 0),
                    type: 'scatter', mode: 'lines+markers',
                    name: 'Total',
                    line: { color: '#fff', width: 2, dash: 'dot' },
                    marker: { size: 6, color: '#fff' },
                    yaxis: 'y',
                    hovertemplate: '<b>Total</b><br>%{x}: %{y:,.0f} places<extra></extra>'
                });

                const layout = {
                    ...basePlotLayout,
                    margin: { t: 10, l: 50, r: 15, b: 35 },
                    barmode: 'stack',
                    showlegend: true,
                    legend: {
                        orientation: 'h', x: 0, y: -0.25,
                        font: { size: 8, color: 'rgba(255,255,255,0.7)' },
                        bgcolor: 'rgba(0,0,0,0)'
                    },
                    yaxis: { ...basePlotLayout.yaxis, title: { text: 'Places', font: { size: 9, color: 'rgba(255,255,255,0.4)' } } }
                };

                maxBtn.addEventListener('click', () => this._toggleFullScreenChart(traces, { ...layout, margin: { t: 40, l: 60, r: 30, b: 60 }, title: `Capacité annuelle — ${countyName}` }));
                container.appendChild(section);
                Plotly.newPlot(chartDiv, traces, layout, plotConfig);
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // 5-7. KPI INDICATORS (Tourist Density, Accommodation Density, Tourist Intensity)
        // ═══════════════════════════════════════════════════════════════════
        {
            // Compute annual totals from monthly data
            const totalArrivals = months.reduce((sum, m) => sum + (monthlyData[m]?.arrivals?.total || 0), 0);
            const totalBeds = months.reduce((sum, m) => sum + (monthlyData[m]?.bed_capacity?.total || 0), 0);
            const totalNights = months.reduce((sum, m) => sum + (monthlyData[m]?.overnight_stays?.total || 0), 0);
            const monthCount = months.length;

            const kpiBlock = document.createElement('div');
            kpiBlock.className = 'ind-block';
            kpiBlock.style.marginTop = '8px';

            let kpiHtml = `<div class="ind-block__header">
                <span class="ind-block__title">Indicateurs de surtourisme</span>
                <span class="ind-block__big">${countyName}</span>
            </div>`;

            // Tourist Density : Arrivals / Surface
            if (areaKm2 > 0) {
                const touristDensity = totalArrivals / areaKm2;
                let rating = '';
                if (touristDensity < 100) rating = 'Faible';
                else if (touristDensity < 500) rating = 'Modérée';
                else if (touristDensity < 2000) rating = 'Élevée';
                else rating = 'Très élevée';

                const pct = Math.min((touristDensity / 5000) * 100, 100);
                kpiHtml += `
                    <div class="density-bar" style="margin-top:6px;">
                        <div class="density-bar__header">
                            <span class="density-bar__label">Tourist Density</span>
                            <div class="density-bar__metrics">
                                <span class="density-bar__value" style="color:#818cf8;">${touristDensity.toFixed(1)} <span class="density-bar__unit">arrivées / km²</span></span>
                                <span class="density-bar__rating">(${rating})</span>
                            </div>
                        </div>
                        <div class="density-bar__track">
                            <div class="density-bar__fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(129,140,248,0.4),rgba(129,140,248,1));"></div>
                        </div>
                    </div>`;
            }

            // Accommodation Density : Avg monthly beds / Surface
            if (areaKm2 > 0 && totalBeds > 0) {
                const avgMonthlyBeds = totalBeds / monthCount;
                const accomDensity = avgMonthlyBeds / areaKm2;
                let rating = '';
                if (accomDensity < 500) rating = 'Faible';
                else if (accomDensity < 5000) rating = 'Modérée';
                else if (accomDensity < 20000) rating = 'Élevée';
                else rating = 'Très élevée';

                const pct = Math.min((accomDensity / 50000) * 100, 100);
                kpiHtml += `
                    <div class="density-bar" style="margin-top:6px;">
                        <div class="density-bar__header">
                            <span class="density-bar__label">Accommodation Density</span>
                            <div class="density-bar__metrics">
                                <span class="density-bar__value" style="color:#a78bfa;">${accomDensity.toFixed(0)} <span class="density-bar__unit">lits / km²</span></span>
                                <span class="density-bar__rating">(${rating})</span>
                            </div>
                        </div>
                        <div class="density-bar__track">
                            <div class="density-bar__fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(167,139,250,0.4),rgba(167,139,250,1));"></div>
                        </div>
                    </div>`;
            }

            // Tourist Intensity : Arrivals / Population
            if (population && population > 0) {
                const intensity = (totalArrivals / population);
                let rating = '';
                if (intensity < 1) rating = 'Faible';
                else if (intensity < 5) rating = 'Modérée';
                else if (intensity < 20) rating = 'Élevée';
                else rating = 'Saturation';

                const pct = Math.min((intensity / 30) * 100, 100);
                kpiHtml += `
                    <div class="density-bar" style="margin-top:6px;">
                        <div class="density-bar__header">
                            <span class="density-bar__label">Tourist Intensity</span>
                            <div class="density-bar__metrics">
                                <span class="density-bar__value" style="color:#f472b6;">${intensity.toFixed(2)} <span class="density-bar__unit">arrivées / habitant</span></span>
                                <span class="density-bar__rating">(${rating})</span>
                            </div>
                        </div>
                        <div class="density-bar__track">
                            <div class="density-bar__fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(244,114,182,0.4),rgba(244,114,182,1));"></div>
                        </div>
                    </div>`;
            }

            // Durée Moyenne de Séjour : TUR105H overnight stays / TUR104H arrivals
            if (totalArrivals > 0) {
                const avgStay = totalNights / totalArrivals;
                let rating = '';
                if (avgStay < 1.5) rating = 'Court séjour';
                else if (avgStay < 3) rating = 'Moyen';
                else if (avgStay < 5) rating = 'Long';
                else rating = 'Très long';

                const pct = Math.min((avgStay / 7) * 100, 100);
                kpiHtml += `
                    <div class="density-bar" style="margin-top:6px;">
                        <div class="density-bar__header">
                            <span class="density-bar__label">Durée Moyenne de Séjour</span>
                            <div class="density-bar__metrics">
                                <span class="density-bar__value" style="color:#22d3ee;">${avgStay.toFixed(2)} <span class="density-bar__unit">nuits / arrivée</span></span>
                                <span class="density-bar__rating">(${rating})</span>
                            </div>
                        </div>
                        <div class="density-bar__track">
                            <div class="density-bar__fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(34,211,238,0.4),rgba(34,211,238,1));"></div>
                        </div>
                    </div>`;
            }

            kpiBlock.innerHTML = kpiHtml;
            container.appendChild(kpiBlock);
        }

        // ═══════════════════════════════════════════════════════════════════
        // 8. TAUX D'OCCUPATION (Utilization Rate) — Bar chart
        // ═══════════════════════════════════════════════════════════════════
        {
            const utilizationData = months.map(m => {
                const beds = monthlyData[m]?.bed_capacity?.total || 0;
                const nights = monthlyData[m]?.overnight_stays?.total || 0;
                return beds > 0 ? (nights / beds) * 100 : 0;
            });

            const { section, chartDiv, maxBtn } = createChartSection('Taux d\'occupation (TUR105H / TUR103F)', 'Nuitées / Capacité × 100', '200px');

            const traceData = [{
                x: xLabels,
                y: utilizationData,
                type: 'bar',
                marker: {
                    color: utilizationData.map(v => {
                        if (v < 30) return '#22c55e';
                        if (v < 60) return '#fbbf24';
                        return '#ef4444';
                    }),
                    line: { color: 'rgba(255,255,255,0.12)', width: 0.5 }
                },
                hovertemplate: '<b>%{x}</b><br>Taux : %{y:.1f}%<extra></extra>'
            }];

            const layout = {
                ...basePlotLayout,
                margin: { t: 10, l: 40, r: 15, b: 50 },
                bargap: 0.15,
                yaxis: {
                    ...basePlotLayout.yaxis,
                    title: { text: '%', font: { size: 9, color: 'rgba(255,255,255,0.4)' } },
                    range: [0, Math.max(...utilizationData, 100) * 1.1]
                },
                shapes: [{
                    type: 'line', x0: 0, x1: 1, xref: 'paper',
                    y0: 50, y1: 50,
                    line: { color: 'rgba(251,191,36,0.4)', width: 1, dash: 'dash' }
                }, {
                    type: 'line', x0: 0, x1: 1, xref: 'paper',
                    y0: 80, y1: 80,
                    line: { color: 'rgba(239,68,68,0.4)', width: 1, dash: 'dash' }
                }]
            };

            maxBtn.addEventListener('click', () => this._toggleFullScreenChart(traceData, { ...layout, margin: { t: 40, l: 50, r: 30, b: 60 }, title: `Taux d'occupation — ${countyName}` }));
            container.appendChild(section);
            Plotly.newPlot(chartDiv, traceData, layout, plotConfig);
        }
    }

    /** Initialize overtourism filters */
    _initOvertourismFilters() {
        const content = document.getElementById('overtourism-filters-content');
        const btn = document.getElementById('toggle-overtourism-filters-btn');
        if (!content || !btn) return;

        const options = [
            { id: 'overtourism_cities', label: 'Villes', color: '#ef4444' },
            { id: 'overtourism_pois', label: 'POIs', color: '#facc15' }
        ];

        options.forEach(opt => {
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
            checkbox.value = opt.id;
            checkbox.checked = false;
            checkbox.style.accentColor = 'var(--color-primary)';
            checkbox.addEventListener('change', (e) => {
                this.updateOvertourismFilterButtonText();
                if (this.onHeatmapToggle) {
                    this.onHeatmapToggle(opt.id, e.target.checked);
                }
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${opt.label}`));
            div.appendChild(label);
            content.appendChild(div);
        });

        btn.addEventListener('click', () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            btn.classList.toggle('is-open', isHidden);
        });

        this.updateOvertourismFilterButtonText();
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

        // Checkboxes directes
        panel.querySelectorAll('.heatmap-toggle').forEach(cb => {
            cb.addEventListener('change', () => {
                if (this.onHeatmapToggle) {
                    this.onHeatmapToggle(cb.dataset.heat, cb.checked);
                }
            });
        });

        // Clic sur les barres de densité pour basculer la checkbox correspondante
        panel.querySelectorAll('.density-bar--clickable').forEach(bar => {
            bar.addEventListener('click', () => {
                const heatType = bar.dataset.heatmapTrigger;
                const cb = panel.querySelector(`.heatmap-toggle[data-heat="${heatType}"]`);
                if (cb) {
                    cb.checked = !cb.checked;
                    if (this.onHeatmapToggle) {
                        this.onHeatmapToggle(heatType, cb.checked);
                    }
                }
            });
        });
    }

    /** Désactive visuellement tous les highlights de filtres */
    _clearAllHighlightFilters() {
        this.macroStats.querySelectorAll('[data-digital-filter]').forEach(r => { r.classList.remove('ind-row--active'); r.classList.remove('ind-block__header--active'); });
        this.macroStats.querySelectorAll('[data-accom-filter]').forEach(r => { r.classList.remove('accom-detail-item--active'); r.classList.remove('ind-block__header--active'); r.classList.remove('kpi-star-badge--active'); });
        this.macroStats.querySelectorAll('[data-infra-filter]').forEach(r => { r.classList.remove('ind-row--active'); r.classList.remove('ind-block__header--active'); });
    }

    /** Lie les barres "Site web" / "Réseaux sociaux" / header "Présence numérique" */
    _bindDigitalFilterClicks() {
        this.macroStats.querySelectorAll('[data-digital-filter]').forEach(el => {
            // Clone-replace pour supprimer les anciens listeners (évite les doublons)
            const fresh = el.cloneNode(true);
            el.parentNode.replaceChild(fresh, el);
            fresh.addEventListener('click', (e) => {
                e.stopPropagation();
                const filterType = fresh.dataset.digitalFilter;
                const isHeader = fresh.classList.contains('ind-block__header--clickable');
                const activeClass = isHeader ? 'ind-block__header--active' : 'ind-row--active';
                const wasActive = fresh.classList.contains(activeClass);
                this._clearAllHighlightFilters();
                if (!wasActive) {
                    fresh.classList.add(activeClass);
                    if (this.onDigitalFilterClick) this.onDigitalFilterClick(filterType);
                } else {
                    if (this.onDigitalFilterClick) this.onDigitalFilterClick(null);
                }
            });
        });
    }

    /** Lie les items hébergement + header pour déclencher le highlight sur la carte */
    _bindAccomFilterClicks() {
        this.macroStats.querySelectorAll('[data-accom-filter]').forEach(el => {
            const fresh = el.cloneNode(true);
            el.parentNode.replaceChild(fresh, el);
            fresh.addEventListener('click', (e) => {
                e.stopPropagation();
                const filterType = fresh.dataset.accomFilter;
                const isHeader = fresh.classList.contains('ind-block__header--clickable');
                const isStar = fresh.classList.contains('kpi-star-badge');
                let activeClass = 'accom-detail-item--active';
                if (isHeader) activeClass = 'ind-block__header--active';
                else if (isStar) activeClass = 'kpi-star-badge--active';
                const wasActive = fresh.classList.contains(activeClass);
                this._clearAllHighlightFilters();
                if (!wasActive) {
                    fresh.classList.add(activeClass);
                    if (this.onAccomFilterClick) this.onAccomFilterClick(filterType);
                } else {
                    if (this.onAccomFilterClick) this.onAccomFilterClick(null);
                }
            });
        });
    }

    /** Lie les barres infra (transport + services) + headers "Transports" / "Services" */
    _bindInfraFilterClicks() {
        this.macroStats.querySelectorAll('[data-infra-filter]').forEach(el => {
            const fresh = el.cloneNode(true);
            el.parentNode.replaceChild(fresh, el);
            fresh.addEventListener('click', (e) => {
                e.stopPropagation();
                const filterType = fresh.dataset.infraFilter;
                const isHeader = fresh.classList.contains('ind-block__header--clickable');
                const activeClass = isHeader ? 'ind-block__header--active' : 'ind-row--active';
                const wasActive = fresh.classList.contains(activeClass);
                this._clearAllHighlightFilters();
                if (!wasActive) {
                    fresh.classList.add(activeClass);
                    if (this.onInfraFilterClick) this.onInfraFilterClick(filterType);
                } else {
                    if (this.onInfraFilterClick) this.onInfraFilterClick(null);
                }
            });
        });
    }

    // ── UNESCO + Natura 2000 side-by-side cards ────────────────────────────
    _buildEnvSitesHtml(whcCount, naturaCount, whcSites = [], naturaSites = []) {
        const buildSiteList = (sites, type) => {
            if (!sites || sites.length === 0) return '<div class="env-card__empty">Aucun site dans la zone</div>';
            return sites.map((s, i) =>
                `<div class="env-site-item" data-env-type="${type}" data-env-idx="${i}" data-env-lat="${s.lat}" data-env-lon="${s.lon}" title="Localiser sur la carte">${s.name || 'Site sans nom'}</div>`
            ).join('');
        };

        return `
            <div class="env-sites-grid">
                <div class="env-card env-card--unesco">
                    <div class="env-card__icon">🏛️</div>
                    <div class="env-card__count">${whcCount}</div>
                    <div class="env-card__label">UNESCO</div>
                    <div class="env-card__list">${buildSiteList(whcSites, 'whc')}</div>
                </div>
                <div class="env-card env-card--natura">
                    <div class="env-card__icon">🌿</div>
                    <div class="env-card__count">${naturaCount}</div>
                    <div class="env-card__label">Natura 2000</div>
                    <div class="env-card__list">${buildSiteList(naturaSites, 'natura')}</div>
                </div>
            </div>`;
    }

    _bindEnvSiteClicks() {
        this.macroStats.querySelectorAll('.env-site-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const lat = parseFloat(el.dataset.envLat);
                const lon = parseFloat(el.dataset.envLon);
                const type = el.dataset.envType;
                const name = el.textContent;

                // Toggle active state
                const wasActive = el.classList.contains('env-site-item--active');
                this.macroStats.querySelectorAll('.env-site-item--active').forEach(a => a.classList.remove('env-site-item--active'));

                if (!wasActive) {
                    el.classList.add('env-site-item--active');
                    if (this.onEnvSiteClick) this.onEnvSiteClick({ lat, lon, type, name });
                } else {
                    if (this.onEnvSiteClick) this.onEnvSiteClick(null);
                }
            });
        });
    }


    // ── Macro Completeness Score ────────────────────────────────────────────
    _buildMacroCompletenessHtml(pois, totalRaw) {
        if (!pois || pois.length === 0) {
            if (totalRaw === 0) return '';
            return `<div class="completeness-macro" style="margin-bottom:8px;">
                <div class="completeness-macro__title">Score de Complétude</div>
                <div class="completeness-macro__sub">Activez les filtres pour voir le score</div>
            </div>`;
        }

        const breakdowns = pois.map(p => {
            try { return this._computeCompletenessBreakdown(p); }
            catch(e) { return { general: 0, infra: 0, tourisme: 0, digital: 0, global: 0 }; }
        });

        const avg = (arr, key) => arr.length > 0 ? Math.round(arr.reduce((s, b) => s + b[key], 0) / arr.length) : 0;
        const globalAvg = avg(breakdowns, 'global');
        const generalAvg = avg(breakdowns, 'general');
        const infraAvg = avg(breakdowns, 'infra');
        const tourismeAvg = avg(breakdowns, 'tourisme');
        const digitalAvg = avg(breakdowns, 'digital');

        const catLabels = this.categories.reduce((acc, c) => { acc[c.id] = c.label; return acc; }, {});
        const catGroups = {};
        pois.forEach((p, i) => {
            const cat = p.category || 'unknown';
            if (!catGroups[cat]) catGroups[cat] = [];
            catGroups[cat].push(breakdowns[i]);
        });

        const catScores = Object.entries(catGroups)
            .map(([catId, bks]) => ({
                label: catLabels[catId] || catId,
                score: Math.round(bks.reduce((s, b) => s + b.global, 0) / bks.length),
                count: bks.length
            }))
            .sort((a, b) => b.score - a.score);

        const scoreColor = (s) => s >= 70 ? '#22c55e' : s >= 50 ? '#eab308' : s >= 30 ? '#f97316' : '#ef4444';
        const scoreLabel = (s) => s >= 70 ? 'Complet' : s >= 50 ? 'Bon' : s >= 30 ? 'Partiel' : 'Insuffisant';

        const radius = 32, circumference = 2 * Math.PI * radius;
        const offset = circumference - (globalAvg / 100) * circumference;
        const color = scoreColor(globalAvg);

        const dimBar = (label, value) => {
            const c = scoreColor(value);
            return `<div class="completeness-dim">
                <span class="completeness-dim__label">${label}</span>
                <div class="completeness-dim__track"><div class="completeness-dim__fill" style="width:${value}%;background:${c};"></div></div>
                <span class="completeness-dim__val" style="color:${c};">${value}%</span>
            </div>`;
        };

        const catRowsHtml = catScores.slice(0, 8).map(c => {
            const cc = scoreColor(c.score);
            return `<div class="completeness-cat">
                <span class="completeness-cat__label" title="${c.label}">${c.label}</span>
                <div class="completeness-cat__track"><div class="completeness-cat__fill" style="width:${c.score}%;background:${cc};"></div></div>
                <span class="completeness-cat__val" style="color:${cc};">${c.score}%</span>
                <span class="completeness-cat__count">${c.count}</span>
            </div>`;
        }).join('');

        return `
            <div class="completeness-macro">
                <div class="completeness-macro__header">
                    <div class="completeness-macro__gauge">
                        <svg viewBox="0 0 80 80" class="completeness-svg">
                            <circle cx="40" cy="40" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
                            <circle cx="40" cy="40" r="${radius}" fill="none" stroke="${color}" stroke-width="6"
                                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                                stroke-linecap="round" transform="rotate(-90 40 40)" class="completeness-ring"/>
                        </svg>
                        <div class="completeness-macro__score">
                            <span class="completeness-macro__value" style="color:${color};">${globalAvg}</span>
                            <span class="completeness-macro__unit">/ 100</span>
                        </div>
                    </div>
                    <div class="completeness-macro__info">
                        <div class="completeness-macro__title">Score de Complétude</div>
                        <div class="completeness-macro__rating" style="color:${color};">${scoreLabel(globalAvg)}</div>
                        <div class="completeness-macro__sub">Moyenne sur ${pois.length.toLocaleString('fr-FR')} POIs</div>
                    </div>
                </div>
                <div class="completeness-macro__dims">
                    ${dimBar('Général', generalAvg)}
                    ${dimBar('Infrastructures', infraAvg)}
                    ${dimBar('Tourisme', tourismeAvg)}
                    ${dimBar('Digital', digitalAvg)}
                </div>
                <div class="completeness-macro__cats-title">Par catégorie</div>
                <div class="completeness-macro__cats">${catRowsHtml}</div>
            </div>`;
    }

    renderMicroList(pois) {
        if (pois.length === 0) {
            this.poiList.innerHTML = '<p class="empty-state">Aucun point d\'intérêt trouvé dans cette zone.</p>';
            return;
        }

        this.lastPois = pois; // SYNC: Update the source of truth for the list

        // Peupler le select de catégorie avec les catégories présentes dans les POIs
        const catSpotlightSelect = document.getElementById('poi-cat-spotlight');
        if (catSpotlightSelect) {
            const catLabels = this.categories.reduce((acc, c) => { acc[c.id] = c.label; return acc; }, {});
            const presentCats = [...new Set(pois.map(p => p.category).filter(Boolean))]
                .sort((a, b) => (catLabels[a] || a).localeCompare(catLabels[b] || b, 'fr'));
            // Conserver la valeur sélectionnée si elle est toujours valide
            const currentVal = catSpotlightSelect.value;
            catSpotlightSelect.innerHTML = '<option value="">Toutes les catégories</option>';
            presentCats.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = catLabels[cat] || cat;
                catSpotlightSelect.appendChild(opt);
            });
            catSpotlightSelect.value = presentCats.includes(currentVal) ? currentVal : '';
            this.currentCatSpotlight = catSpotlightSelect.value;
        }

        this._renderSortedList(pois);
    }

    /**
     * Applique le tri courant (this.currentSort) et injecte les cartes dans la liste.
     */
    _renderSortedList(pois) {
        const sort = this.currentSort || 'default';
        const spotlight = this.currentCatSpotlight || '';

        // Si une catégorie est sélectionnée, mettre ses POIs en premier selon le tri courant,
        // puis afficher le reste également selon le tri courant.
        if (spotlight) {
            const rawSpotlight = pois.filter(p => p.category === spotlight);
            const rawOthers    = pois.filter(p => p.category !== spotlight);

            const sortedSpotlight = this._applySortToPois(rawSpotlight, sort);
            const sortedOthers    = this._applySortToPois(rawOthers, sort);

            const catLabels = this.categories.reduce((acc, c) => { acc[c.id] = c.label; return acc; }, {});
            const color = this.getCategoryColor(spotlight);
            const label = catLabels[spotlight] || spotlight;
            const showScore = sort.startsWith('completeness');

            let html = '';
            if (sortedSpotlight.length > 0) {
                html += `<div class="poi-group-header poi-group-header--spotlight">
                    <span class="poi-group-header__dot" style="background:${color};"></span>
                    ${this.escapeHtml(label)}
                    <span class="poi-group-header__count">${sortedSpotlight.length} POI${sortedSpotlight.length > 1 ? 's' : ''} — prioritaire</span>
                </div>`;
                html += sortedSpotlight.map(p => this.createPoiCard(p, showScore)).join('');
            }
            if (sortedOthers.length > 0) {
                html += `<div class="poi-group-header" style="margin-top:12px;">
                    <span style="opacity:0.5;font-size:0.68rem;">Reste des POIs (${sortedOthers.length})</span>
                </div>`;
                html += sortedOthers.map(p => this.createPoiCard(p, showScore)).join('');
            }
            this.poiList.innerHTML = html;
            this._bindPoiCardClicks();
            return;
        }

        const showScore = sort === 'completeness_desc' || sort === 'completeness_asc';

        // ── Mode non groupé : liste plate avec le tri global ──
        if (!this.groupByCategory) {
            const sorted = this._applySortToPois(pois, sort);
            let html = sorted.map(p => this.createPoiCard(p, showScore)).join('');
            this.poiList.innerHTML = html;
            this._bindPoiCardClicks();
            return;
        }

        // ── Mode groupé : grouper par catégorie, puis appliquer le tri au sein de chaque groupe ──
        const groups = {};
        pois.forEach(p => {
            const cat = p.category || 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        });
        const catLabels = this.categories.reduce((acc, c) => { acc[c.id] = c.label; return acc; }, {});
        const sortedCats = Object.keys(groups).sort((a, b) =>
            (catLabels[a] || a).localeCompare(catLabels[b] || b, 'fr')
        );

        let html = '';
        sortedCats.forEach(cat => {
            const color = this.getCategoryColor(cat);
            const label = catLabels[cat] || cat;
            const sorted = this._applySortToPois(groups[cat], sort);
            html += `<div class="poi-group-header">
                <span class="poi-group-header__dot" style="background:${color};"></span>
                ${this.escapeHtml(label)}
                <span class="poi-group-header__count">${sorted.length} POI${sorted.length > 1 ? 's' : ''}</span>
            </div>`;
            html += sorted.map(p => this.createPoiCard(p, showScore)).join('');
        });
        this.poiList.innerHTML = html;

        this._bindPoiCardClicks();
    }

    /** Rebind les clicks sur toutes les .poi-card actuellement dans le DOM. */
    _bindPoiCardClicks() {
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

    /**
     * Applique un tri nommé à un tableau de POIs et retourne le tableau trié.
     * Utilisé pour trier la section "reste des POIs" dans le mode spotlight.
     */
    _applySortToPois(pois, sort) {
        if (sort === 'alpha' || sort === 'cat_alpha') {
            return pois.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        }
        if (sort === 'completeness_desc') {
            return pois.slice().sort((a, b) => this._computeCompleteness(b) - this._computeCompleteness(a));
        }
        if (sort === 'completeness_asc') {
            return pois.slice().sort((a, b) => this._computeCompleteness(a) - this._computeCompleteness(b));
        }
        return pois; // cat_alpha et default : ordre d'arrivée pour le reste
    }

    /**
     * Calcule les 4 scores de complétude (0-100) alignés sur les sections de la fiche micro.
     * Retourne un objet { general, infra, tourisme, digital, global }
     *
     * Calibration :
     *  - Un POI correctement renseigné (nom + type + horaires) doit être orange (≈50%)
     *  - Un POI enrichi (+ description + site web OU wikipedia) doit être vert (≥60%)
     *  - global = moyenne pondérée : General 40% + Tourisme 35% + Infra 15% + Digital 10%
     */
    _computeCompletenessBreakdown(poi) {
        const t = poi.tags || {};
        const d = poi.digital || {};

        // ── 1. Informations générales (/100) ───────────────────────────────────
        // Critère clé : nom (45), horaires (25), description (20), contact (10)
        let general = 0;
        if (t.name)                                              general += 45;
        if (t.opening_hours)                                     general += 25;
        if (t.description || t['description:fr'])                general += 20;
        if (t.phone || t['contact:phone'] ||
            t.email || t['contact:email'])                       general += 10;
        // Bonus: nom traduit ou adresse structurée
        if (t['name:fr'] || t['name:en'] ||
            t['addr:street'] || t['addr:housenumber'])           general = Math.min(general + 5, 100);

        // ── 2. Infrastructures & activités (/100) ──────────────────────────────
        // Combine tags OSM + données de proximité calculées par l'app
        let infra = 0;
        // Accès transport (présence = l'app a calculé la distance)
        const hasTransport = poi.nearestBusStopDist !== undefined ||
                             poi.nearestTrainStationDist !== undefined;
        const hasAirport   = poi.nearestAirportDist !== undefined;
        const hasRoad      = poi.nearestRoadDist !== undefined;
        const hasTrail     = poi.nearestHikingDist !== undefined ||
                             poi.nearestCyclingDist !== undefined;
        const hasAccom     = poi.nearestAccomHotelDist !== undefined ||
                             poi.nearestAccomCampingDist !== undefined;
        if (hasTransport)                                        infra += 30;
        if (hasRoad)                                             infra += 20;
        if (hasTrail)                                            infra += 20;
        if (hasAirport)                                          infra += 10;
        if (hasAccom)                                            infra += 10;
        // Tags OSM d'accessibilité
        if (t.wheelchair)                                        infra += 5;
        if (t.fee !== undefined && t.fee !== null)               infra += 5;

        // ── 3. Tourisme (/100) ─────────────────────────────────────────────────
        // Avoir un type OSM spécifique est la base (50 pts)
        let tourisme = 0;
        if (t.tourism || t.historic || t.natural ||
            t.leisure || t.amenity)                              tourisme += 50;
        if (t.wikipedia || t.wikidata)                           tourisme += 30;
        if (t.stars || t['stars:tourism'])                       tourisme += 10;
        if (t.cuisine || t.sport || t.capacity)                  tourisme += 10;

        // ── 4. Données digitales (/100) ────────────────────────────────────────
        // Website seul = déjà bien (55 pts)
        // Website (30), Wikipedia (20), Photos (20), Social Media (10), Wikivoyage (10), Languages (10)
        let digital = 0;
        const hasPhotos = t.image || t.wikimedia_commons || t.mapillary || d.hasPhotos;
        
        if (t.website || t['contact:website'] || t.url)         digital += 30;
        if (t.wikipedia || t.wikidata)                           digital += 20;
        if (hasPhotos)                                           digital += 20;
        if (d.hasSocialMedia)                                    digital += 10;
        if (d.hasWikivoyage || t.wikivoyage)                     digital += 10;
        if (d.wikidataLanguagesCount > 0)                        digital += 10;

        general  = Math.min(general, 100);
        infra    = Math.min(infra, 100);
        tourisme = Math.min(tourisme, 100);
        digital  = Math.min(digital, 100);

        // Moyenne pondérée : General 40% + Tourisme 35% + Infra 15% + Digital 10%
        const global = Math.round(
            general  * 0.40 +
            tourisme * 0.35 +
            infra    * 0.15 +
            digital  * 0.10
        );

        return { general, infra, tourisme, digital, global };
    }

    /**
     * Score global (0-100) utilisé pour le tri — moyenne des 4 scores.
     */
    _computeCompleteness(poi) {
        return this._computeCompletenessBreakdown(poi).global;
    }

    createPoiCard(poi, showCompleteness = false) {
        const color = this.getCategoryColor(poi.category);
        const bgStyle = `background: ${color}33; color: ${color};`;
        let distanceHtml = '';
        const distParts = [];
        const formatDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

        if (poi.nearestBusStopDist !== undefined) distParts.push(`🚌 ${formatDist(poi.nearestBusStopDist)}`);
        if (poi.nearestTrainStationDist !== undefined) distParts.push(`🚉 ${formatDist(poi.nearestTrainStationDist)}`);
        if (poi.nearestAirportDist !== undefined) distParts.push(`✈️ ${formatDist(poi.nearestAirportDist)}`);

        if (distParts.length > 0) {
            distanceHtml = `<div class="poi-desc" style="margin-top:4px; font-size:0.75rem;"><span style="color:var(--color-primary);font-weight:600;">${distParts.join(' • ')}</span></div>`;
        }

        let completenessHtml = '';
        if (showCompleteness) {
            const score = this._computeCompleteness(poi);
            const barColor = score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#ef4444';
            completenessHtml = `
                <div class="poi-completeness">
                    <div class="poi-completeness__bar-track">
                        <div class="poi-completeness__bar-fill" style="width:${score}%; background:${barColor};"></div>
                    </div>
                    <span class="poi-completeness__label" style="color:${barColor};">${score}%</span>
                </div>`;
        }

        const catLabels = this.categories.reduce((acc, c) => { acc[c.id] = c.label; return acc; }, {});
        const catLabel = catLabels[poi.category] || poi.category;

        return `
            <div class="poi-card" data-id="${poi.id}" style="border-left: 3px solid ${color}">
                <span class="poi-category-tag" style="${bgStyle}">${this.translateType(poi.type)}</span>
                <div class="poi-name">${poi.name}</div>
                <div class="poi-desc">${this.escapeHtml(catLabel)}</div>
                ${distanceHtml}
                ${completenessHtml}
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

                <!-- Scores de complétude par section -->
                ${(() => {
                    const s = this._computeCompletenessBreakdown(poi);
                    // Seuils : vert ≥60%, orange ≥35%, rouge <35%
                    const col = (score) => score >= 60 ? '#34d399' : score >= 35 ? '#f59e0b' : '#ef4444';
                    const bar = (label, score) => {
                        const c = col(score);
                        return `<div class="poi-score-row">
                            <span class="poi-score-row__label">${label}</span>
                            <div class="poi-score-row__track">
                                <div class="poi-score-row__fill" style="width:${score}%;background:${c};"></div>
                            </div>
                            <span class="poi-score-row__pct" style="color:${c};">${score}%</span>
                        </div>`;
                    };
                    return `<div class="poi-scores-widget" id="poi-scores-widget">
                        <div class="poi-scores-widget__title">
                            📊 Complétude de la fiche
                            <span class="poi-scores-widget__global" style="color:${col(s.global)};">${s.global}%</span>
                        </div>
                        ${bar('Infos générales', s.general)}
                        ${bar('Infrastructures', s.infra)}
                        ${bar('Tourisme', s.tourisme)}
                        ${bar('Données digitales', s.digital)}
                    </div>`;
                })()}

                <!-- Section 1: Informations générales -->
                <div class="poi-section poi-section--collapsible">
                    <div class="poi-section__title poi-section__title--toggle" data-target="poi-sec-info">
                        Informations générales
                        <span class="poi-section__chevron">▾</span>
                    </div>
                    <div class="detail-info" id="poi-sec-info">
                        ${this._buildGeneralInfoRows(poi, color)}
                    </div>
                </div>

                <!-- Section 2: Infrastructures & activités -->
                <div class="poi-section poi-section--collapsible">
                    <div class="poi-section__title poi-section__title--toggle" data-target="poi-sec-infra">
                        Infrastructures & activités
                        <span class="poi-section__chevron">▾</span>
                    </div>
                    <div id="poi-sec-infra">
                        <div class="detail-info" id="poi-infra-block">
                            ${this._buildInfraRows(poi, color)}
                        </div>
                        <!-- Transport filter toggles -->
                        <div class="poi-transport-filter" id="poi-transport-filter">
                            <div class="poi-transport-filter__title">🚏 Transport — itinéraire vers :</div>
                            <div class="poi-transport-filter__toggles">
                                <label class="poi-transport-toggle ${poi.nearestBusStopDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="bus" class="poi-transit-cb" ${poi.nearestBusStopDist !== undefined ? 'checked' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🚌</span>
                                    <span class="poi-transport-toggle__label">Bus</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestTrainStationDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="gare" class="poi-transit-cb" ${poi.nearestTrainStationDist !== undefined ? 'checked' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🚉</span>
                                    <span class="poi-transport-toggle__label">Gare</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestAirportDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="aeroport" class="poi-transit-cb" ${poi.nearestAirportDist !== undefined ? 'checked' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">✈️</span>
                                    <span class="poi-transport-toggle__label">Aéroport</span>
                                </label>
                            </div>
                        </div>

                        <!-- Accessibilité sub-section -->
                        <div class="poi-transport-filter">
                            <div class="poi-transport-filter__title">♿ Accessibilité</div>
                            ${poi.tags.wheelchair ? `<div class="detail-info" style="padding:4px 0;">
                                ${this._infoRow('PMR', poi.tags.wheelchair === 'yes' ? '<span style="color:#10b981;font-weight:bold;">Accessible PMR ♿</span>' :
                                    poi.tags.wheelchair === 'limited' ? '<span style="color:#f59e0b;font-weight:bold;">Accès limité ⚠️</span>' :
                                    '<span style="color:#ef4444;font-weight:bold;">Non accessible ❌</span>')}
                            </div>` : '<div class="detail-info" style="padding:4px 0;"><div class="info-row"><span class="info-label">PMR</span><span class="info-value" style="color:var(--color-text-muted);opacity:0.6;">Non renseigné</span></div></div>'}
                        </div>

                        <!-- Voies d'accès filter toggles -->
                        <div class="poi-transport-filter">
                            <div class="poi-transport-filter__title">🛤️ Voies d'accès — itinéraire vers :</div>
                            <div class="poi-transport-filter__toggles">
                                <label class="poi-transport-toggle ${poi.nearestRoadDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="route" class="poi-transit-cb" ${poi.nearestRoadDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🛣️</span>
                                    <span class="poi-transport-toggle__label">Route</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestHikingDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="rando" class="poi-transit-cb" ${poi.nearestHikingDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🥾</span>
                                    <span class="poi-transport-toggle__label">Rando</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestCyclingDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="cyclable" class="poi-transit-cb" ${poi.nearestCyclingDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🚴</span>
                                    <span class="poi-transport-toggle__label">Cyclable</span>
                                </label>
                            </div>
                            ${this._buildAccessRows(poi, color)}
                        </div>

                        <!-- Services filter toggles -->
                        <div class="poi-transport-filter">
                            <div class="poi-transport-filter__title">🔧 Services — le plus proche :</div>
                            <div class="poi-transport-filter__toggles">
                                <label class="poi-transport-toggle ${poi.nearestServiceParkingDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="service_parking" class="poi-transit-cb" ${poi.nearestServiceParkingDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🅿️</span>
                                    <span class="poi-transport-toggle__label">Parking</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestServiceToiletsDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="service_toilets" class="poi-transit-cb" ${poi.nearestServiceToiletsDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🚻</span>
                                    <span class="poi-transport-toggle__label">Toilettes</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestServiceChargingDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="service_charging" class="poi-transit-cb" ${poi.nearestServiceChargingDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">⚡</span>
                                    <span class="poi-transport-toggle__label">Recharge</span>
                                </label>
                            </div>
                            ${this._buildServiceRows(poi, color)}
                        </div>
                    </div>
                </div>

                <!-- Section 3: Tourisme -->
                <div class="poi-section poi-section--collapsible" id="poi-tourisme-section">
                    <div class="poi-section__title poi-section__title--toggle" data-target="poi-sec-tourisme">
                        Tourisme
                        <span class="poi-section__chevron">▾</span>
                    </div>
                    <div id="poi-sec-tourisme">
                        <div class="detail-info" id="poi-tourisme-block">
                            ${this._buildTourismeRows(poi, color)}
                        </div>

                        <!-- Hébergement filter toggles -->
                        <div class="poi-transport-filter">
                            <div class="poi-transport-filter__title">🛏️ Hébergement le plus proche :</div>
                            <div class="poi-transport-filter__toggles poi-transport-filter__toggles--wrap">
                                <label class="poi-transport-toggle ${poi.nearestAccomHotelDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="accom_hotel" class="poi-transit-cb" ${poi.nearestAccomHotelDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🏨</span>
                                    <span class="poi-transport-toggle__label">Hôtel</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestAccomCampingDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="accom_camping" class="poi-transit-cb" ${poi.nearestAccomCampingDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">⛺</span>
                                    <span class="poi-transport-toggle__label">Camping</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestAccomRefugeDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="accom_refuge" class="poi-transit-cb" ${poi.nearestAccomRefugeDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🏔️</span>
                                    <span class="poi-transport-toggle__label">Refuge</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestAccomGiteDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="accom_gite" class="poi-transit-cb" ${poi.nearestAccomGiteDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🏡</span>
                                    <span class="poi-transport-toggle__label">Gîte</span>
                                </label>
                            </div>
                            ${this._buildAccomDistRows(poi, color)}
                        </div>

                        <!-- Environnement filter toggles -->
                        <div class="poi-transport-filter">
                            <div class="poi-transport-filter__title">🌍 Environnement — le plus proche :</div>
                            <div class="poi-transport-filter__toggles poi-transport-filter__toggles--wrap">
                                <label class="poi-transport-toggle ${poi.nearestWhcDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="env_whc" class="poi-transit-cb" ${poi.nearestWhcDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🏛️</span>
                                    <span class="poi-transport-toggle__label">UNESCO</span>
                                </label>
                                <label class="poi-transport-toggle ${poi.nearestNaturaDist !== undefined ? '' : 'poi-transport-toggle--disabled'}">
                                    <input type="checkbox" value="env_natura" class="poi-transit-cb" ${poi.nearestNaturaDist !== undefined ? '' : 'disabled'}>
                                    <span class="poi-transport-toggle__icon">🌿</span>
                                    <span class="poi-transport-toggle__label">Natura 2000</span>
                                </label>
                            </div>
                            ${this._buildEnvDistRows(poi, color)}
                        </div>

                        <!-- Wikidata Block (skeleton then replaced) -->
                        <div id="poi-wikidata-section" style="display:none">
                            <div class="poi-section__subtitle">
                                <img src="https://www.wikidata.org/static/favicon/wikidata.ico" width="14" height="14" style="vertical-align:middle;margin-right:5px;" alt="">
                                Wikidata
                            </div>
                            <div id="poi-wikidata-block" class="detail-info"></div>
                        </div>
                    </div>
                </div>

                <!-- Section 4: Marketing digital -->
                <div class="poi-section poi-section--collapsible">
                    <div class="poi-section__title poi-section__title--toggle" data-target="poi-sec-marketing">
                        Marketing digital
                        <span class="poi-section__chevron">▾</span>
                    </div>
                    <div class="detail-info" id="poi-sec-marketing">
                        ${this._buildDigitalRows(poi, color)}
                    </div>
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
        document.getElementById('back-to-list').addEventListener('click', () => {
            const filtersContainer = document.getElementById('micro-filters-container');
            if (filtersContainer) filtersContainer.style.display = 'block';
            if (this.onBackToList) this.onBackToList();
            this.filterList();
        });

        // Collapsible section toggles
        document.querySelectorAll('.poi-section__title--toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const body = document.getElementById(targetId);
                if (!body) return;
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : '';
                const chevron = btn.querySelector('.poi-section__chevron');
                if (chevron) chevron.style.transform = isOpen ? 'rotate(-90deg)' : '';
            });
        });

        // Transport filter checkboxes → trigger transit line redraw
        document.querySelectorAll('.poi-transit-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const activeFilters = Array.from(document.querySelectorAll('.poi-transit-cb:checked'))
                    .map(c => c.value);
                if (this.onTransitFilterChange) {
                    this.onTransitFilterChange(poi, activeFilters);
                }
            });
        });

        // Trigger initial transit lines for all available types
        setTimeout(() => {
            const activeFilters = Array.from(document.querySelectorAll('.poi-transit-cb:checked'))
                .map(c => c.value);
            if (this.onTransitFilterChange && activeFilters.length > 0) {
                this.onTransitFilterChange(poi, activeFilters);
            }
        }, 100);

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

                    const socialPlatforms = ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'tiktok'];
                    socialPlatforms.forEach(sm => {
                        const url = poi.tags[sm] || poi.tags[`contact:${sm}`];
                        if (url) {
                            const validUrl = url.startsWith('http') ? url : `https://${url}`;
                            const name = sm.charAt(0).toUpperCase() + sm.slice(1);
                            linksContainer.insertAdjacentHTML('beforeend',
                                `<a href="${validUrl}" target="_blank" class="icon-btn" title="${name}">${name}</a>`);
                        }
                    });

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

                // --- Mise à jour du bloc Marketing digital ---
                if (poi.digital) {
                    if (wikidataInfo) {
                        poi.digital.wikidataLanguagesCount = wikidataInfo.wikidataLanguagesCount || 0;
                        if (wikidataInfo.wikidataHasWikivoyage) {
                            poi.digital.hasWikivoyage = true;
                        }
                        if (wikidataInfo.image) {
                            poi.digital.hasPhotos = true;
                        }
                    } else {
                        poi.digital.wikidataLanguagesCount = 0;
                    }
                    const digitalBlock = document.getElementById('poi-sec-marketing');
                    if (digitalBlock) {
                        digitalBlock.innerHTML = this._buildDigitalRows(poi, color);
                    }
                    // Rafraîchir le widget de score de complétude
                    this._refreshScoresWidget(poi);
                }
            }).catch(err => {
                console.warn('POI enrichment error:', err);
                if (poi.digital) {
                    poi.digital.wikidataLanguagesCount = 0;
                    const digitalBlock = document.getElementById('poi-sec-marketing');
                    if (digitalBlock) {
                        digitalBlock.innerHTML = this._buildDigitalRows(poi, color);
                    }
                }
            });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Recalcule et met à jour le widget de complétude après enrichissement async.
     */
    _refreshScoresWidget(poi) {
        const widget = document.getElementById('poi-scores-widget');
        if (!widget) return;

        const s = this._computeCompletenessBreakdown(poi);
        const col = (score) => score >= 60 ? '#34d399' : score >= 35 ? '#f59e0b' : '#ef4444';

        const bar = (label, score) => {
            const c = col(score);
            return `<div class="poi-score-row">
                <span class="poi-score-row__label">${label}</span>
                <div class="poi-score-row__track">
                    <div class="poi-score-row__fill" style="width:${score}%;background:${c};"></div>
                </div>
                <span class="poi-score-row__pct" style="color:${c};">${score}%</span>
            </div>`;
        };

        widget.innerHTML = `
            <div class="poi-scores-widget__title">
                📊 Complétude de la fiche
                <span class="poi-scores-widget__global" style="color:${col(s.global)};">${s.global}%</span>
            </div>
            ${bar('Infos générales', s.general)}
            ${bar('Infrastructures', s.infra)}
            ${bar('Tourisme', s.tourisme)}
            ${bar('Données digitales', s.digital)}
        `;
    }

    _buildDigitalRows(poi, color) {
        const d = poi.digital || {};
        const t = poi.tags;
        const rows = [];

        const yesLabel = `<span style="color:#10b981;font-weight:bold;">Oui</span>`;
        const noLabel = `<span style="color:var(--color-text-muted);opacity:0.8;">Non</span>`;

        // --- DÉBUT DES MODIFICATIONS : Site Web ---
        const website = t.website || t['contact:website'] || t.url;
        if (website) {
            // Normaliser l'URL (ajouter https:// si absent)
            const fullUrl = website.startsWith('http') ? website : `https://${website}`;
            // Extraire le nom de domaine pour l'affichage
            let displayUrl = website;
            try {
                const urlObj = new URL(fullUrl);
                displayUrl = urlObj.hostname.replace(/^www\./, '');
                // Ajouter le path s'il est significatif (pas juste "/")
                if (urlObj.pathname && urlObj.pathname !== '/') {
                    const path = urlObj.pathname.replace(/\/$/, '');
                    if (path.length > 0 && path.length <= 25) {
                        displayUrl += path;
                    } else if (path.length > 25) {
                        displayUrl += path.substring(0, 22) + '…';
                    }
                }
            } catch (e) {
                // URL invalide, afficher telle quelle mais tronquer si trop long
                displayUrl = website.replace(/^https?:\/\/(www\.)?/, '');
                if (displayUrl.length > 40) displayUrl = displayUrl.substring(0, 37) + '…';
            }
            rows.push(`
                <div class="info-row info-row--website">
                    <span class="info-label">🌐 Site Web</span>
                    <a href="${this.escapeHtml(fullUrl)}" target="_blank" rel="noopener" class="info-value info-website-link" style="color:${color};" title="${this.escapeHtml(fullUrl)}">
                        ${this.escapeHtml(displayUrl)} ↗
                    </a>
                </div>
            `);
        } else if (d.hasWebsite) {
            rows.push(this._infoRow('🌐 Site Web', yesLabel));
        }

        // --- MODIFICATIONS : Réseaux sociaux ---
        const socialLinks = [];
        ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'tiktok'].forEach(sm => {
            const url = t[sm] || t[`contact:${sm}`];
            if (url) {
                const validUrl = url.startsWith('http') ? url : `https://${url}`;
                // Création de mini-boutons stylisés
                socialLinks.push(`<a href="${validUrl}" target="_blank" class="digital-social-btn" style="color:${color}; border-color:${color}55;">${sm.charAt(0).toUpperCase() + sm.slice(1)} ↗</a>`);
            }
        });
        
        if (socialLinks.length > 0) {
            rows.push(`<div class="info-row"><span class="info-label">Réseaux Sociaux</span><span class="info-value" style="display:flex; flex-wrap:wrap; gap:6px;">${socialLinks.join('')}</span></div>`);
        } else if (d.hasSocialMedia) {
            rows.push(this._infoRow('Réseaux Sociaux', yesLabel));
        }
        // --- FIN DES MODIFICATIONS ---

        // --- MODIFICATIONS : Wikipedia ---
        const wikipediaUrl = this._getWikipediaUrl(t);
        if (wikipediaUrl) {
            rows.push(this._infoRow('Wikipedia', `<a href="${wikipediaUrl}" target="_blank" rel="noopener" style="color:${color}; font-weight:bold; text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Page Wikipédia ↗</a>`));
        }

        const hasPhotos = t.image || t.wikimedia_commons || t.mapillary || d.hasPhotos;
        if (hasPhotos) {
            rows.push(this._infoRow('Photos', yesLabel));
        }

        if (d.hasWikivoyage) {
            rows.push(this._infoRow('Wikivoyage', yesLabel));
        }

        let langLabel = '';
        if (d.wikidataLanguagesCount === null || d.wikidataLanguagesCount === undefined) {
            if (poi.tags.wikidata) {
                langLabel = `<span style="color:var(--color-text-muted);font-style:italic;">Chargement...</span>`;
            }
        } else if (d.wikidataLanguagesCount > 0) {
            const wikidataId = poi.tags.wikidata;
            const wikipediaTitle = poi.tags.wikipedia;
            let link = null;

            if (wikidataId) {
                link = `https://www.wikidata.org/wiki/${wikidataId}#sitelinks-wikipedia`;
            } else if (wikipediaTitle) {
                const parts = wikipediaTitle.split(':');
                const lang = parts.length > 1 ? parts[0] : 'fr';
                const title = parts.length > 1 ? parts[1] : parts[0];
                link = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
            }

            if (link) {
                langLabel = `<a href="${link}" target="_blank" rel="noopener" style="color:${color}; font-weight:bold; text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Voir les sources multilingues">
                    ${d.wikidataLanguagesCount} langue(s) ↗
                </a>`;
            } else {
                langLabel = `<span style="color:${color};font-weight:bold;">${d.wikidataLanguagesCount} langue(s)</span>`;
            }
        }

        if (langLabel) {
            rows.push(this._infoRow('Langues', langLabel));
        }

        return rows.join('');
    }

    /**
     * Met à jour le panneau Wikivoyage dans la section Marketing Digital
     * avec les données retournées par l'API Wikivoyage.
     * @param {{byLang: Object, allArticles: Array, totalUnique: number}|null} data
     */
    updateWikivoyagePanel(data) {
        const panel = document.getElementById('wikivoyage-panel');
        if (!panel) return;

        if (!data || data.totalUnique === 0) {
            panel.innerHTML = `
                <div class="ind-block" style="margin-top:6px;opacity:0.6;">
                    <div class="ind-block__header">
                        <span class="ind-block__title">🌍 Wikivoyage</span>
                    </div>
                    <div style="padding:6px 0;font-size:0.82rem;color:var(--color-text-muted);font-style:italic;">
                        Aucun article Wikivoyage trouvé dans cette zone
                    </div>
                </div>`;
            return;
        }

        const langsArray = Object.entries(data.byLang)
            .map(([lang, articles]) => ({ lang, count: articles.length }))
            .filter(l => l.count > 0)
            .sort((a, b) => b.count - a.count);

        const topLangs = langsArray.slice(0, 5); // display up to 5 language bars
        const maxCount = langsArray.length > 0 ? langsArray[0].count : 1;

        // Barres de progression
        const langBar = (label, count, max, color, flag) => {
            const pct = max > 0 ? Math.min((count / max) * 100, 100) : 0;
            return `<div class="ind-row">
                <div class="ind-row__head">
                    <span class="ind-row__label">${flag} ${label}</span>
                    <span class="ind-row__val" style="color:${color};">${count} article${count > 1 ? 's' : ''}</span>
                </div>
                <div class="ind-row__track"><div class="ind-row__fill" style="width:${pct}%;background:${color};"></div></div>
            </div>`;
        };

        const langInfo = {
            'fr': { name: 'Français', flag: '🇫🇷', color: '#3b82f6' },
            'en': { name: 'English', flag: '🇬🇧', color: '#f59e0b' },
            'de': { name: 'Deutsch', flag: '🇩🇪', color: '#10b981' },
            'it': { name: 'Italiano', flag: '🇮🇹', color: '#ef4444' },
            'es': { name: 'Español', flag: '🇪🇸', color: '#eab308' },
            'nl': { name: 'Nederlands', flag: '🇳🇱', color: '#f97316' },
            'pt': { name: 'Português', flag: '🇵🇹', color: '#8b5cf6' },
            'ru': { name: 'Русский', flag: '🇷🇺', color: '#06b6d4' },
            'zh': { name: '中文', flag: '🇨🇳', color: '#ec4899' },
            'ja': { name: '日本語', flag: '🇯🇵', color: '#f43f5e' },
            'pl': { name: 'Polski', flag: '🇵🇱', color: '#dc2626' },
            'sv': { name: 'Svenska', flag: '🇸🇪', color: '#3b82f6' },
            'vi': { name: 'Tiếng Việt', flag: '🇻🇳', color: '#ef4444' },
            'ro': { name: 'Română', flag: '🇷🇴', color: '#3b82f6' },
            'el': { name: 'Ελληνικά', flag: '🇬🇷', color: '#0ea5e9' }
        };

        const getLangInfo = (code) => langInfo[code] || { name: code.toUpperCase(), flag: '🌐', color: '#94a3b8' };

        const langBarsHtml = topLangs.map(l => {
            const info = getLangInfo(l.lang);
            return langBar(info.name, l.count, maxCount, info.color, info.flag);
        }).join('');

        // Liste des articles les plus proches (top 5)
        const allArticles = [...data.allArticles].sort((a, b) => a.dist - b.dist);

        // Dédupliquer par titre (garder la version la plus proche)
        const seen = new Set();
        const uniqueArticles = [];
        for (const a of allArticles) {
            const key = a.title.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                uniqueArticles.push(a);
            }
        }
        const top5 = uniqueArticles.slice(0, 5);

        let articleListHtml = '';
        if (top5.length > 0) {
            articleListHtml = `
                <div style="margin-top:8px;">
                    <div style="font-size:0.75rem;color:var(--color-text-muted);margin-bottom:4px;">Articles les plus proches :</div>
                    ${top5.map(a => {
                const flag = getLangInfo(a.lang).flag;
                const url = `https://${a.lang}.wikivoyage.org/wiki/${encodeURIComponent(a.title)}`;
                return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.8rem;">
                            <span>${flag}</span>
                            <a href="${url}" target="_blank" rel="noopener" style="color:var(--color-primary);text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.title}">${a.title}</a>
                        </div>`;
            }).join('')}
                </div>`;
        }

        panel.innerHTML = `
            <div class="ind-block" style="margin-top:6px;">
                <div class="ind-block__header">
                    <span class="ind-block__title">🌍 Wikivoyage</span>
                    <span class="ind-block__big">${data.totalUnique} <span class="ind-block__unit">article${data.totalUnique > 1 ? 's' : ''} unique${data.totalUnique > 1 ? 's' : ''}</span></span>
                </div>
                ${langBarsHtml}
                ${articleListHtml}
            </div>`;
    }

    updatePageviewsPanel(data) {
        const panel = document.getElementById('pageviews-panel');
        if (!panel) return;

        const results = data?.results ?? [];
        const totalWikiPois = data?.totalWikiPois ?? 0;

        const countLabel = `<span
            data-digital-filter="wikipedia"
            style="font-size:0.75rem;color:var(--color-text-muted);margin-top:2px;display:block;cursor:pointer;"
            title="Cliquer pour mettre en surbrillance les POIs avec une page Wikipedia">
            📖 ${totalWikiPois} POI${totalWikiPois > 1 ? 's' : ''} avec page Wikipedia dans cette zone
        </span>`;

        if (results.length === 0) {
            panel.innerHTML = `
                <div class="ind-block" style="margin-top:6px;opacity:0.75;">
                    <div class="ind-block__header">
                        <span class="ind-block__title">📊 Wikipedia Pageviews</span>
                    </div>
                    ${countLabel}
                    <div style="padding:6px 0;font-size:0.82rem;color:var(--color-text-muted);font-style:italic;">
                        ${totalWikiPois > 0 ? 'Données de vues non disponibles pour cette zone' : 'Aucun POI avec page Wikipedia dans cette zone'}
                    </div>
                </div>`;
            return;
        }

        const maxViews = results[0].views;
        const totalViews = results.reduce((s, d) => s + d.views, 0);

        const langInfo = {
            'fr': { name: 'Français', flag: '🇫🇷', color: '#3b82f6' },
            'en': { name: 'English', flag: '🇬🇧', color: '#f59e0b' },
            'de': { name: 'Deutsch', flag: '🇩🇪', color: '#10b981' },
            'it': { name: 'Italiano', flag: '🇮🇹', color: '#ef4444' },
            'es': { name: 'Español', flag: '🇪🇸', color: '#eab308' },
            'nl': { name: 'Nederlands', flag: '🇳🇱', color: '#f97316' },
            'pt': { name: 'Português', flag: '🇵🇹', color: '#8b5cf6' },
            'ru': { name: 'Русский', flag: '🇷🇺', color: '#06b6d4' },
            'zh': { name: '中文', flag: '🇨🇳', color: '#ec4899' },
            'ja': { name: '日本語', flag: '🇯🇵', color: '#f43f5e' },
            'pl': { name: 'Polski', flag: '🇵🇱', color: '#dc2626' },
            'sv': { name: 'Svenska', flag: '🇸🇪', color: '#3b82f6' },
            'vi': { name: 'Tiếng Việt', flag: '🇻🇳', color: '#ef4444' },
            'ro': { name: 'Română', flag: '🇷🇴', color: '#3b82f6' },
            'el': { name: 'Ελληνικά', flag: '🇬🇷', color: '#0ea5e9' }
        };
        const getLangInfo = (code) => langInfo[code] || { name: code.toUpperCase(), flag: '🌐', color: '#94a3b8' };

        const rows = results.slice(0, 5).map((item, idx) => {
            const pct = maxViews > 0 ? Math.min((item.views / maxViews) * 100, 100) : 0;
            const formattedViews = item.views.toLocaleString('fr-FR');
            const flag = getLangInfo(item.lang).flag;
            const url = `https://${item.lang}.wikipedia.org/wiki/${encodeURIComponent(item.articleTitle.replace(/ /g, '_'))}`;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            return `
                <div class="ind-row" style="margin-bottom:4px;">
                    <div class="ind-row__head">
                        <span class="ind-row__label" style="display:flex;align-items:center;gap:4px;">
                            <span>${medal}</span>
                            <a href="${url}" target="_blank" rel="noopener"
                               style="color:var(--color-text-primary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;"
                               title="${item.articleTitle}">${item.name}</a>
                            <span style="font-size:0.7rem;opacity:0.6;">${flag}</span>
                        </span>
                        <span class="ind-row__val" style="color:#60a5fa;white-space:nowrap;">${formattedViews} vues</span>
                    </div>
                    <div class="ind-row__track">
                        <div class="ind-row__fill" style="width:${pct}%;background:linear-gradient(90deg,rgba(96,165,250,0.4),rgba(96,165,250,1));"></div>
                    </div>
                </div>`;
        }).join('');

        panel.innerHTML = `
            <div class="ind-block" style="margin-top:6px;">
                <div class="ind-block__header">
                    <span class="ind-block__title">📊 Wikipedia Pageviews</span>
                    <span class="ind-block__big">${totalViews.toLocaleString('fr-FR')} <span class="ind-block__unit">vues / 3 mois</span></span>
                </div>
                ${countLabel}
                <div style="font-size:0.72rem;color:var(--color-text-muted);margin:6px 0 8px;">
                    Top ${results.slice(0, 5).length} les plus consultés
                </div>
                ${rows}
            </div>`;

        // Re-bind digital filter clicks to include the new wikipedia element
        if (this.macroStats) this._bindDigitalFilterClicks();
    }

    /** Build general info rows for the 'Informations générales' section */
    _buildGeneralInfoRows(poi, color) {
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

        if (t.operator) rows.push(this._infoRow('Opérateur', t.operator));
        if (t.brand) rows.push(this._infoRow('Enseigne', t.brand));
        if (t.ele) rows.push(this._infoRow('Altitude', t.ele + ' m'));
        if (t.start_date) rows.push(this._infoRow('Création', t.start_date));
        if (t.description) rows.push(this._infoRow('Description', t.description));

        if (poi.lat != null && poi.lng != null) {
            rows.push(this._infoRow('Coordonnées',
                `${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}`));
        }

        if (poi.osmMetadata && poi.osmMetadata.timestamp) {
            rows.push(this._infoRow('Dernière modification OSM', this._formatOsmDate(poi.osmMetadata.timestamp)));
        }

        // ── UNESCO & Natura 2000 indicators ──
        const formatDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

        if (poi.isInWhcSite) {
            rows.push(this._infoRow('🏛️ World Heritage Site',
                `<span style="color:#22c55e;font-weight:600;">✔ Oui</span> <span style="color:var(--color-text-muted);font-size:0.8em;">(${poi.nearestWhcName})</span>`));
        }

        if (poi.isInNaturaSite) {
            rows.push(this._infoRow('🌿 Natura 2000',
                `<span style="color:#22c55e;font-weight:600;">✔ Oui</span> <span style="color:var(--color-text-muted);font-size:0.8em;">(${poi.nearestNaturaName})</span>`));
        }

        return rows.join('') || '<p style="color:var(--color-text-muted);font-size:0.85rem;">Aucune donnée disponible.</p>';
    }

    /** Build infra rows for the 'Infrastructures & activités' section */
    _buildInfraRows(poi, color) {
        const t = poi.tags;
        const rows = [];
        const formatDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

        // Transport distances
        if (poi.nearestBusStopDist !== undefined) {
            const busName = poi.nearestBusStopName || 'Arrêt de bus';
            rows.push(this._infoRow('🚌 Bus le plus proche',
                `<span style="color:${color};font-weight:600">${busName}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestBusStopDist)}</span>`));
        }
        if (poi.nearestTrainStationDist !== undefined) {
            const trainName = poi.nearestTrainStationName || 'Gare';
            rows.push(this._infoRow('🚉 Gare la plus proche',
                `<span style="color:${color};font-weight:600">${trainName}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestTrainStationDist)}</span>`));
        }
        if (poi.nearestAirportDist !== undefined) {
            const airportName = poi.nearestAirportName || 'Aéroport';
            rows.push(this._infoRow('✈️ Aéroport le plus proche',
                `<span style="color:${color};font-weight:600">${airportName}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestAirportDist)}</span>`));
        }

        if (t.fee) rows.push(this._infoRow('Tarif', t.fee === 'yes' ? 'Payant' : t.fee === 'no' ? 'Gratuit' : t.fee));
        if (t.access) rows.push(this._infoRow('Accès', t.access));

        return rows.join('') || '<p style="color:var(--color-text-muted);font-size:0.85rem;">Aucune donnée d\'infrastructure.</p>';
    }

    /** Build access routes distance rows */
    _buildAccessRows(poi, color) {
        const rows = [];
        const formatDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

        if (poi.nearestRoadDist !== undefined) {
            rows.push(this._infoRow('🛣️ Route',
                `<span style="color:${color};font-weight:600">${poi.nearestRoadName || 'Route'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestRoadDist)}</span>`));
        }
        if (poi.nearestHikingDist !== undefined) {
            rows.push(this._infoRow('🥾 Sentier rando',
                `<span style="color:${color};font-weight:600">${poi.nearestHikingName || 'Sentier'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestHikingDist)}</span>`));
        }
        if (poi.nearestCyclingDist !== undefined) {
            rows.push(this._infoRow('🚴 Piste cyclable',
                `<span style="color:${color};font-weight:600">${poi.nearestCyclingName || 'Piste cyclable'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestCyclingDist)}</span>`));
        }

        return rows.length > 0 ? `<div class="detail-info" style="padding:4px 0;">${rows.join('')}</div>` : '';
    }

    /** Build nearest services distance rows (parking, toilets, charging) */
    _buildServiceRows(poi, color) {
        const rows = [];
        const formatDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

        if (poi.nearestServiceParkingDist !== undefined) {
            rows.push(this._infoRow('🅿️ Parking le plus proche',
                `<span style="color:${color};font-weight:600">${poi.nearestServiceParkingName || 'Parking'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestServiceParkingDist)}</span>`));
        }
        if (poi.nearestServiceToiletsDist !== undefined) {
            rows.push(this._infoRow('🚻 Toilettes les plus proches',
                `<span style="color:${color};font-weight:600">${poi.nearestServiceToiletsName || 'Toilettes'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestServiceToiletsDist)}</span>`));
        }
        if (poi.nearestServiceChargingDist !== undefined) {
            rows.push(this._infoRow('⚡ Borne de recharge la plus proche',
                `<span style="color:${color};font-weight:600">${poi.nearestServiceChargingName || 'Borne de recharge'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestServiceChargingDist)}</span>`));
        }

        return rows.length > 0 ? `<div class="detail-info" style="padding:4px 0;">${rows.join('')}</div>` : '';
    }

    /** Build nearest environment site distance rows */
    _buildEnvDistRows(poi, color) {
        const rows = [];
        const formatDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

        if (poi.nearestWhcDist !== undefined) {
            rows.push(this._infoRow('🏛️ Site UNESCO le plus proche',
                `<span style="color:${color};font-weight:600;">${poi.nearestWhcName}</span><br><span style="color:var(--color-text-muted);">${formatDist(poi.nearestWhcDist)}</span>`));
        }
        if (poi.nearestNaturaDist !== undefined) {
            rows.push(this._infoRow('🌿 Site Natura 2000 le plus proche',
                `<span style="color:${color};font-weight:600;">${poi.nearestNaturaName}</span><br><span style="color:var(--color-text-muted);">${formatDist(poi.nearestNaturaDist)}</span>`));
        }

        return rows.length > 0 ? `<div class="detail-info" style="padding:4px 0;">${rows.join('')}</div>` : '';
    }

    /** Build nearest accommodation distance rows */
    _buildAccomDistRows(poi, color) {
        const rows = [];
        const formatDist = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

        if (poi.nearestAccomHotelDist !== undefined) {
            rows.push(this._infoRow('🏨 Hôtel',
                `<span style="color:${color};font-weight:600">${poi.nearestAccomHotelName || 'Hôtel'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestAccomHotelDist)}</span>`));
        }
        if (poi.nearestAccomCampingDist !== undefined) {
            rows.push(this._infoRow('⛺ Camping',
                `<span style="color:${color};font-weight:600">${poi.nearestAccomCampingName || 'Camping'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestAccomCampingDist)}</span>`));
        }
        if (poi.nearestAccomRefugeDist !== undefined) {
            rows.push(this._infoRow('🏔️ Refuge',
                `<span style="color:${color};font-weight:600">${poi.nearestAccomRefugeName || 'Refuge'}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestAccomRefugeDist)}</span>`));
        }
        if (poi.nearestAccomGiteDist !== undefined) {
            rows.push(this._infoRow("🏡 Maison d'hôtes",
                `<span style="color:${color};font-weight:600">${poi.nearestAccomGiteName || "Maison d'hôtes"}</span><br><span style="color:var(--color-text-muted)">${formatDist(poi.nearestAccomGiteDist)}</span>`));
        }

        return rows.length > 0 ? `<div class="detail-info" style="padding:4px 0;">${rows.join('')}</div>` : '';
    }

    /** Build tourisme rows for the 'Tourisme' section */
    _buildTourismeRows(poi, color) {
        const t = poi.tags;
        const rows = [];

        if (t.cuisine) rows.push(this._infoRow('Cuisine', t.cuisine.replace(/_/g, ' ')));
        if (t.stars) rows.push(this._infoRow('Étoiles', isNaN(t.stars) ? t.stars : '★'.repeat(Number(t.stars))));
        if (t.capacity) rows.push(this._infoRow('Capacité', t.capacity + ' pers.'));
        if (t.wikipedia && !t.wikidata) {
            const wikiTitle = t.wikipedia.replace(/^fr:/, '');
            rows.push(this._infoRow('Wikipédia',
                `<a href="https://fr.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}" target="_blank" style="color:${color}">Voir l'article ↗</a>`));
        }

        return rows.join('');
    }

    /** Backward compat: Build all OSM info rows (legacy) */
    _buildOsmRows(poi, color) {
        return this._buildGeneralInfoRows(poi, color)
            + this._buildInfraRows(poi, color)
            + this._buildTourismeRows(poi, color);
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
        const searchQuery = this.poiSearchInput ? this.poiSearchInput.value.toLowerCase().trim() : '';
        let filtered = this.lastPois;

        // Filtrage textuel sur le nom et le type
        if (searchQuery.length > 0) {
            filtered = filtered.filter(p =>
                (p.name && p.name.toLowerCase().includes(searchQuery)) ||
                (p.type && p.type.toLowerCase().includes(searchQuery))
            );
        }

        // Filtrage par catégorie spotlight (sans écraser lastPois)
        const spotlight = this.currentCatSpotlight || '';
        if (spotlight) {
            // On ne filtre pas ici, le spotlight est géré dans _renderSortedList
        }

        if (filtered.length === 0) {
            this.poiList.innerHTML = searchQuery.length > 0
                ? `<p class="empty-state">Aucun résultat pour « ${this.escapeHtml(searchQuery)} »</p>`
                : '<p class="empty-state">Aucun point d\'intérêt trouvé dans cette zone.</p>';
            return;
        }

        this._renderSortedList(filtered);
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

    _formatOsmDate(dateStr) {
        if (!dateStr) return 'Inconnue';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateStr;
        }
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
            'motel': 'Motel', 'bed_and_breakfast': 'Chambre d\'hôtes', 'holiday_flat': 'Meublé de tourisme',
            'camp_site': 'Camping', 'caravan_site': 'Aire camping-car', 'camp_pitch': 'Emplacement',
            'alpine_hut': 'Refuge de montagne', 'wilderness_hut': 'Refuge nature', 'apartment': 'Appartement',
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
            'yes': 'Oui', 'antenna': 'Antenne', 'mast': 'Mât', 'tower': 'Tour',
            'station': 'Gare', 'halt': 'Halte ferroviaire', 'stop': 'Gare',
            'aerodrome': 'Aérodrome', 'airport': 'Aéroport'
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

    _toggleFullScreenChart(data, layout, source = 'unknown') {
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

        if (data[0] && data[0].type === 'treemap') {
            this.fsChartContainer.on('plotly_click', (eventData) => {
                if (eventData.points && eventData.points.length > 0) {
                    const point = eventData.points[0];
                    if (this.onTreemapItemClick) this.onTreemapItemClick(point.id, point.parent, source);

                    // Optionnel: fermer la vue plein écran après un clic ?
                    // this._closeFullScreenChart();
                }
            });
        }
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
            white-space: normal;
            word-break: break-word;
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

    // ══════════════════════════════════════════════════════════════════════════
    //  EXPORT CSV — Macro + Micro
    // ══════════════════════════════════════════════════════════════════════════

    /** Attache l'événement click au bouton export statique (appelé une seule fois à l'init) */
    _bindExportButton() {
        const btn = document.getElementById('export-zone-btn');
        if (btn && !btn._exportBound) {
            btn._exportBound = true;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onExportRequest) this.onExportRequest();
            });
        }
    }

    /** Affiche le bouton export (icône dans la barre gauche) */
    _showExportButton() {
        const btn = document.getElementById('export-zone-btn');
        if (btn) {
            btn.classList.remove('hidden');
            // Bind au premier appel si pas encore fait
            this._bindExportButton();
        }
    }

    /** Cache le bouton export */
    _hideExportButton() {
        const btn = document.getElementById('export-zone-btn');
        if (btn) btn.classList.add('hidden');
    }

    /** Déclenche le téléchargement d'un fichier CSV */
    _downloadCsv(csvContent, filename) {
        const BOM = '\uFEFF'; // UTF-8 BOM pour Excel
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Échapper une valeur pour CSV (point-virgule comme séparateur).
     * Entoure de guillemets si la valeur contient ;, ", ou saut de ligne.
     */
    _csvEscape(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    /**
     * Génère le contenu CSV du fichier Macro.
     * @param {object} data — Objet avec toutes les données agrégées de la zone
     * @returns {string} contenu CSV
     */
    generateMacroCsv(data) {
        const esc = (v) => this._csvEscape(v);
        const rows = [['CATÉGORIE', 'INDICATEUR', 'VALEUR', 'UNITÉ'].map(esc).join(';')];

        const addRow = (cat, ind, val, unit = '') => {
            rows.push([esc(cat), esc(ind), esc(val), esc(unit)].join(';'));
        };

        // ── Informations générales ──
        const G = 'Informations générales';
        addRow(G, 'Nombre de POIs (total)', data.totalRaw, 'POIs');
        addRow(G, 'Nombre de POIs (affichés)', data.totalFiltered, 'POIs');
        if (data.areaKm2 > 0) addRow(G, 'Superficie', data.areaKm2.toFixed(2), 'km²');
        addRow(G, 'Sites UNESCO dans la zone', data.whcCount, 'sites');
        addRow(G, 'Sites Natura 2000 dans la zone', data.naturaCount, 'sites');
        if (data.population) addRow(G, 'Population', data.population, 'habitants');
        if (data.hierarchy) {
            if (data.hierarchy.country) addRow(G, 'Pays', data.hierarchy.country);
            if (data.hierarchy.region) addRow(G, 'Région', data.hierarchy.region);
            if (data.hierarchy.dept) addRow(G, 'Département', data.hierarchy.dept);
            if (data.hierarchy.city) addRow(G, 'Ville', data.hierarchy.city);
        }
        if (data.zoneName) addRow(G, 'Nom de la zone', data.zoneName);

        // ── Infrastructures ──
        const I = 'Infrastructures & activités';
        addRow(I, 'Arrêts de bus', data.busStopCount, 'arrêts');
        addRow(I, 'Gares', data.trainStationCount, 'gares');
        addRow(I, 'Aéroports', data.airportCount, 'aéroports');
        addRow(I, 'Stationnements', data.parkingCount, 'places');
        addRow(I, 'Sanitaires', data.sanitaryCount, 'installations');
        addRow(I, 'Bornes de recharge', data.chargingCount, 'bornes');
        addRow(I, 'Sentiers piétons (nombre)', data.pedestrianTrailCount, 'tracés');
        addRow(I, 'Sentiers piétons (longueur)', data.pedestrianTrailLength.toFixed(1), 'km');
        addRow(I, 'Pistes cyclables (nombre)', data.cyclingTrailCount, 'tracés');
        addRow(I, 'Pistes cyclables (longueur)', data.cyclingTrailLength.toFixed(1), 'km');
        addRow(I, 'Km total des sentiers', (data.pedestrianTrailLength + data.cyclingTrailLength).toFixed(1), 'km');

        // ── Tourisme ──
        const T = 'Tourisme';
        addRow(T, 'Hébergements', data.accommodationCount, 'établissements');
        addRow(T, 'Lits (total)', data.totalBeds, 'lits');
        addRow(T, 'Chambres (total)', data.totalRooms, 'chambres');
        if (data.inseeStats) {
            addRow(T, 'Hébergements INSEE', data.inseeStats.total_loc, 'établissements');
            addRow(T, 'Lits hôtels (INSEE)', data.inseeStats.hotel_beds, 'lits');
            addRow(T, 'Lits campings (INSEE)', data.inseeStats.camping_beds, 'lits');
            addRow(T, 'Lits héb. collectifs (INSEE)', data.inseeStats.collective_beds, 'lits');
            if (data.inseeStats.hotel_stars) {
                Object.entries(data.inseeStats.hotel_stars)
                    .filter(([rank, val]) => val > 0 && rank !== 'NC')
                    .forEach(([rank, count]) => {
                        addRow(T, `Hôtels ${rank} étoile(s)`, count, 'hôtels');
                    });
            }
        }

        // ── INSSE Roumanie ──
        if (data.romaniaStats?.data?.monthly_data) {
            const R = 'Tourisme INSSE Roumanie';
            const roData = data.romaniaStats.data;
            const roMonths = Object.keys(roData.monthly_data).sort();
            if (roMonths.length > 0) {
                const roTotalArrivals = roMonths.reduce((s, m) => s + (roData.monthly_data[m]?.arrivals?.total || 0), 0);
                const roTotalNights = roMonths.reduce((s, m) => s + (roData.monthly_data[m]?.overnight_stays?.total || 0), 0);
                const roTotalBedCap = roMonths.reduce((s, m) => s + (roData.monthly_data[m]?.bed_capacity?.total || 0), 0);
                addRow(R, 'Comté', data.romaniaStats.countyName);
                addRow(R, 'Période couverte', `${roMonths[0]} → ${roMonths[roMonths.length - 1]}`, 'mois');
                addRow(R, 'Arrivées totales (TUR104H)', roTotalArrivals, 'personnes');
                addRow(R, 'Nuitées totales (TUR105H)', roTotalNights, 'nuitées');
                if (roTotalArrivals > 0) {
                    addRow(R, 'Durée Moyenne de Séjour (TUR105H / TUR104H)', (roTotalNights / roTotalArrivals).toFixed(2), 'nuits / arrivée');
                }
                addRow(R, 'Capacité lits cumulée (TUR103F)', roTotalBedCap, 'places-jours');
                if (roTotalBedCap > 0) {
                    addRow(R, 'Taux d\'occupation moyen', ((roTotalNights / roTotalBedCap) * 100).toFixed(1), '%');
                }
                // Capacité annuelle dernière année
                if (roData.annual_capacity?.total) {
                    const years = Object.keys(roData.annual_capacity.total).sort();
                    if (years.length > 0) {
                        const latestYear = years[years.length - 1];
                        addRow(R, `Capacité annuelle ${latestYear} (TUR102C)`, roData.annual_capacity.total[latestYear], 'places');
                    }
                }
            }
        }

        // ── Marketing digital ──
        const M = 'Marketing digital';
        addRow(M, 'Présence numérique', data.digitalPresenceCount, 'POIs');
        if (data.totalFiltered > 0) {
            addRow(M, 'Présence numérique (%)', (data.digitalPresenceCount / data.totalFiltered * 100).toFixed(1), '%');
        }
        addRow(M, 'Avec site web', data.websiteCount, 'POIs');
        addRow(M, 'Avec réseaux sociaux', data.socialMediaCount, 'POIs');
        addRow(M, 'Avec Wikivoyage', data.wikivoyageCount, 'POIs');

        // ── Densités ──
        if (data.areaKm2 > 0) {
            const D = 'Densités';
            addRow(D, 'Densité sentiers piétons', (data.pedestrianTrailLength / data.areaKm2).toFixed(2), 'km / km²');
            addRow(D, 'Densité pistes cyclables', (data.cyclingTrailLength / data.areaKm2).toFixed(2), 'km / km²');
            if (data.population && data.population > 0) {
                let bestBeds = data.totalBeds; // fallback OSM
                let bedSource = 'OSM';
                if (data.inseeStats) {
                    bestBeds = data.inseeStats.hotel_beds + data.inseeStats.camping_beds + data.inseeStats.collective_beds;
                    bedSource = 'INSEE';
                } else if (data.romaniaStats?.data?.annual_capacity?.total) {
                    const years = Object.keys(data.romaniaStats.data.annual_capacity.total).sort();
                    if (years.length > 0) {
                        bestBeds = data.romaniaStats.data.annual_capacity.total[years[years.length - 1]];
                        bedSource = 'INSSE';
                    }
                }
                addRow(D, 'Capacité d\'accueil', ((bestBeds / data.population) * 100).toFixed(1), 'lits / 100 hab.');
                addRow(D, `Accommodation Intensity (${bedSource})`, (bestBeds / data.population).toFixed(4), 'lits / hab.');
            }
        }

        // ── Catégories de POIs ──
        const C = 'Répartition POIs';
        const categoryCounts = {};
        data.pois.forEach(p => {
            categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
        });
        const catLabels = this.categories.reduce((acc, c) => { acc[c.id] = c.label; return acc; }, {});
        Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([catId, count]) => {
                addRow(C, catLabels[catId] || catId, count, 'POIs');
            });

        return rows.join('\n');
    }

    /**
     * Génère le contenu CSV du fichier Micro.
     * Dynamique : scanne toutes les propriétés présentes dans les POIs.
     * @param {Array} pois — Liste des POIs
     * @returns {string} contenu CSV
     */
    generateMicroCsv(pois) {
        if (!pois || pois.length === 0) return '';

        const esc = (v) => this._csvEscape(v);
        const catLabels = this.categories.reduce((acc, c) => { acc[c.id] = c.label; return acc; }, {});
        const fmtDist = (d) => d !== undefined && d !== null ? Math.round(d) : '';
        const yesNo = (v) => v ? 'Oui' : 'Non';

        // ── Définition des colonnes, organisées par catégorie ──
        const columns = [
            // Identité
            { header: 'ID_OSM', get: p => p.id },
            { header: 'Nom', get: p => p.name },
            { header: 'Catégorie', get: p => catLabels[p.category] || p.category },
            { header: 'Type', get: p => this.translateType(p.type) },
            { header: 'Type_brut', get: p => p.type },
            { header: 'Latitude', get: p => p.lat },
            { header: 'Longitude', get: p => p.lng || p.lon },

            // Wikipedia
            { header: 'Wikipedia_tag', get: p => p.tags?.wikipedia || '' },
            { header: 'Wikidata_tag', get: p => p.tags?.wikidata || '' },
            { header: 'Wikipedia_URL', get: p => {
                const url = this._getWikipediaUrl(p.tags || {});
                return url || '';
            }},

            // Photos
            { header: 'Photo_image', get: p => p.tags?.image || '' },
            { header: 'Photo_wikimedia', get: p => p.tags?.wikimedia_commons || '' },
            { header: 'Photo_mapillary', get: p => p.tags?.mapillary || '' },
            { header: 'Photos_présentes', get: p => yesNo(p.tags?.image || p.tags?.wikimedia_commons || p.tags?.mapillary || p.digital?.hasPhotos) },

            // Langues
            { header: 'Langues_Wikidata', get: p => p.digital?.wikidataLanguagesCount != null ? p.digital.wikidataLanguagesCount : '' },

            // UNESCO
            { header: 'UNESCO_distance_m', get: p => fmtDist(p.nearestWhcDist) },
            { header: 'UNESCO_nom', get: p => p.nearestWhcName || '' },
            { header: 'Dans_site_UNESCO', get: p => p.isInWhcSite !== undefined ? yesNo(p.isInWhcSite) : '' },

            // Natura 2000
            { header: 'Natura2000_distance_m', get: p => fmtDist(p.nearestNaturaDist) },
            { header: 'Natura2000_nom', get: p => p.nearestNaturaName || '' },
            { header: 'Dans_site_Natura2000', get: p => p.isInNaturaSite !== undefined ? yesNo(p.isInNaturaSite) : '' },

            // Bornes de recharge
            { header: 'Borne_recharge_distance_m', get: p => fmtDist(p.nearestServiceChargingDist) },
            { header: 'Borne_recharge_nom', get: p => p.nearestServiceChargingName || '' },

            // Transport
            { header: 'Bus_distance_m', get: p => fmtDist(p.nearestBusStopDist) },
            { header: 'Bus_nom', get: p => p.nearestBusStopName || '' },
            { header: 'Gare_distance_m', get: p => fmtDist(p.nearestTrainStationDist) },
            { header: 'Gare_nom', get: p => p.nearestTrainStationName || '' },
            { header: 'Aéroport_distance_m', get: p => fmtDist(p.nearestAirportDist) },
            { header: 'Aéroport_nom', get: p => p.nearestAirportName || '' },

            // Services
            { header: 'Parking_distance_m', get: p => fmtDist(p.nearestServiceParkingDist) },
            { header: 'Parking_nom', get: p => p.nearestServiceParkingName || '' },
            { header: 'Toilettes_distance_m', get: p => fmtDist(p.nearestServiceToiletsDist) },
            { header: 'Toilettes_nom', get: p => p.nearestServiceToiletsName || '' },

            // Voies d'accès
            { header: 'Route_distance_m', get: p => fmtDist(p.nearestRoadDist) },
            { header: 'Route_nom', get: p => p.nearestRoadName || '' },
            { header: 'Rando_distance_m', get: p => fmtDist(p.nearestHikingDist) },
            { header: 'Rando_nom', get: p => p.nearestHikingName || '' },
            { header: 'Cyclable_distance_m', get: p => fmtDist(p.nearestCyclingDist) },
            { header: 'Cyclable_nom', get: p => p.nearestCyclingName || '' },

            // Hébergement le plus proche
            { header: 'Hôtel_distance_m', get: p => fmtDist(p.nearestAccomHotelDist) },
            { header: 'Hôtel_nom', get: p => p.nearestAccomHotelName || '' },
            { header: 'Camping_distance_m', get: p => fmtDist(p.nearestAccomCampingDist) },
            { header: 'Camping_nom', get: p => p.nearestAccomCampingName || '' },
            { header: 'Refuge_distance_m', get: p => fmtDist(p.nearestAccomRefugeDist) },
            { header: 'Refuge_nom', get: p => p.nearestAccomRefugeName || '' },
            { header: 'Gîte_distance_m', get: p => fmtDist(p.nearestAccomGiteDist) },
            { header: 'Gîte_nom', get: p => p.nearestAccomGiteName || '' },

            // Digital
            { header: 'Site_web', get: p => yesNo(p.digital?.hasWebsite) },
            { header: 'Site_web_URL', get: p => p.tags?.website || p.tags?.['contact:website'] || p.tags?.url || '' },
            { header: 'Réseaux_sociaux', get: p => yesNo(p.digital?.hasSocialMedia) },
            { header: 'Facebook', get: p => p.tags?.facebook || p.tags?.['contact:facebook'] || '' },
            { header: 'Instagram', get: p => p.tags?.instagram || p.tags?.['contact:instagram'] || '' },
            { header: 'Twitter', get: p => p.tags?.twitter || p.tags?.['contact:twitter'] || '' },
            { header: 'Youtube', get: p => p.tags?.youtube || p.tags?.['contact:youtube'] || '' },
            { header: 'Wikivoyage', get: p => yesNo(p.digital?.hasWikivoyage) },

            // Tourisme
            { header: 'Étoiles', get: p => p.tags?.stars || p.tags?.['stars:tourism'] || '' },
            { header: 'Cuisine', get: p => p.tags?.cuisine || '' },
            { header: 'Capacité', get: p => p.tags?.capacity || '' },
            { header: 'Lits', get: p => p.tags?.beds || '' },
            { header: 'Chambres', get: p => p.tags?.rooms || '' },
            { header: 'Horaires', get: p => p.tags?.opening_hours || '' },
            { header: 'PMR', get: p => p.tags?.wheelchair || '' },

            // Infos générales
            { header: 'Description', get: p => p.tags?.description || p.tags?.['description:fr'] || '' },
            { header: 'Téléphone', get: p => p.tags?.phone || p.tags?.['contact:phone'] || '' },
            { header: 'Email', get: p => p.tags?.email || p.tags?.['contact:email'] || '' },
            { header: 'Adresse', get: p => {
                const t = p.tags || {};
                const parts = [t['addr:housenumber'], t['addr:street'], t['addr:postcode'], t['addr:city']].filter(Boolean);
                return parts.join(' ');
            }},
            { header: 'Altitude', get: p => p.tags?.ele || '' },

            // OSM Métadonnées
            { header: 'OSM_version', get: p => p.osmMetadata?.version || '' },
            { header: 'OSM_dernière_modif', get: p => p.osmMetadata?.timestamp || '' },
            { header: 'OSM_utilisateur', get: p => p.osmMetadata?.user || '' },

            // Score de complétude
            { header: 'Score_complétude_%', get: p => {
                try { return this._computeCompleteness(p); } catch(e) { return ''; }
            }},
        ];

        // ── Détecter les tags OSM supplémentaires non encore couverts ──
        // On scanne toutes les clés de tags présentes dans les POIs
        const coveredTagKeys = new Set([
            'name', 'wikipedia', 'wikidata', 'image', 'wikimedia_commons', 'mapillary',
            'website', 'contact:website', 'url', 'facebook', 'contact:facebook',
            'instagram', 'contact:instagram', 'twitter', 'contact:twitter',
            'youtube', 'contact:youtube', 'linkedin', 'contact:linkedin',
            'tiktok', 'contact:tiktok', 'wikivoyage', 'stars', 'stars:tourism',
            'cuisine', 'capacity', 'beds', 'rooms', 'opening_hours', 'wheelchair',
            'description', 'description:fr', 'phone', 'contact:phone',
            'email', 'contact:email', 'addr:housenumber', 'addr:street',
            'addr:postcode', 'addr:city', 'ele'
        ]);

        const extraTagKeys = new Set();
        pois.forEach(p => {
            if (p.tags) {
                Object.keys(p.tags).forEach(key => {
                    if (!coveredTagKeys.has(key)) extraTagKeys.add(key);
                });
            }
        });

        // Ajouter les colonnes dynamiques pour les tags non couverts
        const sortedExtraTags = Array.from(extraTagKeys).sort();
        sortedExtraTags.forEach(tagKey => {
            columns.push({
                header: `tag:${tagKey}`,
                get: p => p.tags?.[tagKey] || ''
            });
        });

        // ── Générer le CSV ──
        const headerRow = columns.map(c => esc(c.header)).join(';');
        const dataRows = pois.map(poi => {
            return columns.map(col => esc(col.get(poi))).join(';');
        });

        return [headerRow, ...dataRows].join('\n');
    }

    // ═══════════════════════════════════════════════════════════════════
    //  DASHBOARD MINIMALISTE — 6 KPIs
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Renders the minimalist 6-KPI dashboard panel below the macro-overlay.
     * Called at the end of renderMacroStats() to keep data in sync.
     */
    renderDashboard(pois, networks = [], areaKm2 = 0, totalRaw = 0, inseeStats = null, hierarchy = null, population = null, romaniaStats = null) {
        if (!this.dashboardPanel || !this.dashboardGrid) return;

        // Show panel
        this.dashboardPanel.style.display = '';

        // ── 1. LOCALISATION ─────────────────────────────────────────────────
        let locHtml = '';
        if (hierarchy && typeof hierarchy === 'object') {
            const parts = [];
            if (hierarchy.country) parts.push(`<span class="dash-breadcrumb__item">${hierarchy.country}</span>`);
            if (hierarchy.region)  parts.push(`<span class="dash-breadcrumb__item">${hierarchy.region}</span>`);
            if (hierarchy.dept)    parts.push(`<span class="dash-breadcrumb__item">${hierarchy.dept}</span>`);
            if (hierarchy.city)    parts.push(`<span class="dash-breadcrumb__item dash-breadcrumb__item--highlight">${hierarchy.city}</span>`);
            locHtml = parts.join('<span class="dash-breadcrumb__sep">›</span>');
        }
        if (!locHtml) locHtml = '<span class="dash-breadcrumb__item" style="opacity:0.5;">Zone personnalisée</span>';

        const locCard = `
            <div class="dashboard-kpi dashboard-kpi--loc">
                <div class="dashboard-kpi__title">📍 Localisation</div>
                <div class="dashboard-kpi__body">
                    <div class="dash-breadcrumb">${locHtml}</div>
                </div>
            </div>`;

        // ── 2. INFRASTRUCTURES ───────────────────────────────────────────────
        const busTypes = new Set(['bus_stop', 'bus_station', 'platform']);
        const trainTypes = new Set(['station', 'halt', 'tram_stop', 'subway_entrance']);
        const airportTypes = new Set(['aerodrome', 'aeroway', 'airport']);
        let transportTotal = 0, servicesTotal = 0;

        pois.forEach(p => {
            const pType = p.type || '';
            // Transport
            if (busTypes.has(pType) || (p.tags && p.tags.bus === 'yes') || (p.tags && p.tags.highway === 'bus_stop')) transportTotal++;
            if (trainTypes.has(pType) || (p.tags && p.tags.railway === 'station') || (p.tags && p.tags.railway === 'halt')) transportTotal++;
            if (airportTypes.has(pType) || (p.tags && p.tags.aeroway === 'aerodrome')) transportTotal++;
            // Services
            if (pType === 'parking' || pType === 'parking_space' || pType === 'bicycle_parking' || (p.tags && p.tags.amenity === 'parking')) servicesTotal++;
            if (pType === 'toilets' || pType === 'shower' || pType === 'drinking_water' || (p.tags && (p.tags.amenity === 'toilets' || p.tags.amenity === 'shower' || p.tags.amenity === 'drinking_water'))) servicesTotal++;
            if (pType === 'charging_station' || (p.tags && p.tags.amenity === 'charging_station')) servicesTotal++;
        });

        const infraCard = `
            <div class="dashboard-kpi dashboard-kpi--infra">
                <div class="dashboard-kpi__title">🏗️ Infrastructures</div>
                <div class="dashboard-kpi__body">
                    <div class="dash-badge-row">
                        <div class="dash-badge dash-badge--transport">
                            <span class="dash-badge__val">${transportTotal.toLocaleString('fr-FR')}</span>
                            <span class="dash-badge__label">Points d'accès</span>
                        </div>
                        <div class="dash-badge dash-badge--service">
                            <span class="dash-badge__val">${servicesTotal.toLocaleString('fr-FR')}</span>
                            <span class="dash-badge__label">Installations</span>
                        </div>
                    </div>
                </div>
            </div>`;

        // ── 3. SLOW MOBILITY ─────────────────────────────────────────────────
        const pedestrianTypes = new Set(['path', 'footway', 'pedestrian', 'living_street']);
        const cyclingTypes = new Set(['cycleway']);
        let pedLength = 0, cycleLength = 0;

        networks.forEach(net => {
            const t = net.type;
            const route = net.relationRoute;
            if (pedestrianTypes.has(t) || route === 'hiking' || route === 'foot' || (net.tags && net.tags.sac_scale)) {
                pedLength += this._getPathLength(net.geometry);
            } else if (cyclingTypes.has(t) || route === 'bicycle' || route === 'mtb') {
                cycleLength += this._getPathLength(net.geometry);
            }
        });

        const pedDensity = areaKm2 > 0 ? pedLength / areaKm2 : 0;
        const cycleDensity = areaKm2 > 0 ? cycleLength / areaKm2 : 0;
        const maxDensity = Math.max(pedDensity, cycleDensity, 0.1);

        const dashBar = (label, value, max, color, suffix = '') => {
            const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
            const fmt = value < 0.01 && value > 0 ? value.toExponential(1) : value.toFixed(2);
            return `<div class="dash-bar-row">
                <span class="dash-bar-row__label">${label}</span>
                <div class="dash-bar-row__track"><div class="dash-bar-row__fill" style="width:${pct}%;background:${color};"></div></div>
                <span class="dash-bar-row__val" style="color:${color};">${fmt}${suffix}</span>
            </div>`;
        };

        const mobilityCard = `
            <div class="dashboard-kpi dashboard-kpi--mobility">
                <div class="dashboard-kpi__title">🚶 Mobilité douce</div>
                <div class="dashboard-kpi__body">
                    ${dashBar('Sentiers piétons', pedDensity, maxDensity, '#34d399', ' km/km²')}
                    ${dashBar('Pistes cyclables', cycleDensity, maxDensity, '#60a5fa', ' km/km²')}
                </div>
            </div>`;

        // ── 4. TERRITORY PROFILE ─────────────────────────────────────────────
        const categoryCounts = {};
        pois.forEach(p => {
            if (!categoryCounts[p.category]) categoryCounts[p.category] = 0;
            categoryCounts[p.category]++;
        });

        const top5 = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const maxCatDensity = top5.length > 0 && areaKm2 > 0 ? top5[0][1] / areaKm2 : 1;

        let territoryBars = '';
        top5.forEach(([catId, count]) => {
            const catDef = this.categories.find(c => c.id === catId);
            const label = catDef ? catDef.label : catId;
            const color = this.getCategoryColor(catId);
            const density = areaKm2 > 0 ? count / areaKm2 : count;
            const suffix = areaKm2 > 0 ? ' /km²' : '';
            territoryBars += dashBar(label, density, maxCatDensity, color, suffix);
        });

        const territoryCard = `
            <div class="dashboard-kpi dashboard-kpi--territory">
                <div class="dashboard-kpi__title">🗺️ Profil territorial</div>
                <div class="dashboard-kpi__body">
                    ${territoryBars || '<span style="font-size:0.68rem;color:var(--color-text-muted);opacity:0.6;">Aucune donnée</span>'}
                </div>
            </div>`;

        // ── 5. TOURISM — Saturation Index ────────────────────────────────────
        const accommodationTypes = new Set([
            'hotel', 'guest_house', 'hostel', 'camp_site', 'chalet',
            'alpine_hut', 'apartment', 'motel', 'caravan_site', 'shelter',
            'wilderness_hut', 'bed_and_breakfast', 'holiday_flat', 'camp_pitch'
        ]);
        let accomCount = 0;
        pois.forEach(p => {
            if (p.category === 'accommodation' || accommodationTypes.has(p.type)) accomCount++;
        });

        // Tourist Density = POIs / km²
        const touristDensity = areaKm2 > 0 ? totalRaw / areaKm2 : 0;
        let tdRating = '';
        if (touristDensity < 10) tdRating = 'Faible';
        else if (touristDensity < 50) tdRating = 'Modérée';
        else if (touristDensity < 200) tdRating = 'Élevée';
        else tdRating = 'Très élevée';

        // Accommodation Density = (accom * 100) / (area)
        const accomDensity = areaKm2 > 0 ? (accomCount / areaKm2) : 0;
        let adRating = '';
        if (accomDensity < 1) adRating = 'Faible';
        else if (accomDensity < 5) adRating = 'Modérée';
        else if (accomDensity < 20) adRating = 'Élevée';
        else adRating = 'Très élevée';

        // Tourist Intensity = accom / (population * area) * 100 (Tourism Saturation Index from the spec)
        let tiValue = 0, tiRating = '', tiSource = '';
        const pop = population || 0;
        if (pop > 0 && areaKm2 > 0) {
            // Best beds count: INSEE > Romania > OSM count
            let bestAccom = accomCount;
            if (inseeStats) {
                bestAccom = inseeStats.total_loc || accomCount;
                tiSource = 'INSEE';
            } else if (romaniaStats?.data?.annual_capacity?.total) {
                const years = Object.keys(romaniaStats.data.annual_capacity.total).sort();
                if (years.length > 0) {
                    bestAccom = romaniaStats.data.annual_capacity.total[years[years.length - 1]];
                    tiSource = 'INSSE';
                }
            } else {
                tiSource = 'OSM';
            }
            tiValue = (bestAccom * 100) / (pop * areaKm2);
            if (tiValue < 0.1) tiRating = 'Faible';
            else if (tiValue < 1) tiRating = 'Modérée';
            else if (tiValue < 5) tiRating = 'Élevée';
            else tiRating = 'Très élevée';
        }

        const fmtDensity = (v) => {
            if (v >= 1000) return v.toFixed(0);
            if (v >= 10) return v.toFixed(1);
            if (v >= 1) return v.toFixed(2);
            return v.toFixed(3);
        };

        const tourismCard = `
            <div class="dashboard-kpi dashboard-kpi--tourism">
                <div class="dashboard-kpi__title">🏖️ Tourisme</div>
                <div class="dashboard-kpi__body">
                    <div class="dash-metric">
                        <span class="dash-metric__label">Tourist Density</span>
                        <span class="dash-metric__val" style="color:#a78bfa;">${fmtDensity(touristDensity)} <span class="dash-metric__rating">${tdRating}</span></span>
                    </div>
                    <div class="dash-metric">
                        <span class="dash-metric__label">Accommodation Density</span>
                        <span class="dash-metric__val" style="color:#c4b5fd;">${fmtDensity(accomDensity)} <span class="dash-metric__rating">${adRating}</span></span>
                    </div>
                    ${pop > 0 ? `<div class="dash-metric">
                        <span class="dash-metric__label">Tourist Intensity${tiSource ? ' (' + tiSource + ')' : ''}</span>
                        <span class="dash-metric__val" style="color:#8b5cf6;">${fmtDensity(tiValue)} <span class="dash-metric__rating">${tiRating}</span></span>
                    </div>` : ''}
                </div>
            </div>`;

        // ── 6. NOTORIETY ─────────────────────────────────────────────────────
        // Wikivoyage + Wikipedia data are loaded async, so we use cached values
        // that get updated by updateDashboardNotoriety()
        const wvCount = this._dashboardWikivoyageCount || 0;
        const pvTotal = this._dashboardPageviewsTotal || 0;
        const pvPois = this._dashboardPageviewsPois || 0;

        const notorietyCard = `
            <div class="dashboard-kpi dashboard-kpi--notoriety">
                <div class="dashboard-kpi__title">🌍 Notoriété</div>
                <div class="dashboard-kpi__body">
                    <div class="dash-notoriety-big">
                        <span class="dash-notoriety-big__val" id="dash-wv-count">${wvCount}</span>
                        <span class="dash-notoriety-big__label">articles Wikivoyage</span>
                    </div>
                    <div class="dash-pv-mini">
                        <span class="dash-pv-mini__val" id="dash-pv-total">${pvTotal > 0 ? pvTotal.toLocaleString('fr-FR') : '—'}</span>
                        <span class="dash-pv-mini__label">${pvPois > 0 ? `vues (${pvPois} POIs)` : 'vues Wikipedia'}</span>
                    </div>
                </div>
            </div>`;

        this.dashboardGrid.innerHTML = locCard + infraCard + mobilityCard + territoryCard + tourismCard + notorietyCard;
    }

    /**
     * Updates the notoriety section of the dashboard with async-loaded data.
     * Called after Wikivoyage/Pageviews data arrives.
     */
    updateDashboardNotoriety(wikivoyageData = null, pageviewsData = null) {
        if (wikivoyageData) {
            this._dashboardWikivoyageCount = wikivoyageData.totalUnique || 0;
        }
        if (pageviewsData) {
            const results = pageviewsData.results || [];
            this._dashboardPageviewsTotal = results.reduce((s, d) => s + d.views, 0);
            this._dashboardPageviewsPois = pageviewsData.totalWikiPois || 0;
        }

        // Update DOM elements if they exist
        const wvEl = document.getElementById('dash-wv-count');
        const pvEl = document.getElementById('dash-pv-total');

        if (wvEl) wvEl.textContent = this._dashboardWikivoyageCount || 0;
        if (pvEl) {
            pvEl.textContent = this._dashboardPageviewsTotal > 0
                ? this._dashboardPageviewsTotal.toLocaleString('fr-FR')
                : '—';
            const labelEl = pvEl.nextElementSibling;
            if (labelEl && this._dashboardPageviewsPois > 0) {
                labelEl.textContent = `vues (${this._dashboardPageviewsPois} POIs)`;
            }
        }
    }
}

