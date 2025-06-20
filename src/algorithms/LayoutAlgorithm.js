/**
 * Layout algorithm for positioning tables in the ERD
 */
export class LayoutAlgorithm {
    constructor() {
        this.defaultTableWidth = 200;
        this.defaultTableHeight = 100;
        this.minSpacing = 50;
        this.gridSize = 20;
    }

    /**
     * Calculate layout for all tables in the schema
     * @param {Object} schema - Schema object
     * @returns {Object} Layout data
     */
    calculateLayout(schema) {
        if (!schema || !schema.tables || schema.tables.length === 0) {
            return { tables: [] };
        }

        // Calculate table dimensions first
        const tablesWithDimensions = schema.tables.map(table => ({
            ...table,
            width: this.calculateTableWidth(table),
            height: this.calculateTableHeight(table)
        }));

        // Apply layout algorithm
        const positionedTables = this.applyForceDirectedLayout(tablesWithDimensions, schema.relationships || []);

        return {
            tables: positionedTables.map(table => ({
                name: table.name,
                x: table.x,
                y: table.y,
                width: table.width,
                height: table.height,
                zIndex: 0
            }))
        };
    }

    /**
     * Calculate the width needed for a table
     * @param {Object} table - Table object
     * @returns {number} Table width
     */
    calculateTableWidth(table) {
        const minWidth = 150;
        const maxWidth = 350;
        
        // Calculate based on content
        let maxColumnNameLength = 0;
        let maxColumnTypeLength = 0;

        table.columns.forEach(column => {
            maxColumnNameLength = Math.max(maxColumnNameLength, column.name.length);
            maxColumnTypeLength = Math.max(maxColumnTypeLength, column.type.length);
        });

        // Estimate width based on character count (rough approximation)
        const estimatedWidth = Math.max(
            table.name.length * 8 + 40, // Table name width
            (maxColumnNameLength + maxColumnTypeLength) * 7 + 60 // Column content width
        );

        return Math.max(minWidth, Math.min(maxWidth, estimatedWidth));
    }

    /**
     * Calculate the height needed for a table
     * @param {Object} table - Table object
     * @returns {number} Table height
     */
    calculateTableHeight(table) {
        const headerHeight = 30;
        const rowHeight = 25;
        const padding = 10;

        return headerHeight + (table.columns.length * rowHeight) + padding;
    }

    /**
     * Apply force-directed layout algorithm
     * @param {Array} tables - Tables with dimensions
     * @param {Array} relationships - Relationships between tables
     * @returns {Array} Tables with positions
     */
    applyForceDirectedLayout(tables, relationships) {
        // For CSV data with many tables, use a simpler grid layout first
        if (tables.length > 5) {
            return this.applyGridLayout(tables);
        }

        const iterations = 100;
        const coolingFactor = 0.95;
        let temperature = 100;

        // Initialize positions randomly or in a grid
        this.initializePositions(tables);

        // Build adjacency list for connected tables
        const connections = this.buildConnectionGraph(tables, relationships);

        // Run force-directed algorithm
        for (let i = 0; i < iterations; i++) {
            this.applyForces(tables, connections, temperature);
            temperature *= coolingFactor;
        }

        // Align to grid and prevent overlaps
        this.alignToGrid(tables);
        this.resolveOverlaps(tables);

        // Center the layout
        this.centerLayout(tables);

        return tables;
    }

    /**
     * Apply simple grid layout for many tables
     * @param {Array} tables - Tables to layout
     * @returns {Array} Tables with positions
     */
    applyGridLayout(tables) {
        const cols = Math.ceil(Math.sqrt(tables.length));
        const spacing = 300; // Increased spacing between tables
        let col = 0;
        let row = 0;

        tables.forEach((table, index) => {
            table.x = col * spacing + 50;
            table.y = row * spacing + 50;
            
            col++;
            if (col >= cols) {
                col = 0;
                row++;
            }
        });

        return tables;
    }

