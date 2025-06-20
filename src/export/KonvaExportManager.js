import jsPDF from 'jspdf';

/**
 * Export manager for handling various export formats using Konva Canvas
 */
export class KonvaExportManager {
    constructor(options = {}) {
        this.eventBus = options.eventBus;
        this.saveAs = null; // Will be initialized async
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        try {
            // Try to import file-saver from CDN for production compatibility
            const fileSaver = await import('https://cdn.skypack.dev/file-saver@2');
            this.saveAs = fileSaver.saveAs;
        } catch (error) {
            console.warn('Failed to load file-saver from CDN, trying local import:', error);
            try {
                // Fallback to local import
                const fileSaver = await import('file-saver');
                this.saveAs = fileSaver.saveAs;
            } catch (localError) {
                console.error('Failed to load file-saver:', localError);
                throw new Error('file-saver could not be loaded');
            }
        }
        
        this.initialized = true;
    }

    /**
     * Export diagram in specified format
     * @param {Object} schema - Schema data
     * @param {Object} layout - Layout data
     * @param {Konva.Stage} stage - Konva stage to export
     * @param {Object} options - Export options
     */
    async export(schema, layout, stage, options = {}) {
        const { format, includeStyles = true, highResolution = true } = options;

        try {
            switch (format) {
                case 'png':
                    return await this.exportPNG(stage, { includeStyles, highResolution });
                
                case 'jpeg':
                    return await this.exportJPEG(stage, { includeStyles, highResolution });
                
                case 'svg':
                    return await this.exportSVG(stage, { includeStyles, highResolution });
                
                case 'pdf':
                    return await this.exportPDF(stage, { includeStyles, highResolution });
                
                case 'json':
                    return await this.exportJSON(schema, layout);
                
                case 'sql':
                    return await this.exportSQL(schema);
                
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
        } catch (error) {
            if (this.eventBus) {
                this.eventBus.emit('export:error', { format, error });
            }
            throw error;
        }
    }

    /**
     * Export as PNG
     * @param {Konva.Stage} stage - Konva stage
     * @param {Object} options - Export options
     */
    async exportPNG(stage, options = {}) {
        const { highResolution = true } = options;

        try {
            const dataURL = stage.toDataURL({
                mimeType: 'image/png',
                quality: 1.0,
                pixelRatio: highResolution ? 2 : 1
            });
            
            // Convert data URL to blob
            const response = await fetch(dataURL);
            const blob = await response.blob();
            
            this.saveAs(blob, `erd-diagram-${this.getTimestamp()}.png`);
            
            if (this.eventBus) {
                this.eventBus.emit('export:success', { format: 'png' });
            }
            
        } catch (error) {
            throw new Error(`PNG export failed: ${error.message}`);
        }
    }

    /**
     * Export as JPEG
     * @param {Konva.Stage} stage - Konva stage
     * @param {Object} options - Export options
     */
    async exportJPEG(stage, options = {}) {
        const { highResolution = true } = options;

        try {
            const dataURL = stage.toDataURL({
                mimeType: 'image/jpeg',
                quality: 0.9,
                pixelRatio: highResolution ? 2 : 1
            });
            
            // Convert data URL to blob
            const response = await fetch(dataURL);
            const blob = await response.blob();
            
            this.saveAs(blob, `erd-diagram-${this.getTimestamp()}.jpg`);
            
            if (this.eventBus) {
                this.eventBus.emit('export:success', { format: 'jpeg' });
            }
            
        } catch (error) {
            throw new Error(`JPEG export failed: ${error.message}`);
        }
    }

    /**
     * Export as SVG (using Konva's toSVG method)
     * @param {Konva.Stage} stage - Konva stage
     * @param {Object} options - Export options
     */
    async exportSVG(stage, options = {}) {
        try {
            // Use Konva's built-in SVG export
            const svgString = stage.toSVG();
            
            // Create blob and download
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            this.saveAs(blob, `erd-diagram-${this.getTimestamp()}.svg`);
            
            if (this.eventBus) {
                this.eventBus.emit('export:success', { format: 'svg' });
            }
            
        } catch (error) {
            throw new Error(`SVG export failed: ${error.message}`);
        }
    }

    /**
     * Export as PDF
     * @param {Konva.Stage} stage - Konva stage
     * @param {Object} options - Export options
     */
    async exportPDF(stage, options = {}) {
        const { highResolution = true } = options;

        try {
            // Get canvas from stage
            const canvas = stage.toCanvas({
                pixelRatio: highResolution ? 2 : 1
            });
            
            const imgData = canvas.toDataURL('image/png');
            
            // Calculate PDF dimensions
            const stageWidth = stage.width();
            const stageHeight = stage.height();
            const aspectRatio = stageWidth / stageHeight;
            
            // Standard A4 dimensions in mm
            const maxWidth = 210;
            const maxHeight = 297;
            
            let pdfWidth, pdfHeight;
            
            if (aspectRatio > maxWidth / maxHeight) {
                // Landscape orientation or wide diagram
                pdfWidth = maxWidth;
                pdfHeight = maxWidth / aspectRatio;
            } else {
                // Portrait orientation or tall diagram
                pdfHeight = maxHeight;
                pdfWidth = maxHeight * aspectRatio;
            }
            
            // Create PDF
            const pdf = new jsPDF({
                orientation: aspectRatio > 1 ? 'landscape' : 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            
            // Center the image on the page
            const x = (pdf.internal.pageSize.getWidth() - pdfWidth) / 2;
            const y = (pdf.internal.pageSize.getHeight() - pdfHeight) / 2;
            
            pdf.addImage(imgData, 'PNG', x, y, pdfWidth, pdfHeight);
            
            // Save PDF
            pdf.save(`erd-diagram-${this.getTimestamp()}.pdf`);
            
            if (this.eventBus) {
                this.eventBus.emit('export:success', { format: 'pdf' });
            }
            
        } catch (error) {
            throw new Error(`PDF export failed: ${error.message}`);
        }
    }

    /**
     * Export as JSON
     * @param {Object} schema - Schema data
     * @param {Object} layout - Layout data
     */
    async exportJSON(schema, layout) {
        try {
            const exportData = {
                schema,
                layout,
                exportedAt: new Date().toISOString(),
                version: '1.0'
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
            
            this.saveAs(blob, `erd-schema-${this.getTimestamp()}.json`);
            
            if (this.eventBus) {
                this.eventBus.emit('export:success', { format: 'json' });
            }
            
        } catch (error) {
            throw new Error(`JSON export failed: ${error.message}`);
        }
    }

    /**
     * Export as SQL DDL
     * @param {Object} schema - Schema data
     */
    async exportSQL(schema) {
        try {
            let sqlString = '-- Generated ERD Schema\n';
            sqlString += `-- Generated on: ${new Date().toISOString()}\n\n`;
            
            // Generate CREATE TABLE statements
            if (schema.tables) {
                schema.tables.forEach(table => {
                    sqlString += `CREATE TABLE ${table.name} (\n`;
                    
                    const columnDefinitions = table.columns.map(column => {
                        let definition = `  ${column.name} ${column.type}`;
                        
                        if (column.isPrimaryKey) {
                            definition += ' PRIMARY KEY';
                        }
                        
                        if (column.constraints) {
                            column.constraints.forEach(constraint => {
                                if (!constraint.includes('PRIMARY KEY')) {
                                    definition += ` ${constraint}`;
                                }
                            });
                        }
                        
                        return definition;
                    });
                    
                    sqlString += columnDefinitions.join(',\n');
                    sqlString += '\n);\n\n';
                });
            }
            
            // Generate ALTER TABLE statements for foreign keys
            if (schema.relationships) {
                schema.relationships.forEach(rel => {
                    sqlString += `ALTER TABLE ${rel.fromTable}\n`;
                    sqlString += `ADD CONSTRAINT fk_${rel.fromTable}_${rel.toTable}\n`;
                    sqlString += `FOREIGN KEY (${rel.fromColumn}) REFERENCES ${rel.toTable}(${rel.toColumn});\n\n`;
                });
            }
            
            const blob = new Blob([sqlString], { type: 'text/sql;charset=utf-8' });
            this.saveAs(blob, `erd-schema-${this.getTimestamp()}.sql`);
            
            if (this.eventBus) {
                this.eventBus.emit('export:success', { format: 'sql' });
            }
            
        } catch (error) {
            throw new Error(`SQL export failed: ${error.message}`);
        }
    }

    /**
     * Get timestamp for file naming
     * @returns {string} Timestamp string
     */
    getTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    }

    /**
     * Get available export formats
     * @returns {Array} Available formats
     */
    getAvailableFormats() {
        return [
            { value: 'png', label: 'PNG (Image)', description: 'High-quality raster image' },
            { value: 'jpeg', label: 'JPEG (Image)', description: 'Compressed raster image' },
            { value: 'svg', label: 'SVG (Vector)', description: 'Scalable vector graphics' },
            { value: 'pdf', label: 'PDF (Document)', description: 'Portable document format' },
            { value: 'json', label: 'JSON (Schema)', description: 'Schema data with layout' },
            { value: 'sql', label: 'SQL DDL (Schema)', description: 'Database schema definition' }
        ];
    }

    /**
     * Validate export options
     * @param {Object} options - Export options
     * @returns {Object} Validated options
     */
    validateExportOptions(options) {
        const defaults = {
            format: 'png',
            includeStyles: true,
            highResolution: true
        };

        const validFormats = ['png', 'jpeg', 'svg', 'pdf', 'json', 'sql'];
        
        const validated = { ...defaults, ...options };
        
        if (!validFormats.includes(validated.format)) {
            validated.format = 'png';
        }
        
        return validated;
    }
}