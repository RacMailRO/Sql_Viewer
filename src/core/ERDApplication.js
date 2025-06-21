import { EventBus } from './EventBus.js';
import { SchemaModel } from './SchemaModel.js';
import { DiagramState } from './DiagramState.js';
import { KonvaERDRenderer } from '../visualization/KonvaERDRenderer.js';
import { FileImporter } from '../ui/FileImporter.js';
import { KonvaExportManager } from '../export/KonvaExportManager.js';
import { LayoutManager } from './LayoutManager.js';
import { PropertiesPanel } from '../ui/PropertiesPanel.js';
import { LayoutAlgorithm } from '../algorithms/LayoutAlgorithm.js';
import { IntelligentLayoutAlgorithm } from '../algorithms/IntelligentLayoutAlgorithm.js';
import { SearchManager } from '../ui/SearchManager.js';
import { FilteringManager } from '../ui/FilteringManager.js';

/**
 * Main application class that orchestrates all components
 */
export class ERDApplication {
    constructor() {
        this.eventBus = new EventBus();
        this.schemaModel = new SchemaModel();
        this.diagramState = new DiagramState();
        this.renderer = null;
        this.fileImporter = null;
        this.exportManager = null;
        this.layoutManager = null;
        this.propertiesPanel = null;
        this.layoutAlgorithm = null;
        this.searchManager = null;
        this.filteringManager = null;
        
        // UI elements
        this.elements = {};
        
        // Application state
        this.isInitialized = false;
        
        // Settings
        this.settings = {
            tableDistance: 150,
            layoutPadding: 50,
            debugEnabled: false
        };
    }

    /**
     * Handle schema filtered event
     * @param {Object} filteredSchema - The filtered schema data
     */
    handleSchemaFiltered(filteredSchema) {
        try {
            this.showLoading('Applying filters...');

            // Update the schema model with the filtered data
            // This might internally emit 'schema:loaded' if SchemaModel is designed that way,
            // or we might need to call a more direct update if available.
            // For now, assume loadSchema also updates and can be used here.
            this.schemaModel.loadSchema(filteredSchema);

            // The rest is similar to handleSchemaLoaded but uses the filteredSchema directly
            const schemaForLayout = {
                ...filteredSchema,
                relationships: filteredSchema.relationships.map(r => ({
                    sourceTable: r.from.table,
                    sourceColumn: r.from.column,
                    targetTable: r.to.table,
                    targetColumn: r.to.column,
                    type: r.type
                }))
            };

            const layout = this.layoutAlgorithm.calculateLayout(schemaForLayout);
            this.diagramState.setLayout(layout);
            this.renderer.render(filteredSchema, layout);

            // Update UI elements like table counts
            this.updateUI();

            console.log('Schema filtered and re-rendered successfully:', filteredSchema);

            // Optionally, re-apply auto-layout and reset zoom for the new filtered view
            setTimeout(() => {
                try {
                    this.applyAutoLayout(); // This will use the current (filtered) schema
                    setTimeout(() => {
                        try {
                            this.resetZoom();
                        } catch (resetError) {
                            console.error('Reset zoom error after filtering:', resetError);
                        }
                    }, 100);
                } catch (layoutError) {
                    console.error('Auto layout error after filtering:', layoutError);
                }
            }, 100);

        } catch (error) {
            console.error('Error handling schema filter:', error);
            this.showError('Failed to apply filters and re-render schema');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Initialize the application
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            this.initializeElements();
            await this.initializeComponents();
            this.setupEventListeners();
            this.setupKeyboardShortcuts();
            
            this.isInitialized = true;
            console.log('ERD Application initialized successfully');
            
            // Show welcome message initially
            this.showWelcomeMessage();
            
        } catch (error) {
            console.error('Failed to initialize ERD Application:', error);
            this.showError('Failed to initialize application');
        }
    }

