/**
 * Parser for CSV schema files
 * Supports table_name, column_name, data_type format
 */
export class CsvParser {
    constructor() {
        this.description = 'CSV schema parser supporting table definitions with auto-generated relationships';
    }

    /**
     * Parse CSV content into schema
     * @param {string} content - CSV content to parse
     * @param {Object} options - Parse options
     * @returns {Promise<Object>} Parsed schema
     */
    async parse(content, options = {}) {
        try {
            const lines = content.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV must have at least a header row and one data row');
            }

            // Parse CSV lines
            const rows = lines.map(line => this.parseCsvLine(line));
            const headers = rows[0].map(header => header.toLowerCase().replace(/"/g, ''));
            const dataRows = rows.slice(1);

            // Validate expected columns
            this.validateHeaders(headers);

            // Group rows by table
            const tableGroups = this.groupRowsByTable(dataRows, headers);

            // Convert to schema format
            const schema = this.convertToSchema(tableGroups, options);

            // Auto-generate relationships
            this.autoGenerateRelationships(schema);

            return schema;
        } catch (error) {
            throw new Error(`CSV parsing error: ${error.message}`);
        }
    }

    /**
     * Parse a single CSV line handling quoted values
     * @param {string} line - CSV line to parse
     * @returns {Array} Array of values
     */
    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i += 2;
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                result.push(current.trim());
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }

