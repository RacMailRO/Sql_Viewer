/**
 * Enhanced Controls UI Component
 * Provides advanced controls for export, layout management, and relationship features
 */
export class EnhancedControls {
    constructor(application, eventBus) {
        this.app = application;
        this.eventBus = eventBus;
        this.initialized = false;
        
        this.setupEventListeners();
    }

    /**
     * Initialize enhanced controls UI
     */
    initialize() {
        if (this.initialized) return;
        
        this.createControlPanels();
        this.setupKeyboardShortcuts();
        this.initialized = true;
    }

    /**
     * Create control panels for enhanced features
     */
    createControlPanels() {
        // Add enhanced export controls
        this.addEnhancedExportControls();
        
        // Add layout management controls
        this.addLayoutManagementControls();
        
        // Add relationship controls
        this.addRelationshipControls();
    }

    /**
     * Add enhanced export controls to the UI
     */
    addEnhancedExportControls() {
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) return;

        // Create enhanced export dropdown
        const exportGroup = document.createElement('div');
        exportGroup.className = 'control-group';
        exportGroup.innerHTML = `
            <button id="enhanced-export-btn" class="btn btn-secondary" title="Enhanced Export Options">
                <span class="icon">📤</span>
                <span>Export</span>
                <span class="dropdown-arrow">▼</span>
            </button>
            <div id="enhanced-export-menu" class="dropdown-menu">
                <div class="menu-section">
                    <div class="menu-title">Database Schema</div>
                    <button class="menu-item" data-export="json">
                        <span class="icon">📄</span>
                        JSON Schema
                    </button>
                    <button class="menu-item" data-export="sql">
                        <span class="icon">🗃️</span>
                        SQL DDL
                    </button>
                    <button class="menu-item" data-export="yaml">
                        <span class="icon">📋</span>
                        YAML Schema
                    </button>
                </div>
                <div class="menu-divider"></div>
                <div class="menu-section">
                    <div class="menu-title">ERD State</div>
                    <button class="menu-item" data-export="complete">
                        <span class="icon">💾</span>
                        Complete ERD State
                    </button>
                    <button class="menu-item" data-export="layout">
                        <span class="icon">🎨</span>
                        Layout Only
                    </button>
                </div>
            </div>
        `;

        // Insert before existing export button or at the end
        const existingExportBtn = document.getElementById('export-btn');
        if (existingExportBtn) {
            existingExportBtn.parentNode.replaceChild(exportGroup, existingExportBtn);
        } else {
            toolbar.appendChild(exportGroup);
        }

