/**
 * Comprehensive Search Manager
 * Provides search functionality for tables and columns with automatic navigation and highlighting
 */
export class SearchManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.schemaData = null;
        this.searchIndex = new Map();
        this.searchResults = [];
        this.currentResultIndex = -1;
        this.searchPanel = null;
        this.isVisible = false;
        
        // Search configuration
        this.searchConfig = {
            minQueryLength: 1,
            maxResults: 50,
            highlightDuration: 3000,
            animationDuration: 800,
            searchDelay: 300,
            caseSensitive: false,
            fuzzySearch: true,
            fuzzyThreshold: 0.6
        };
        
        // Search filters
        this.activeFilters = {
            tables: true,
            columns: true,
            relationships: false,
            dataTypes: false
        };
        
        this.searchTimeout = null;
        this.highlightTimeout = null;
        
        this.initialize();
    }

    /**
     * Initialize the search manager
     */
    initialize() {
        this.createSearchPanel();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    /**
     * Create search panel UI
     */
    createSearchPanel() {
        const panel = document.createElement('div');
        panel.id = 'search-panel';
        panel.className = 'search-panel';
        panel.innerHTML = `
            <div class="search-header">
                <div class="search-input-container">
                    <input type="text" id="search-input" placeholder="Search tables, columns, or relationships..." autocomplete="off">
                    <div class="search-icons">
                        <span class="search-icon">🔍</span>
                        <button id="clear-search" class="clear-btn" title="Clear search">✕</button>
                    </div>
                </div>
                <div class="search-controls">
                    <div class="search-filters">
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-tables" checked>
                            <span>Tables</span>
                        </label>
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-columns" checked>
                            <span>Columns</span>
                        </label>
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-relationships">
                            <span>Relationships</span>
                        </label>
                        <label class="filter-checkbox">
                            <input type="checkbox" id="filter-datatypes">
                            <span>Data Types</span>
                        </label>
                    </div>
                    <div class="search-options">
                        <label class="option-checkbox">
                            <input type="checkbox" id="option-case-sensitive">
                            <span>Case Sensitive</span>
                        </label>
                        <label class="option-checkbox">
                            <input type="checkbox" id="option-fuzzy-search" checked>
                            <span>Fuzzy Search</span>
                        </label>
                    </div>
                    <button id="close-search" class="close-btn" title="Close Search">✕</button>
                </div>
            </div>
            <div class="search-content">
                <div class="search-stats">
                    <span id="search-stats-text">Enter search terms to find tables and columns</span>
                    <div class="navigation-controls">
                        <button id="prev-result" class="nav-btn" disabled title="Previous Result (↑)">↑</button>
                        <span id="result-counter">0/0</span>
                        <button id="next-result" class="nav-btn" disabled title="Next Result (↓)">↓</button>
                    </div>
                </div>
                <div class="search-results" id="search-results">
                    <div class="no-results">
                        <span class="no-results-icon">🔍</span>
                        <p>Start typing to search through your schema</p>
                        <div class="search-tips">
                            <strong>Search Tips:</strong>
                            <ul>
                                <li>Search for table names, column names, or data types</li>
                                <li>Use fuzzy search to find partial matches</li>
                                <li>Click on results to navigate directly to the element</li>
                                <li>Use ↑/↓ arrow keys to navigate results</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.searchPanel = panel;
        this.setupPanelEventListeners();
    }

    /**
     * Setup panel event listeners
     */
    setupPanelEventListeners() {
        const searchInput = document.getElementById('search-input');
        const clearBtn = document.getElementById('clear-search');
        const closeBtn = document.getElementById('close-search');
        const prevBtn = document.getElementById('prev-result');
        const nextBtn = document.getElementById('next-result');
        
        // Search input events
        searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
        searchInput.addEventListener('keydown', (e) => this.handleSearchKeydown(e));
        
        // Control buttons
        clearBtn.addEventListener('click', () => this.clearSearch());
        closeBtn.addEventListener('click', () => this.hide());
        prevBtn.addEventListener('click', () => this.navigateToPrevious());
        nextBtn.addEventListener('click', () => this.navigateToNext());
        
        // Filter checkboxes
        document.getElementById('filter-tables').addEventListener('change', (e) => {
            this.activeFilters.tables = e.target.checked;
            this.performSearch();
        });
        
        document.getElementById('filter-columns').addEventListener('change', (e) => {
            this.activeFilters.columns = e.target.checked;
            this.performSearch();
        });
        
        document.getElementById('filter-relationships').addEventListener('change', (e) => {
            this.activeFilters.relationships = e.target.checked;
            this.performSearch();
        });
        
        document.getElementById('filter-datatypes').addEventListener('change', (e) => {
            this.activeFilters.dataTypes = e.target.checked;
            this.performSearch();
        });
        
        // Option checkboxes
        document.getElementById('option-case-sensitive').addEventListener('change', (e) => {
            this.searchConfig.caseSensitive = e.target.checked;
            this.performSearch();
        });
        
        document.getElementById('option-fuzzy-search').addEventListener('change', (e) => {
            this.searchConfig.fuzzySearch = e.target.checked;
            this.performSearch();
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (this.eventBus) {
            this.eventBus.on('schema:loaded', (data) => {
                this.setSchemaData(data);
            });
            
            this.eventBus.on('schema:filtered', (data) => {
                this.setSchemaData(data);
            });
        }
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+K or Cmd+K to open search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.show();
                return;
            }
            
            // Escape to close search
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
                return;
            }
            
            // Arrow keys for navigation when search is open
            if (this.isVisible && this.searchResults.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateToNext();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateToPrevious();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.selectCurrentResult();
                }
            }
        });
    }

    /**
     * Handle search input
     */
    handleSearchInput(event) {
        const query = event.target.value.trim();
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Debounce search
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, this.searchConfig.searchDelay);
    }

    /**
     * Handle search input keydown
     */
    handleSearchKeydown(event) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.navigateToNext();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.navigateToPrevious();
                break;
            case 'Enter':
                event.preventDefault();
                this.selectCurrentResult();
                break;
            case 'Escape':
                this.hide();
                break;
        }
    }

    /**
     * Set schema data and build search index
     */
    setSchemaData(schemaData) {
        this.schemaData = schemaData;
        this.buildSearchIndex();
    }

    /**
     * Build search index for fast searching
     */
    buildSearchIndex() {
        this.searchIndex.clear();
        
        if (!this.schemaData) return;
        
        const tables = this.schemaData.tables || [];
        const relationships = this.schemaData.relationships || [];
        
        // Index tables
        tables.forEach(table => {
            this.addToIndex({
                type: 'table',
                id: `table_${table.name}`,
                name: table.name,
                displayName: table.name,
                description: table.description || '',
                table: table.name,
                searchText: this.buildSearchText([table.name, table.description]),
                data: table
            });
            
            // Index columns
            if (table.columns) {
                table.columns.forEach(column => {
                    this.addToIndex({
                        type: 'column',
                        id: `column_${table.name}_${column.name}`,
                        name: column.name,
                        displayName: `${table.name}.${column.name}`,
                        description: column.description || '',
                        table: table.name,
                        column: column.name,
                        dataType: column.type || '',
                        isPrimary: column.isPrimary || false,
                        isForeign: column.isForeign || false,
                        searchText: this.buildSearchText([
                            column.name, 
                            column.type, 
                            column.description,
                            table.name
                        ]),
                        data: { table, column }
                    });
                });
            }
        });
        
        // Index relationships
        relationships.forEach((relationship, index) => {
            const relationshipName = relationship.name || `${relationship.fromTable} → ${relationship.toTable}`;
            this.addToIndex({
                type: 'relationship',
                id: `relationship_${index}`,
                name: relationshipName,
                displayName: relationshipName,
                description: relationship.description || '',
                fromTable: relationship.fromTable,
                toTable: relationship.toTable,
                cardinality: `${relationship.fromCardinality || '1'}:${relationship.toCardinality || '1'}`,
                searchText: this.buildSearchText([
                    relationshipName,
                    relationship.fromTable,
                    relationship.toTable,
                    relationship.fromCardinality,
                    relationship.toCardinality,
                    relationship.description
                ]),
                data: relationship
            });
        });
        
        console.log(`Search index built with ${this.searchIndex.size} entries`);
    }

    /**
     * Build search text from array of strings
     */
    buildSearchText(textArray) {
        return textArray
            .filter(text => text && typeof text === 'string')
            .join(' ')
            .toLowerCase();
    }

    /**
     * Add item to search index
     */
    addToIndex(item) {
        this.searchIndex.set(item.id, item);
    }

    /**
     * Perform search with current query
     */
    performSearch(query = null) {
        if (query === null) {
            query = document.getElementById('search-input')?.value.trim() || '';
        }
        
        if (query.length < this.searchConfig.minQueryLength) {
            this.displayResults([]);
            return;
        }
        
        const results = this.searchInIndex(query);
        this.displayResults(results);
    }

    /**
     * Search in the index
     */
    searchInIndex(query) {
        const queryLower = query.toLowerCase();
        const results = [];
        
        for (const item of this.searchIndex.values()) {
            // Apply filters
            if (!this.shouldIncludeType(item.type)) {
                continue;
            }
            
            // Calculate relevance score
            const score = this.calculateRelevanceScore(item, queryLower);
            
            if (score > 0) {
                results.push({
                    ...item,
                    score: score,
                    matchedText: this.getMatchedText(item, queryLower)
                });
            }
        }
        
        // Sort by relevance score (highest first)
        results.sort((a, b) => b.score - a.score);
        
        // Limit results
        return results.slice(0, this.searchConfig.maxResults);
    }

    /**
     * Check if type should be included based on filters
     */
    shouldIncludeType(type) {
        switch (type) {
            case 'table':
                return this.activeFilters.tables;
            case 'column':
                return this.activeFilters.columns;
            case 'relationship':
                return this.activeFilters.relationships;
            default:
                return false;
        }
    }

    /**
     * Calculate relevance score for search result
     */
    calculateRelevanceScore(item, query) {
        let score = 0;
        const searchText = this.searchConfig.caseSensitive ? item.searchText : item.searchText.toLowerCase();
        const searchQuery = this.searchConfig.caseSensitive ? query : query.toLowerCase();
        
        // Exact name match (highest score)
        if (item.name.toLowerCase() === searchQuery) {
            score += 100;
        }
        
        // Name starts with query
        if (item.name.toLowerCase().startsWith(searchQuery)) {
            score += 80;
        }
        
        // Name contains query
        if (item.name.toLowerCase().includes(searchQuery)) {
            score += 60;
        }
        
        // Search text contains query
        if (searchText.includes(searchQuery)) {
            score += 40;
        }
        
        // Fuzzy search
        if (this.searchConfig.fuzzySearch && score === 0) {
            const fuzzyScore = this.calculateFuzzyScore(item.name.toLowerCase(), searchQuery);
            if (fuzzyScore >= this.searchConfig.fuzzyThreshold) {
                score += fuzzyScore * 30;
            }
        }
        
        // Boost score for certain types
        if (item.type === 'table') {
            score *= 1.2; // Tables are more important
        } else if (item.isPrimary) {
            score *= 1.1; // Primary keys are important
        }
        
        return score;
    }

    /**
     * Calculate fuzzy match score using Levenshtein distance
     */
    calculateFuzzyScore(str1, str2) {
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;
        
        // Initialize matrix
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        // Fill matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return maxLen > 0 ? 1 - (distance / maxLen) : 0;
    }

    /**
     * Get matched text for highlighting
     */
    getMatchedText(item, query) {
        const text = item.name;
        const index = text.toLowerCase().indexOf(query);
        
        if (index === -1) {
            return text;
        }
        
        return {
            before: text.substring(0, index),
            match: text.substring(index, index + query.length),
            after: text.substring(index + query.length)
        };
    }

    /**
     * Display search results
     */
    displayResults(results) {
        this.searchResults = results;
        this.currentResultIndex = results.length > 0 ? 0 : -1;
        
        const resultsContainer = document.getElementById('search-results');
        const statsText = document.getElementById('search-stats-text');
        const resultCounter = document.getElementById('result-counter');
        const prevBtn = document.getElementById('prev-result');
        const nextBtn = document.getElementById('next-result');
        
        // Update stats
        if (results.length === 0) {
            const query = document.getElementById('search-input')?.value.trim() || '';
            if (query) {
                statsText.textContent = 'No results found';
                resultsContainer.innerHTML = `
                    <div class="no-results">
                        <span class="no-results-icon">😔</span>
                        <p>No results found for "${query}"</p>
                        <div class="search-suggestions">
                            <strong>Try:</strong>
                            <ul>
                                <li>Check your spelling</li>
                                <li>Use fewer keywords</li>
                                <li>Enable fuzzy search for partial matches</li>
                                <li>Adjust search filters</li>
                            </ul>
                        </div>
                    </div>
                `;
            } else {
                statsText.textContent = 'Enter search terms to find tables and columns';
                resultsContainer.innerHTML = `
                    <div class="no-results">
                        <span class="no-results-icon">🔍</span>
                        <p>Start typing to search through your schema</p>
                        <div class="search-tips">
                            <strong>Search Tips:</strong>
                            <ul>
                                <li>Search for table names, column names, or data types</li>
                                <li>Use fuzzy search to find partial matches</li>
                                <li>Click on results to navigate directly to the element</li>
                                <li>Use ↑/↓ arrow keys to navigate results</li>
                            </ul>
                        </div>
                    </div>
                `;
            }
        } else {
            statsText.textContent = `Found ${results.length} result${results.length !== 1 ? 's' : ''}`;
            resultsContainer.innerHTML = this.renderResults(results);
            this.setupResultEventListeners();
        }
        
        // Update navigation
        resultCounter.textContent = results.length > 0 ? `${this.currentResultIndex + 1}/${results.length}` : '0/0';
        prevBtn.disabled = results.length === 0 || this.currentResultIndex <= 0;
        nextBtn.disabled = results.length === 0 || this.currentResultIndex >= results.length - 1;
        
        // Highlight current result
        this.updateResultSelection();
    }

    /**
     * Render search results HTML
     */
    renderResults(results) {
        return results.map((result, index) => {
            const iconMap = {
                table: '🗂️',
                column: '📋',
                relationship: '🔗'
            };
            
            const icon = iconMap[result.type] || '📄';
            const typeClass = `result-${result.type}`;
            
            let badges = '';
            if (result.type === 'column') {
                if (result.isPrimary) badges += '<span class="badge badge-primary">PK</span>';
                if (result.isForeign) badges += '<span class="badge badge-foreign">FK</span>';
                if (result.dataType) badges += `<span class="badge badge-type">${result.dataType}</span>`;
            } else if (result.type === 'relationship') {
                badges += `<span class="badge badge-cardinality">${result.cardinality}</span>`;
            }
            
            const matchedText = typeof result.matchedText === 'object' ? 
                `${result.matchedText.before}<mark>${result.matchedText.match}</mark>${result.matchedText.after}` :
                result.displayName;
            
            return `
                <div class="search-result ${typeClass}" data-index="${index}" data-id="${result.id}">
                    <div class="result-icon">${icon}</div>
                    <div class="result-content">
                        <div class="result-name">${matchedText}</div>
                        <div class="result-meta">
                            <span class="result-type">${result.type}</span>
                            ${result.table ? `<span class="result-table">in ${result.table}</span>` : ''}
                            ${badges}
                        </div>
                        ${result.description ? `<div class="result-description">${result.description}</div>` : ''}
                    </div>
                    <div class="result-score">${Math.round(result.score)}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Setup event listeners for result items
     */
    setupResultEventListeners() {
        const resultElements = document.querySelectorAll('.search-result');
        resultElements.forEach((element, index) => {
            element.addEventListener('click', () => {
                this.currentResultIndex = index;
                this.selectCurrentResult();
            });
            
            element.addEventListener('mouseenter', () => {
                this.currentResultIndex = index;
                this.updateResultSelection();
            });
        });
    }

    /**
     * Update result selection highlighting
     */
    updateResultSelection() {
        const resultElements = document.querySelectorAll('.search-result');
        resultElements.forEach((element, index) => {
            element.classList.toggle('selected', index === this.currentResultIndex);
        });
        
        // Scroll selected result into view
        if (this.currentResultIndex >= 0 && this.currentResultIndex < resultElements.length) {
            resultElements[this.currentResultIndex].scrollIntoView({
                block: 'nearest',
                behavior: 'smooth'
            });
        }
    }

    /**
     * Navigate to previous result
     */
    navigateToPrevious() {
        if (this.searchResults.length > 0 && this.currentResultIndex > 0) {
            this.currentResultIndex--;
            this.updateResultSelection();
            this.updateNavigationButtons();
        }
    }

    /**
     * Navigate to next result
     */
    navigateToNext() {
        if (this.searchResults.length > 0 && this.currentResultIndex < this.searchResults.length - 1) {
            this.currentResultIndex++;
            this.updateResultSelection();
            this.updateNavigationButtons();
        }
    }

    /**
     * Update navigation button states
     */
    updateNavigationButtons() {
        const resultCounter = document.getElementById('result-counter');
        const prevBtn = document.getElementById('prev-result');
        const nextBtn = document.getElementById('next-result');
        
        resultCounter.textContent = this.searchResults.length > 0 ? 
            `${this.currentResultIndex + 1}/${this.searchResults.length}` : '0/0';
        
        prevBtn.disabled = this.currentResultIndex <= 0;
        nextBtn.disabled = this.currentResultIndex >= this.searchResults.length - 1;
    }

    /**
     * Select and navigate to current result
     */
    selectCurrentResult() {
        if (this.currentResultIndex >= 0 && this.currentResultIndex < this.searchResults.length) {
            const result = this.searchResults[this.currentResultIndex];
            this.navigateToResult(result);
        }
    }

    /**
     * Navigate to search result with smooth animation
     */
    navigateToResult(result) {
        if (!this.eventBus) return;
        
        // Clear any existing highlights
        this.clearHighlights();
        
        // Emit navigation event
        this.eventBus.emit('search:navigate', {
            type: result.type,
            target: result,
            animate: true,
            highlight: true
        });
        
        // Set up highlight timeout
        this.highlightTimeout = setTimeout(() => {
            this.clearHighlights();
        }, this.searchConfig.highlightDuration);
        
        console.log('Navigating to search result:', result);
    }

    /**
     * Clear search highlights
     */
    clearHighlights() {
        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
            this.highlightTimeout = null;
        }
        
        if (this.eventBus) {
            this.eventBus.emit('search:clearHighlight');
        }
    }

    /**
     * Clear search
     */
    clearSearch() {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        
        this.searchResults = [];
        this.currentResultIndex = -1;
        this.displayResults([]);
        this.clearHighlights();
    }

    /**
     * Show search panel
     */
    show() {
        if (this.searchPanel) {
            this.searchPanel.classList.add('visible');
            this.isVisible = true;
            
            // Focus search input
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    }

    /**
     * Hide search panel
     */
    hide() {
        if (this.searchPanel) {
            this.searchPanel.classList.remove('visible');
            this.isVisible = false;
            this.clearHighlights();
        }
    }

    /**
     * Toggle search panel visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Get current search results
     */
    getResults() {
        return this.searchResults;
    }

    /**
     * Export search results
     */
    exportResults(format = 'json') {
        const data = {
            query: document.getElementById('search-input')?.value || '',
            results: this.searchResults,
            filters: this.activeFilters,
            timestamp: new Date().toISOString()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            return this.convertResultsToCSV(data);
        }
        
        return data;
    }

    /**
     * Convert results to CSV format
     */
    convertResultsToCSV(data) {
        const headers = ['Type', 'Name', 'Table', 'Description', 'Score'];
        const rows = data.results.map(result => [
            result.type,
            result.name,
            result.table || '',
            result.description || '',
            result.score
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
        
        return csvContent;
    }
}