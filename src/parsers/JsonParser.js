/**
 * Parser for JSON schema files
 */
export class JsonParser {
    constructor() {
        this.description = 'JSON schema parser supporting structured database definitions';
    }

    /**
     * Parse JSON content into schema
     * @param {string} content - JSON content to parse
     * @param {Object} options - Parse options
     * @returns {Promise<Object>} Parsed schema
     */
    async parse(content, options = {}) {
        try {
            const data = JSON.parse(content);
            return this.processJsonData(data, options);
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON format: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Process parsed JSON data into standardized schema format
     * @param {Object} data - Parsed JSON data
     * @param {Object} options - Processing options
     * @returns {Object} Standardized schema
     */
    processJsonData(data, options = {}) {
        // Handle different JSON schema formats
        if (data.schema) {
            // Format: { schema: { tables: [...], relationships: [...] } }
            return this.processSchemaObject(data.schema, options);
        } else if (data.tables) {
            // Format: { tables: [...], relationships: [...] }
            return this.processSchemaObject(data, options);
        } else if (Array.isArray(data)) {
            // Format: [{ name: "table1", columns: [...] }, ...]
            return this.processTableArray(data, options);
        } else {
            throw new Error('Unrecognized JSON schema format. Expected schema object or table array.');
        }
    }

    /**
     * Process schema object format
     * @param {Object} schemaData - Schema data
     * @param {Object} options - Processing options
     * @returns {Object} Processed schema
     */
    processSchemaObject(schemaData, options = {}) {
        if (!schemaData.tables || !Array.isArray(schemaData.tables)) {
            throw new Error('Schema must contain a tables array');
        }

        const schema = {
            metadata: {
                name: schemaData.name || options.fileName || 'Imported Schema',
                description: schemaData.description || '',
                version: schemaData.version || '1.0',
                importedAt: new Date().toISOString(),
                source: 'json',
                ...schemaData.metadata
            },
            tables: schemaData.tables.map(table => this.processTable(table)),
            relationships: []
        };

        // Process relationships if provided
        if (schemaData.relationships && Array.isArray(schemaData.relationships)) {
            schema.relationships = schemaData.relationships.map(rel => this.processRelationship(rel));
        }

        return schema;
    }

    /**
     * Process table array format
     * @param {Array} tables - Array of table objects
     * @param {Object} options - Processing options
     * @returns {Object} Processed schema
     */
    processTableArray(tables, options = {}) {
        const schema = {
            metadata: {
                name: options.fileName || 'Imported Schema',
                description: 'Schema imported from JSON table array',
                version: '1.0',
                importedAt: new Date().toISOString(),
                source: 'json'
            },
            tables: tables.map(table => this.processTable(table)),
            relationships: []
        };

        return schema;
    }

    /**
     * Process individual table
     * @param {Object} tableData - Raw table data
     * @returns {Object} Processed table
     */
    processTable(tableData) {
        if (!tableData.name) {
            throw new Error('Table must have a name');
        }

        if (!tableData.columns || !Array.isArray(tableData.columns)) {
            throw new Error(`Table '${tableData.name}' must have a columns array`);
        }

        const table = {
            name: tableData.name,
            displayName: tableData.displayName || tableData.name,
            columns: tableData.columns.map(column => this.processColumn(column, tableData.name)),
            metadata: {
                description: tableData.description || '',
                ...tableData.metadata
            }
        };

        // Process table-level relationships
        if (tableData.relationships && Array.isArray(tableData.relationships)) {
            table.relationships = tableData.relationships.map(rel => this.processRelationship(rel));
        }

        return table;
    }

    /**
     * Process individual column
     * @param {Object|string} columnData - Raw column data
     * @param {string} tableName - Name of parent table
     * @returns {Object} Processed column
     */
    processColumn(columnData, tableName) {
        // Handle string format: "column_name TYPE CONSTRAINTS"
        if (typeof columnData === 'string') {
            return this.parseColumnString(columnData);
        }

        // Handle object format
        if (!columnData.name) {
            throw new Error(`Column in table '${tableName}' must have a name`);
        }

        const column = {
            name: columnData.name,
            type: columnData.type || 'VARCHAR',
            constraints: Array.isArray(columnData.constraints) ? [...columnData.constraints] : [],
            nullable: columnData.nullable !== false,
            defaultValue: columnData.defaultValue,
            description: columnData.description || '',
            metadata: columnData.metadata || {}
        };

        // Process additional properties
        if (columnData.length !== undefined) {
            column.length = columnData.length;
        }

        if (columnData.precision !== undefined) {
            column.precision = columnData.precision;
        }

        if (columnData.scale !== undefined) {
            column.scale = columnData.scale;
        }

        // Handle boolean flags for constraints
        if (columnData.primaryKey === true) {
            column.constraints.push('PRIMARY KEY');
        }

        if (columnData.unique === true) {
            column.constraints.push('UNIQUE');
        }

        if (columnData.notNull === true || columnData.required === true) {
            column.constraints.push('NOT NULL');
            column.nullable = false;
        }

        if (columnData.autoIncrement === true) {
            column.constraints.push('AUTO_INCREMENT');
        }

        // Handle foreign key references
        if (columnData.references) {
            const ref = columnData.references;
            if (ref.table && ref.column) {
                column.constraints.push(`FOREIGN KEY REFERENCES ${ref.table}(${ref.column})`);
            }
        }

        return column;
    }

    /**
     * Parse column string format
     * @param {string} columnString - Column definition string
     * @returns {Object} Parsed column
     */
    parseColumnString(columnString) {
        const parts = columnString.trim().split(/\s+/);
        
        if (parts.length === 0) {
            throw new Error('Empty column definition');
        }

        const column = {
            name: parts[0],
            type: parts[1] || 'VARCHAR',
            constraints: [],
            nullable: true,
            description: '',
            metadata: {}
        };

        // Process remaining parts as constraints
        if (parts.length > 2) {
            const constraintString = parts.slice(2).join(' ').toUpperCase();
            
            // Split by common constraint keywords
            const constraints = constraintString.split(/\s+(?=PRIMARY|UNIQUE|NOT|AUTO|FOREIGN|CHECK|DEFAULT)/);
            
            constraints.forEach(constraint => {
                constraint = constraint.trim();
                if (constraint) {
                    column.constraints.push(constraint);
                    
                    // Update flags based on constraints
                    if (constraint.includes('NOT NULL')) {
                        column.nullable = false;
                    }
                }
            });
        }

        return column;
    }

    /**
     * Process individual relationship
     * @param {Object} relationshipData - Raw relationship data
     * @returns {Object} Processed relationship
     */
    processRelationship(relationshipData) {
        if (!relationshipData.sourceTable || !relationshipData.targetTable) {
            throw new Error('Relationship must have sourceTable and targetTable');
        }

        if (!relationshipData.sourceColumn || !relationshipData.targetColumn) {
            throw new Error('Relationship must have sourceColumn and targetColumn');
        }

        return {
            sourceTable: relationshipData.sourceTable,
            sourceColumn: relationshipData.sourceColumn,
            targetTable: relationshipData.targetTable,
            targetColumn: relationshipData.targetColumn,
            type: this.normalizeRelationshipType(relationshipData.type),
            name: relationshipData.name || '',
            description: relationshipData.description || '',
            metadata: relationshipData.metadata || {}
        };
    }

    /**
     * Normalize relationship type
     * @param {string} type - Raw relationship type
     * @returns {string} Normalized type
     */
    normalizeRelationshipType(type) {
        if (!type) return 'one-to-many';

        const normalizedType = type.toLowerCase().replace(/[_\s-]/g, '');

        switch (normalizedType) {
            case 'onetoone':
            case '1to1':
            case '11':
                return 'one-to-one';
            
            case 'onetomany':
            case '1tomany':
            case '1ton':
            case '1n':
                return 'one-to-many';
            
            case 'manytomany':
            case 'ntomany':
            case 'mton':
            case 'mn':
            case 'nn':
                return 'many-to-many';
            
            default:
                return 'one-to-many';
        }
    }

    /**
     * Get supported features
     * @returns {Array} Array of supported features
     */
    getSupportedFeatures() {
        return [
            'tables',
            'columns',
            'relationships',
            'constraints',
            'data-types',
            'metadata',
            'foreign-keys',
            'primary-keys',
            'unique-constraints',
            'not-null-constraints',
            'default-values',
            'auto-increment',
            'column-descriptions',
            'table-descriptions'
        ];
    }

    /**
     * Validate JSON schema structure
     * @param {Object} data - Data to validate
     * @returns {Object} Validation result
     */
    validateStructure(data) {
        const errors = [];
        const warnings = [];

        try {
            // Basic structure validation
            if (!data || typeof data !== 'object') {
                errors.push('Root must be an object');
                return { valid: false, errors, warnings };
            }

            // Check for required fields
            let tables = null;
            if (data.schema && data.schema.tables) {
                tables = data.schema.tables;
            } else if (data.tables) {
                tables = data.tables;
            } else if (Array.isArray(data)) {
                tables = data;
            } else {
                errors.push('No tables found in schema');
                return { valid: false, errors, warnings };
            }

            if (!Array.isArray(tables)) {
                errors.push('Tables must be an array');
                return { valid: false, errors, warnings };
            }

            // Validate each table
            tables.forEach((table, index) => {
                if (!table.name) {
                    errors.push(`Table at index ${index} missing name`);
                }

                if (!table.columns || !Array.isArray(table.columns)) {
                    errors.push(`Table '${table.name || index}' missing columns array`);
                } else if (table.columns.length === 0) {
                    warnings.push(`Table '${table.name}' has no columns`);
                }
            });

        } catch (error) {
            errors.push(`Validation error: ${error.message}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Generate example JSON schema
     * @returns {Object} Example schema
     */
    generateExample() {
        return {
            schema: {
                name: "Example Database",
                description: "Sample database schema",
                version: "1.0",
                tables: [
                    {
                        name: "users",
                        description: "User accounts table",
                        columns: [
                            {
                                name: "id",
                                type: "INT",
                                constraints: ["PRIMARY KEY", "AUTO_INCREMENT"],
                                description: "Unique user identifier"
                            },
                            {
                                name: "username",
                                type: "VARCHAR(50)",
                                constraints: ["UNIQUE", "NOT NULL"],
                                description: "User login name"
                            },
                            {
                                name: "email",
                                type: "VARCHAR(255)",
                                constraints: ["UNIQUE", "NOT NULL"],
                                description: "User email address"
                            },
                            {
                                name: "created_at",
                                type: "TIMESTAMP",
                                defaultValue: "CURRENT_TIMESTAMP",
                                description: "Account creation timestamp"
                            }
                        ]
                    },
                    {
                        name: "posts",
                        description: "User posts table",
                        columns: [
                            {
                                name: "id",
                                type: "INT",
                                constraints: ["PRIMARY KEY", "AUTO_INCREMENT"]
                            },
                            {
                                name: "user_id",
                                type: "INT",
                                constraints: ["NOT NULL"],
                                references: {
                                    table: "users",
                                    column: "id"
                                }
                            },
                            {
                                name: "title",
                                type: "VARCHAR(255)",
                                constraints: ["NOT NULL"]
                            },
                            {
                                name: "content",
                                type: "TEXT"
                            }
                        ]
                    }
                ],
                relationships: [
                    {
                        sourceTable: "posts",
                        sourceColumn: "user_id",
                        targetTable: "users",
                        targetColumn: "id",
                        type: "one-to-many",
                        name: "user_posts"
                    }
                ]
            }
        };
    }
}