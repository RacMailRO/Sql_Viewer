import { JsonParser } from '../parsers/JsonParser.js';
import { SqlParser } from '../parsers/SqlParser.js';
import { TextParser } from '../parsers/TextParser.js';
import { CsvParser } from '../parsers/CsvParser.js';

/**
 * File importer that handles multiple schema formats
 */
export class FileImporter {
    constructor(options = {}) {
        this.eventBus = options.eventBus;
        this.parsers = new Map();
        
        this.initializeParsers();
    }

    /**
     * Initialize parsers for different file formats
     */
    initializeParsers() {
        this.parsers.set('json', new JsonParser());
        this.parsers.set('sql', new SqlParser());
        this.parsers.set('txt', new TextParser());
        this.parsers.set('text', new TextParser());
        this.parsers.set('csv', new CsvParser());
    }

    /**
     * Import a file and return parsed schema
     * @param {File} file - File to import
     * @returns {Promise<Object>} Parsed schema
     */
    async importFile(file) {
        if (!file) {
            throw new Error('No file provided');
        }

        const fileExtension = this.getFileExtension(file.name);
        const parser = this.getParserForExtension(fileExtension);

        if (!parser) {
            throw new Error(`Unsupported file format: ${fileExtension}`);
        }

        try {
            const fileContent = await this.readFileContent(file);
            const schema = await parser.parse(fileContent, {
                fileName: file.name,
                fileSize: file.size,
                lastModified: file.lastModified
            });

            this.validateSchema(schema);
            
            if (this.eventBus) {
                this.eventBus.emit('file:imported', {
                    fileName: file.name,
                    fileType: fileExtension,
                    schema
                });
            }

            return schema;

        } catch (error) {
            const importError = new Error(`Failed to import ${file.name}: ${error.message}`);
            importError.originalError = error;
            
            if (this.eventBus) {
                this.eventBus.emit('file:import-error', {
                    fileName: file.name,
                    error: importError
                });
            }

            throw importError;
        }
    }

