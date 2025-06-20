/**
 * Schema model that manages database schema data
 */
export class SchemaModel {
    constructor() {
        this.schema = null;
        this.tables = new Map();
        this.relationships = new Set();
        this.metadata = {};
    }

    /**
     * Load a complete schema
     * @param {Object} schemaData - Schema data object
     */
    loadSchema(schemaData) {
        this.clear();
        
        if (!schemaData || !schemaData.tables) {
            throw new Error('Invalid schema data: missing tables');
        }

        this.schema = schemaData;
        this.metadata = schemaData.metadata || {};

        // Load tables
        schemaData.tables.forEach(tableData => {
            this.addTable(tableData);
        });

        // Load relationships
        if (schemaData.relationships) {
            schemaData.relationships.forEach(relationshipData => {
                this.addRelationship(relationshipData);
            });
        }

        // Auto-detect relationships if none were provided
        if (this.relationships.size === 0) {
            this.detectRelationships();
        }

        this.validateSchema();
    }

    /**
     * Add a table to the schema
     * @param {Object} tableData - Table definition
     */
    addTable(tableData) {
        if (!tableData.name) {
            throw new Error('Table must have a name');
        }

        if (!tableData.columns || !Array.isArray(tableData.columns)) {
            throw new Error('Table must have columns array');
        }

        const table = {
            name: tableData.name,
            displayName: tableData.displayName || tableData.name,
            columns: this.processColumns(tableData.columns),
            position: tableData.position || { x: 0, y: 0 },
            metadata: tableData.metadata || {}
        };

        this.tables.set(table.name, table);
    }

    /**
     * Process table columns
     * @param {Array} columns - Raw column data
     * @returns {Array} Processed columns
     */
    processColumns(columns) {
        return columns.map(column => {
            if (typeof column === 'string') {
                // Simple string format: "column_name TYPE"
                const parts = column.trim().split(/\s+/);
                return {
                    name: parts[0],
                    type: parts[1] || 'VARCHAR',
                    constraints: [],
                    isPrimaryKey: false,
                    isForeignKey: false
                };
            }

            // Object format
            const processedColumn = {
                name: column.name,
                type: column.type || 'VARCHAR',
                constraints: column.constraints || [],
                isPrimaryKey: false,
                isForeignKey: false,
                nullable: column.nullable !== false,
                defaultValue: column.defaultValue,
                metadata: column.metadata || {}
            };

            // Detect key types from constraints
            if (processedColumn.constraints) {
                const constraintStr = processedColumn.constraints.join(' ').toUpperCase();
                processedColumn.isPrimaryKey = constraintStr.includes('PRIMARY KEY');
                processedColumn.isForeignKey = constraintStr.includes('FOREIGN KEY') || 
                                             constraintStr.includes('REFERENCES');
            }

            return processedColumn;
        });
    }

    /**
     * Add a relationship to the schema
     * @param {Object} relationshipData - Relationship definition
     */
    addRelationship(relationshipData) {
        const fromTable = relationshipData.from ? relationshipData.from.table : relationshipData.sourceTable;
        const fromColumn = relationshipData.from ? relationshipData.from.column : relationshipData.sourceColumn;
        const toTable = relationshipData.to ? relationshipData.to.table : relationshipData.targetTable;
        const toColumn = relationshipData.to ? relationshipData.to.column : relationshipData.targetColumn;

        if (!fromTable || !toTable) {
            throw new Error('Relationship must have source and target tables');
        }

        if (!fromColumn || !toColumn) {
            throw new Error('Relationship must have source and target columns');
        }

        const relationship = {
            id: relationshipData.id || this.generateRelationshipId({sourceTable: fromTable, sourceColumn: fromColumn, targetTable: toTable, targetColumn: toColumn}),
            type: relationshipData.type || 'one-to-many',
            from: {
                table: fromTable,
                column: fromColumn
            },
            to: {
                table: toTable,
                column: toColumn
            },
            name: relationshipData.name || '',
            metadata: relationshipData.metadata || {}
        };

        this.relationships.add(relationship);
    }

    /**
     * Generate a unique ID for a relationship
     * @param {Object} relationshipData - Relationship data
     * @returns {string} Generated ID
     */
    generateRelationshipId(relationshipData) {
        return `${relationshipData.sourceTable}.${relationshipData.sourceColumn}_to_${relationshipData.targetTable}.${relationshipData.targetColumn}`;
    }

