export class UiRenderer {
    constructor() {
        this.macroStats = document.getElementById('macro-stats');
        this.poiList = document.getElementById('poi-list');
        this.microSidebar = document.getElementById('micro-sidebar');
        this.closeMicroBtn = document.getElementById('close-micro-view');
        this.categoryFilter = document.getElementById('category-filter');

        this.toggleFiltersBtn = document.getElementById('toggle-filters-btn');
        this.deselectAllBtn = document.getElementById('deselect-all-btn');
        this.macroFiltersContent = document.getElementById('macro-filters-content');

        this.deselectAllPathsBtn = document.getElementById('deselect-all-paths-btn');

        this.onFilterChange = null;
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

    initPresets() {
        // Find container
        const container = document.querySelector('#preset-polygons-bar .presets-list');
        if (!container) return;

        container.innerHTML = '';
        this.nationalParks.forEach(park => {
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.textContent = park.name;
            btn.addEventListener('click', () => {
                if (this.onPresetSelected) {
                    this.onPresetSelected(park);
                }
            });
            container.appendChild(btn);
        });
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

    init() {
        if (this.closeMicroBtn) {
            this.closeMicroBtn.addEventListener('click', () => {
                this.toggleMicroSidebar(false);
            });
        }

        if (this.categoryFilter) {
            this.categoryFilter.addEventListener('change', (e) => {
                this.filterList(e.target.value);
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

        if (this.macroFiltersContent && this.toggleFiltersBtn) {
            this.categories.forEach(cat => {
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
                    this.updateFilterButtonText();
                    if (this.onFilterChange) this.onFilterChange();
                });

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(`${this.getCategoryEmoji(cat.id)} ${cat.label}`));
                div.appendChild(label);
                this.macroFiltersContent.appendChild(div);
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
        const checkedCount = this.macroFiltersContent.querySelectorAll('input:checked').length;
        const total = this.categories.length;
        this.toggleFiltersBtn.textContent = `🛠️ Choisir les catégories (${checkedCount}/${total})`;
    }

    getSelectedCategories() {
        if (!this.macroFiltersContent) return [];
        const checkboxes = this.macroFiltersContent.querySelectorAll('input[type="checkbox"]:checked');
        if (checkboxes.length === 0) return ['none'];
        return Array.from(checkboxes).map(cb => cb.value);
    }

    toggleMicroSidebar(show) {
        if (show) this.microSidebar.classList.add('visible');
        else this.microSidebar.classList.remove('visible');
    }

    showLoading(isLoading) {
        if (isLoading) {
            this.macroStats.innerHTML = '<div class="stat-item"><span class="stat-value">...</span><span class="stat-label">Chargement</span></div>';
            this.poiList.innerHTML = '<p class="empty-state">Chargement des données...</p>';
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
        const chartDiv = document.createElement('div');
        chartDiv.style.height = '350px';
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
                    ${address ? `<div class="info-row"><span class="info-label">Adresse</span><span class="info-value">${address}</span></div>` : ''}
                    ${phone ? `<div class="info-row"><span class="info-label">Téléphone</span><span class="info-value"><a href="tel:${phone}" style="color:${color}">${phone}</a></span></div>` : ''}
                    ${openingHours ? `<div class="info-row"><span class="info-label">Horaires</span><span class="info-value">${openingHours}</span></div>` : ''}
                    ${wheelchair ? `<div class="info-row"><span class="info-label">Accessibilité</span><span class="info-value">${wheelchair === 'yes' ? 'Accessible Fauteuil' : 'Non spécifié'}</span></div>` : ''}
                    <div class="info-row"><span class="info-label">Coordonnées</span><span class="info-value">${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}</span></div>
                </div>
            </div>
        `;

        this.poiList.innerHTML = html;
        document.getElementById('back-to-list').addEventListener('click', () => {
            this.categoryFilter.parentElement.style.display = 'block';
            this.filterList(this.categoryFilter.value);
        });

        const imgContainer = document.getElementById('poi-image-container');
        const imgElement = document.getElementById('poi-image');
        if (this.apiService) {
            imgContainer.style.display = 'block';
            imgElement.style.opacity = '0.5';
            this.apiService.fetchPoiImage(poi.lat, poi.lng).then(url => {
                if (url) {
                    imgElement.src = url;
                    imgElement.style.opacity = '1';
                    imgContainer.style.display = 'block';
                } else {
                    imgContainer.style.display = 'none';
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

    filterList(category) {
        if (category === 'all') this.renderMicroList(this.lastPois);
        else this.renderMicroList(this.lastPois.filter(p => p.category === category));
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
}
