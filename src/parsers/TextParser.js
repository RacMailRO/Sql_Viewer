/**
 * Parser for plain text schema definitions
 */
export class TextParser {
    constructor() {
        this.description = 'Plain text parser supporting simple table definitions';
    }

    /**
     * Parse text content into schema
     * @param {string} content - Text content to parse
     * @param {Object} options - Parse options
     * @returns {Promise<Object>} Parsed schema
     */
    async parse(content, options = {}) {
        try {
            const lines = this.preprocessContent(content);
            return this.processLines(lines, options);
        } catch (error) {
            throw new Error(`Text parsing error: ${error.message}`);
        }
    }

    /**
     * Preprocess content into clean lines
     * @param {string} content - Raw content
     * @returns {Array} Array of clean lines
     */
    preprocessContent(content) {
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#') && !line.startsWith('//'));
    }

    /**
     * Process lines into schema
     * @param {Array} lines - Array of content lines
     * @param {Object} options - Processing options
     * @returns {Object} Processed schema
     */
    processLines(lines, options = {}) {
        const schema = {
            metadata: {
                name: options.fileName || 'Text Schema',
                description: 'Schema imported from text format',
                version: '1.0',
                importedAt: new Date().toISOString(),
                source: 'text'
            },
            tables: [],
            relationships: []
        };

        let currentTable = null;
        let currentSection = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (this.isTableDefinition(line)) {
                // Save previous table
                if (currentTable) {
                    schema.tables.push(currentTable);
                }
                
                // Start new table
                currentTable = this.parseTableDefinition(line);
                currentSection = 'columns';
                
            } else if (this.isRelationshipSection(line)) {
                // Save current table before switching to relationships
                if (currentTable) {
                    schema.tables.push(currentTable);
                    currentTable = null;
                }
                currentSection = 'relationships';
                
            } else if (currentSection === 'columns' && currentTable) {
                // Parse column definition
                const column = this.parseColumnDefinition(line);
                if (column) {
                    currentTable.columns.push(column);
                }
                
            } else if (currentSection === 'relationships') {
                // Parse relationship definition
                const relationship = this.parseRelationshipDefinition(line);
                if (relationship) {
                    schema.relationships.push(relationship);
                }
            }
        }

        // Add final table
        if (currentTable) {
            schema.tables.push(currentTable);
        }