    /**
     * Auto-detect relationships based on column names and types
     */
    detectRelationships() {
        const tables = Array.from(this.tables.values());
        
        for (let i = 0; i < tables.length; i++) {
            for (let j = 0; j < tables.length; j++) {
                if (i === j) continue;
                
                const sourceTable = tables[i];
                const targetTable = tables[j];
                
                this.detectRelationshipsBetweenTables(sourceTable, targetTable);
            }
        }
    }

    /**
     * Detect relationships between two specific tables
     * @param {Object} sourceTable - Source table
     * @param {Object} targetTable - Target table
     */
    detectRelationshipsBetweenTables(sourceTable, targetTable) {
        // Look for foreign key patterns
        sourceTable.columns.forEach(sourceColumn => {
            targetTable.columns.forEach(targetColumn => {
                if (this.isLikelyRelationship(sourceColumn, targetColumn, sourceTable, targetTable)) {
                    const relationship = {
                        sourceTable: sourceTable.name,
                        sourceColumn: sourceColumn.name,
                        targetTable: targetTable.name,
                        targetColumn: targetColumn.name,
                        type: this.determineRelationshipType(sourceColumn, targetColumn),
                        name: `${sourceTable.name}_${targetTable.name}`
                    };

                    // Check if relationship already exists
                    const relationshipId = this.generateRelationshipId(relationship);
                    const exists = Array.from(this.relationships).some(rel => rel.id === relationshipId);
                    
                    if (!exists) {
                        this.addRelationship(relationship);
                    }
                }
            });
        });
    }

    /**
     * Check if two columns likely form a relationship
     * @param {Object} sourceColumn - Source column
     * @param {Object} targetColumn - Target column
     * @param {Object} sourceTable - Source table
     * @param {Object} targetTable - Target table
     * @returns {boolean} True if likely a relationship
     */
    isLikelyRelationship(sourceColumn, targetColumn, sourceTable, targetTable) {
        // Primary key to foreign key relationship
        if (targetColumn.isPrimaryKey && this.isLikelyForeignKey(sourceColumn, targetTable.name)) {
            return true;
        }

        // Name-based detection
        const sourceName = sourceColumn.name.toLowerCase();
        const targetName = targetColumn.name.toLowerCase();
        const targetTableName = targetTable.name.toLowerCase();

        // Check for patterns like user_id -> users.id
        if (sourceName === `${targetTableName}_id` && targetName === 'id') {
            return true;
        }

        // Check for exact name matches with compatible types
        if (sourceName === targetName && this.areTypesCompatible(sourceColumn.type, targetColumn.type)) {
            return true;
        }

        return false;
    }

    /**
     * Check if a column is likely a foreign key
     * @param {Object} column - Column to check
     * @param {string} targetTableName - Target table name
     * @returns {boolean} True if likely a foreign key
     */
    isLikelyForeignKey(column, targetTableName) {
        const columnName = column.name.toLowerCase();
        const tableName = targetTableName.toLowerCase();

        // Common foreign key patterns
        const patterns = [
            `${tableName}_id`,
            `${tableName}id`,
            `${tableName.slice(0, -1)}_id`, // singular form
            `id_${tableName}`,
            `fk_${tableName}`
        ];

        return patterns.some(pattern => columnName === pattern) || column.isForeignKey;
    }

    /**
     * Check if two data types are compatible for relationships
     * @param {string} type1 - First type
     * @param {string} type2 - Second type
     * @returns {boolean} True if compatible
     */
    areTypesCompatible(type1, type2) {
        const normalize = (type) => type.toLowerCase().replace(/\(\d+\)/, '').trim();
        
        const normalizedType1 = normalize(type1);
        const normalizedType2 = normalize(type2);

        // Exact match
        if (normalizedType1 === normalizedType2) {
            return true;
        }

        // Compatible integer types
        const intTypes = ['int', 'integer', 'bigint', 'smallint', 'tinyint'];
        if (intTypes.includes(normalizedType1) && intTypes.includes(normalizedType2)) {
            return true;
        }

        // Compatible string types
        const stringTypes = ['varchar', 'char', 'text', 'string'];
        if (stringTypes.includes(normalizedType1) && stringTypes.includes(normalizedType2)) {
            return true;
        }

        return false;
    }

