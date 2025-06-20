/**
 * Layout Manager for ERD Generator
 * Handles saving, loading, and managing ERD layouts with visual state
 */
export class LayoutManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.layouts = new Map();
        this.currentLayoutId = null;
        this.autoSaveEnabled = true;
        this.autoSaveInterval = 30000; // 30 seconds
        this.autoSaveTimer = null;
        
        this.initializeAutoSave();
    }

    /**
     * Save current layout with complete visual state
     * @param {string} layoutId - Unique layout identifier
     * @param {Object} layoutData - Layout data to save
     * @param {Object} metadata - Additional metadata
     */
    saveLayout(layoutId, layoutData, metadata = {}) {
        const timestamp = new Date().toISOString();
        
        const layout = {
            id: layoutId,
            timestamp,
            metadata: {
                name: metadata.name || `Layout ${layoutId}`,
                description: metadata.description || '',
                created: metadata.created || timestamp,
                modified: timestamp,
                version: '1.0',
                ...metadata
            },
            data: {
                tables: this.serializeTablePositions(layoutData.tables),
                relationships: this.serializeRelationshipRoutes(layoutData.relationships),
                canvas: this.serializeCanvasState(layoutData.canvas),
                visual: this.serializeVisualState(layoutData.visual)
            }
        };

        this.layouts.set(layoutId, layout);
        this.currentLayoutId = layoutId;
        
        // Persist to localStorage
        this.persistLayout(layoutId, layout);
        
        if (this.eventBus) {
            this.eventBus.emit('layout:saved', { layoutId, layout });
        }
        
        return layout;
    }

    /**
     * Load layout by ID
     * @param {string} layoutId - Layout identifier
     * @returns {Object|null} Layout data or null if not found
     */
    loadLayout(layoutId) {
        let layout = this.layouts.get(layoutId);
        
        if (!layout) {
            // Try to load from localStorage
            layout = this.loadPersistedLayout(layoutId);
            if (layout) {
                this.layouts.set(layoutId, layout);
            }
        }
        
        if (layout) {
            this.currentLayoutId = layoutId;
            
            if (this.eventBus) {
                this.eventBus.emit('layout:loaded', { layoutId, layout });
            }
        }
        
        return layout;
    }

    /**
     * Get all available layouts
     * @returns {Array} Array of layout metadata
     */
    getAllLayouts() {
        // Load all persisted layouts
        this.loadAllPersistedLayouts();
        
        return Array.from(this.layouts.values()).map(layout => ({
            id: layout.id,
            name: layout.metadata.name,
            description: layout.metadata.description,
            created: layout.metadata.created,
            modified: layout.metadata.modified,
            tableCount: layout.data.tables?.length || 0,
            relationshipCount: layout.data.relationships?.length || 0
        }));
    }

    /**
     * Delete layout
     * @param {string} layoutId - Layout identifier
     */
    deleteLayout(layoutId) {
        this.layouts.delete(layoutId);
        this.removePersistedLayout(layoutId);
        
        if (this.currentLayoutId === layoutId) {
            this.currentLayoutId = null;
        }
        
        if (this.eventBus) {
            this.eventBus.emit('layout:deleted', { layoutId });
        }
    }

    /**
     * Duplicate layout
     * @param {string} sourceLayoutId - Source layout ID
     * @param {string} newLayoutId - New layout ID
     * @param {Object} metadata - New metadata
     * @returns {Object} New layout
     */
    duplicateLayout(sourceLayoutId, newLayoutId, metadata = {}) {
        const sourceLayout = this.loadLayout(sourceLayoutId);
        if (!sourceLayout) {
            throw new Error(`Layout ${sourceLayoutId} not found`);
        }
        
        const newLayout = {
            ...sourceLayout,
            id: newLayoutId,
            metadata: {
                ...sourceLayout.metadata,
                name: metadata.name || `${sourceLayout.metadata.name} (Copy)`,
                description: metadata.description || sourceLayout.metadata.description,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            }
        };
        
        return this.saveLayout(newLayoutId, newLayout.data, newLayout.metadata);
    }

    /**
     * Serialize table positions and visual state
     * @param {Array} tables - Table layout data
     * @returns {Array} Serialized table data
     */
    serializeTablePositions(tables) {
        if (!tables) return [];
        
        return tables.map(table => ({
            name: table.name,
            position: {
                x: table.x || 0,
                y: table.y || 0
            },
            size: {
                width: table.width || 200,
                height: table.height || 100
            },
            visual: {
                collapsed: table.collapsed || false,
                highlighted: table.highlighted || false,
                customColor: table.customColor || null,
                zIndex: table.zIndex || 0
            }
        }));
    }

    /**
     * Serialize relationship routing and visual state
     * @param {Array} relationships - Relationship data
     * @returns {Array} Serialized relationship data
     */
    serializeRelationshipRoutes(relationships) {
        if (!relationships) return [];
        
        return relationships.map(rel => ({
            id: `${rel.sourceTable}-${rel.targetTable}-${rel.sourceColumn}-${rel.targetColumn}`,
            sourceTable: rel.sourceTable,
            sourceColumn: rel.sourceColumn,
            targetTable: rel.targetTable,
            targetColumn: rel.targetColumn,
            type: rel.type,
            routing: {
                waypoints: rel.waypoints || [],
                style: rel.routingStyle || 'orthogonal',
                customPath: rel.customPath || null
            },
            visual: {
                highlighted: rel.highlighted || false,
                customColor: rel.customColor || null,
                labelPosition: rel.labelPosition || 'center',
                showLabel: rel.showLabel !== false
            }
        }));
    }

    /**
     * Serialize canvas state
     * @param {Object} canvas - Canvas state
     * @returns {Object} Serialized canvas state
     */
    serializeCanvasState(canvas) {
        return {
            zoom: canvas?.zoom || { scale: 1, translate: [0, 0] },
            viewport: canvas?.viewport || { x: 0, y: 0, width: 1200, height: 800 },
            grid: {
                enabled: canvas?.grid?.enabled || false,
                size: canvas?.grid?.size || 20,
                snapToGrid: canvas?.grid?.snapToGrid || false
            },
            background: canvas?.background || 'default'
        };
    }

    /**
     * Serialize visual state
     * @param {Object} visual - Visual state
     * @returns {Object} Serialized visual state
     */
    serializeVisualState(visual) {
        return {
            theme: visual?.theme || 'light',
            showRelationshipLabels: visual?.showRelationshipLabels !== false,
            showColumnTypes: visual?.showColumnTypes !== false,
            compactMode: visual?.compactMode || false,
            animations: visual?.animations !== false,
            customStyles: visual?.customStyles || {}
        };
    }

    /**
     * Auto-save functionality
     */
    initializeAutoSave() {
        if (this.autoSaveEnabled) {
            this.autoSaveTimer = setInterval(() => {
                if (this.currentLayoutId) {
                    this.autoSaveCurrentLayout();
                }
            }, this.autoSaveInterval);
        }
    }

    /**
     * Auto-save current layout
     */
    autoSaveCurrentLayout() {
        if (this.eventBus) {
            this.eventBus.emit('layout:auto-save-request');
        }
    }

    /**
     * Enable/disable auto-save
     * @param {boolean} enabled - Whether to enable auto-save
     */
    setAutoSave(enabled) {
        this.autoSaveEnabled = enabled;
        
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        
        if (enabled) {
            this.initializeAutoSave();
        }
    }

    /**
     * Persistence methods using localStorage
     */
    persistLayout(layoutId, layout) {
        try {
            const key = `erd_layout_${layoutId}`;
            localStorage.setItem(key, JSON.stringify(layout));
            
            // Update layout index
            const index = this.getLayoutIndex();
            index[layoutId] = {
                name: layout.metadata.name,
                modified: layout.metadata.modified
            };
            localStorage.setItem('erd_layout_index', JSON.stringify(index));
        } catch (error) {
            console.error('Failed to persist layout:', error);
        }
    }

    /**
     * Load persisted layout
     * @param {string} layoutId - Layout identifier
     * @returns {Object|null} Layout data
     */
    loadPersistedLayout(layoutId) {
        try {
            const key = `erd_layout_${layoutId}`;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Failed to load persisted layout:', error);
            return null;
        }
    }

    /**
     * Load all persisted layouts
     */
    loadAllPersistedLayouts() {
        try {
            const index = this.getLayoutIndex();
            Object.keys(index).forEach(layoutId => {
                if (!this.layouts.has(layoutId)) {
                    const layout = this.loadPersistedLayout(layoutId);
                    if (layout) {
                        this.layouts.set(layoutId, layout);
                    }
                }
            });
        } catch (error) {
            console.error('Failed to load persisted layouts:', error);
        }
    }

    /**
     * Remove persisted layout
     * @param {string} layoutId - Layout identifier
     */
    removePersistedLayout(layoutId) {
        try {
            const key = `erd_layout_${layoutId}`;
            localStorage.removeItem(key);
            
            // Update layout index
            const index = this.getLayoutIndex();
            delete index[layoutId];
            localStorage.setItem('erd_layout_index', JSON.stringify(index));
        } catch (error) {
            console.error('Failed to remove persisted layout:', error);
        }
    }

    /**
     * Get layout index from localStorage
     * @returns {Object} Layout index
     */
    getLayoutIndex() {
        try {
            const data = localStorage.getItem('erd_layout_index');
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to get layout index:', error);
            return {};
        }
    }

    /**
     * Export layout to file
     * @param {string} layoutId - Layout identifier
     * @param {string} format - Export format
     */
    async exportLayout(layoutId, format = 'json') {
        const layout = this.loadLayout(layoutId);
        if (!layout) {
            throw new Error(`Layout ${layoutId} not found`);
        }
        
        const exportData = {
            ...layout,
            exported: new Date().toISOString(),
            exportFormat: format
        };
        
        const filename = `${layout.metadata.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_layout`;
        const content = JSON.stringify(exportData, null, 2);
        
        await this.downloadFile(content, `${filename}.erd.json`, 'application/json');
        
        if (this.eventBus) {
            this.eventBus.emit('layout:exported', { layoutId, filename });
        }
    }

    /**
     * Import layout from file
     * @param {File} file - Layout file
     * @returns {Promise<string>} Imported layout ID
     */
    async importLayout(file) {
        try {
            const content = await this.readFileContent(file);
            const layoutData = JSON.parse(content);
            
            // Validate layout structure
            if (!layoutData.id || !layoutData.data) {
                throw new Error('Invalid layout file format');
            }
            
            // Generate new ID if layout already exists
            let layoutId = layoutData.id;
            if (this.layouts.has(layoutId)) {
                layoutId = `${layoutId}_imported_${Date.now()}`;
            }
            
            const layout = this.saveLayout(layoutId, layoutData.data, {
                ...layoutData.metadata,
                name: `${layoutData.metadata.name} (Imported)`
            });
            
            if (this.eventBus) {
                this.eventBus.emit('layout:imported', { layoutId, layout });
            }
            
            return layoutId;
        } catch (error) {
            console.error('Failed to import layout:', error);
            throw error;
        }
    }

    /**
     * Helper methods
     */
    async downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
        }
    }
}