        return schema;
    }

    /**
     * Check if line is a table definition
     * @param {string} line - Line to check
     * @returns {boolean} True if table definition
     */
    isTableDefinition(line) {
        const upperLine = line.toUpperCase();
        return upperLine.startsWith('TABLE ') || 
               upperLine.startsWith('CREATE TABLE ') ||
               line.match(/^[A-Za-z_][A-Za-z0-9_]*\s*:?\s*$/);
    }

    /**
     * Check if line indicates relationships section
     * @param {string} line - Line to check
     * @returns {boolean} True if relationships section
     */
    isRelationshipSection(line) {
        const upperLine = line.toUpperCase();
        return upperLine === 'RELATIONSHIPS' || 
               upperLine === 'RELATIONS' || 
               upperLine === 'FOREIGN KEYS' ||
               upperLine === 'CONSTRAINTS';
    }

    /**
     * Parse table definition line
     * @param {string} line - Table definition line
     * @returns {Object} Table object
     */
    parseTableDefinition(line) {
        let tableName = '';
        
        if (line.toUpperCase().startsWith('TABLE ')) {
            tableName = line.substring(6).trim();
        } else if (line.toUpperCase().startsWith('CREATE TABLE ')) {
            tableName = line.substring(13).trim();
        } else {
            // Simple format: "table_name:" or "table_name"
            tableName = line.replace(':', '').trim();
        }

        return {
            name: tableName,
            displayName: tableName,
            columns: [],
            metadata: {
                description: ''
            }
        };
    }

    /**
     * Parse column definition line
     * @param {string} line - Column definition line
     * @returns {Object|null} Column object or null
     */
    parseColumnDefinition(line) {
        // Skip empty lines and section headers
        if (!line || this.isTableDefinition(line) || this.isRelationshipSection(line)) {
            return null;
        }

        // Handle different formats:
        // 1. "  column_name TYPE constraints"
        // 2. "  - column_name TYPE constraints"
        // 3. "column_name: TYPE constraints"
        // 4. "column_name (TYPE) constraints"

        let cleanLine = line.trim();
        
        // Remove leading dash or bullet
        cleanLine = cleanLine.replace(/^[-*•]\s*/, '');
        
        // Handle colon format
        if (cleanLine.includes(':')) {
            const parts = cleanLine.split(':');
            const columnName = parts[0].trim();
            const rest = parts[1].trim();
            
            return this.parseColumnParts(columnName, rest);
        }
        
        // Handle parentheses format
        if (cleanLine.includes('(') && cleanLine.includes(')')) {
            const nameMatch = cleanLine.match(/^([^(]+)\s*\(([^)]+)\)\s*(.*)/);
            if (nameMatch) {
                const columnName = nameMatch[1].trim();
                const dataType = nameMatch[2].trim();
                const constraints = nameMatch[3].trim();
                
                return this.createColumn(columnName, dataType, constraints);
            }
        }
        
        // Handle space-separated format
        const parts = cleanLine.split(/\s+/);
        if (parts.length >= 2) {
            const columnName = parts[0];
            const dataType = parts[1];
            const constraints = parts.slice(2).join(' ');
            
            return this.createColumn(columnName, dataType, constraints);
        }

        return null;
    }

    /**
     * Parse column parts after splitting
     * @param {string} columnName - Column name
     * @param {string} rest - Rest of the definition
     * @returns {Object|null} Column object
     */
    parseColumnParts(columnName, rest) {
        const parts = rest.trim().split(/\s+/);
        const dataType = parts[0] || 'VARCHAR';
        const constraints = parts.slice(1).join(' ');
        
        return this.createColumn(columnName, dataType, constraints);
    }

    /**
     * Create column object
     * @param {string} name - Column name
     * @param {string} type - Data type
     * @param {string} constraintsStr - Constraints string
     * @returns {Object} Column object
     */
    createColumn(name, type, constraintsStr = '') {
        const column = {
            name: name.trim(),
            type: this.normalizeDataType(type.trim()),
            constraints: [],
            nullable: true,
            description: '',
            metadata: {}
        };

        // Parse constraints
        if (constraintsStr) {
            const constraints = this.parseConstraints(constraintsStr);
            column.constraints = constraints.constraints;
            column.nullable = constraints.nullable;
            
            if (constraints.defaultValue) {
                column.defaultValue = constraints.defaultValue;
            }
            
            if (constraints.description) {
                column.description = constraints.description;
            }
        }

        return column;
    }

    /**
     * Parse constraints string
     * @param {string} constraintsStr - Constraints string
     * @returns {Object} Parsed constraints
     */
    parseConstraints(constraintsStr) {
        const result = {
            constraints: [],
            nullable: true,
            defaultValue: null,
            description: ''
        };

        const upperStr = constraintsStr.toUpperCase();
        
        // Check for common constraints
        if (upperStr.includes('PRIMARY KEY') || upperStr.includes('PK')) {
            result.constraints.push('PRIMARY KEY');
        }
        
        if (upperStr.includes('FOREIGN KEY') || upperStr.includes('FK')) {
            result.constraints.push('FOREIGN KEY');
        }
        
        if (upperStr.includes('UNIQUE')) {
            result.constraints.push('UNIQUE');
        }
        
        if (upperStr.includes('NOT NULL') || upperStr.includes('REQUIRED')) {
            result.constraints.push('NOT NULL');
            result.nullable = false;
        }
        
        if (upperStr.includes('AUTO_INCREMENT') || upperStr.includes('AUTOINCREMENT') || upperStr.includes('AUTO INCREMENT')) {
            result.constraints.push('AUTO_INCREMENT');
        }

        // Extract default value
        const defaultMatch = constraintsStr.match(/DEFAULT\s+(['"]?)([^'"\s]+)\1/i);
        if (defaultMatch) {
            result.defaultValue = defaultMatch[2];
        }

        // Extract description/comment
        const commentMatch = constraintsStr.match(/COMMENT\s+(['"])([^'"]*)\1/i) ||
                           constraintsStr.match(/--\s*(.+)$/) ||
                           constraintsStr.match(/\/\*\s*([^*]*)\s*\*\//);
        if (commentMatch) {
            result.description = commentMatch[commentMatch.length - 1].trim();
        }

        return result;
    }

    /**
     * Parse relationship definition line
     * @param {string} line - Relationship definition line
     * @returns {Object|null} Relationship object or null
     */
    parseRelationshipDefinition(line) {
        // Handle different relationship formats:
        // 1. "table1.column -> table2.column"
        // 2. "table1(column) -> table2(column)"
        // 3. "table1.column references table2.column"
        // 4. "table1.column FK table2.column"

        let cleanLine = line.trim();
        
        // Arrow format
        if (cleanLine.includes('->') || cleanLine.includes('→')) {
            const arrow = cleanLine.includes('->') ? '->' : '→';
            const parts = cleanLine.split(arrow);
            
            if (parts.length === 2) {
                const source = this.parseTableColumn(parts[0].trim());
                const target = this.parseTableColumn(parts[1].trim());
                
                if (source && target) {
                    return {
                        sourceTable: source.table,
                        sourceColumn: source.column,
                        targetTable: target.table,
                        targetColumn: target.column,
                        type: 'one-to-many',
                        name: `${source.table}_${target.table}_rel`
                    };
                }
            }
        }
        
        // References format
        if (cleanLine.toUpperCase().includes('REFERENCES')) {
            const parts = cleanLine.toUpperCase().split('REFERENCES');
            if (parts.length === 2) {
                const source = this.parseTableColumn(parts[0].trim());
                const target = this.parseTableColumn(parts[1].trim());
                
                if (source && target) {
                    return {
                        sourceTable: source.table,
                        sourceColumn: source.column,
                        targetTable: target.table,
                        targetColumn: target.column,
                        type: 'one-to-many',
                        name: `${source.table}_${target.table}_ref`
                    };
                }
            }
        }

        return null;
    }

    /**
     * Parse table.column reference
     * @param {string} ref - Table column reference
     * @returns {Object|null} Parsed reference or null
     */
    parseTableColumn(ref) {
        // Handle formats:
        // 1. "table.column"
        // 2. "table(column)"
        // 3. "table column"

        if (ref.includes('.')) {
            const parts = ref.split('.');
            return {
                table: parts[0].trim(),
                column: parts[1].trim()
            };
        }
        
        if (ref.includes('(') && ref.includes(')')) {
            const match = ref.match(/([^(]+)\(([^)]+)\)/);
            if (match) {
                return {
                    table: match[1].trim(),
                    column: match[2].trim()
                };
            }
        }
        
        const parts = ref.split(/\s+/);
        if (parts.length === 2) {
            return {
                table: parts[0].trim(),
                column: parts[1].trim()
            };
        }

        return null;
    }

    /**
     * Normalize data type
     * @param {string} type - Raw data type
     * @returns {string} Normalized data type
     */
    normalizeDataType(type) {
        const upperType = type.toUpperCase();
        
        // Common type mappings
        const typeMap = {
            'STRING': 'VARCHAR',
            'TEXT': 'TEXT',
            'NUMBER': 'INT',
            'INTEGER': 'INT',
            'DECIMAL': 'DECIMAL',
            'FLOAT': 'FLOAT',
            'DOUBLE': 'DOUBLE',
            'BOOLEAN': 'BOOL',
            'BOOL': 'BOOL',
            'DATE': 'DATE',
            'TIME': 'TIME',
            'DATETIME': 'DATETIME',
            'TIMESTAMP': 'TIMESTAMP'
        };

        return typeMap[upperType] || type;
    }

    /**
     * Get supported features
     * @returns {Array} Array of supported features
     */
    getSupportedFeatures() {
        return [
            'tables',
            'columns',
            'data-types',
            'primary-keys',
            'foreign-keys',
            'unique-constraints',
            'not-null-constraints',
            'default-values',
            'auto-increment',
            'comments',
            'relationships'
        ];
    }

    /**
     * Generate example text schema
     * @returns {string} Example text schema
     */
    generateExample() {
        return `# Example Text Schema

TABLE users
  id INT PRIMARY KEY AUTO_INCREMENT
  username VARCHAR(50) UNIQUE NOT NULL
  email VARCHAR(255) UNIQUE NOT NULL
  password_hash VARCHAR(255) NOT NULL
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  updated_at TIMESTAMP

TABLE posts
  id INT PRIMARY KEY AUTO_INCREMENT
  user_id INT NOT NULL FK
  title VARCHAR(255) NOT NULL
  content TEXT
  status VARCHAR(20) DEFAULT 'draft'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

TABLE categories
  id INT PRIMARY KEY AUTO_INCREMENT
  name VARCHAR(100) UNIQUE NOT NULL
  description TEXT
  parent_id INT

RELATIONSHIPS
posts.user_id -> users.id
categories.parent_id -> categories.id`;
    }

    /**
     * Validate text schema format
     * @param {string} content - Content to validate
     * @returns {Object} Validation result
     */
    validateFormat(content) {
        const errors = [];
        const warnings = [];
        const lines = this.preprocessContent(content);

        let hasTable = false;
        let currentTable = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (this.isTableDefinition(line)) {
                hasTable = true;
                currentTable = line;
            } else if (currentTable && !this.isRelationshipSection(line)) {
                // Should be a column definition
                const column = this.parseColumnDefinition(line);
                if (!column) {
                    warnings.push(`Line ${lineNum}: Could not parse column definition: "${line}"`);
                }
            }
        }

        if (!hasTable) {
            errors.push('No table definitions found');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}