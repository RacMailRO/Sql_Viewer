/**
 * Enhanced Export Manager for ERD Generator
 * Provides comprehensive export functionality for schemas and ERD states
 */
export class EnhancedExportManager {
    constructor(d3, eventBus) {
        this.d3 = d3;
        this.eventBus = eventBus;
        this.currentSchema = null;
        this.currentLayout = null;
        this.currentRelationships = null;
    }

    /**
     * Set current ERD state
     * @param {Object} schema - Schema data
     * @param {Object} layout - Layout data
     * @param {Array} relationships - Relationships data
     */
    setERDState(schema, layout, relationships) {
        this.currentSchema = schema;
        this.currentLayout = layout;
        this.currentRelationships = relationships;
    }

    /**
     * Export complete ERD state with visual elements
     * @returns {Object} Complete ERD state
     */
    exportCompleteERDState() {
        const timestamp = new Date().toISOString();
        
        return {
            metadata: {
                version: "1.0",
                exported: timestamp,
                generator: "ERD Generator",
                description: "Complete ERD state with visual elements and positioning"
            },
            schema: {
                ...this.currentSchema,
                tables: this.currentSchema?.tables?.map(table => ({
                    ...table,
                    // Add any table-specific visual metadata
                    visual: this.getTableVisualState(table.name)
                }))
            },
            layout: {
                ...this.currentLayout,
                // Add layout metadata
                layoutType: this.currentLayout?.type || 'auto',
                canvasSize: this.getCanvasSize(),
                zoom: this.getZoomState()
            },
            relationships: this.currentRelationships?.map(rel => ({
                ...rel,
                // Add relationship visual state
                visual: this.getRelationshipVisualState(rel)
            })),
            visual: {
                theme: this.getCurrentTheme(),
                gridEnabled: this.isGridEnabled(),
                snapToGrid: this.isSnapToGridEnabled(),
                customStyles: this.getCustomStyles()
            }
        };
    }

    /**
     * Export database schema in various formats
     * @param {string} format - Export format (json, sql, yaml)
     * @returns {string} Exported schema
     */
    exportDatabaseSchema(format = 'json') {
        switch (format.toLowerCase()) {
            case 'json':
                return this.exportSchemaAsJSON();
            case 'sql':
                return this.exportSchemaAsSQL();
            case 'yaml':
                return this.exportSchemaAsYAML();
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Export schema as JSON
     * @returns {string} JSON string
     */
    exportSchemaAsJSON() {
        const schemaExport = {
            database: {
                name: this.currentSchema?.name || 'unnamed_database',
                tables: this.currentSchema?.tables?.map(table => ({
                    name: table.name,
                    columns: table.columns?.map(col => ({
                        name: col.name,
                        type: col.type,
                        nullable: col.nullable !== false,
                        primaryKey: col.isPrimaryKey || false,
                        foreignKey: col.isForeignKey || false,
                        constraints: col.constraints || [],
                        defaultValue: col.defaultValue
                    })),
                    indexes: table.indexes || [],
                    constraints: table.constraints || []
                })),
                relationships: this.currentRelationships?.map(rel => ({
                    type: rel.type,
                    sourceTable: rel.sourceTable,
                    sourceColumn: rel.sourceColumn,
                    targetTable: rel.targetTable,
                    targetColumn: rel.targetColumn,
                    onDelete: rel.onDelete || 'RESTRICT',
                    onUpdate: rel.onUpdate || 'RESTRICT'
                }))
            }
        };

        return JSON.stringify(schemaExport, null, 2);
    }

    /**
     * Export schema as SQL DDL
     * @returns {string} SQL string
     */
    exportSchemaAsSQL() {
        let sql = `-- Database Schema Export\n-- Generated on ${new Date().toISOString()}\n\n`;

        // Create tables
        if (this.currentSchema?.tables) {
            this.currentSchema.tables.forEach(table => {
                sql += this.generateCreateTableSQL(table);
                sql += '\n\n';
            });
        }

        // Add foreign key constraints
        if (this.currentRelationships) {
            sql += '-- Foreign Key Constraints\n';
            this.currentRelationships.forEach(rel => {
                sql += this.generateForeignKeySQL(rel);
                sql += '\n';
            });
        }

        return sql;
    }

    /**
     * Generate CREATE TABLE SQL
     * @param {Object} table - Table data
     * @returns {string} SQL string
     */
    generateCreateTableSQL(table) {
        let sql = `CREATE TABLE ${table.name} (\n`;
        
        const columnDefs = table.columns?.map(col => {
            let colDef = `  ${col.name} ${col.type}`;
            
            if (col.isPrimaryKey) {
                colDef += ' PRIMARY KEY';
            }
            
            if (col.nullable === false) {
                colDef += ' NOT NULL';
            }
            
            if (col.defaultValue) {
                colDef += ` DEFAULT ${col.defaultValue}`;
            }
            
            return colDef;
        }) || [];

        sql += columnDefs.join(',\n');
        sql += '\n);';
        
        return sql;
    }

    /**
     * Generate foreign key constraint SQL
     * @param {Object} relationship - Relationship data
     * @returns {string} SQL string
     */
    generateForeignKeySQL(relationship) {
        return `ALTER TABLE ${relationship.sourceTable} 
ADD CONSTRAINT fk_${relationship.sourceTable}_${relationship.sourceColumn}
FOREIGN KEY (${relationship.sourceColumn}) 
REFERENCES ${relationship.targetTable}(${relationship.targetColumn})
ON DELETE ${relationship.onDelete || 'RESTRICT'}
ON UPDATE ${relationship.onUpdate || 'RESTRICT'};`;
    }

    /**
     * Export schema as YAML
     * @returns {string} YAML string
     */
    exportSchemaAsYAML() {
        // Simple YAML generation (for complex schemas, consider using a YAML library)
        const schema = this.exportSchemaAsJSON();
        const parsed = JSON.parse(schema);
        return this.convertToYAML(parsed);
    }

    /**
     * Simple JSON to YAML converter
     * @param {Object} obj - Object to convert
     * @param {number} indent - Indentation level
     * @returns {string} YAML string
     */
    convertToYAML(obj, indent = 0) {
        const spaces = '  '.repeat(indent);
        let yaml = '';

        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) {
                yaml += `${spaces}${key}: null\n`;
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                yaml += `${spaces}${key}:\n`;
                yaml += this.convertToYAML(value, indent + 1);
            } else if (Array.isArray(value)) {
                yaml += `${spaces}${key}:\n`;
                value.forEach(item => {
                    if (typeof item === 'object') {
                        yaml += `${spaces}- \n`;
                        yaml += this.convertToYAML(item, indent + 1);
                    } else {
                        yaml += `${spaces}- ${item}\n`;
                    }
                });
            } else {
                yaml += `${spaces}${key}: ${value}\n`;
            }
        }

        return yaml;
    }