    /**
     * Initialize table positions
     * @param {Array} tables - Tables to position
     */
    initializePositions(tables) {
        const gridCols = Math.ceil(Math.sqrt(tables.length));
        const spacing = 300;

        tables.forEach((table, index) => {
            const row = Math.floor(index / gridCols);
            const col = index % gridCols;
            
            table.x = col * spacing + Math.random() * 100 - 50;
            table.y = row * spacing + Math.random() * 100 - 50;
        });
    }

    /**
     * Build connection graph from relationships
     * @param {Array} tables - Tables
     * @param {Array} relationships - Relationships
     * @returns {Map} Connection graph
     */
    buildConnectionGraph(tables, relationships) {
        const connections = new Map();
        
        // Initialize connections map
        tables.forEach(table => {
            connections.set(table.name, new Set());
        });

        // Add relationships
        relationships.forEach(rel => {
            if (connections.has(rel.sourceTable) && connections.has(rel.targetTable)) {
                connections.get(rel.sourceTable).add(rel.targetTable);
                connections.get(rel.targetTable).add(rel.sourceTable);
            }
        });

        return connections;
    }

    /**
     * Apply forces to tables
     * @param {Array} tables - Tables
     * @param {Map} connections - Connection graph
     * @param {number} temperature - Current temperature
     */
    applyForces(tables, connections, temperature) {
        const forces = new Map();
        
        // Initialize forces
        tables.forEach(table => {
            forces.set(table.name, { x: 0, y: 0 });
        });

        // Repulsive forces (all pairs)
        for (let i = 0; i < tables.length; i++) {
            for (let j = i + 1; j < tables.length; j++) {
                const table1 = tables[i];
                const table2 = tables[j];
                
                const dx = table1.x - table2.x;
                const dy = table1.y - table2.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const repulsiveForce = 5000 / (distance * distance);
                const fx = (dx / distance) * repulsiveForce;
                const fy = (dy / distance) * repulsiveForce;
                
                forces.get(table1.name).x += fx;
                forces.get(table1.name).y += fy;
                forces.get(table2.name).x -= fx;
                forces.get(table2.name).y -= fy;
            }
        }

        // Attractive forces (connected pairs)
        tables.forEach(table1 => {
            const connected = connections.get(table1.name) || new Set();
            
            connected.forEach(table2Name => {
                const table2 = tables.find(t => t.name === table2Name);
                if (!table2) return;

                const dx = table2.x - table1.x;
                const dy = table2.y - table1.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const attractiveForce = distance * distance / 1000;
                const fx = (dx / distance) * attractiveForce;
                const fy = (dy / distance) * attractiveForce;
                
                forces.get(table1.name).x += fx;
                forces.get(table1.name).y += fy;
            });
        });

        // Apply forces with temperature dampening
        tables.forEach(table => {
            const force = forces.get(table.name);
            const displacement = Math.sqrt(force.x * force.x + force.y * force.y) || 1;
            
            const maxDisplacement = Math.min(displacement, temperature);
            
            table.x += (force.x / displacement) * maxDisplacement;
            table.y += (force.y / displacement) * maxDisplacement;
        });
    }

    /**
     * Align tables to grid
     * @param {Array} tables - Tables to align
     */
    alignToGrid(tables) {
        tables.forEach(table => {
            table.x = Math.round(table.x / this.gridSize) * this.gridSize;
            table.y = Math.round(table.y / this.gridSize) * this.gridSize;
        });
    }