    /**
     * Determine the type of relationship between two columns
     * @param {Object} sourceColumn - Source column
     * @param {Object} targetColumn - Target column
     * @returns {string} Relationship type
     */
    determineRelationshipType(sourceColumn, targetColumn) {
        // If target is primary key, it's likely one-to-many
        if (targetColumn.isPrimaryKey) {
            return 'one-to-many';
        }

        // If both are unique, it might be one-to-one
        const sourceUnique = sourceColumn.constraints.some(c => c.toUpperCase().includes('UNIQUE'));
        const targetUnique = targetColumn.constraints.some(c => c.toUpperCase().includes('UNIQUE'));
        
        if (sourceUnique && targetUnique) {
            return 'one-to-one';
        }

        // Default to one-to-many
        return 'one-to-many';
    }

    /**
     * Remove a table from the schema
     * @param {string} tableName - Name of table to remove
     */
    removeTable(tableName) {
        this.tables.delete(tableName);
        
        // Remove relationships involving this table
        const relationshipsToRemove = Array.from(this.relationships).filter(rel => 
            rel.from.table === tableName || rel.to.table === tableName
        );
        
        relationshipsToRemove.forEach(rel => this.relationships.delete(rel));
    }

    /**
     * Remove a relationship from the schema
     * @param {string} relationshipId - ID of relationship to remove
     */
    removeRelationship(relationshipId) {
        const relationship = Array.from(this.relationships).find(rel => rel.id === relationshipId);
        if (relationship) {
            this.relationships.delete(relationship);
        }
    }

    /**
     * Get a table by name
     * @param {string} tableName - Table name
     * @returns {Object|null} Table object or null if not found
     */
    getTable(tableName) {
        return this.tables.get(tableName) || null;
    }

    /**
     * Get all tables
     * @returns {Array} Array of table objects
     */
    getTables() {
        return Array.from(this.tables.values());
    }

    /**
     * Get all relationships
     * @returns {Array} Array of relationship objects
     */
    getRelationships() {
        return Array.from(this.relationships);
    }

    /**
     * Get the complete schema
     * @returns {Object} Schema object
     */
    getSchema() {
        return {
            metadata: this.metadata,
            tables: this.getTables(),
            relationships: this.getRelationships()
        };
    }

    /**
     * Check if schema has data
     * @returns {boolean} True if schema has tables
     */
    hasData() {
        return this.tables.size > 0;
    }

    /**
     * Validate the current schema
     * @throws {Error} If schema is invalid
     */
    validateSchema() {
        // Check for duplicate table names
        const tableNames = new Set();
        for (const table of this.tables.values()) {
            if (tableNames.has(table.name)) {
                throw new Error(`Duplicate table name: ${table.name}`);
            }
            tableNames.add(table.name);
        }

        // Validate relationships
        for (const relationship of this.relationships) {
            const sourceTable = this.getTable(relationship.from.table);
            const targetTable = this.getTable(relationship.to.table);

            if (!sourceTable) {
                throw new Error(`Relationship references non-existent source table: ${relationship.from.table}`);
            }

            if (!targetTable) {
                throw new Error(`Relationship references non-existent target table: ${relationship.to.table}`);
            }

            const sourceColumn = sourceTable.columns.find(col => col.name === relationship.from.column);
            const targetColumn = targetTable.columns.find(col => col.name === relationship.to.column);

            if (!sourceColumn) {
                throw new Error(`Relationship references non-existent source column: ${relationship.from.table}.${relationship.from.column}`);
            }

            if (!targetColumn) {
                throw new Error(`Relationship references non-existent target column: ${relationship.to.table}.${relationship.to.column}`);
            }
        }
    }

    /**
     * Clear all schema data
     */
    clear() {
        this.schema = null;
        this.tables.clear();
        this.relationships.clear();
        this.metadata = {};
    }

    /**
     * Get schema statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const tables = this.getTables();
        const relationships = this.getRelationships();

        return {
            tableCount: tables.length,
            relationshipCount: relationships.length,
            totalColumns: tables.reduce((sum, table) => sum + table.columns.length, 0),
            primaryKeys: tables.reduce((sum, table) => 
                sum + table.columns.filter(col => col.isPrimaryKey).length, 0),
            foreignKeys: tables.reduce((sum, table) => 
                sum + table.columns.filter(col => col.isForeignKey).length, 0)
        };
    }
}