/**
 * Export manager for handling various export formats
 */
export class ExportManager {
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
     * @param {SVGElement} svgElement - SVG element to export
     * @param {Object} options - Export options
     */
    async export(schema, layout, svgElement, options = {}) {
        const { format, includeStyles = true, highResolution = true } = options;

        try {
            switch (format) {
                case 'svg':
                    return await this.exportSVG(svgElement, { includeStyles, highResolution });
                
                case 'pdf':
                    return await this.exportPDF(svgElement, { includeStyles, highResolution });
                
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
     * Export as SVG
     * @param {SVGElement} svgElement - SVG element
     * @param {Object} options - Export options
     */
    async exportSVG(svgElement, options = {}) {
        const { includeStyles = true, highResolution = true } = options;

        try {
            // Clone the SVG element
            const clonedSvg = svgElement.cloneNode(true);
            
            // Set up the SVG for export
            this.prepareSVGForExport(clonedSvg, includeStyles, highResolution);
            
            // Convert to string
            const svgString = new XMLSerializer().serializeToString(clonedSvg);
            
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
     * @param {SVGElement} svgElement - SVG element
     * @param {Object} options - Export options
     */
    async exportPDF(svgElement, options = {}) {
        const { includeStyles = true, highResolution = true } = options;

        try {
            // First convert SVG to canvas
            const canvas = await this.svgToCanvas(svgElement, { includeStyles, highResolution });
            
            // Import jsPDF dynamically with CDN fallback
            let jsPDF;
            try {
                const jsPDFModule = await import('https://cdn.skypack.dev/jspdf@2');
                jsPDF = jsPDFModule.jsPDF;
            } catch (error) {
                console.warn('Failed to load jsPDF from CDN, trying local import:', error);
                const jsPDFModule = await import('jspdf');
                jsPDF = jsPDFModule.jsPDF;
            }
            
            // Calculate PDF dimensions
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = imgWidth / imgHeight;
            
            // Create PDF with appropriate size
            let pdfWidth, pdfHeight;
            if (ratio > 1) {
                // Landscape
                pdfWidth = 297; // A4 width in mm
                pdfHeight = pdfWidth / ratio;
            } else {
                // Portrait
                pdfHeight = 210; // A4 height in mm
                pdfWidth = pdfHeight * ratio;
            }
            
            const pdf = new jsPDF({
                orientation: ratio > 1 ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [pdfWidth, pdfHeight]
            });
            
            // Convert canvas to image data
            const imgData = canvas.toDataURL('image/png');
            
            // Add image to PDF
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            
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
                metadata: {
                    exportedAt: new Date().toISOString(),
                    exportFormat: 'json',
                    version: '1.0',
                    ...schema.metadata
                },
                schema: {
                    tables: schema.tables.map(table => ({
                        name: table.name,
                        displayName: table.displayName,
                        columns: table.columns.map(column => ({
                            name: column.name,
                            type: column.type,
                            constraints: column.constraints || [],
                            nullable: column.nullable !== false,
                            defaultValue: column.defaultValue,
                            description: column.description || '',
                            metadata: column.metadata || {}
                        })),
                        metadata: table.metadata || {}
                    })),
                    relationships: (schema.relationships || []).map(rel => ({
                        sourceTable: rel.sourceTable,
                        sourceColumn: rel.sourceColumn,
                        targetTable: rel.targetTable,
                        targetColumn: rel.targetColumn,
                        type: rel.type,
                        name: rel.name || '',
                        description: rel.description || '',
                        metadata: rel.metadata || {}
                    }))
                },
                layout: {
                    tables: layout.tables.map(table => ({
                        name: table.name,
                        x: table.x,
                        y: table.y,
                        width: table.width,
                        height: table.height
                    }))
                }
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
            const sqlLines = [];
            
            // Add header comment
            sqlLines.push('-- ERD Schema Export');
            sqlLines.push(`-- Generated on: ${new Date().toISOString()}`);
            sqlLines.push('-- Source: ERD Generator');
            sqlLines.push('');

            // Generate CREATE TABLE statements
            schema.tables.forEach(table => {
                sqlLines.push(`-- Table: ${table.name}`);
                if (table.metadata?.description) {
                    sqlLines.push(`-- ${table.metadata.description}`);
                }
                
                sqlLines.push(`CREATE TABLE ${this.escapeIdentifier(table.name)} (`);
                
                const columnLines = table.columns.map((column, index) => {
                    let columnDef = `    ${this.escapeIdentifier(column.name)} ${column.type}`;
                    
                    // Add constraints
                    if (column.constraints && column.constraints.length > 0) {
                        const constraints = column.constraints.join(' ');
                        columnDef += ` ${constraints}`;
                    }
                    
                    // Add NOT NULL if not nullable
                    if (column.nullable === false && !columnDef.toUpperCase().includes('NOT NULL')) {
                        columnDef += ' NOT NULL';
                    }
                    
                    // Add default value
                    if (column.defaultValue && !columnDef.toUpperCase().includes('DEFAULT')) {
                        columnDef += ` DEFAULT ${this.formatDefaultValue(column.defaultValue)}`;
                    }
                    
                    // Add comma except for last column
                    if (index < table.columns.length - 1) {
                        columnDef += ',';
                    }
                    
                    // Add comment
                    if (column.description) {
                        columnDef += ` -- ${column.description}`;
                    }
                    
                    return columnDef;
                });
                
                sqlLines.push(...columnLines);
                sqlLines.push(');');
                sqlLines.push('');
            });

            // Generate ALTER TABLE statements for foreign keys
            const relationships = schema.relationships || [];
            if (relationships.length > 0) {
                sqlLines.push('-- Foreign Key Constraints');
                
                relationships.forEach(rel => {
                    const constraintName = `fk_${rel.sourceTable}_${rel.sourceColumn}`;
                    sqlLines.push(
                        `ALTER TABLE ${this.escapeIdentifier(rel.sourceTable)} ` +
                        `ADD CONSTRAINT ${this.escapeIdentifier(constraintName)} ` +
                        `FOREIGN KEY (${this.escapeIdentifier(rel.sourceColumn)}) ` +
                        `REFERENCES ${this.escapeIdentifier(rel.targetTable)}(${this.escapeIdentifier(rel.targetColumn)});`
                    );
                });
                
                sqlLines.push('');
            }

            const sqlString = sqlLines.join('\n');
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
     * Prepare SVG for export
     * @param {SVGElement} svgElement - SVG element
     * @param {boolean} includeStyles - Whether to include styles
     * @param {boolean} highResolution - Whether to use high resolution
     */
    prepareSVGForExport(svgElement, includeStyles, highResolution) {
        // Remove any temporary classes or attributes
        svgElement.classList.remove('dragging', 'hover', 'selected');
        
        // Set explicit dimensions
        const bbox = svgElement.getBBox();
        const padding = 20;
        
        svgElement.setAttribute('viewBox', 
            `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
        
        if (highResolution) {
            svgElement.setAttribute('width', (bbox.width + padding * 2) * 2);
            svgElement.setAttribute('height', (bbox.height + padding * 2) * 2);
        } else {
            svgElement.setAttribute('width', bbox.width + padding * 2);
            svgElement.setAttribute('height', bbox.height + padding * 2);
        }

        if (includeStyles) {
            // Embed CSS styles
            this.embedStyles(svgElement);
        }

        // Add XML namespace if not present
        if (!svgElement.hasAttribute('xmlns')) {
            svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
    }

    /**
     * Embed CSS styles into SVG
     * @param {SVGElement} svgElement - SVG element
     */
    embedStyles(svgElement) {
        // Get all stylesheets
        const styles = [];
        
        // Collect styles from stylesheets
        for (const stylesheet of document.styleSheets) {
            try {
                for (const rule of stylesheet.cssRules) {
                    if (rule.type === CSSRule.STYLE_RULE) {
                        // Check if rule applies to SVG elements
                        if (this.ruleAppliesTo(rule.selectorText, svgElement)) {
                            styles.push(rule.cssText);
                        }
                    }
                }
            } catch (e) {
                // Skip stylesheets that can't be accessed (CORS)
                console.warn('Could not access stylesheet:', e);
            }
        }

        // Create style element
        if (styles.length > 0) {
            const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            styleElement.textContent = styles.join('\n');
            svgElement.insertBefore(styleElement, svgElement.firstChild);
        }
    }

    /**
     * Check if CSS rule applies to SVG elements
     * @param {string} selector - CSS selector
     * @param {SVGElement} svgElement - SVG element
     * @returns {boolean} True if rule applies
     */
    ruleAppliesTo(selector, svgElement) {
        if (!selector) return false;
        
        // Check for SVG-related selectors
        const svgSelectors = [
            '.erd-table', '.table-header', '.table-body', '.table-row',
            '.column-name', '.column-type', '.connection-line', '.connection-marker',
            '.relationship-label', '.primary-key', '.foreign-key'
        ];
        
        return svgSelectors.some(svgSelector => selector.includes(svgSelector));
    }

    /**
     * Convert SVG to Canvas
     * @param {SVGElement} svgElement - SVG element
     * @param {Object} options - Conversion options
     * @returns {Promise<HTMLCanvasElement>} Canvas element
     */
    async svgToCanvas(svgElement, options = {}) {
        const { includeStyles = true, highResolution = true } = options;
        
        return new Promise((resolve, reject) => {
            // Clone and prepare SVG
            const clonedSvg = svgElement.cloneNode(true);
            this.prepareSVGForExport(clonedSvg, includeStyles, highResolution);
            
            // Convert to data URL
            const svgString = new XMLSerializer().serializeToString(clonedSvg);
            const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
            
            // Create image
            const img = new Image();
            img.onload = () => {
                // Create canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = img.width;
                canvas.height = img.height;
                
                // Set white background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw image
                ctx.drawImage(img, 0, 0);
                
                resolve(canvas);
            };
            
            img.onerror = () => {
                reject(new Error('Failed to convert SVG to canvas'));
            };
            
            img.src = svgDataUrl;
        });
    }

    /**
     * Escape SQL identifier
     * @param {string} identifier - Identifier to escape
     * @returns {string} Escaped identifier
     */
    escapeIdentifier(identifier) {
        // Use backticks for MySQL-style escaping
        return `\`${identifier.replace(/`/g, '``')}\``;
    }

    /**
     * Format default value for SQL
     * @param {*} value - Default value
     * @returns {string} Formatted value
     */
    formatDefaultValue(value) {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        
        if (typeof value === 'string') {
            // Check if it's an SQL function
            const sqlFunctions = ['CURRENT_TIMESTAMP', 'NOW()', 'CURRENT_DATE', 'CURRENT_TIME'];
            if (sqlFunctions.includes(value.toUpperCase())) {
                return value;
            }
            // Otherwise, quote it
            return `'${value.replace(/'/g, "''")}'`;
        }
        
        return String(value);
    }

    /**
     * Get timestamp for filenames
     * @returns {string} Timestamp string
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    }

    /**
     * Export multiple formats
     * @param {Object} schema - Schema data
     * @param {Object} layout - Layout data
     * @param {SVGElement} svgElement - SVG element
     * @param {Array} formats - Array of formats to export
     */
    async exportMultiple(schema, layout, svgElement, formats) {
        const results = [];
        
        for (const format of formats) {
            try {
                await this.export(schema, layout, svgElement, { format });
                results.push({ format, success: true });
            } catch (error) {
                results.push({ format, success: false, error: error.message });
            }
        }
        
        return results;
    }

    /**
     * Get available export formats
     * @returns {Array} Array of available formats
     */
    getAvailableFormats() {
        return [
            {
                id: 'svg',
                name: 'SVG (Vector Graphics)',
                description: 'Scalable vector graphics format',
                extension: 'svg',
                mimeType: 'image/svg+xml'
            },
            {
                id: 'pdf',
                name: 'PDF (Document)',
                description: 'Portable document format',
                extension: 'pdf',
                mimeType: 'application/pdf'
            },
            {
                id: 'json',
                name: 'JSON (Schema)',
                description: 'JSON schema with layout data',
                extension: 'json',
                mimeType: 'application/json'
            },
            {
                id: 'sql',
                name: 'SQL DDL (Schema)',
                description: 'SQL Data Definition Language',
                extension: 'sql',
                mimeType: 'text/sql'
            }
        ];
    }

    /**
     * Validate export options
     * @param {Object} options - Export options
     * @returns {Object} Validation result
     */
    validateExportOptions(options) {
        const errors = [];
        const warnings = [];

        if (!options.format) {
            errors.push('Export format is required');
        } else {
            const availableFormats = this.getAvailableFormats().map(f => f.id);
            if (!availableFormats.includes(options.format)) {
                errors.push(`Unsupported format: ${options.format}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}