    /**
     * Save ERD state to file
     * @param {string} filename - Filename
     * @param {string} format - Export format
     */
    async saveERDState(filename, format = 'json') {
        try {
            let content, mimeType, fileExtension;

            if (format === 'complete') {
                content = JSON.stringify(this.exportCompleteERDState(), null, 2);
                mimeType = 'application/json';
                fileExtension = '.erd.json';
            } else {
                content = this.exportDatabaseSchema(format);
                switch (format) {
                    case 'json':
                        mimeType = 'application/json';
                        fileExtension = '.json';
                        break;
                    case 'sql':
                        mimeType = 'text/sql';
                        fileExtension = '.sql';
                        break;
                    case 'yaml':
                        mimeType = 'text/yaml';
                        fileExtension = '.yaml';
                        break;
                    default:
                        throw new Error(`Unsupported format: ${format}`);
                }
            }

            await this.downloadFile(content, filename + fileExtension, mimeType);
            
            if (this.eventBus) {
                this.eventBus.emit('export:success', { filename, format });
            }
        } catch (error) {
            console.error('Export failed:', error);
            if (this.eventBus) {
                this.eventBus.emit('export:error', { error: error.message });
            }
        }
    }

    /**
     * Load ERD state from file
     * @param {File} file - File to load
     * @returns {Promise<Object>} Loaded ERD state
     */
    async loadERDState(file) {
        try {
            const content = await this.readFileContent(file);
            const erdState = JSON.parse(content);
            
            // Validate ERD state structure
            this.validateERDState(erdState);
            
            if (this.eventBus) {
                this.eventBus.emit('import:success', erdState);
            }
            
            return erdState;
        } catch (error) {
            console.error('Import failed:', error);
            if (this.eventBus) {
                this.eventBus.emit('import:error', { error: error.message });
            }
            throw error;
        }
    }

    /**
     * Validate ERD state structure
     * @param {Object} erdState - ERD state to validate
     */
    validateERDState(erdState) {
        if (!erdState.metadata || !erdState.schema) {
            throw new Error('Invalid ERD file format');
        }
        
        if (erdState.metadata.version !== '1.0') {
            console.warn('ERD file version mismatch, attempting to load anyway');
        }
    }

    /**
     * Get table visual state
     * @param {string} tableName - Table name
     * @returns {Object} Visual state
     */
    getTableVisualState(tableName) {
        const tableLayout = this.currentLayout?.tables?.find(t => t.name === tableName);
        return {
            position: tableLayout ? { x: tableLayout.x, y: tableLayout.y } : null,
            size: tableLayout ? { width: tableLayout.width, height: tableLayout.height } : null,
            collapsed: false, // Future feature
            customColor: null // Future feature
        };
    }

    /**
     * Get relationship visual state
     * @param {Object} relationship - Relationship data
     * @returns {Object} Visual state
     */
    getRelationshipVisualState(relationship) {
        return {
            waypoints: [], // Future feature for custom routing
            style: 'orthogonal',
            labelPosition: 'center',
            customColor: null
        };
    }

    /**
     * Helper methods for visual state
     */
    getCanvasSize() {
        const canvas = document.querySelector('.erd-canvas svg');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
        }
        return { width: 1200, height: 800 };
    }

    getZoomState() {
        // Future implementation for zoom state
        return { scale: 1, translate: [0, 0] };
    }

    getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    isGridEnabled() {
        return false; // Future feature
    }

    isSnapToGridEnabled() {
        return false; // Future feature
    }

    getCustomStyles() {
        return {}; // Future feature
    }

    /**
     * Download file helper
     * @param {string} content - File content
     * @param {string} filename - Filename
     * @param {string} mimeType - MIME type
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

    /**
     * Read file content helper
     * @param {File} file - File to read
     * @returns {Promise<string>} File content
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
}