    /**
     * Get file extension from filename
     * @param {string} filename - Filename
     * @returns {string} File extension (lowercase)
     */
    getFileExtension(filename) {
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex === -1) {
            return '';
        }
        return filename.substring(lastDotIndex + 1).toLowerCase();
    }

    /**
     * Get parser for file extension
     * @param {string} extension - File extension
     * @returns {Object|null} Parser instance or null
     */
    getParserForExtension(extension) {
        return this.parsers.get(extension) || null;
    }

    /**
     * Read file content as text
     * @param {File} file - File to read
     * @returns {Promise<string>} File content
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Validate parsed schema
     * @param {Object} schema - Schema to validate
     * @throws {Error} If schema is invalid
     */
    validateSchema(schema) {
        if (!schema) {
            throw new Error('Parser returned null or undefined schema');
        }

        if (!schema.tables || !Array.isArray(schema.tables)) {
            throw new Error('Schema must contain a tables array');
        }

        if (schema.tables.length === 0) {
            throw new Error('Schema must contain at least one table');
        }

        // Validate each table
        schema.tables.forEach((table, index) => {
            if (!table.name || typeof table.name !== 'string') {
                throw new Error(`Table at index ${index} must have a valid name`);
            }

            if (!table.columns || !Array.isArray(table.columns)) {
                throw new Error(`Table '${table.name}' must have a columns array`);
            }

            if (table.columns.length === 0) {
                throw new Error(`Table '${table.name}' must have at least one column`);
            }

            // Validate each column
            table.columns.forEach((column, columnIndex) => {
                if (typeof column === 'string') {
                    // String format is valid
                    return;
                }

                if (!column.name || typeof column.name !== 'string') {
                    throw new Error(`Column at index ${columnIndex} in table '${table.name}' must have a valid name`);
                }
            });
        });

        // Validate relationships if present
        if (schema.relationships && Array.isArray(schema.relationships)) {
            schema.relationships.forEach((relationship, index) => {
                if (!relationship.sourceTable || !relationship.targetTable) {
                    throw new Error(`Relationship at index ${index} must have sourceTable and targetTable`);
                }

                if (!relationship.sourceColumn || !relationship.targetColumn) {
                    throw new Error(`Relationship at index ${index} must have sourceColumn and targetColumn`);
                }
            });
        }
    }

    /**
     * Get supported file formats
     * @returns {Array} Array of supported file extensions
     */
    getSupportedFormats() {
        return Array.from(this.parsers.keys());
    }

    /**
     * Check if a file format is supported
     * @param {string} extension - File extension
     * @returns {boolean} True if supported
     */
    isFormatSupported(extension) {
        return this.parsers.has(extension.toLowerCase());
    }

    /**
     * Import from text content directly
     * @param {string} content - Text content
     * @param {string} format - Format type ('json', 'sql', 'txt')
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Parsed schema
     */
    async importFromText(content, format, options = {}) {
        const parser = this.getParserForExtension(format);
        if (!parser) {
            throw new Error(`Unsupported format: ${format}`);
        }

        try {
            const schema = await parser.parse(content, options);
            this.validateSchema(schema);
            return schema;
        } catch (error) {
            throw new Error(`Failed to parse ${format} content: ${error.message}`);
        }
    }

    /**
     * Import multiple files
     * @param {FileList} files - Files to import
     * @returns {Promise<Array>} Array of parsed schemas
     */
    async importMultipleFiles(files) {
        const results = [];
        const errors = [];

        for (const file of files) {
            try {
                const schema = await this.importFile(file);
                results.push({
                    fileName: file.name,
                    schema,
                    success: true
                });
            } catch (error) {
                errors.push({
                    fileName: file.name,
                    error,
                    success: false
                });
            }
        }

        if (errors.length > 0 && results.length === 0) {
            throw new Error(`Failed to import any files. First error: ${errors[0].error.message}`);
        }

        return {
            successful: results,
            failed: errors,
            totalFiles: files.length,
            successCount: results.length,
            errorCount: errors.length
        };
    }

    /**
     * Create a file input element for importing
     * @param {Object} options - Configuration options
     * @returns {HTMLInputElement} File input element
     */
    createFileInput(options = {}) {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = options.multiple || false;
        
        const supportedFormats = this.getSupportedFormats();
        const acceptString = supportedFormats.map(ext => `.${ext}`).join(',');
        input.accept = acceptString;

        if (options.onChange) {
            input.addEventListener('change', options.onChange);
        }

        return input;
    }

    /**
     * Show file picker dialog
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Import result
     */
    showFilePicker(options = {}) {
        return new Promise((resolve, reject) => {
            const input = this.createFileInput({
                multiple: options.multiple,
                onChange: async (event) => {
                    try {
                        const files = event.target.files;
                        if (files.length === 0) {
                            resolve(null);
                            return;
                        }

                        if (options.multiple) {
                            const result = await this.importMultipleFiles(files);
                            resolve(result);
                        } else {
                            const schema = await this.importFile(files[0]);
                            resolve({
                                fileName: files[0].name,
                                schema,
                                success: true
                            });
                        }
                    } catch (error) {
                        reject(error);
                    } finally {
                        // Clean up
                        document.body.removeChild(input);
                    }
                }
            });

            // Add to DOM and trigger click
            input.style.display = 'none';
            document.body.appendChild(input);
            input.click();
        });
    }

    /**
     * Get parser information
     * @returns {Object} Parser information
     */
    getParserInfo() {
        const info = {};
        
        for (const [format, parser] of this.parsers.entries()) {
            info[format] = {
                name: parser.constructor.name,
                description: parser.description || 'No description available',
                supportedFeatures: parser.getSupportedFeatures ? parser.getSupportedFeatures() : []
            };
        }

        return info;
    }
}