    /**
     * Initialize DOM elements
     */
    initializeElements() {
        this.elements = {
            // Canvas and containers
            canvas: document.getElementById('erd-canvas'),
            welcomeMessage: document.getElementById('welcome-message'),
            loadingOverlay: document.getElementById('loading-overlay'),
            propertyPanel: document.getElementById('property-panel'),
            panelContent: document.getElementById('panel-content'),
            
            // Buttons
            importBtn: document.getElementById('import-btn'),
            welcomeImportBtn: document.getElementById('welcome-import-btn'),
            exportBtn: document.getElementById('export-btn'),
            autoLayoutBtn: document.getElementById('auto-layout-btn'),
            resetZoomBtn: document.getElementById('reset-zoom-btn'),
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
            closePanelBtn: document.getElementById('close-panel-btn'),
            
            // File input
            fileInput: document.getElementById('file-input'),
            
            // Export dialog
            exportDialog: document.getElementById('export-dialog'),
            closeExportDialog: document.getElementById('close-export-dialog'),
            cancelExport: document.getElementById('cancel-export'),
            confirmExport: document.getElementById('confirm-export'),
            
            // Status bar
            zoomLevel: document.getElementById('zoom-level'),
            tableCount: document.getElementById('table-count'),
            relationshipCount: document.getElementById('relationship-count'),
            
            // Tooltip
            tooltip: document.getElementById('tooltip')
        };

        // Validate required elements
        const requiredElements = ['canvas', 'importBtn', 'fileInput'];
        for (const elementKey of requiredElements) {
            if (!this.elements[elementKey]) {
                throw new Error(`Required element not found: ${elementKey}`);
            }
        }
    }

