export class UiRenderer {
    constructor() {
        this.macroStats = document.getElementById('macro-stats');
        this.poiList = document.getElementById('poi-list');
        this.microSidebar = document.getElementById('micro-sidebar');
        this.closeMicroBtn = document.getElementById('close-micro-view');
        this.categoryFilter = document.getElementById('category-filter'); // Legacy sidebar filter

        // Macro Filters UI
        this.toggleFiltersBtn = document.getElementById('toggle-filters-btn');
        this.deselectAllBtn = document.getElementById('deselect-all-btn');
        this.macroFiltersContent = document.getElementById('macro-filters-content');

        this.onFilterChange = null;

        // Categories Definition
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

        // Init Macro Filters
        if (this.macroFiltersContent && this.toggleFiltersBtn) {
            // Render Checkboxes
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
                checkbox.checked = true; // Default all checked
                checkbox.style.accentColor = 'var(--color-primary)';
                // Update button text on change
                checkbox.addEventListener('change', () => {
                    this.updateFilterButtonText();
                    if (this.onFilterChange) this.onFilterChange();
                });

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(`${this.getCategoryEmoji(cat.id)} ${cat.label}`));

                div.appendChild(label);
                this.macroFiltersContent.appendChild(div);
            });

            // Toggle logic
            this.toggleFiltersBtn.addEventListener('click', () => {
                const isHidden = this.macroFiltersContent.style.display === 'none';
                this.macroFiltersContent.style.display = isHidden ? 'block' : 'none';
            });
        }

        if (this.deselectAllBtn) {
            this.deselectAllBtn.addEventListener('click', () => {
                // Determine if we should check all or uncheck all
                // Strategy: If any is checked -> Uncheck All. If all Unchecked -> Check All? 
                // Request said "tout décocher". Let's stick to uncheck all for now.
                // Or "Toggle" as I wrote in HTML button text.
                // Let's make it a smart toggle: if any is checked -> uncheck all.
                // If 0 checked -> check all.

                const inputs = this.macroFiltersContent.querySelectorAll('input[type="checkbox"]');
                const anyChecked = Array.from(inputs).some(i => i.checked);

                inputs.forEach(input => input.checked = !anyChecked);

                this.updateFilterButtonText();
                if (this.onFilterChange) this.onFilterChange();
            });
        }
    }

    updateFilterButtonText() {
        if (!this.macroFiltersContent) return;
        const checkedCount = this.macroFiltersContent.querySelectorAll('input:checked').length;
        const total = this.categories.length;
        this.toggleFiltersBtn.textContent = `🛠️ Choisir les catégories (${checkedCount}/${total})`;
    }

    getSelectedCategories() {
        if (!this.macroFiltersContent) return []; // Empty means all in our API logic fallback? Or we should return all IDs.
        // If API expects empty array to mean "all", return empty.
        // But let's return explicit list to be safe.
        const checkboxes = this.macroFiltersContent.querySelectorAll('input[type="checkbox"]:checked');
        if (checkboxes.length === 0) return ['none']; // Hack to fetch nothing if nothing checked
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
            this.macroStats.innerHTML = `
                <div class="stat-item empty">
                    <span class="stat-value">--</span>
                    <span class="stat-label">Aucun lieu trouvé</span>
                </div>`;
            return;
        }

        // Prepare data for Treemap
        // Hierarchy: Root -> Category -> Type
        const rootId = 'All';
        const labels = ['Total'];
        const parents = [''];
        const ids = [rootId];
        const values = [total];
        const colors = ['#ffffff']; // Root color (often ignored if transparent)

        // Aggregation
        const categoryCounts = {};
        const typeCounts = {}; // Key: cat_type

        pois.forEach(p => {
            // Category count
            if (!categoryCounts[p.category]) categoryCounts[p.category] = 0;
            categoryCounts[p.category]++;

            // Type count within category
            const typeKey = `${p.category}__${p.type}`;
            if (!typeCounts[typeKey]) typeCounts[typeKey] = 0;
            typeCounts[typeKey]++;
        });

        // Build Arrays
        // Add Categories
        Object.keys(categoryCounts).forEach(catId => {
            const catDef = this.categories.find(c => c.id === catId);
            const label = catDef ? catDef.label : catId;
            const color = this.getCategoryColor(catId);

            ids.push(catId);
            labels.push(`${this.getCategoryEmoji(catId)} ${label}`);
            parents.push(rootId);
            values.push(categoryCounts[catId]); // Plotly can compute this from leaves, but providing it is fine
            colors.push(color);
        });

        // Add Types (Leaves)
        Object.keys(typeCounts).forEach(typeKey => {
            const [catId, typeName] = typeKey.split('__');
            const count = typeCounts[typeKey];
            const label = this.translateType(typeName);

            ids.push(typeKey);
            labels.push(`${label} (${count})`);
            parents.push(catId);
            values.push(count);
            // Leaf color: same as category but maybe slightly specialized? 
            // Let's inherit or use same.
            colors.push(this.getCategoryColor(catId));
        });

        const data = [{
            type: "treemap",
            ids: ids,
            labels: labels,
            parents: parents,
            values: values,
            marker: { colors: colors },
            textinfo: "label+value",
            hoverinfo: "label+value+percent parent",
            branchvalues: "total" // Important for structure
        }];

        const layout = {
            margin: { t: 0, l: 0, r: 0, b: 0 }, // Tight layout
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { family: "Outfit, sans-serif", color: "#e2e8f0" }
        };

        const config = { responsive: true, displayModeBar: false };

        // Ensure container is empty and ready
        this.macroStats.innerHTML = '';
        this.macroStats.style.height = '300px'; // Give it some height

        Plotly.newPlot(this.macroStats, data, layout, config);

        this.lastPois = pois;
    }

    renderMicroList(pois) {
        if (pois.length === 0) {
            this.poiList.innerHTML = '<p class="empty-state">Aucun point d\'intérêt trouvé dans cette zone.</p>';
            return;
        }

        // Update Sidebar Filter Options based on available categories in POIs (ALL discovered, not just filtered)
        this.updateSidebarFilterOptions(this.lastPois);

        this.poiList.innerHTML = pois.map(poi => this.createPoiCard(poi)).join('');

        // Add event listeners to cards
        this.poiList.querySelectorAll('.poi-card').forEach(card => {
            card.addEventListener('click', () => {
                const poiId = card.getAttribute('data-id');
                const poi = this.lastPois.find(p => p.id == poiId);
                if (poi) this.renderPoiDetails(poi);
            });
        });
    }

    updateSidebarFilterOptions(pois) {
        if (!this.categoryFilter) return;

        // Get unique categories currently present
        const categoriesPresent = new Set(pois.map(p => p.category));

        // Save current selection if possible, else reset to 'all'
        const currentVal = this.categoryFilter.value;

        // Clear existing options
        this.categoryFilter.innerHTML = '';

        // Add "All" option
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = '🌎 Toutes catégories';
        this.categoryFilter.appendChild(allOption);

        // Add options for present categories
        // Sort alphabetically or by importance? Let's use our defined order if possible
        this.categories.forEach(cat => {
            if (categoriesPresent.has(cat.id)) {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = `${this.getCategoryEmoji(cat.id)} ${cat.label}`;
                this.categoryFilter.appendChild(option);
            }
        });

        // Restore selection if valid
        if (categoriesPresent.has(currentVal) || currentVal === 'all') {
            this.categoryFilter.value = currentVal;
        } else {
            this.categoryFilter.value = 'all';
        }
    }

    createPoiCard(poi) {
        const color = this.getCategoryColor(poi.category);
        const bgStyle = `background: ${color}33; color: ${color};`; // 33 = 20% opacity approx for hex
        return `
            <div class="poi-card" data-id="${poi.id}" style="border-left: 3px solid ${color}">
                <span class="poi-category-tag" style="${bgStyle}">${this.translateType(poi.type)}</span>
                <div class="poi-name">${poi.name}</div>
                <div class="poi-desc">Catégorie: ${this.getCategoryEmoji(poi.category)} ${poi.category}</div>
            </div>
        `;
    }

    renderPoiDetails(poi) {
        // Hide filter, show details
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
                
                <div class="detail-info">
                    ${address ? `
                    <div class="info-row">
                        <span class="info-label">Adresse</span>
                        <span class="info-value">${address}</span>
                    </div>` : ''}
                    
                    ${phone ? `
                    <div class="info-row">
                        <span class="info-label">Téléphone</span>
                        <span class="info-value"><a href="tel:${phone}" style="color:${color}">${phone}</a></span>
                    </div>` : ''}
                    
                    ${openingHours ? `
                    <div class="info-row">
                        <span class="info-label">Horaires</span>
                        <span class="info-value">${openingHours}</span>
                    </div>` : ''}

                    ${wheelchair ? `
                    <div class="info-row">
                        <span class="info-label">Accessibilité</span>
                        <span class="info-value">${wheelchair === 'yes' ? 'Accessible Fauteuil' : 'Non spécifié'}</span>
                    </div>` : ''}

                     <div class="info-row">
                        <span class="info-label">Coordonnées</span>
                        <span class="info-value">${poi.lat.toFixed(5)}, ${poi.lng.toFixed(5)}</span>
                    </div>
                </div>
            </div>
        `;

        this.poiList.innerHTML = html;

        // Bind Back Button
        document.getElementById('back-to-list').addEventListener('click', () => {
            this.categoryFilter.parentElement.style.display = 'block';
            this.filterList(this.categoryFilter.value);
        });
    }

    formatAddress(tags) {
        // Try to construct address from osm tags
        const parts = [];
        if (tags['addr:street']) parts.push(tags['addr:street']);
        if (tags['addr:housenumber']) parts.unshift(tags['addr:housenumber']);
        if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
        if (tags['addr:city']) parts.push(tags['addr:city']);

        return parts.length > 0 ? parts.join(', ') : null;
    }

    filterList(category) {
        if (category === 'all') {
            this.renderMicroList(this.lastPois);
        } else {
            const filtered = this.lastPois.filter(p => p.category === category);
            this.renderMicroList(filtered);
        }
    }

    getCategoryEmoji(category) {
        const emojis = {
            'tourism': '📷',
            'sustenance': '🍴',
            'accommodation': '🛏️',
            'amenity': '🚻', // or '🏪'
            'natural': '🌳',
            'historic': '🏛️',
            'leisure': '🎡', // or 🎳
            'shop': '🛒',
            'transport': '🚌',
            'craft': '🎨',
            'office': '💼',
            'emergency': '🚨',
            'man_made': '🏗️',
            'place': '📍',
            'sport': '⚽',
            'healthcare': '⚕️',
            'power': '⚡',
            'barrier': '🚧',
            'other': '❓'
        };
        return emojis[category] || emojis['other'];
    }

    translateType(type) {
        const translations = {
            // Natural
            'peak': 'Sommet',
            'saddle': 'Col',
            'volcano': 'Volcan',
            'spring': 'Source',
            'cave_entrance': 'Entrée de grotte',
            'tree': 'Arbre',
            'rock': 'Rocher',
            'cliff': 'Falaise',
            'ridge': 'Crête',
            'arete': 'Arête',
            'mountain_pass': 'Col de montagne',
            'water': 'Eau',
            'wetland': 'Zone humide',
            'glacier': 'Glacier',
            'scree': 'Éboulis',

            // Tourism
            'viewpoint': 'Point de vue',
            'information': 'Information',
            'hotel': 'Hôtel',
            'guest_house': 'Maison d\'hôtes',
            'hostel': 'Auberge de jeunesse',
            'chalet': 'Chalet',
            'camp_site': 'Camping',
            'alpine_hut': 'Refuge de montagne',
            'apartment': 'Appartement',
            'museum': 'Musée',
            'artwork': 'Œuvre d\'art',
            'attraction': 'Attraction',
            'picnic_site': 'Aire de pique-nique',

            // Amenity
            'parking': 'Parking',
            'bench': 'Banc',
            'shelter': 'Abri',
            'restaurant': 'Restaurant',
            'cafe': 'Café',
            'bar': 'Bar',
            'pub': 'Pub',
            'fast_food': 'Restauration rapide',
            'drinking_water': 'Eau potable',
            'toilets': 'Toilettes',
            'place_of_worship': 'Lieu de culte',
            'school': 'École',
            'pharmacy': 'Pharmacie',
            'hospital': 'Hôpital',
            'post_office': 'Poste',
            'recycling': 'Recyclage',
            'waste_basket': 'Corbeille',

            // Historic
            'memorial': 'Mémorial',
            'ruins': 'Ruines',
            'monument': 'Monument',
            'castle': 'Château',
            'archaeological_site': 'Site archéologique',
            'wayside_shrine': 'Oratoire',
            'wayside_cross': 'Croix de chemin',

            // Place
            'village': 'Village',
            'hamlet': 'Hameau',
            'locality': 'Lieu-dit',
            'isolated_dwelling': 'Habitation isolée',
            'town': 'Ville',
            'city': 'Grande ville',

            // Leisure
            'pitch': 'Terrain de sport',
            'playground': 'Aire de jeux',
            'swimming_pool': 'Piscine',
            'park': 'Parc',
            'garden': 'Jardin',
            'nature_reserve': 'Réserve naturelle',

            // Shop
            'convenience': 'Supérette',
            'bakery': 'Boulangerie',
            'supermarket': 'Supermarché',
            'clothes': 'Vêtements',
            'hairdresser': 'Coiffeur',

            // Other
            'yes': 'Oui', // Sometimes type is just 'yes'
            'antenna': 'Antenne',
            'mast': 'Mât',
            'tower': 'Tour'
        };

        const normalizedType = type.toLowerCase().replace(/-/g, '_');
        return translations[normalizedType] || type.replace(/_/g, ' ');
    }

    getCategoryColor(category) {
        const colors = {
            'tourism': '#fbbf24', // Amber
            'sustenance': '#f87171', // Red
            'accommodation': '#a78bfa', // Purple
            'amenity': '#60a5fa', // Blue
            'natural': '#34d399', // Emerald (Green)
            'historic': '#d97706', // Dark Amber/Brownish
            'leisure': '#f472b6', // Pink
            'shop': '#c084fc', // Violet
            'transport': '#9ca3af', // Gray
            'craft': '#e879f9', // Pinkish
            'office': '#64748b', // Blue Gray
            'emergency': '#ef4444', // Red
            'man_made': '#78716c', // Stone
            'place': '#facc15', // Yellow
            'sport': '#14b8a6', // Teal
            'healthcare': '#f43f5e', // Rose
            'power': '#a8a29e', // Warm Gray
            'barrier': '#57534e', // Stone Darker
            'other': '#94a3b8' // Slate
        };
        return colors[category] || colors['other'];
    }
}
