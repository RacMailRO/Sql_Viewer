/**
 * Advanced Filtering and Isolation Manager
 * Provides comprehensive filtering capabilities to focus on specific parts of the ERD
 */
export class FilteringManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.schemaData = null;
        this.originalData = null;
        this.activeFilters = new Map();
        this.isolationMode = false;
        this.selectedTables = new Set();
        this.filterHistory = [];
        this.maxHistorySize = 50;
        this.isVisible = false;
        
        this.filterTypes = {
            table: 'Table-based',
            relationship: 'Relationship-based',
            column: 'Column-based',
            group: 'Group-based',
            statistical: 'Statistical-based',
            custom: 'Custom Query'
        };
        
        this.initialize();
    }

    /**
     * Isolate a single table and its direct connections.
     * @param {string} tableName - The name of the table to isolate.
     */
    isolateSingleTable(tableName) {
        if (!this.originalData || !this.originalData.tables) {
            console.warn('Original data not available for isolation.');
            return;
        }

        const targetTable = this.originalData.tables.find(t => t.name === tableName);
        if (!targetTable) {
            console.warn(`Table "${tableName}" not found for isolation.`);
            return;
        }

        const directlyConnectedTableNames = new Set([tableName]);
        const relevantRelationships = this.originalData.relationships.filter(rel => {
            const fromTable = rel.from?.table || rel.fromTable;
            const toTable = rel.to?.table || rel.toTable;

            if (fromTable === tableName) {
                directlyConnectedTableNames.add(toTable);
                return true;
            }
            if (toTable === tableName) {
                directlyConnectedTableNames.add(fromTable);
                return true;
            }
            return false;
        });

        const filterId = `isolate-${tableName}`;
        const filter = {
            id: filterId,
            type: 'isolation', // Consistent type for isolation filters
            name: `Isolated: ${tableName}`,
            description: `Showing table "${tableName}" and its direct connections.`,

            // The 'data' parameter to apply is the current schema being filtered.
            // However, for this specific isolation, we always start from originalData.
            apply: (data) => {
                const tablesToShow = this.originalData.tables.filter(t => directlyConnectedTableNames.has(t.name));
                // Filter relationships again based on the tablesToShow, ensuring both ends are present
                const finalRelationships = relevantRelationships.filter(rel => {
                    const fromTable = rel.from?.table || rel.fromTable;
                    const toTable = rel.to?.table || rel.toTable;
                    return directlyConnectedTableNames.has(fromTable) && directlyConnectedTableNames.has(toTable);
                });

                return {
                    ...this.originalData, // Start from original data to avoid compounding filters
                    tables: tablesToShow,
                    relationships: finalRelationships
                };
            }
        };

        // Clear other filters before applying single table isolation for a cleaner state
        this.activeFilters.clear();
        this.isolationMode = true; // Set isolation mode
        this.applyFilter(filter); // This will also update UI and emit schema:filtered
        this.updateIsolationModeUI(); // Explicitly update button state
    }


    /**
     * Initialize the filtering manager
     */
    initialize() {
        this.createFilterPanel();
        this.setupEventListeners();
    }

    /**
     * Create the filter panel UI
     */
    createFilterPanel() {
        const panel = document.createElement('div');
        panel.id = 'filter-panel';
        panel.className = 'filter-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3 class="panel-title">
                    <span class="panel-icon">🔍</span>
                    Filters & Isolation
                </h3>
                <div class="panel-controls">
                    <button id="clear-all-filters" class="panel-btn" title="Clear All Filters">🗑️</button>
                    <button id="toggle-isolation" class="panel-btn" title="Toggle Isolation Mode">🎯</button>
                    <button id="close-filter-panel" class="panel-btn" title="Close Panel">✕</button>
                </div>
            </div>
            <div class="panel-content">
                <div class="filter-sections">
                    <div class="filter-section">
                        <div class="section-header">
                            <h4>Quick Filters</h4>
                            <span class="section-icon">⚡</span>
                        </div>
                        <div class="quick-filters">
                            <button class="filter-btn" data-filter="isolated-tables">
                                <span class="btn-icon">🏝️</span>
                                Isolated Tables
                            </button>
                            <button class="filter-btn" data-filter="hub-tables">
                                <span class="btn-icon">🌟</span>
                                Hub Tables
                            </button>
                            <button class="filter-btn" data-filter="junction-tables">
                                <span class="btn-icon">🔗</span>
                                Junction Tables
                            </button>
                            <button class="filter-btn" data-filter="large-tables">
                                <span class="btn-icon">📊</span>
                                Large Tables
                            </button>
                            <button class="filter-btn" data-filter="no-primary-key">
                                <span class="btn-icon">⚠️</span>
                                No Primary Key
                            </button>
                            <button class="filter-btn" data-filter="many-to-many">
                                <span class="btn-icon">🔀</span>
                                Many-to-Many
                            </button>
                        </div>
                    </div>
                    
                    <div class="filter-section">
                        <div class="section-header">
                            <h4>Table Selection</h4>
                            <span class="section-icon">🗂️</span>
                        </div>
                        <div class="filter-controls">
                            <div class="control-group">
                                <label for="table-name-filter">Table Name Contains:</label>
                                <input type="text" id="table-name-filter" placeholder="Enter table name pattern...">
                                <button id="apply-table-name-filter" class="btn btn-sm">Apply</button>
                            </div>
                            
                            <div class="control-group">
                                <label>Table Selection for Isolation:</label>
                                <div class="table-selection">
                                    <input type="text" id="table-search" placeholder="Search tables...">
                                    <div id="table-selection-list" class="selection-list"></div>
                                    <button id="isolate-selected-tables" class="btn btn-primary">Isolate Selected</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="filter-section">
                        <div class="section-header">
                            <h4>Active Filters</h4>
                            <span class="section-icon">🏷️</span>
                        </div>
                        <div id="active-filters-list" class="active-filters-list">
                            <div class="no-filters-message">No active filters</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.panelElement = panel;
        this.setupPanelEventListeners();
    }

    /**
     * Setup panel event listeners
     */
    setupPanelEventListeners() {
        // Panel controls
        document.getElementById('clear-all-filters')?.addEventListener('click', () => this.clearAllFilters());
        document.getElementById('toggle-isolation')?.addEventListener('click', () => this.toggleIsolationMode());
        document.getElementById('close-filter-panel')?.addEventListener('click', () => this.hide());
        
        // Quick filters
        this.panelElement.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filterType = e.currentTarget.dataset.filter;
                this.applyQuickFilter(filterType);
            });
        });
        
        // Table filters
        document.getElementById('apply-table-name-filter')?.addEventListener('click', () => this.applyTableNameFilter());
        document.getElementById('isolate-selected-tables')?.addEventListener('click', () => this.isolateSelectedTables());
        
        // Table search
        document.getElementById('table-search')?.addEventListener('input', (e) => this.searchTables(e.target.value));
        
        this.setupDynamicEventListeners();
    }

    /**
     * Setup dynamic event listeners
     */
    setupDynamicEventListeners() {
        // Listen for table selection changes
        document.addEventListener('change', (e) => {
            if (e.target.matches('.table-checkbox')) {
                this.updateSelectedTables();
            }
        });
        
        // Listen for Enter key in input fields
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.target.matches('.filter-section input[type="text"]')) {
                const filterId = e.target.id;
                this.handleEnterKeyFilter(filterId);
            }
        });
    }

    /**
     * Handle Enter key in filter inputs
     */
    handleEnterKeyFilter(inputId) {
        const filterMap = {
            'table-name-filter': () => this.applyTableNameFilter()
        };
        
        if (filterMap[inputId]) {
            filterMap[inputId]();
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (this.eventBus) {
            this.eventBus.on('schema:loaded', (data) => {
                this.setSchemaData(data);
            });
            
            this.eventBus.on('analysis:complete', (analysis) => {
                this.updateFiltersWithAnalysis(analysis);
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.toggle();
            }
            
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    /**
     * Set schema data
     */
    setSchemaData(schemaData) {
        this.schemaData = schemaData;
        this.originalData = JSON.parse(JSON.stringify(schemaData)); // Deep copy
        this.updateTableSelectionList();
    }

    /**
     * Update table selection list
     */
    updateTableSelectionList() {
        const listElement = document.getElementById('table-selection-list');
        if (!listElement || !this.schemaData?.tables) return;
        
        const tables = this.schemaData.tables;
        listElement.innerHTML = tables.map(table => `
            <div class="table-selection-item">
                <label>
                    <input type="checkbox" class="table-checkbox" value="${table.name}">
                    <span class="table-name">${table.name}</span>
                    <span class="table-info">(${table.columns?.length || 0} cols)</span>
                </label>
            </div>
        `).join('');
    }

    /**
     * Update filters with analysis data
     */
    updateFiltersWithAnalysis(analysis) {
        this.analysisData = analysis;
    }

    /**
     * Apply quick filter
     */
    applyQuickFilter(filterType) {
        const filters = {
            'isolated-tables': () => this.filterIsolatedTables(),
            'hub-tables': () => this.filterHubTables(),
            'junction-tables': () => this.filterJunctionTables(),
            'large-tables': () => this.filterLargeTables(),
            'no-primary-key': () => this.filterTablesWithoutPrimaryKey(),
            'many-to-many': () => this.filterManyToManyRelationships()
        };
        
        if (filters[filterType]) {
            filters[filterType]();
            this.addToHistory(`Quick Filter: ${filterType.replace('-', ' ')}`);
        }
    }

    /**
     * Filter isolated tables
     */
    filterIsolatedTables() {
        const filterId = 'isolated-tables';
        const filter = {
            id: filterId,
            type: 'table',
            name: 'Isolated Tables',
            description: 'Tables with no relationships',
            apply: (data) => {
                const relationships = data.relationships || [];
                const connectedTables = new Set();
                
                relationships.forEach(rel => {
                    connectedTables.add(rel.fromTable);
                    connectedTables.add(rel.toTable);
                });
                
                return {
                    ...data,
                    tables: data.tables.filter(table => !connectedTables.has(table.name)),
                    relationships: []
                };
            }
        };
        
        this.applyFilter(filter);
    }

    /**
     * Filter hub tables (highly connected)
     */
    filterHubTables() {
        const filterId = 'hub-tables';
        const filter = {
            id: filterId,
            type: 'table',
            name: 'Hub Tables',
            description: 'Tables with 4+ relationships',
            apply: (data) => {
                const relationships = data.relationships || [];
                const connectionCounts = new Map();
                
                // Count connections for each table
                relationships.forEach(rel => {
                    connectionCounts.set(rel.fromTable, (connectionCounts.get(rel.fromTable) || 0) + 1);
                    connectionCounts.set(rel.toTable, (connectionCounts.get(rel.toTable) || 0) + 1);
                });
                
                const hubTables = Array.from(connectionCounts.entries())
                    .filter(([table, count]) => count >= 4)
                    .map(([table]) => table);
                
                return this.filterByTableNames(data, hubTables);
            }
        };
        
        this.applyFilter(filter);
    }

    /**
     * Filter junction tables
     */
    filterJunctionTables() {
        const filterId = 'junction-tables';
        const filter = {
            id: filterId,
            type: 'table',
            name: 'Junction Tables',
            description: 'Tables that resolve many-to-many relationships',
            apply: (data) => {
                const junctionTables = data.tables.filter(table => {
                    const columns = table.columns || [];
                    const foreignKeys = columns.filter(col => col.isForeign);
                    return foreignKeys.length >= 2 && foreignKeys.length / columns.length >= 0.5;
                });
                
                return this.filterByTables(data, junctionTables);
            }
        };
        
        this.applyFilter(filter);
    }

    /**
     * Filter large tables
     */
    filterLargeTables() {
        const filterId = 'large-tables';
        const filter = {
            id: filterId,
            type: 'table',
            name: 'Large Tables',
            description: 'Tables with 20+ columns',
            apply: (data) => {
                const largeTables = data.tables.filter(table => {
                    const columns = table.columns || [];
                    return columns.length >= 20;
                });
                
                return this.filterByTables(data, largeTables);
            }
        };
        
        this.applyFilter(filter);
    }

    /**
     * Filter tables without primary key
     */
    filterTablesWithoutPrimaryKey() {
        const filterId = 'no-primary-key';
        const filter = {
            id: filterId,
            type: 'table',
            name: 'No Primary Key',
            description: 'Tables without primary keys',
            apply: (data) => {
                const tablesWithoutPK = data.tables.filter(table => {
                    const columns = table.columns || [];
                    return !columns.some(col => col.isPrimary);
                });
                
                return this.filterByTables(data, tablesWithoutPK);
            }
        };
        
        this.applyFilter(filter);
    }

    /**
     * Filter many-to-many relationships
     */
    filterManyToManyRelationships() {
        const filterId = 'many-to-many';
        const filter = {
            id: filterId,
            type: 'relationship',
            name: 'Many-to-Many Relationships',
            description: 'Show only many-to-many relationships',
            apply: (data) => {
                const manyToManyRels = data.relationships.filter(rel => {
                    const fromCard = rel.fromCardinality || '1';
                    const toCard = rel.toCardinality || '1';
                    return (fromCard === 'many' || fromCard === '*') && 
                           (toCard === 'many' || toCard === '*');
                });
                
                const relatedTables = new Set();
                manyToManyRels.forEach(rel => {
                    relatedTables.add(rel.fromTable);
                    relatedTables.add(rel.toTable);
                });
                
                return {
                    ...data,
                    tables: data.tables.filter(table => relatedTables.has(table.name)),
                    relationships: manyToManyRels
                };
            }
        };
        
        this.applyFilter(filter);
    }

    /**
     * Apply table name filter
     */
    applyTableNameFilter() {
        const input = document.getElementById('table-name-filter');
        const pattern = input?.value.trim();
        
        if (!pattern) return;
        
        const filterId = `table-name-${pattern}`;
        const filter = {
            id: filterId,
            type: 'table',
            name: `Table Name: ${pattern}`,
            description: `Tables containing "${pattern}"`,
            apply: (data) => {
                const matchingTables = data.tables.filter(table => 
                    table.name.toLowerCase().includes(pattern.toLowerCase())
                );
                
                return this.filterByTables(data, matchingTables);
            }
        };
        
        this.applyFilter(filter);
    }

    /**
     * Isolate selected tables
     */
    isolateSelectedTables() {
        const selectedTableNames = Array.from(this.selectedTables);
        
        if (selectedTableNames.length === 0) {
            alert('Please select at least one table to isolate');
            return;
        }
        
        const filterId = `isolated-${selectedTableNames.join('-')}`;
        const filter = {
            id: filterId,
            type: 'isolation',
            name: `Isolated: ${selectedTableNames.join(', ')}`,
            description: `Show only selected tables and their direct relationships`,
            apply: (data) => {
                return this.createIsolatedView(data, selectedTableNames);
            }
        };
        
        this.applyFilter(filter);
        this.isolationMode = true;
        this.updateIsolationModeUI();
    }

    /**
     * Create isolated view for selected tables
     */
    createIsolatedView(data, tableNames) {
        const selectedTables = data.tables.filter(table => tableNames.includes(table.name));
        const relatedRelationships = data.relationships.filter(rel => 
            tableNames.includes(rel.fromTable) || tableNames.includes(rel.toTable)
        );
        
        // Include tables that are directly connected to selected tables
        const connectedTableNames = new Set(tableNames);
        relatedRelationships.forEach(rel => {
            connectedTableNames.add(rel.fromTable);
            connectedTableNames.add(rel.toTable);
        });
        
        const allRelevantTables = data.tables.filter(table => 
            connectedTableNames.has(table.name)
        );
        
        return {
            ...data,
            tables: allRelevantTables,
            relationships: relatedRelationships
        };
    }

    /**
     * Apply a filter
     */
    applyFilter(filter) {
        this.activeFilters.set(filter.id, filter);
        
        // Apply all active filters in sequence
        let filteredData = JSON.parse(JSON.stringify(this.originalData));
        
        for (const activeFilter of this.activeFilters.values()) {
            filteredData = activeFilter.apply(filteredData);
        }
        
        this.schemaData = filteredData;
        this.updateActiveFiltersDisplay();
        this.addToHistory(filter.name);
        
        // Emit filtered data
        if (this.eventBus) {
            this.eventBus.emit('schema:filtered', filteredData);
        }
    }

    /**
     * Clear all filters
     */
    clearAllFilters() {
        this.activeFilters.clear();
        this.schemaData = JSON.parse(JSON.stringify(this.originalData));
        this.isolationMode = false;
        this.selectedTables.clear();
        
        this.updateActiveFiltersDisplay();
        this.updateIsolationModeUI();
        this.updateSelectedTables();
        
        if (this.eventBus) {
            this.eventBus.emit('schema:filtered', this.schemaData);
        }
        
        this.addToHistory('Cleared all filters');
    }

    /**
     * Remove a specific filter
     */
    removeFilter(filterId) {
        this.activeFilters.delete(filterId);
        
        // Reapply remaining filters
        let filteredData = JSON.parse(JSON.stringify(this.originalData));
        
        for (const activeFilter of this.activeFilters.values()) {
            filteredData = activeFilter.apply(filteredData);
        }
        
        this.schemaData = filteredData;
        this.updateActiveFiltersDisplay();
        
        if (this.eventBus) {
            this.eventBus.emit('schema:filtered', filteredData);
        }
    }

    /**
     * Toggle isolation mode
     */
    toggleIsolationMode() {
        this.isolationMode = !this.isolationMode;
        this.updateIsolationModeUI();
        
        if (!this.isolationMode) {
            // Remove isolation filters
            const isolationFilters = Array.from(this.activeFilters.keys())
                .filter(id => this.activeFilters.get(id).type === 'isolation');
            
            isolationFilters.forEach(id => this.removeFilter(id));
        }
    }

    /**
     * Update isolation mode UI
     */
    updateIsolationModeUI() {
        const toggleBtn = document.getElementById('toggle-isolation');
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', this.isolationMode);
            toggleBtn.title = this.isolationMode ? 'Exit Isolation Mode' : 'Enter Isolation Mode';
        }
    }

    /**
     * Update selected tables
     */
    updateSelectedTables() {
        const checkboxes = this.panelElement.querySelectorAll('.table-checkbox:checked');
        this.selectedTables.clear();
        
        checkboxes.forEach(checkbox => {
            this.selectedTables.add(checkbox.value);
        });
        
        const isolateBtn = document.getElementById('isolate-selected-tables');
        if (isolateBtn) {
            isolateBtn.disabled = this.selectedTables.size === 0;
        }
    }

    /**
     * Search tables
     */
    searchTables(query) {
        const listElement = document.getElementById('table-selection-list');
        if (!listElement) return;
        
        const items = listElement.querySelectorAll('.table-selection-item');
        items.forEach(item => {
            const tableName = item.querySelector('.table-name').textContent;
            const matches = tableName.toLowerCase().includes(query.toLowerCase());
            item.style.display = matches ? 'block' : 'none';
        });
    }

    /**
     * Update active filters display
     */
    updateActiveFiltersDisplay() {
        const container = document.getElementById('active-filters-list');
        if (!container) return;
        
        if (this.activeFilters.size === 0) {
            container.innerHTML = '<div class="no-filters-message">No active filters</div>';
            return;
        }
        
        container.innerHTML = Array.from(this.activeFilters.values()).map(filter => `
            <div class="active-filter-item" data-filter-id="${filter.id}">
                <div class="filter-info">
                    <span class="filter-name">${filter.name}</span>
                    <span class="filter-type">${filter.type}</span>
                </div>
                <div class="filter-description">${filter.description}</div>
                <button class="remove-filter-btn" onclick="window.filteringManager?.removeFilter('${filter.id}')">✕</button>
            </div>
        `).join('');
    }

    /**
     * Add to filter history
     */
    addToHistory(action) {
        const historyItem = {
            action: action,
            timestamp: new Date().toISOString(),
            activeFilters: Array.from(this.activeFilters.keys())
        };
        
        this.filterHistory.unshift(historyItem);
        
        if (this.filterHistory.length > this.maxHistorySize) {
            this.filterHistory = this.filterHistory.slice(0, this.maxHistorySize);
        }
    }

    /**
     * Helper methods for filtering
     */
    
    filterByTables(data, tables) {
        const tableNames = new Set(tables.map(t => t.name));
        const relevantRelationships = data.relationships.filter(rel => 
            tableNames.has(rel.fromTable) && tableNames.has(rel.toTable)
        );
        
        return {
            ...data,
            tables: tables,
            relationships: relevantRelationships
        };
    }
    
    filterByTableNames(data, tableNames) {
        const tables = data.tables.filter(table => tableNames.includes(table.name));
        return this.filterByTables(data, tables);
    }

    /**
     * Show/hide panel
     */
    show() {
        if (this.panelElement) {
            this.panelElement.classList.add('visible');
            this.isVisible = true;
        }
    }

    hide() {
        if (this.panelElement) {
            this.panelElement.classList.remove('visible');
            this.isVisible = false;
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Get current filtered data
     */
    getFilteredData() {
        return this.schemaData;
    }

    /**
     * Get active filters
     */
    getActiveFilters() {
        return Array.from(this.activeFilters.values());
    }

    /**
     * Export filter configuration
     */
    exportFilters() {
        const config = {
            filters: this.getActiveFilters(),
            isolationMode: this.isolationMode,
            selectedTables: Array.from(this.selectedTables),
            exportedAt: new Date().toISOString()
        };
        
        return JSON.stringify(config, null, 2);
    }

    /**
     * Import filter configuration
     */
    importFilters(configJson) {
        try {
            const config = JSON.parse(configJson);
            
            // Clear existing filters
            this.clearAllFilters();
            
            // Apply imported filters
            config.filters?.forEach(filter => {
                this.applyFilter(filter);
            });
            
            // Restore isolation mode
            this.isolationMode = config.isolationMode || false;
            this.updateIsolationModeUI();
            
            // Restore selected tables
            this.selectedTables = new Set(config.selectedTables || []);
            this.updateSelectedTables();
            
            return true;
        } catch (error) {
            console.error('Failed to import filter configuration:', error);
            return false;
        }
    }
}