    /**
     * Initialize core components
     */
    async initializeComponents() {
        // Initialize Konva renderer
        this.renderer = new KonvaERDRenderer(this.elements.canvas, {
            eventBus: this.eventBus
        });
        
        // Initialize Konva renderer
        await this.renderer.init();

        // Initialize file importer
        this.fileImporter = new FileImporter({
            eventBus: this.eventBus
        });

        // Initialize Konva export manager
        this.exportManager = new KonvaExportManager({
            eventBus: this.eventBus
        });
        
        // Initialize layout manager
        this.layoutManager = new LayoutManager(this.eventBus);
        
        // Initialize properties panel
        this.propertiesPanel = new PropertiesPanel(this.eventBus);
        
        // Initialize Konva export manager
        await this.exportManager.init();

        // Initialize layout algorithm
        this.layoutAlgorithm = new LayoutAlgorithm();
        
        // Initialize intelligent layout algorithm
        this.intelligentLayoutAlgorithm = new IntelligentLayoutAlgorithm();
        
        // Initialize search manager
        this.searchManager = new SearchManager(this.eventBus);
        
        // Initialize filtering manager
        this.filteringManager = new FilteringManager(this.eventBus);
        
        // Initialize statistical analyzer (placeholder - will be created when needed)
        this.statisticalAnalyzer = null;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // File import events
        this.elements.importBtn.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        this.elements.welcomeImportBtn.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        this.elements.fileInput.addEventListener('change', (event) => {
            // Show loading immediately when file is selected
            if (event.target.files && event.target.files.length > 0) {
                const file = event.target.files[0];
                const fileExtension = file.name.split('.').pop().toLowerCase();
                
                let loadingMessage = 'Processing schema...';
                if (fileExtension === 'csv') {
                    loadingMessage = 'Parsing CSV and generating relationships...';
                } else if (fileExtension === 'sql') {
                    loadingMessage = 'Parsing SQL schema...';
                } else if (fileExtension === 'json') {
                    loadingMessage = 'Loading JSON schema...';
                } else if (fileExtension === 'txt') {
                    loadingMessage = 'Parsing text schema...';
                }
                
                this.showLoading(loadingMessage);
                
                // Small delay to ensure UI updates before processing
                setTimeout(() => {
                    this.handleFileImport(event);
                }, 50);
            }
        });

        // Export events
        this.elements.exportBtn.addEventListener('click', () => {
            this.showExportDialog();
        });

        this.elements.closeExportDialog.addEventListener('click', () => {
            this.hideExportDialog();
        });

        this.elements.cancelExport.addEventListener('click', () => {
            this.hideExportDialog();
        });

        this.elements.confirmExport.addEventListener('click', () => {
            this.handleExport();
        });

        // Layout and zoom events
        this.elements.autoLayoutBtn.addEventListener('click', () => {
            this.applyAutoLayout();
        });

        this.elements.resetZoomBtn.addEventListener('click', () => {
            this.resetZoom();
        });

        // Undo/Redo events
        this.elements.undoBtn.addEventListener('click', () => {
            this.undo();
        });

        this.elements.redoBtn.addEventListener('click', () => {
            this.redo();
        });

        // Property panel events
        this.elements.closePanelBtn.addEventListener('click', () => {
            this.hidePropertyPanel();
        });

        // Application-wide events via EventBus
        this.eventBus.on('schema:loaded', (schema) => {
            this.handleSchemaLoaded(schema);
        });

        this.eventBus.on('schema:error', (error) => {
            this.handleSchemaError(error);
        });

        this.eventBus.on('table:selected', (table) => {
            this.handleTableSelected(table);
        });

        this.eventBus.on('relationship:selected', (relationship) => {
            this.handleRelationshipSelected(relationship);
        });

        this.eventBus.on('column:selected', (data) => {
            this.handleColumnSelected(data);
        });

        this.eventBus.on('diagram:changed', () => {
            this.updateUI();
        });

        this.eventBus.on('zoom:changed', (zoomLevel) => {
            this.updateZoomLevel(zoomLevel);
        });

        // Search navigation events
        this.eventBus.on('search:navigate', (eventData) => {
            if (this.renderer) {
                this.renderer.navigateToElement(eventData);
            }
        });

        this.eventBus.on('search:clearHighlight', () => {
            if (this.renderer) {
                this.renderer.clearSearchHighlight();
            }
        });

        // Filtering events
        this.eventBus.on('schema:filtered', (filteredSchema) => {
            this.handleSchemaFiltered(filteredSchema);
        });

        // Close modal when clicking outside
        this.elements.exportDialog.addEventListener('click', (event) => {
            if (event.target === this.elements.exportDialog) {
                this.hideExportDialog();
            }
        });
        
        // Toolbar button events
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                if (this.searchManager) {
                    this.searchManager.show();
                }
            });
        }
        
        const filterBtn = document.getElementById('filter-btn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                if (this.filteringManager) {
                    this.filteringManager.toggle();
                }
            });
        }
        
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showSettings();
            });
        }
        
        // Settings panel events
        const closeSettingsBtn = document.getElementById('close-settings-btn');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => {
                this.hideSettings();
            });
        }
        
        const settingsOverlay = document.getElementById('settings-overlay');
        if (settingsOverlay) {
            settingsOverlay.addEventListener('click', () => {
                this.hideSettings();
            });
        }
        
        // Debug toggle
        const debugToggle = document.getElementById('debug-toggle');
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                window.ERD_DEBUG_ENABLED = e.target.checked;
                localStorage.setItem('erd_debug_enabled', e.target.checked);
                console.log('Debug logging:', e.target.checked ? 'enabled' : 'disabled');
            });
            
            // Load debug setting
            const savedDebugSetting = localStorage.getItem('erd_debug_enabled');
            if (savedDebugSetting !== null) {
                debugToggle.checked = savedDebugSetting === 'true';
                window.ERD_DEBUG_ENABLED = debugToggle.checked;
            } else {
                // Enable debug by default for now to investigate drag issues
                debugToggle.checked = true;
                window.ERD_DEBUG_ENABLED = true;
            }
        }
        
        // Table distance setting
        const tableDistanceInput = document.getElementById('table-distance');
        const tableDistanceValue = document.getElementById('table-distance-value');
        if (tableDistanceInput && tableDistanceValue) {
            // Load saved setting
            const savedDistance = localStorage.getItem('erd_table_distance');
            if (savedDistance !== null) {
                this.settings.tableDistance = parseInt(savedDistance);
                tableDistanceInput.value = this.settings.tableDistance;
                tableDistanceValue.textContent = this.settings.tableDistance + 'px';
            }
            
            tableDistanceInput.addEventListener('input', (e) => {
                this.settings.tableDistance = parseInt(e.target.value);
                tableDistanceValue.textContent = this.settings.tableDistance + 'px';
                localStorage.setItem('erd_table_distance', this.settings.tableDistance);
            });
        }
        
        // Layout padding setting
        const layoutPaddingInput = document.getElementById('layout-padding');
        const layoutPaddingValue = document.getElementById('layout-padding-value');
        if (layoutPaddingInput && layoutPaddingValue) {
            // Load saved setting
            const savedPadding = localStorage.getItem('erd_layout_padding');
            if (savedPadding !== null) {
                this.settings.layoutPadding = parseInt(savedPadding);
                layoutPaddingInput.value = this.settings.layoutPadding;
                layoutPaddingValue.textContent = this.settings.layoutPadding + 'px';
            }
            
            layoutPaddingInput.addEventListener('input', (e) => {
                this.settings.layoutPadding = parseInt(e.target.value);
                layoutPaddingValue.textContent = this.settings.layoutPadding + 'px';
                localStorage.setItem('erd_layout_padding', this.settings.layoutPadding);
            });
        }
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Prevent default behavior for our shortcuts
            if (event.ctrlKey || event.metaKey) {
                switch (event.key) {
                    case 'z':
                        if (event.shiftKey) {
                            event.preventDefault();
                            this.redo();
                        } else {
                            event.preventDefault();
                            this.undo();
                        }
                        break;
                    case 'y':
                        event.preventDefault();
                        this.redo();
                        break;
                    case 'o':
                        event.preventDefault();
                        this.elements.fileInput.click();
                        break;
                    case 's':
                        event.preventDefault();
                        this.showExportDialog();
                        break;
                }
            }

            // Other shortcuts
            switch (event.key) {
                case 'Escape':
                    this.hideExportDialog();
                    this.hidePropertyPanel();
                    break;
                case 'Delete':
                case 'Backspace':
                    if (this.diagramState.selectedElement) {
                        this.deleteSelectedElement();
                    }
                    break;
            }
        });
    }

    /**
     * Handle file import
     */
    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // Loading animation is already shown by the file input event handler
            // Just process the file
            const schema = await this.fileImporter.importFile(file);
            this.schemaModel.loadSchema(schema);
            
            this.eventBus.emit('schema:loaded', this.schemaModel.getSchema());
            
        } catch (error) {
            console.error('File import error:', error);
            this.eventBus.emit('schema:error', error);
        } finally {
            this.hideLoading();
            // Reset file input
            event.target.value = '';
        }
    }

    /**
     * Handle schema loaded
     */
    handleSchemaLoaded(schema) {
        try {
            // Hide welcome message
            this.hideWelcomeMessage();
            
            const schemaForLayout = {
                ...schema,
                relationships: schema.relationships.map(r => ({
                    sourceTable: r.from.table,
                    sourceColumn: r.from.column,
                    targetTable: r.to.table,
                    targetColumn: r.to.column,
                    type: r.type
                }))
            };
            
            // Generate initial layout
            const layout = this.layoutAlgorithm.calculateLayout(schemaForLayout);
            
            this.diagramState.setLayout(layout);
            
            // Render the diagram
            this.renderer.render(schema, layout);
            
            // Update filtering manager with new schema (if available)
            if (this.filteringManager && this.filteringManager.setSchemaData) {
                this.filteringManager.setSchemaData(schema);
            }
            
            // Run statistical analysis (if available)
            if (this.statisticalAnalyzer && this.statisticalAnalyzer.analyzeSchema) {
                this.statisticalAnalyzer.analyzeSchema(schema);
            }
            
            // Update UI
            this.updateUI();
            
            console.log('Schema loaded successfully:', schema);
            
            // Auto-apply layout and reset zoom for better initial positioning
            setTimeout(() => {
                try {
                    this.applyAutoLayout();
                    setTimeout(() => {
                        try {
                            this.resetZoom();
                        } catch (resetError) {
                            console.error('Reset zoom error:', resetError);
                        }
                    }, 100);
                } catch (layoutError) {
                    console.error('Auto layout error:', layoutError);
                }
            }, 100);
            
        } catch (error) {
            console.error('Error handling schema load:', error);
            this.showError('Failed to render schema');
        }
    }

    /**
     * Handle schema load error
     * @param {Error} error - The error object
     */
    handleSchemaError(error) {
        this.hideLoading();
        this.showError(`Failed to load schema: ${error.message}`);
    }

    /**
     * Handle table selection
     * @param {Object} table - Selected table data
     */
    handleTableSelected(table) {
        this.diagramState.setSelectedElement(table);
        this.showPropertyPanel(table);
    }

    /**
     * Handle relationship selection
     * @param {Object} relationship - Selected relationship data
     */
    handleRelationshipSelected(relationship) {
        this.diagramState.setSelectedElement(relationship);
        this.showPropertyPanel(relationship);
    }

    /**
     * Handle column selection
     * @param {Object} data - Selected column data ({ table: tableData, column: columnData })
     */
    handleColumnSelected(data) {
        this.diagramState.setSelectedElement(data.column); // Store the actual column as selected
        this.showPropertyPanel(data); // Pass the composite object for the panel to decide
    }

    /**
     * Apply auto layout
     */
    applyAutoLayout() {
        try {
            this.showLoading('Applying auto layout...');
            const schema = this.schemaModel.getSchema();
            const schemaForLayout = {
                ...schema,
                relationships: schema.relationships.map(r => ({
                    sourceTable: r.from.table,
                    sourceColumn: r.from.column,
                    targetTable: r.to.table,
                    targetColumn: r.to.column,
                    type: r.type
                }))
            };

            const layout = this.layoutAlgorithm.calculateLayout(schemaForLayout);

            this.diagramState.setLayout(layout);
            this.renderer.updateLayout(layout);
            
            // Calculate layout statistics
            const bounds = {
                width: this.renderer.stage.width(),
                height: this.renderer.stage.height()
            };
            const stats = this.intelligentLayoutAlgorithm.generateLayoutStatistics(layout, bounds);
            this.showLayoutStats(stats);
            
        } catch (error) {
            console.error('Auto layout error:', error);
            this.showError('Failed to apply auto layout');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Show layout statistics
     * @param {Object} stats - Layout statistics
     */
    showLayoutStats(stats) {
        // Placeholder for showing layout stats in the UI
        console.log('Layout stats:', stats);
    }

    /**
     * Reset zoom and pan
     */
    resetZoom() {
        if (this.renderer) {
            this.renderer.resetZoom();
        }
    }

    /**
     * Undo last action
     */
    undo() {
        // Placeholder for undo functionality
        console.log('Undo action');
    }

    /**
     * Redo last action
     */
    redo() {
        // Placeholder for redo functionality
        console.log('Redo action');
    }

    /**
     * Delete selected element
     */
    deleteSelectedElement() {
        // Placeholder for delete functionality
        console.log('Delete selected element');
    }

    /**
     * Show export dialog
     */
    showExportDialog() {
        if (this.elements.exportDialog) {
            this.elements.exportDialog.style.display = 'flex';
        }
    }

    /**
     * Hide export dialog
     */
    hideExportDialog() {
        if (this.elements.exportDialog) {
            this.elements.exportDialog.style.display = 'none';
        }
    }

    /**
     * Handle export
     */
    async handleExport() {
        const format = document.getElementById('export-format').value;
        const filename = document.getElementById('export-filename').value;
        
        try {
            const options = {
                format,
                filename,
                width: this.renderer.stage.width(),
                height: this.renderer.stage.height()
            };
            
            await this.exportManager.export(this.renderer.stage, this.schemaModel.getSchema(), options);
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export diagram');
        } finally {
            this.hideExportDialog();
        }
    }

    /**
     * Show property panel
     * @param {Object} element - Selected element
     */
    showPropertyPanel(element) {
        if (this.elements.propertyPanel) {
            this.elements.propertyPanel.style.display = 'block';
            this.propertiesPanel.render(element);
        }
    }

    /**
     * Hide property panel
     */
    hidePropertyPanel() {
        if (this.elements.propertyPanel) {
            this.elements.propertyPanel.style.display = 'none';
        }
    }

    /**
     * Show settings panel
     */
    showSettings() {
        const settingsOverlay = document.getElementById('settings-overlay');
        if (settingsOverlay) {
            settingsOverlay.style.display = 'flex';
        }
    }

    /**
     * Hide settings panel
     */
    hideSettings() {
        const settingsOverlay = document.getElementById('settings-overlay');
        if (settingsOverlay) {
            settingsOverlay.style.display = 'none';
        }
    }

    /**
     * Show welcome message
     */
    showWelcomeMessage() {
        if (this.elements.welcomeMessage) {
            this.elements.welcomeMessage.style.display = 'flex';
        }
    }

    /**
     * Hide welcome message
     */
    hideWelcomeMessage() {
        if (this.elements.welcomeMessage) {
            this.elements.welcomeMessage.style.display = 'none';
        }
    }

    /**
     * Show loading overlay
     * @param {string} message - Message to display
     */
    showLoading(message = 'Loading...') {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.querySelector('p').textContent = message;
            this.elements.loadingOverlay.style.display = 'flex';
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        if (this.elements.loadingOverlay) {
            this.elements.loadingOverlay.style.display = 'none';
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        // Simple alert for now, can be replaced with a more user-friendly notification
        alert(`Error: ${message}`);
    }

    /**
     * Update UI elements
     */
    updateUI() {
        const schema = this.schemaModel.getSchema();
        if (!schema) return;

        // Update status bar
        if (this.elements.tableCount) {
            this.elements.tableCount.textContent = schema.tables.length;
        }
        if (this.elements.relationshipCount) {
            this.elements.relationshipCount.textContent = schema.relationships.length;
        }

        // Enable/disable buttons based on state
        const hasSchema = schema.tables.length > 0;
        this.elements.exportBtn.disabled = !hasSchema;
        this.elements.autoLayoutBtn.disabled = !hasSchema;
        this.elements.resetZoomBtn.disabled = !hasSchema;
    }

    /**
     * Update zoom level in the UI
     * @param {number} level - Current zoom level
     */
    updateZoomLevel(level) {
        if (this.elements.zoomLevel) {
            this.elements.zoomLevel.textContent = `${Math.round(level * 100)}%`;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.renderer) {
            this.renderer.destroy();
        }
        if (this.layoutManager) {
            this.layoutManager.destroy();
        }
        // Remove event listeners, etc.
    }
}