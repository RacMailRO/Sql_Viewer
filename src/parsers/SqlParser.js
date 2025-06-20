/**
 * Parser for SQL DDL files
 */
export class SqlParser {
    constructor() {
        this.description = 'SQL DDL parser supporting CREATE TABLE statements and relationships';
    }

    /**
     * Parse SQL DDL content into schema
     * @param {string} content - SQL content to parse
     * @param {Object} options - Parse options
     * @returns {Promise<Object>} Parsed schema
     */
    async parse(content, options = {}) {
        try {
            const statements = this.extractStatements(content);
            return this.processStatements(statements, options);
        } catch (error) {
            throw new Error(`SQL parsing error: ${error.message}`);
        }
    }

    /**
     * Extract SQL statements from content
     * @param {string} content - SQL content
     * @returns {Array} Array of SQL statements
     */
    extractStatements(content) {
        // Remove comments
        let cleanContent = this.removeComments(content);
        
        // Split by semicolons, but be careful about semicolons in strings
        const statements = [];
        let currentStatement = '';
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < cleanContent.length; i++) {
            const char = cleanContent[i];
            const prevChar = i > 0 ? cleanContent[i - 1] : '';
            
            if (!inString && (char === '"' || char === "'" || char === '`')) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
                inString = false;
                stringChar = '';
            } else if (!inString && char === ';') {
                if (currentStatement.trim()) {
                    statements.push(currentStatement.trim());
                }
                currentStatement = '';
                continue;
            }
            
