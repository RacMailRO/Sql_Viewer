import { EventBus } from './EventBus.js';
import { SchemaModel } from './SchemaModel.js';
import { DiagramState } from './DiagramState.js';
import { ERDRenderer } from '../visualization/ERDRenderer.js';
import { FileImporter } from '../ui/FileImporter.js';
import { ExportManager } from '../export/ExportManager.js';
import { EnhancedExportManager } from '../export/EnhancedExportManager.js';
import { LayoutManager } from './LayoutManager.js';
import { LayoutAlgorithm } from '../algorithms/LayoutAlgorithm.js';

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
        this.enhancedExportManager = null;
        this.layoutManager = null;
        this.layoutAlgorithm = null;
        
        // UI elements
        this.elements = {};
        
        // Application state
        this.isInitialized = false;
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
        // Initialize renderer
        this.renderer = new ERDRenderer(this.elements.canvas, {
            eventBus: this.eventBus
        });
        
        // Initialize D3.js in the renderer
        await this.renderer.init();

        // Initialize file importer
        this.fileImporter = new FileImporter({
            eventBus: this.eventBus
        });

        // Initialize export manager
        this.exportManager = new ExportManager({
            eventBus: this.eventBus
        });
        
        // Initialize enhanced export manager
        this.enhancedExportManager = new EnhancedExportManager(
            this.renderer?.d3,
            this.eventBus
        );
        
        // Initialize layout manager
        this.layoutManager = new LayoutManager(this.eventBus);
        
        // Initialize file-saver in the export manager
        await this.exportManager.init();

        // Initialize layout algorithm
        this.layoutAlgorithm = new LayoutAlgorithm();
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
            this.handleFileImport(event);
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

        this.eventBus.on('diagram:changed', () => {
            this.updateUI();
        });

        this.eventBus.on('zoom:changed', (zoomLevel) => {
            this.updateZoomLevel(zoomLevel);
        });

        // Close modal when clicking outside
        this.elements.exportDialog.addEventListener('click', (event) => {
            if (event.target === this.elements.exportDialog) {
                this.hideExportDialog();
            }
        });
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
            // Show specific loading message based on file type
            const fileExtension = file.name.split('.').pop().toLowerCase();
            let loadingMessage = 'Processing schema...';
            
            if (fileExtension === 'csv') {
                loadingMessage = 'Parsing CSV and generating relationships...';
            }
            
            this.showLoading(loadingMessage);
            
            const schema = await this.fileImporter.importFile(file);
            this.schemaModel.loadSchema(schema);
            
            this.eventBus.emit('schema:loaded', schema);
            
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
            
            // Generate initial layout
            const layout = this.layoutAlgorithm.calculateLayout(schema);
            this.diagramState.setLayout(layout);
            
            // Render the diagram
            this.renderer.render(schema, layout);
            
            // Update UI
            this.updateUI();
            
            console.log('Schema loaded successfully:', schema);
            
        } catch (error) {
            console.error('Error handling schema load:', error);
            this.showError('Failed to render schema');
        }
    }

    /**
     * Handle schema error
     */
    handleSchemaError(error) {
        this.showError(`Failed to load schema: ${error.message}`);
    }

    /**
     * Handle table selection
     */
    handleTableSelected(table) {
        this.diagramState.setSelectedElement(table);
        this.showPropertyPanel(table);
    }

    /**
     * Handle relationship selection
     */
    handleRelationshipSelected(relationship) {
        this.diagramState.setSelectedElement(relationship);
        this.showPropertyPanel(relationship);
    }

    /**
     * Apply auto layout
     */
    applyAutoLayout() {
        if (!this.schemaModel.hasData()) {
            return;
        }

        try {
            const schema = this.schemaModel.getSchema();
            const layout = this.layoutAlgorithm.calculateLayout(schema);
            
            this.diagramState.setLayout(layout);
            this.renderer.updateLayout(layout);
            
            this.eventBus.emit('diagram:changed');
            
        } catch (error) {
            console.error('Auto layout error:', error);
            this.showError('Failed to apply auto layout');
        }
    }

    /**
     * Reset zoom to fit all tables
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
        if (this.diagramState.canUndo()) {
            this.diagramState.undo();
            this.renderer.render(this.schemaModel.getSchema(), this.diagramState.getLayout());
            this.updateUI();
        }
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.diagramState.canRedo()) {
            this.diagramState.redo();
            this.renderer.render(this.schemaModel.getSchema(), this.diagramState.getLayout());
            this.updateUI();
        }
    }

    /**
     * Delete selected element
     */
    deleteSelectedElement() {
        const selected = this.diagramState.selectedElement;
        if (!selected) return;

        // TODO: Implement element deletion
        console.log('Delete element:', selected);
    }

    /**
     * Show export dialog
     */
    showExportDialog() {
        if (!this.schemaModel.hasData()) {
            this.showError('No schema to export');
            return;
        }
        
        this.elements.exportDialog.style.display = 'flex';
    }

    /**
     * Hide export dialog
     */
    hideExportDialog() {
        this.elements.exportDialog.style.display = 'none';
    }

    /**
     * Handle export
     */
    async handleExport() {
        try {
            const format = document.querySelector('input[name="export-format"]:checked').value;
            const includeStyles = document.getElementById('include-styles').checked;
            const highResolution = document.getElementById('high-resolution').checked;

            const options = {
                format,
                includeStyles,
                highResolution
            };

            await this.exportManager.export(
                this.schemaModel.getSchema(),
                this.diagramState.getLayout(),
                this.renderer.getSVGElement(),
                options
            );

            this.hideExportDialog();
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export diagram');
        }
    }

    /**
     * Show property panel
     */
    showPropertyPanel(element) {
        // TODO: Implement property panel content generation
        this.elements.panelContent.innerHTML = `
            <div class="property-item">
                <div class="property-label">Type</div>
                <div class="property-value">${element.type || 'Unknown'}</div>
            </div>
            <div class="property-item">
                <div class="property-label">Name</div>
                <div class="property-value">${element.name || 'Unnamed'}</div>
            </div>
        `;
        
        this.elements.propertyPanel.classList.add('open');
    }

    /**
     * Hide property panel
     */
    hidePropertyPanel() {
        this.elements.propertyPanel.classList.remove('open');
        this.diagramState.setSelectedElement(null);
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
     */
    showError(message) {
        // TODO: Implement proper error notification system
        alert(message);
    }

    /**
     * Update UI state
     */
    updateUI() {
        // Update status bar
        const schema = this.schemaModel.getSchema();
        const tableCount = schema?.tables?.length || 0;
        const relationshipCount = schema?.relationships?.length || 0;

        if (this.elements.tableCount) {
            this.elements.tableCount.textContent = `Tables: ${tableCount}`;
        }
        
        if (this.elements.relationshipCount) {
            this.elements.relationshipCount.textContent = `Relationships: ${relationshipCount}`;
        }

        // Update undo/redo buttons
        if (this.elements.undoBtn) {
            this.elements.undoBtn.disabled = !this.diagramState.canUndo();
        }
        
        if (this.elements.redoBtn) {
            this.elements.redoBtn.disabled = !this.diagramState.canRedo();
        }

        // Update other UI elements based on state
        const hasData = this.schemaModel.hasData();
        if (this.elements.exportBtn) {
            this.elements.exportBtn.disabled = !hasData;
        }
        
        if (this.elements.autoLayoutBtn) {
            this.elements.autoLayoutBtn.disabled = !hasData;
        }
        
        if (this.elements.resetZoomBtn) {
            this.elements.resetZoomBtn.disabled = !hasData;
        }
    }

    /**
     * Update zoom level display
     */
    updateZoomLevel(level) {
        if (this.elements.zoomLevel) {
            this.elements.zoomLevel.textContent = `Zoom: ${Math.round(level * 100)}%`;
        }
    }

    /**
     * Cleanup and destroy the application
     */
    destroy() {
        if (this.renderer) {
            this.renderer.destroy();
        }
        
        this.eventBus.removeAllListeners();
        this.isInitialized = false;
    }
}