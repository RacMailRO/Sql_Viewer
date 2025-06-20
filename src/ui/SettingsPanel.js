/**
 * Settings Panel Component
 * Provides configurable controls for ERD visualization settings including margins, spacing, and visual preferences
 */
export class SettingsPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.settings = {
            // Margin and Spacing Settings
            tableMargin: 50,
            minTableSpacing: 30,
            connectionPadding: 15,
            gridSize: 20,
            snapToGrid: false,
            
            // Visual Settings
            showGrid: false,
            showRelationshipLabels: true,
            showColumnTypes: true,
            compactMode: false,
            theme: 'light',
            
            // Relationship Settings
            connectionStyle: 'orthogonal',
            arrowStyle: 'crowsfoot',
            lineThickness: 2,
            connectionOpacity: 1.0,
            
            // Layout Settings
            autoLayout: 'force-directed',
            preventOverlap: true,
            groupByRelationships: false,
            colorCodeGroups: false
        };
        
        this.panelElement = null;
        this.isVisible = false;
        
        this.initialize();
        this.setupEventListeners();
    }

    /**
     * Initialize the settings panel
     */
    initialize() {
        this.createSettingsPanel();
        this.loadSettings();
    }

    /**
     * Create settings panel UI
     */
    createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'settings-panel';
        panel.className = 'settings-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3 class="panel-title">ERD Settings</h3>
                <div class="panel-controls">
                    <button id="reset-settings" class="panel-btn" title="Reset to Defaults">🔄</button>
                    <button id="close-settings" class="panel-btn" title="Close Settings">✕</button>
                </div>
            </div>
            <div class="panel-content">
                ${this.renderSettingsContent()}
            </div>
        `;
        
        document.body.appendChild(panel);
        this.panelElement = panel;
        this.setupPanelEventListeners();
    }

    /**
     * Render settings content sections
     */
    renderSettingsContent() {
        return `
            <div class="settings-sections">
                ${this.renderMarginSettings()}
                ${this.renderVisualSettings()}
                ${this.renderRelationshipSettings()}
                ${this.renderLayoutSettings()}
                ${this.renderAdvancedSettings()}
            </div>
        `;
    }

    /**
     * Render margin and spacing settings
     */
    renderMarginSettings() {
        return `
            <div class="settings-section">
                <div class="section-header">
                    <h4>Margins & Spacing</h4>
                    <span class="section-icon">📏</span>
                </div>
                <div class="setting-group">
                    <label for="table-margin">Table Margin (px)</label>
                    <div class="range-input-group">
                        <input type="range" id="table-margin" min="10" max="200" value="${this.settings.tableMargin}">
                        <span class="range-value">${this.settings.tableMargin}px</span>
                    </div>
                    <div class="setting-description">Minimum distance between tables and other elements</div>
                </div>
                
                <div class="setting-group">
                    <label for="min-table-spacing">Minimum Table Spacing (px)</label>
                    <div class="range-input-group">
                        <input type="range" id="min-table-spacing" min="10" max="100" value="${this.settings.minTableSpacing}">
                        <span class="range-value">${this.settings.minTableSpacing}px</span>
                    </div>
                    <div class="setting-description">Minimum space between adjacent tables</div>
                </div>
                
                <div class="setting-group">
                    <label for="connection-padding">Connection Padding (px)</label>
                    <div class="range-input-group">
                        <input type="range" id="connection-padding" min="5" max="50" value="${this.settings.connectionPadding}">
                        <span class="range-value">${this.settings.connectionPadding}px</span>
                    </div>
                    <div class="setting-description">Distance from table edge to connection point</div>
                </div>
                
                <div class="setting-group">
                    <label for="grid-size">Grid Size (px)</label>
                    <div class="range-input-group">
                        <input type="range" id="grid-size" min="10" max="50" value="${this.settings.gridSize}">
                        <span class="range-value">${this.settings.gridSize}px</span>
                    </div>
                    <div class="setting-description">Grid cell size for alignment</div>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="snap-to-grid" ${this.settings.snapToGrid ? 'checked' : ''}>
                        <label for="snap-to-grid">Snap to Grid</label>
                    </div>
                    <div class="setting-description">Automatically align tables to grid</div>
                </div>
            </div>
        `;
    }

    /**
     * Render visual settings
     */
    renderVisualSettings() {
        return `
            <div class="settings-section">
                <div class="section-header">
                    <h4>Visual Appearance</h4>
                    <span class="section-icon">🎨</span>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="show-grid" ${this.settings.showGrid ? 'checked' : ''}>
                        <label for="show-grid">Show Grid</label>
                    </div>
                    <div class="setting-description">Display background grid for alignment</div>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="show-relationship-labels" ${this.settings.showRelationshipLabels ? 'checked' : ''}>
                        <label for="show-relationship-labels">Show Relationship Labels</label>
                    </div>
                    <div class="setting-description">Display cardinality labels on relationships</div>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="show-column-types" ${this.settings.showColumnTypes ? 'checked' : ''}>
                        <label for="show-column-types">Show Column Types</label>
                    </div>
                    <div class="setting-description">Display data types for each column</div>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="compact-mode" ${this.settings.compactMode ? 'checked' : ''}>
                        <label for="compact-mode">Compact Mode</label>
                    </div>
                    <div class="setting-description">Reduce spacing for smaller tables</div>
                </div>
                
                <div class="setting-group">
                    <label for="theme-select">Theme</label>
                    <select id="theme-select">
                        <option value="light" ${this.settings.theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="dark" ${this.settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
                        <option value="auto" ${this.settings.theme === 'auto' ? 'selected' : ''}>Auto</option>
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * Render relationship settings
     */
    renderRelationshipSettings() {
        return `
            <div class="settings-section">
                <div class="section-header">
                    <h4>Relationships</h4>
                    <span class="section-icon">🔗</span>
                </div>
                
                <div class="setting-group">
                    <label for="connection-style">Connection Style</label>
                    <select id="connection-style">
                        <option value="orthogonal" ${this.settings.connectionStyle === 'orthogonal' ? 'selected' : ''}>Orthogonal (Right Angles)</option>
                        <option value="straight" ${this.settings.connectionStyle === 'straight' ? 'selected' : ''}>Straight Lines</option>
                        <option value="curved" ${this.settings.connectionStyle === 'curved' ? 'selected' : ''}>Curved</option>
                    </select>
                </div>
                
                <div class="setting-group">
                    <label for="arrow-style">Arrow Style</label>
                    <select id="arrow-style">
                        <option value="crowsfoot" ${this.settings.arrowStyle === 'crowsfoot' ? 'selected' : ''}>Crow's Foot</option>
                        <option value="simple" ${this.settings.arrowStyle === 'simple' ? 'selected' : ''}>Simple Arrow</option>
                        <option value="chen" ${this.settings.arrowStyle === 'chen' ? 'selected' : ''}>Chen Notation</option>
                    </select>
                </div>
                
                <div class="setting-group">
                    <label for="line-thickness">Line Thickness</label>
                    <div class="range-input-group">
                        <input type="range" id="line-thickness" min="1" max="5" value="${this.settings.lineThickness}">
                        <span class="range-value">${this.settings.lineThickness}px</span>
                    </div>
                </div>
                
                <div class="setting-group">
                    <label for="connection-opacity">Connection Opacity</label>
                    <div class="range-input-group">
                        <input type="range" id="connection-opacity" min="0.1" max="1.0" step="0.1" value="${this.settings.connectionOpacity}">
                        <span class="range-value">${Math.round(this.settings.connectionOpacity * 100)}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render layout settings
     */
    renderLayoutSettings() {
        return `
            <div class="settings-section">
                <div class="section-header">
                    <h4>Layout & Positioning</h4>
                    <span class="section-icon">📐</span>
                </div>
                
                <div class="setting-group">
                    <label for="auto-layout">Auto Layout Algorithm</label>
                    <select id="auto-layout">
                        <option value="force-directed" ${this.settings.autoLayout === 'force-directed' ? 'selected' : ''}>Force-Directed</option>
                        <option value="hierarchical" ${this.settings.autoLayout === 'hierarchical' ? 'selected' : ''}>Hierarchical</option>
                        <option value="circular" ${this.settings.autoLayout === 'circular' ? 'selected' : ''}>Circular</option>
                        <option value="grid" ${this.settings.autoLayout === 'grid' ? 'selected' : ''}>Grid</option>
                    </select>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="prevent-overlap" ${this.settings.preventOverlap ? 'checked' : ''}>
                        <label for="prevent-overlap">Prevent Table Overlap</label>
                    </div>
                    <div class="setting-description">Automatically prevent tables from overlapping</div>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="group-by-relationships" ${this.settings.groupByRelationships ? 'checked' : ''}>
                        <label for="group-by-relationships">Group by Relationships</label>
                    </div>
                    <div class="setting-description">Automatically group related tables together</div>
                </div>
                
                <div class="setting-group">
                    <div class="checkbox-group">
                        <input type="checkbox" id="color-code-groups" ${this.settings.colorCodeGroups ? 'checked' : ''}>
                        <label for="color-code-groups">Color Code Groups</label>
                    </div>
                    <div class="setting-description">Apply different colors to relationship groups</div>
                </div>
            </div>
        `;
    }

    /**
     * Render advanced settings
     */
    renderAdvancedSettings() {
        return `
            <div class="settings-section">
                <div class="section-header">
                    <h4>Advanced</h4>
                    <span class="section-icon">⚙️</span>
                </div>
                
                <div class="setting-group">
                    <button id="export-settings" class="btn btn-secondary">Export Settings</button>
                    <div class="setting-description">Save current settings to file</div>
                </div>
                
                <div class="setting-group">
                    <button id="import-settings" class="btn btn-secondary">Import Settings</button>
                    <input type="file" id="settings-file-input" accept=".json" style="display: none;">
                    <div class="setting-description">Load settings from file</div>
                </div>
                
                <div class="setting-group">
                    <button id="reset-to-defaults" class="btn btn-warning">Reset to Defaults</button>
                    <div class="setting-description">Restore all settings to default values</div>
                </div>
            </div>
        `;
    }

    /**
     * Setup panel event listeners
     */
    setupPanelEventListeners() {
        const closeBtn = document.getElementById('close-settings');
        const resetBtn = document.getElementById('reset-settings');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetToDefaults());
        }
        
        this.setupSettingControls();
    }

    /**
     * Setup individual setting controls
     */
    setupSettingControls() {
        // Range inputs
        const rangeInputs = this.panelElement.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => {
            input.addEventListener('input', (e) => this.handleRangeChange(e));
        });
        
        // Checkboxes
        const checkboxes = this.panelElement.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.handleCheckboxChange(e));
        });
        
        // Selects
        const selects = this.panelElement.querySelectorAll('select');
        selects.forEach(select => {
            select.addEventListener('change', (e) => this.handleSelectChange(e));
        });
        
        // Buttons
        this.setupAdvancedControls();
    }

    /**
     * Setup advanced control buttons
     */
    setupAdvancedControls() {
        const exportBtn = document.getElementById('export-settings');
        const importBtn = document.getElementById('import-settings');
        const fileInput = document.getElementById('settings-file-input');
        const resetBtn = document.getElementById('reset-to-defaults');
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportSettings());
        }
        
        if (importBtn) {
            importBtn.addEventListener('click', () => fileInput?.click());
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.importSettings(e));
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetToDefaults());
        }
    }

    /**
     * Handle range input changes
     */
    handleRangeChange(event) {
        const { id, value } = event.target;
        const numValue = parseFloat(value);
        
        // Update display value
        const valueSpan = event.target.parentNode.querySelector('.range-value');
        if (valueSpan) {
            if (id === 'connection-opacity') {
                valueSpan.textContent = `${Math.round(numValue * 100)}%`;
            } else {
                valueSpan.textContent = `${numValue}px`;
            }
        }
        
        // Update setting
        const settingKey = this.convertIdToSettingKey(id);
        this.updateSetting(settingKey, numValue);
    }

    /**
     * Handle checkbox changes
     */
    handleCheckboxChange(event) {
        const { id, checked } = event.target;
        const settingKey = this.convertIdToSettingKey(id);
        this.updateSetting(settingKey, checked);
    }

    /**
     * Handle select changes
     */
    handleSelectChange(event) {
        const { id, value } = event.target;
        const settingKey = this.convertIdToSettingKey(id);
        this.updateSetting(settingKey, value);
    }

    /**
     * Convert HTML id to setting key
     */
    convertIdToSettingKey(id) {
        return id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
    }

    /**
     * Update a setting and emit change event
     */
    updateSetting(key, value) {
        if (this.settings.hasOwnProperty(key)) {
            this.settings[key] = value;
            this.saveSettings();
            this.emitSettingChange(key, value);
        }
    }

    /**
     * Emit setting change event
     */
    emitSettingChange(key, value) {
        if (this.eventBus) {
            this.eventBus.emit('settings:changed', {
                key: key,
                value: value,
                allSettings: { ...this.settings }
            });
        }
    }

    /**
     * Show settings panel
     */
    show() {
        if (this.panelElement) {
            this.panelElement.classList.add('visible');
            this.isVisible = true;
        }
    }

    /**
     * Hide settings panel
     */
    hide() {
        if (this.panelElement) {
            this.panelElement.classList.remove('visible');
            this.isVisible = false;
        }
    }

    /**
     * Toggle settings panel visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Reset to default settings
     */
    resetToDefaults() {
        const defaultSettings = {
            tableMargin: 50,
            minTableSpacing: 30,
            connectionPadding: 15,
            gridSize: 20,
            snapToGrid: false,
            showGrid: false,
            showRelationshipLabels: true,
            showColumnTypes: true,
            compactMode: false,
            theme: 'light',
            connectionStyle: 'orthogonal',
            arrowStyle: 'crowsfoot',
            lineThickness: 2,
            connectionOpacity: 1.0,
            autoLayout: 'force-directed',
            preventOverlap: true,
            groupByRelationships: false,
            colorCodeGroups: false
        };
        
        this.settings = { ...defaultSettings };
        this.saveSettings();
        this.refreshPanel();
        
        if (this.eventBus) {
            this.eventBus.emit('settings:reset', this.settings);
        }
    }

    /**
     * Refresh panel with current settings
     */
    refreshPanel() {
        if (this.panelElement) {
            const content = this.panelElement.querySelector('.panel-content');
            if (content) {
                content.innerHTML = this.renderSettingsContent();
                this.setupSettingControls();
            }
        }
    }

    /**
     * Export settings to file
     */
    exportSettings() {
        const settingsData = {
            version: '1.0',
            exported: new Date().toISOString(),
            settings: this.settings
        };
        
        const blob = new Blob([JSON.stringify(settingsData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `erd-settings-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }

    /**
     * Import settings from file
     */
    importSettings(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.settings) {
                    this.settings = { ...this.settings, ...data.settings };
                    this.saveSettings();
                    this.refreshPanel();
                    
                    if (this.eventBus) {
                        this.eventBus.emit('settings:imported', this.settings);
                    }
                }
            } catch (error) {
                console.error('Failed to import settings:', error);
            }
        };
        reader.readAsText(file);
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('erd-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('erd-settings');
            if (saved) {
                const parsedSettings = JSON.parse(saved);
                this.settings = { ...this.settings, ...parsedSettings };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    /**
     * Get current settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Setup event listeners for external events
     */
    setupEventListeners() {
        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+, or Cmd+, to open settings
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                this.toggle();
            }
        });
    }
}