    /**
     * Resolve overlapping tables
     * @param {Array} tables - Tables to check
     */
    resolveOverlaps(tables) {
        const maxIterations = 10;
        
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            let hasOverlap = false;
            
            for (let i = 0; i < tables.length; i++) {
                for (let j = i + 1; j < tables.length; j++) {
                    const table1 = tables[i];
                    const table2 = tables[j];
                    
                    if (this.tablesOverlap(table1, table2)) {
                        this.separateTables(table1, table2);
                        hasOverlap = true;
                    }
                }
            }
            
            if (!hasOverlap) break;
        }
    }

    /**
     * Check if two tables overlap
     * @param {Object} table1 - First table
     * @param {Object} table2 - Second table
     * @returns {boolean} True if overlapping
     */
    tablesOverlap(table1, table2) {
        const margin = this.minSpacing;
        
        return !(table1.x + table1.width + margin < table2.x || 
                table2.x + table2.width + margin < table1.x || 
                table1.y + table1.height + margin < table2.y || 
                table2.y + table2.height + margin < table1.y);
    }

    /**
     * Separate overlapping tables
     * @param {Object} table1 - First table
     * @param {Object} table2 - Second table
     */
    separateTables(table1, table2) {
        const centerX1 = table1.x + table1.width / 2;
        const centerY1 = table1.y + table1.height / 2;
        const centerX2 = table2.x + table2.width / 2;
        const centerY2 = table2.y + table2.height / 2;
        
        const dx = centerX2 - centerX1;
        const dy = centerY2 - centerY1;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const minDistance = (table1.width + table2.width) / 2 + this.minSpacing;
        const overlap = minDistance - distance;
        
        if (overlap > 0) {
            const moveX = (dx / distance) * (overlap / 2);
            const moveY = (dy / distance) * (overlap / 2);
            
            table1.x -= moveX;
            table1.y -= moveY;
            table2.x += moveX;
            table2.y += moveY;
        }
    }

    /**
     * Center the entire layout
     * @param {Array} tables - Tables to center
     */
    centerLayout(tables) {
        if (tables.length === 0) return;

        // Find bounds
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        tables.forEach(table => {
            minX = Math.min(minX, table.x);
            minY = Math.min(minY, table.y);
            maxX = Math.max(maxX, table.x + table.width);
            maxY = Math.max(maxY, table.y + table.height);
        });

        // Calculate offset to center at origin
        const offsetX = -(minX + maxX) / 2;
        const offsetY = -(minY + maxY) / 2;

        // Apply offset
        tables.forEach(table => {
            table.x += offsetX;
            table.y += offsetY;
        });
    }

    /**
     * Apply circular layout
     * @param {Array} tables - Tables to arrange
     * @returns {Array} Tables with circular positions
     */
    applyCircularLayout(tables) {
        if (tables.length === 0) return tables;
        
        const radius = Math.max(200, tables.length * 30);
        const angleStep = (2 * Math.PI) / tables.length;

        tables.forEach((table, index) => {
            const angle = index * angleStep;
            table.x = Math.cos(angle) * radius;
            table.y = Math.sin(angle) * radius;
        });

        return tables;
    }

    /**
     * Apply hierarchical layout
     * @param {Array} tables - Tables to arrange
     * @param {Array} relationships - Relationships
     * @returns {Array} Tables with hierarchical positions
     */
    applyHierarchicalLayout(tables, relationships) {
        // Find root tables (tables with no incoming relationships)
        const incomingCount = new Map();
        tables.forEach(table => incomingCount.set(table.name, 0));

        relationships.forEach(rel => {
            incomingCount.set(rel.targetTable, (incomingCount.get(rel.targetTable) || 0) + 1);
        });

        const roots = tables.filter(table => incomingCount.get(table.name) === 0);
        
        if (roots.length === 0) {
            // No clear hierarchy, fall back to grid layout
            return this.applyGridLayout(tables);
        }

        // Assign levels using BFS
        const levels = new Map();
        const queue = [...roots];
        
        roots.forEach(root => levels.set(root.name, 0));

        while (queue.length > 0) {
            const current = queue.shift();
            const currentLevel = levels.get(current.name);

            relationships
                .filter(rel => rel.sourceTable === current.name)
                .forEach(rel => {
                    if (!levels.has(rel.targetTable)) {
                        levels.set(rel.targetTable, currentLevel + 1);
                        queue.push(tables.find(t => t.name === rel.targetTable));
                    }
                });
        }

        // Position tables by level
        const levelGroups = new Map();
        tables.forEach(table => {
            const level = levels.get(table.name) || 0;
            if (!levelGroups.has(level)) {
                levelGroups.set(level, []);
            }
            levelGroups.get(level).push(table);
        });

        const levelHeight = 150;
        const tableSpacing = 250;

        for (const [level, tablesInLevel] of levelGroups.entries()) {
            const startX = -(tablesInLevel.length - 1) * tableSpacing / 2;
            
            tablesInLevel.forEach((table, index) => {
                table.x = startX + index * tableSpacing;
                table.y = level * levelHeight;
            });
        }

        return tables;
    }

    /**
     * Apply simple grid layout
     * @param {Array} tables - Tables to arrange
     * @returns {Array} Tables with grid positions
     */
    applyGridLayout(tables) {
        const cols = Math.ceil(Math.sqrt(tables.length));
        const spacing = 300;

        tables.forEach((table, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            
            table.x = col * spacing;
            table.y = row * spacing;
        });

        this.centerLayout(tables);
        return tables;
    }

    /**
     * Optimize layout to minimize connection crossings
     * @param {Array} tables - Tables with positions
     * @param {Array} relationships - Relationships
     * @returns {Array} Optimized tables
     */
    optimizeForConnections(tables, relationships) {
        // This is a simplified optimization
        // In a full implementation, we would use more sophisticated algorithms
        
        const iterations = 10;
        
        for (let i = 0; i < iterations; i++) {
            let improved = false;
            
            // Try swapping adjacent tables to reduce crossings
            for (let j = 0; j < tables.length - 1; j++) {
                const crossingsBefore = this.countCrossings(tables, relationships);
                
                // Swap positions
                const tempX = tables[j].x;
                const tempY = tables[j].y;
                tables[j].x = tables[j + 1].x;
                tables[j].y = tables[j + 1].y;
                tables[j + 1].x = tempX;
                tables[j + 1].y = tempY;
                
                const crossingsAfter = this.countCrossings(tables, relationships);
                
                if (crossingsAfter < crossingsBefore) {
                    improved = true;
                } else {
                    // Revert swap
                    tables[j + 1].x = tables[j].x;
                    tables[j + 1].y = tables[j].y;
                    tables[j].x = tempX;
                    tables[j].y = tempY;
                }
            }
            
            if (!improved) break;
        }
        
        return tables;
    }

    /**
     * Count connection crossings (simplified)
     * @param {Array} tables - Tables
     * @param {Array} relationships - Relationships
     * @returns {number} Number of crossings
     */
    countCrossings(tables, relationships) {
        // Simplified crossing count
        // In a full implementation, we would check actual line intersections
        let crossings = 0;
        
        for (let i = 0; i < relationships.length; i++) {
            for (let j = i + 1; j < relationships.length; j++) {
                const rel1 = relationships[i];
                const rel2 = relationships[j];
                
                const table1a = tables.find(t => t.name === rel1.sourceTable);
                const table1b = tables.find(t => t.name === rel1.targetTable);
                const table2a = tables.find(t => t.name === rel2.sourceTable);
                const table2b = tables.find(t => t.name === rel2.targetTable);
                
                if (table1a && table1b && table2a && table2b) {
                    if (this.linesIntersect(table1a, table1b, table2a, table2b)) {
                        crossings++;
                    }
                }
            }
        }
        
        return crossings;
    }

    /**
     * Check if two lines intersect (simplified)
     * @param {Object} p1 - First point of first line
     * @param {Object} p2 - Second point of first line
     * @param {Object} p3 - First point of second line
     * @param {Object} p4 - Second point of second line
     * @returns {boolean} True if lines intersect
     */
    linesIntersect(p1, p2, p3, p4) {
        // Simplified intersection test using bounding boxes
        const minX1 = Math.min(p1.x, p2.x);
        const maxX1 = Math.max(p1.x, p2.x);
        const minY1 = Math.min(p1.y, p2.y);
        const maxY1 = Math.max(p1.y, p2.y);
        
        const minX2 = Math.min(p3.x, p4.x);
        const maxX2 = Math.max(p3.x, p4.x);
        const minY2 = Math.min(p3.y, p4.y);
        const maxY2 = Math.max(p3.y, p4.y);
        
        return !(maxX1 < minX2 || maxX2 < minX1 || maxY1 < minY2 || maxY2 < minY1);
    }
}