        this.setupEnhancedExportEvents();
    }

    /**
     * Add layout management controls
     */
    addLayoutManagementControls() {
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) return;

        const layoutGroup = document.createElement('div');
        layoutGroup.className = 'control-group';
        layoutGroup.innerHTML = `
            <button id="layout-manager-btn" class="btn btn-secondary" title="Layout Management">
                <span class="icon">⚙️</span>
                <span>Layouts</span>
            </button>
            <button id="save-layout-btn" class="btn btn-secondary" title="Save Current Layout">
                <span class="icon">💾</span>
                <span>Save Layout</span>
            </button>
        `;

        toolbar.appendChild(layoutGroup);
        this.setupLayoutManagementEvents();
    }

    /**
     * Add relationship controls
     */
    addRelationshipControls() {
        const toolbar = document.querySelector('.toolbar');
        if (!toolbar) return;

        const relationshipGroup = document.createElement('div');
        relationshipGroup.className = 'control-group';
        relationshipGroup.innerHTML = `
            <button id="relationship-settings-btn" class="btn btn-secondary" title="Relationship Settings">
                <span class="icon">🔗</span>
                <span>Relationships</span>
            </button>
            <div class="toggle-group">
                <label class="toggle-label">
                    <input type="checkbox" id="show-relationship-labels" checked>
                    <span>Labels</span>
                </label>
                <label class="toggle-label">
                    <input type="checkbox" id="highlight-on-hover" checked>
                    <span>Hover Highlight</span>
                </label>
            </div>
        `;

        toolbar.appendChild(relationshipGroup);
        this.setupRelationshipEvents();
    }

    /**
     * Setup enhanced export events
     */
    setupEnhancedExportEvents() {
        const exportBtn = document.getElementById('enhanced-export-btn');
        const exportMenu = document.getElementById('enhanced-export-menu');
        const menuItems = exportMenu.querySelectorAll('.menu-item');

        // Toggle dropdown menu
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('show');
        });

        // Close menu when clicking outside
        document.addEventListener('click', () => {
            exportMenu.classList.remove('show');
        });

        // Handle export options
        menuItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                const exportType = e.currentTarget.dataset.export;
                await this.handleEnhancedExport(exportType);
                exportMenu.classList.remove('show');
            });
        });
    }

    /**
     * Setup layout management events
     */
    setupLayoutManagementEvents() {
        const layoutManagerBtn = document.getElementById('layout-manager-btn');
        const saveLayoutBtn = document.getElementById('save-layout-btn');

        layoutManagerBtn.addEventListener('click', () => {
            this.showLayoutManager();
        });

        saveLayoutBtn.addEventListener('click', () => {
            this.showSaveLayoutDialog();
        });
    }

    /**
     * Setup relationship events
     */
    setupRelationshipEvents() {
        const relationshipSettingsBtn = document.getElementById('relationship-settings-btn');
        const showLabelsToggle = document.getElementById('show-relationship-labels');
        const highlightToggle = document.getElementById('highlight-on-hover');

        relationshipSettingsBtn.addEventListener('click', () => {
            this.showRelationshipSettings();
        });

        showLabelsToggle.addEventListener('change', (e) => {
            this.toggleRelationshipLabels(e.target.checked);
        });

        highlightToggle.addEventListener('change', (e) => {
            this.toggleHoverHighlight(e.target.checked);
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+E - Enhanced Export
            if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                e.preventDefault();
                document.getElementById('enhanced-export-btn').click();
            }
            
            // Ctrl+Shift+S - Save Layout
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this.showSaveLayoutDialog();
            }
            
            // Ctrl+Shift+L - Layout Manager
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                e.preventDefault();
                this.showLayoutManager();
            }
        });
    }

    /**
     * Handle enhanced export
     */
    async handleEnhancedExport(exportType) {
        try {
            const currentSchema = this.app.schemaModel.getSchema();
            const currentLayout = this.app.diagramState.getCurrentLayout();
            const currentRelationships = this.app.schemaModel.getRelationships();

            // Update enhanced export manager with current state
            this.app.enhancedExportManager.setERDState(
                currentSchema, 
                currentLayout, 
                currentRelationships
            );

            const timestamp = new Date().toISOString().slice(0, 16).replace(/[:.]/g, '-');
            let filename = `erd_export_${timestamp}`;

            if (currentSchema?.name) {
                filename = `${currentSchema.name}_${timestamp}`;
            }

            switch (exportType) {
                case 'json':
                case 'sql':
                case 'yaml':
                    await this.app.enhancedExportManager.saveERDState(filename, exportType);
                    break;
                case 'complete':
                    await this.app.enhancedExportManager.saveERDState(filename, 'complete');
                    break;
                case 'layout':
                    await this.app.layoutManager.exportLayout('current', 'json');
                    break;
            }

            this.showNotification(`Export completed: ${filename}`, 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.showNotification('Export failed: ' + error.message, 'error');
        }
    }

    /**
     * Show layout manager dialog
     */
    showLayoutManager() {
        const layouts = this.app.layoutManager.getAllLayouts();
        
        const dialog = this.createDialog('Layout Manager', `
            <div class="layout-manager">
                <div class="layout-list">
                    <div class="list-header">
                        <h4>Saved Layouts</h4>
                        <button class="btn btn-primary btn-sm" id="import-layout-btn">Import Layout</button>
                    </div>
                    <div class="layout-items">
                        ${layouts.map(layout => `
                            <div class="layout-item" data-layout-id="${layout.id}">
                                <div class="layout-info">
                                    <div class="layout-name">${layout.name}</div>
                                    <div class="layout-meta">
                                        ${layout.tableCount} tables, ${layout.relationshipCount} relationships
                                    </div>
                                    <div class="layout-date">Modified: ${new Date(layout.modified).toLocaleDateString()}</div>
                                </div>
                                <div class="layout-actions">
                                    <button class="btn btn-sm" data-action="load">Load</button>
                                    <button class="btn btn-sm" data-action="duplicate">Duplicate</button>
                                    <button class="btn btn-sm" data-action="export">Export</button>
                                    <button class="btn btn-sm btn-danger" data-action="delete">Delete</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `);

        this.setupLayoutManagerEvents(dialog);
    }

    /**
     * Show save layout dialog
     */
    showSaveLayoutDialog() {
        const dialog = this.createDialog('Save Layout', `
            <div class="save-layout-form">
                <div class="form-group">
                    <label for="layout-name">Layout Name:</label>
                    <input type="text" id="layout-name" class="form-control" 
                           placeholder="Enter layout name..." value="Layout ${Date.now()}">
                </div>
                <div class="form-group">
                    <label for="layout-description">Description (optional):</label>
                    <textarea id="layout-description" class="form-control" 
                              placeholder="Describe this layout..."></textarea>
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                    <button class="btn btn-primary" data-action="save">Save Layout</button>
                </div>
            </div>
        `);

        const nameInput = dialog.querySelector('#layout-name');
        const descriptionInput = dialog.querySelector('#layout-description');
        const saveBtn = dialog.querySelector('[data-action="save"]');
        const cancelBtn = dialog.querySelector('[data-action="cancel"]');

        saveBtn.addEventListener('click', () => {
            const name = nameInput.value.trim();
            if (!name) {
                this.showNotification('Please enter a layout name', 'error');
                return;
            }

            const layoutId = `layout_${Date.now()}`;
            const currentLayout = this.app.diagramState.getCurrentLayout();
            
            this.app.layoutManager.saveLayout(layoutId, currentLayout, {
                name: name,
                description: descriptionInput.value.trim()
            });

            this.closeDialog(dialog);
            this.showNotification('Layout saved successfully', 'success');
        });

        cancelBtn.addEventListener('click', () => {
            this.closeDialog(dialog);
        });
    }

    /**
     * Show relationship settings
     */
    showRelationshipSettings() {
        // Future implementation for advanced relationship settings
        this.showNotification('Relationship settings coming soon!', 'info');
    }

    /**
     * Toggle relationship labels
     */
    toggleRelationshipLabels(show) {
        if (this.eventBus) {
            this.eventBus.emit('relationships:toggle-labels', { show });
        }
    }

    /**
     * Toggle hover highlight
     */
    toggleHoverHighlight(enabled) {
        if (this.eventBus) {
            this.eventBus.emit('relationships:toggle-hover', { enabled });
        }
    }

    /**
     * Utility methods
     */
    createDialog(title, content) {
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="close-btn" data-action="close">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Setup close events
        const closeBtn = dialog.querySelector('[data-action="close"]');
        closeBtn.addEventListener('click', () => this.closeDialog(dialog));
        
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) this.closeDialog(dialog);
        });

        return dialog;
    }

    closeDialog(dialog) {
        if (dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
        }
    }

    showNotification(message, type = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (this.eventBus) {
            // Listen for layout events
            this.eventBus.on('layout:saved', (data) => {
                this.showNotification(`Layout "${data.layout.metadata.name}" saved`, 'success');
            });

            this.eventBus.on('export:success', (data) => {
                this.showNotification(`Export completed: ${data.filename}`, 'success');
            });

            this.eventBus.on('export:error', (data) => {
                this.showNotification(`Export failed: ${data.error}`, 'error');
            });
        }
    }
}