        // Add the last field
        result.push(current.trim());
        return result;
    }

    /**
     * Validate CSV headers
     * @param {Array} headers - Header array
     */
    validateHeaders(headers) {
        const requiredHeaders = ['table_name', 'column_name', 'data_type'];
        const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
        
        if (missingHeaders.length > 0) {
            throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
        }
    }

    /**
     * Group CSV rows by table name
     * @param {Array} dataRows - Array of data rows
     * @param {Array} headers - Header array
     * @returns {Map} Map of table name to columns
     */
    groupRowsByTable(dataRows, headers) {
        const tableGroups = new Map();
        const tableIndex = headers.indexOf('table_name');
        const columnIndex = headers.indexOf('column_name');
        const typeIndex = headers.indexOf('data_type');

        dataRows.forEach((row, index) => {
            if (row.length < 3) {
                console.warn(`Skipping incomplete row ${index + 2}: ${row.join(',')}`);
                return;
            }

            const tableName = row[tableIndex]?.replace(/"/g, '').trim();
            const columnName = row[columnIndex]?.replace(/"/g, '').trim();
            const dataType = row[typeIndex]?.replace(/"/g, '').trim();

            if (!tableName || !columnName || !dataType) {
                console.warn(`Skipping row ${index + 2} with missing data: ${row.join(',')}`);
                return;
            }

            if (!tableGroups.has(tableName)) {
                tableGroups.set(tableName, []);
            }

            tableGroups.get(tableName).push({
                name: columnName,
                type: dataType
            });
        });

        return tableGroups;
    }

    /**
     * Convert grouped data to schema format
     * @param {Map} tableGroups - Grouped table data
     * @param {Object} options - Conversion options
     * @returns {Object} Schema object
     */
    convertToSchema(tableGroups, options = {}) {
        const tables = [];

        for (const [tableName, columns] of tableGroups) {
            const table = {
                name: tableName,
                displayName: this.generateDisplayName(tableName),
                columns: columns.map(col => this.processColumn(col, tableName)),
                metadata: {
                    description: this.generateTableDescription(tableName),
                    category: this.categorizeTable(tableName)
                }
            };

            tables.push(table);
        }

        return {
            metadata: {
                name: options.fileName || 'Warehouse Schema',
                description: 'Database schema imported from CSV',
                version: '1.0',
                importedAt: new Date().toISOString(),
                source: 'csv',
                totalTables: tables.length,
                totalColumns: tables.reduce((sum, table) => sum + table.columns.length, 0)
            },
            tables: tables,
            relationships: []
        };
    }

    /**
     * Process individual column
     * @param {Object} columnData - Raw column data
     * @param {string} tableName - Name of parent table
     * @returns {Object} Processed column
     */
    processColumn(columnData, tableName) {
        const column = {
            name: columnData.name,
            type: this.normalizeDataType(columnData.type),
            constraints: [],
            nullable: true,
            description: this.generateColumnDescription(columnData.name, tableName),
            metadata: {
                originalType: columnData.type
            }
        };

        // Detect primary keys
        if (this.isPrimaryKey(columnData.name, tableName)) {
            column.constraints.push('PRIMARY KEY');
            column.nullable = false;
        }

        // Detect foreign keys
        if (this.isForeignKey(columnData.name)) {
            column.constraints.push('FOREIGN KEY');
            column.metadata.isReference = true;
            column.metadata.referencedTable = this.inferReferencedTable(columnData.name);
        }

        // Detect not null constraints based on naming patterns
        if (this.shouldBeNotNull(columnData.name)) {
            column.constraints.push('NOT NULL');
            column.nullable = false;
        }

        return column;
    }

    /**
     * Auto-generate relationships based on foreign key patterns
     * @param {Object} schema - Schema object to modify
     */
    autoGenerateRelationships(schema) {
        const relationships = [];
        const tableMap = new Map(schema.tables.map(table => [table.name, table]));

        schema.tables.forEach(table => {
            table.columns.forEach(column => {
                if (this.isForeignKey(column.name)) {
                    const referencedTableName = this.inferReferencedTable(column.name);
                    const referencedTable = tableMap.get(referencedTableName);

                    if (referencedTable) {
                        // Find the primary key column in the referenced table
                        const primaryKeyColumn = referencedTable.columns.find(col => 
                            col.constraints.includes('PRIMARY KEY') || 
                            col.name === 'id' || 
                            col.name === referencedTableName + '_id'
                        );

                        if (primaryKeyColumn) {
                            const relationship = {
                                sourceTable: table.name,
                                sourceColumn: column.name,
                                targetTable: referencedTable.name,
                                targetColumn: primaryKeyColumn.name,
                                type: 'many-to-one',
                                name: `${table.name}_${column.name}_fk`,
                                description: `Foreign key relationship from ${table.name} to ${referencedTable.name}`,
                                metadata: {
                                    autoGenerated: true,
                                    confidence: this.calculateRelationshipConfidence(column.name, referencedTableName)
                                }
                            };

                            relationships.push(relationship);
                        }
                    }
                }
            });
        });

        schema.relationships = relationships;
    }

    /**
     * Check if column name indicates a primary key
     * @param {string} columnName - Column name to check
     * @param {string} tableName - Table name for context
     * @returns {boolean} True if likely primary key
     */
    isPrimaryKey(columnName, tableName) {
        const lowerName = columnName.toLowerCase();
        return lowerName === 'id' || 
               lowerName === tableName.toLowerCase() + '_id' ||
               lowerName.endsWith('_id') && lowerName.startsWith(tableName.toLowerCase().replace(/^mstr_[lf]_/, ''));
    }

    /**
     * Check if column name indicates a foreign key
     * @param {string} columnName - Column name to check
     * @returns {boolean} True if likely foreign key
     */
    isForeignKey(columnName) {
        const lowerName = columnName.toLowerCase();
        return lowerName.endsWith('_id') && lowerName !== 'id';
    }

    /**
     * Infer referenced table name from foreign key column
     * @param {string} columnName - Foreign key column name
     * @returns {string} Inferred table name
     */
    inferReferencedTable(columnName) {
        const baseName = columnName.replace(/_id$/i, '');
        
        // Common patterns in the warehouse data
        const patterns = [
            `mstr_l_${baseName}`,      // Lookup tables
            `mstr_f_${baseName}`,      // Fact tables
            `mstr_${baseName}`,        // General tables
            baseName                   // Direct match
        ];

        return patterns[0]; // Return the most likely pattern
    }

    /**
     * Calculate confidence score for relationship
     * @param {string} columnName - Column name
     * @param {string} referencedTable - Referenced table name
     * @returns {number} Confidence score (0-1)
     */
    calculateRelationshipConfidence(columnName, referencedTable) {
        const baseName = columnName.replace(/_id$/i, '');
        
        if (referencedTable.includes(baseName)) {
            return 0.9;
        }
        
        if (referencedTable.endsWith(baseName)) {
            return 0.8;
        }
        
        return 0.6;
    }

    /**
     * Check if column should be NOT NULL based on patterns
     * @param {string} columnName - Column name to check
     * @returns {boolean} True if should be NOT NULL
     */
    shouldBeNotNull(columnName) {
        const patterns = [
            /^tenant_id$/i,
            /^org_id$/i,
            /^.*_id$/i,
            /^.*_date$/i,
            /^.*_code$/i,
            /^.*_name$/i
        ];

        return patterns.some(pattern => pattern.test(columnName));
    }

    /**
     * Normalize data type to standard format
     * @param {string} dataType - Raw data type
     * @returns {string} Normalized data type
     */
    normalizeDataType(dataType) {
        const type = dataType.toLowerCase().trim();
        
        const typeMap = {
            'bigint': 'BIGINT',
            'integer': 'INTEGER',
            'int': 'INTEGER',
            'numeric': 'NUMERIC',
            'decimal': 'DECIMAL',
            'boolean': 'BOOLEAN',
            'bool': 'BOOLEAN',
            'timestamp without time zone': 'TIMESTAMP',
            'timestamp with time zone': 'TIMESTAMPTZ',
            'character varying': 'VARCHAR',
            'varchar': 'VARCHAR',
            'character': 'CHAR',
            'char': 'CHAR',
            'text': 'TEXT',
            'real': 'REAL',
            'double precision': 'DOUBLE PRECISION',
            'date': 'DATE',
            'time': 'TIME',
            'oid': 'OID',
            'regproc': 'REGPROC',
            'pg_node_tree': 'TEXT',
            'pg_lsn': 'TEXT',
            'xid': 'INTEGER',
            'name': 'VARCHAR(63)',
            'anyarray': 'TEXT[]',
            'bytea': 'BYTEA',
            'interval': 'INTERVAL',
            'inet': 'INET',
            'array': 'ARRAY'
        };

        // Handle array types
        if (type === 'array' || type.includes('[]')) {
            return 'ARRAY';
        }

        // Handle types with precision/scale
        const precisionMatch = type.match(/^(\w+)\((\d+(?:,\d+)?)\)$/);
        if (precisionMatch) {
            const baseType = typeMap[precisionMatch[1]] || precisionMatch[1].toUpperCase();
            return `${baseType}(${precisionMatch[2]})`;
        }

        return typeMap[type] || type.toUpperCase();
    }

    /**
     * Generate display name for table
     * @param {string} tableName - Raw table name
     * @returns {string} Display name
     */
    generateDisplayName(tableName) {
        return tableName
            .replace(/^mstr_[lf]_/, '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Generate description for table
     * @param {string} tableName - Table name
     * @returns {string} Generated description
     */
    generateTableDescription(tableName) {
        if (tableName.startsWith('mstr_l_')) {
            return `Lookup/Master table: ${this.generateDisplayName(tableName)}`;
        } else if (tableName.includes('_f_')) {
            return `Fact table: ${this.generateDisplayName(tableName)}`;
        } else if (tableName.startsWith('pg_')) {
            return `PostgreSQL system table: ${this.generateDisplayName(tableName)}`;
        } else {
            return `Data table: ${this.generateDisplayName(tableName)}`;
        }
    }

    /**
     * Categorize table based on naming patterns
     * @param {string} tableName - Table name
     * @returns {string} Table category
     */
    categorizeTable(tableName) {
        if (tableName.startsWith('mstr_l_')) return 'lookup';
        if (tableName.includes('_f_')) return 'fact';
        if (tableName.startsWith('pg_')) return 'system';
        if (tableName.includes('_hierarchy')) return 'hierarchy';
        return 'data';
    }

    /**
     * Generate description for column
     * @param {string} columnName - Column name
     * @param {string} tableName - Table name for context
     * @returns {string} Generated description
     */
    generateColumnDescription(columnName, tableName) {
        const lowerName = columnName.toLowerCase();
        
        if (lowerName === 'id' || lowerName.endsWith('_id')) {
            if (lowerName === 'id') {
                return `Primary key for ${tableName}`;
            } else {
                const refTable = lowerName.replace(/_id$/, '');
                return `Foreign key reference to ${refTable}`;
            }
        }
        
        if (lowerName.includes('date') || lowerName.includes('time')) {
            return `Date/time field: ${columnName}`;
        }
        
        if (lowerName.includes('name') || lowerName.includes('desc')) {
            return `Descriptive field: ${columnName}`;
        }
        
        if (lowerName.includes('code')) {
            return `Code/identifier field: ${columnName}`;
        }
        
        if (lowerName.includes('amt') || lowerName.includes('amount')) {
            return `Amount/monetary field: ${columnName}`;
        }
        
        if (lowerName.includes('qty') || lowerName.includes('quantity')) {
            return `Quantity field: ${columnName}`;
        }
        
        return `Data field: ${columnName}`;
    }

    /**
     * Get supported features
     * @returns {Array} Array of supported features
     */
    getSupportedFeatures() {
        return [
            'tables',
            'columns',
            'auto-relationships',
            'data-types',
            'primary-keys',
            'foreign-keys',
            'constraints',
            'table-categorization',
            'column-descriptions',
            'relationship-confidence'
        ];
    }

    /**
     * Validate CSV structure
     * @param {string} content - CSV content to validate
     * @returns {Object} Validation result
     */
    validateStructure(content) {
        const errors = [];
        const warnings = [];

        try {
            const lines = content.trim().split('\n');
            
            if (lines.length < 2) {
                errors.push('CSV must have at least a header row and one data row');
                return { valid: false, errors, warnings };
            }

            // Check header
            const headerLine = lines[0];
            const headers = this.parseCsvLine(headerLine).map(h => h.toLowerCase().replace(/"/g, ''));
            
            const requiredHeaders = ['table_name', 'column_name', 'data_type'];
            const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
            
            if (missingHeaders.length > 0) {
                errors.push(`Missing required headers: ${missingHeaders.join(', ')}`);
            }

            // Check data rows
            const dataLines = lines.slice(1);
            let validRows = 0;
            
            dataLines.forEach((line, index) => {
                const row = this.parseCsvLine(line);
                if (row.length >= 3 && row.every(cell => cell.trim())) {
                    validRows++;
                } else {
                    warnings.push(`Row ${index + 2} appears incomplete or malformed`);
                }
            });

            if (validRows === 0) {
                errors.push('No valid data rows found');
            }

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
     * Generate example CSV schema
     * @returns {string} Example CSV content
     */
    generateExample() {
        return `"table_name","column_name","data_type"
"users","id","bigint"
"users","username","character varying(50)"
"users","email","character varying(255)"
"users","created_at","timestamp without time zone"
"posts","id","bigint"
"posts","user_id","bigint"
"posts","title","character varying(255)"
"posts","content","text"
"posts","created_at","timestamp without time zone"`;
    }
}