            currentStatement += char;
        }
        
        // Add final statement if exists
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }
        
        return statements.filter(stmt => stmt.length > 0);
    }

    /**
     * Remove comments from SQL content
     * @param {string} content - SQL content
     * @returns {string} Content without comments
     */
    removeComments(content) {
        // Remove single-line comments (-- comment)
        content = content.replace(/--.*$/gm, '');
        
        // Remove multi-line comments (/* comment */)
        content = content.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Remove hash comments (# comment) - MySQL style
        content = content.replace(/#.*$/gm, '');
        
        return content;
    }

    /**
     * Process SQL statements into schema
     * @param {Array} statements - SQL statements
     * @param {Object} options - Processing options
     * @returns {Object} Processed schema
     */
    processStatements(statements, options = {}) {
        const schema = {
            metadata: {
                name: options.fileName || 'SQL Schema',
                description: 'Schema imported from SQL DDL',
                version: '1.0',
                importedAt: new Date().toISOString(),
                source: 'sql'
            },
            tables: [],
            relationships: []
        };

        const tables = new Map();
        const relationships = [];

        // Process each statement
        statements.forEach(statement => {
            const statementType = this.getStatementType(statement);
            
            switch (statementType) {
                case 'CREATE_TABLE':
                    const table = this.parseCreateTable(statement);
                    if (table) {
                        tables.set(table.name, table);
                        
                        // Extract inline foreign key relationships
                        const inlineRelationships = this.extractInlineRelationships(table, statement);
                        relationships.push(...inlineRelationships);
                    }
                    break;
                
                case 'ALTER_TABLE':
                    const alterInfo = this.parseAlterTable(statement);
                    if (alterInfo && alterInfo.type === 'ADD_FOREIGN_KEY') {
                        relationships.push(alterInfo.relationship);
                    }
                    break;
                
                default:
                    // Ignore other statement types for now
                    break;
            }
        });

        schema.tables = Array.from(tables.values());
        schema.relationships = relationships;

        return schema;
    }

    /**
     * Get the type of SQL statement
     * @param {string} statement - SQL statement
     * @returns {string} Statement type
     */
    getStatementType(statement) {
        const upperStatement = statement.toUpperCase().trim();
        
        if (upperStatement.startsWith('CREATE TABLE')) {
            return 'CREATE_TABLE';
        } else if (upperStatement.startsWith('ALTER TABLE')) {
            return 'ALTER_TABLE';
        } else if (upperStatement.startsWith('CREATE INDEX')) {
            return 'CREATE_INDEX';
        } else if (upperStatement.startsWith('CREATE VIEW')) {
            return 'CREATE_VIEW';
        }
        
        return 'UNKNOWN';
    }

    /**
     * Parse CREATE TABLE statement
     * @param {string} statement - CREATE TABLE statement
     * @returns {Object|null} Parsed table or null
     */
    parseCreateTable(statement) {
        try {
            // Extract table name
            const tableNameMatch = statement.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([^`\s(]+)`?\s*\(/i);
            if (!tableNameMatch) {
                return null;
            }

            const tableName = tableNameMatch[1];
            
            // Extract column definitions
            const columnsSection = this.extractColumnsSection(statement);
            if (!columnsSection) {
                return null;
            }

            const columns = this.parseColumns(columnsSection);
            
            return {
                name: tableName,
                displayName: tableName,
                columns: columns,
                metadata: {
                    description: '',
                    originalStatement: statement
                }
            };

        } catch (error) {
            console.warn(`Failed to parse CREATE TABLE statement: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract columns section from CREATE TABLE statement
     * @param {string} statement - CREATE TABLE statement
     * @returns {string|null} Columns section
     */
    extractColumnsSection(statement) {
        const match = statement.match(/\(\s*([\s\S]*)\s*\)(?:\s*ENGINE|$)/i);
        return match ? match[1] : null;
    }

    /**
     * Parse column definitions from columns section
     * @param {string} columnsSection - Columns section
     * @returns {Array} Array of column objects
     */
    parseColumns(columnsSection) {
        const columns = [];
        const columnDefinitions = this.splitColumnDefinitions(columnsSection);

        columnDefinitions.forEach(columnDef => {
            const column = this.parseColumnDefinition(columnDef);
            if (column) {
                columns.push(column);
            }
        });

        return columns;
    }

    /**
     * Split column definitions while respecting parentheses and commas
     * @param {string} columnsSection - Columns section
     * @returns {Array} Array of column definition strings
     */
    splitColumnDefinitions(columnsSection) {
        const definitions = [];
        let currentDef = '';
        let parenCount = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < columnsSection.length; i++) {
            const char = columnsSection[i];
            const prevChar = i > 0 ? columnsSection[i - 1] : '';

            if (!inString && (char === '"' || char === "'" || char === '`')) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
                inString = false;
                stringChar = '';
            } else if (!inString) {
                if (char === '(') {
                    parenCount++;
                } else if (char === ')') {
                    parenCount--;
                } else if (char === ',' && parenCount === 0) {
                    if (currentDef.trim()) {
                        definitions.push(currentDef.trim());
                    }
                    currentDef = '';
                    continue;
                }
            }

            currentDef += char;
        }

        if (currentDef.trim()) {
            definitions.push(currentDef.trim());
        }

        return definitions.filter(def => def && !this.isConstraintDefinition(def));
    }

    /**
     * Check if definition is a table constraint (not a column)
     * @param {string} definition - Definition string
     * @returns {boolean} True if it's a constraint definition
     */
    isConstraintDefinition(definition) {
        const upperDef = definition.toUpperCase().trim();
        return upperDef.startsWith('PRIMARY KEY') ||
               upperDef.startsWith('FOREIGN KEY') ||
               upperDef.startsWith('UNIQUE') ||
               upperDef.startsWith('CHECK') ||
               upperDef.startsWith('CONSTRAINT');
    }

    /**
     * Parse individual column definition
     * @param {string} columnDef - Column definition string
     * @returns {Object|null} Parsed column or null
     */
    parseColumnDefinition(columnDef) {
        try {
            const parts = this.tokenizeColumnDefinition(columnDef);
            if (parts.length < 2) {
                return null;
            }

            const columnName = parts[0].replace(/[`'"]/g, '');
            const dataType = parts[1];

            const column = {
                name: columnName,
                type: this.normalizeDataType(dataType),
                constraints: [],
                nullable: true,
                description: '',
                metadata: {
                    originalDefinition: columnDef
                }
            };

            // Parse constraints and attributes
            for (let i = 2; i < parts.length; i++) {
                const part = parts[i].toUpperCase();
                
                if (part === 'NOT' && i + 1 < parts.length && parts[i + 1].toUpperCase() === 'NULL') {
                    column.constraints.push('NOT NULL');
                    column.nullable = false;
                    i++; // Skip next token
                } else if (part === 'PRIMARY' && i + 1 < parts.length && parts[i + 1].toUpperCase() === 'KEY') {
                    column.constraints.push('PRIMARY KEY');
                    i++; // Skip next token
                } else if (part === 'UNIQUE') {
                    column.constraints.push('UNIQUE');
                } else if (part === 'AUTO_INCREMENT' || part === 'AUTOINCREMENT') {
                    column.constraints.push('AUTO_INCREMENT');
                } else if (part === 'DEFAULT' && i + 1 < parts.length) {
                    column.defaultValue = parts[i + 1].replace(/['"]/g, '');
                    i++; // Skip next token
                } else if (part.startsWith('COMMENT') && i + 1 < parts.length) {
                    column.description = parts[i + 1].replace(/['"]/g, '');
                    i++; // Skip next token
                }
            }

            return column;

        } catch (error) {
            console.warn(`Failed to parse column definition: ${columnDef}`);
            return null;
        }
    }

    /**
     * Tokenize column definition into parts
     * @param {string} columnDef - Column definition
     * @returns {Array} Array of tokens
     */
    tokenizeColumnDefinition(columnDef) {
        const tokens = [];
        let currentToken = '';
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < columnDef.length; i++) {
            const char = columnDef[i];
            const prevChar = i > 0 ? columnDef[i - 1] : '';

            if (!inString && (char === '"' || char === "'" || char === '`')) {
                if (currentToken) {
                    tokens.push(currentToken);
                    currentToken = '';
                }
                inString = true;
                stringChar = char;
                currentToken += char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
                currentToken += char;
                tokens.push(currentToken);
                currentToken = '';
                inString = false;
                stringChar = '';
            } else if (inString) {
                currentToken += char;
            } else if (char === ' ' || char === '\t' || char === '\n') {
                if (currentToken) {
                    tokens.push(currentToken);
                    currentToken = '';
                }
            } else {
                currentToken += char;
            }
        }

        if (currentToken) {
            tokens.push(currentToken);
        }

        return tokens;
    }

    /**
     * Normalize data type
     * @param {string} dataType - Raw data type
     * @returns {string} Normalized data type
     */
    normalizeDataType(dataType) {
        // Remove backticks and quotes
        let normalized = dataType.replace(/[`'"]/g, '');
        
        // Convert to uppercase for consistency
        normalized = normalized.toUpperCase();
        
        // Handle common variations
        const typeMap = {
            'INTEGER': 'INT',
            'BOOLEAN': 'BOOL',
            'CHARACTER': 'CHAR',
            'DOUBLE PRECISION': 'DOUBLE',
            'REAL': 'FLOAT'
        };

        for (const [from, to] of Object.entries(typeMap)) {
            if (normalized.startsWith(from)) {
                normalized = normalized.replace(from, to);
                break;
            }
        }

        return normalized;
    }

    /**
     * Extract inline foreign key relationships from table
     * @param {Object} table - Table object
     * @param {string} statement - Original CREATE TABLE statement
     * @returns {Array} Array of relationships
     */
    extractInlineRelationships(table, statement) {
        const relationships = [];
        
        // Look for REFERENCES clauses in column definitions
        const referencesRegex = /REFERENCES\s+`?([^`\s(]+)`?\s*\(\s*`?([^`\s)]+)`?\s*\)/gi;
        let match;

        while ((match = referencesRegex.exec(statement)) !== null) {
            const targetTable = match[1];
            const targetColumn = match[2];
            
            // Find the column that has this reference
            // This is a simplified approach - in reality, we'd need to track which column definition contains this REFERENCES clause
            const sourceColumn = table.columns.find(col => 
                statement.includes(`${col.name}`) && 
                statement.indexOf(`${col.name}`) < statement.indexOf(match[0])
            );

            if (sourceColumn) {
                relationships.push({
                    sourceTable: table.name,
                    sourceColumn: sourceColumn.name,
                    targetTable: targetTable,
                    targetColumn: targetColumn,
                    type: 'one-to-many',
                    name: `${table.name}_${sourceColumn.name}_fk`
                });
            }
        }

        return relationships;
    }

    /**
     * Parse ALTER TABLE statement
     * @param {string} statement - ALTER TABLE statement
     * @returns {Object|null} Alter information
     */
    parseAlterTable(statement) {
        const upperStatement = statement.toUpperCase();
        
        if (upperStatement.includes('ADD FOREIGN KEY') || upperStatement.includes('ADD CONSTRAINT')) {
            // Extract foreign key information
            const fkMatch = statement.match(/ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(\s*`?([^`\s)]+)`?\s*\)\s+REFERENCES\s+`?([^`\s(]+)`?\s*\(\s*`?([^`\s)]+)`?\s*\)/i);
            
            if (fkMatch) {
                const tableMatch = statement.match(/ALTER\s+TABLE\s+`?([^`\s]+)`?/i);
                if (tableMatch) {
                    return {
                        type: 'ADD_FOREIGN_KEY',
                        relationship: {
                            sourceTable: tableMatch[1],
                            sourceColumn: fkMatch[1],
                            targetTable: fkMatch[2],
                            targetColumn: fkMatch[3],
                            type: 'one-to-many',
                            name: `${tableMatch[1]}_${fkMatch[1]}_fk`
                        }
                    };
                }
            }
        }

        return null;
    }

    /**
     * Get supported features
     * @returns {Array} Array of supported features
     */
    getSupportedFeatures() {
        return [
            'create-table',
            'columns',
            'data-types',
            'primary-keys',
            'foreign-keys',
            'unique-constraints',
            'not-null-constraints',
            'default-values',
            'auto-increment',
            'comments',
            'alter-table',
            'constraints'
        ];
    }

    /**
     * Generate example SQL DDL
     * @returns {string} Example SQL
     */
    generateExample() {
        return `-- Example SQL DDL Schema
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE posts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_tags (
    post_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);`;
    }
}