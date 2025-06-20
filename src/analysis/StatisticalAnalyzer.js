/**
 * Statistical Analysis Manager
 * Provides comprehensive metrics and insights for database schema analysis
 */
export class StatisticalAnalyzer {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.schemaData = null;
        this.analysisResults = null;
        this.groupings = new Map();
        this.colorScheme = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
        ];
        
        this.initialize();
    }

    /**
     * Initialize the statistical analyzer
     */
    initialize() {
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (this.eventBus) {
            this.eventBus.on('schema:loaded', (data) => {
                this.analyzeSchema(data);
            });
            
            this.eventBus.on('analysis:refresh', () => {
                if (this.schemaData) {
                    this.analyzeSchema(this.schemaData);
                }
            });
        }
    }

    /**
     * Analyze the complete schema and generate statistics
     */
    analyzeSchema(schemaData) {
        this.schemaData = schemaData;
        
        const analysis = {
            // Basic Statistics
            basic: this.calculateBasicStats(schemaData),
            
            // Relationship Analysis
            relationships: this.analyzeRelationships(schemaData),
            
            // Table Analysis
            tables: this.analyzeTableMetrics(schemaData),
            
            // Column Analysis
            columns: this.analyzeColumnMetrics(schemaData),
            
            // Connectivity Analysis
            connectivity: this.analyzeConnectivity(schemaData),
            
            // Grouping Analysis
            groups: this.identifyTableGroups(schemaData),
            
            // Quality Metrics
            quality: this.assessSchemaQuality(schemaData),
            
            // Complexity Metrics
            complexity: this.calculateComplexityMetrics(schemaData),
            
            // Timestamp
            analyzedAt: new Date().toISOString()
        };
        
        this.analysisResults = analysis;
        this.emitAnalysisComplete(analysis);
        
        return analysis;
    }

    /**
     * Calculate basic schema statistics
     */
    calculateBasicStats(schemaData) {
        const tables = schemaData.tables || [];
        const relationships = schemaData.relationships || [];
        
        let totalColumns = 0;
        let totalPrimaryKeys = 0;
        let totalForeignKeys = 0;
        
        tables.forEach(table => {
            totalColumns += table.columns ? table.columns.length : 0;
            totalPrimaryKeys += table.columns ? table.columns.filter(col => col.isPrimary).length : 0;
            totalForeignKeys += table.columns ? table.columns.filter(col => col.isForeign).length : 0;
        });
        
        return {
            totalTables: tables.length,
            totalColumns: totalColumns,
            totalRelationships: relationships.length,
            totalPrimaryKeys: totalPrimaryKeys,
            totalForeignKeys: totalForeignKeys,
            avgColumnsPerTable: totalColumns / Math.max(tables.length, 1),
            avgRelationshipsPerTable: (relationships.length * 2) / Math.max(tables.length, 1)
        };
    }

    /**
     * Analyze relationship patterns and types
     */
    analyzeRelationships(schemaData) {
        const relationships = schemaData.relationships || [];
        const relationshipTypes = {
            'one-to-one': 0,
            'one-to-many': 0,
            'many-to-one': 0,
            'many-to-many': 0,
            'self-referencing': 0
        };
        
        const tableConnections = new Map();
        const relationshipLengths = [];
        
        relationships.forEach(rel => {
            // Count relationship types
            const type = this.determineRelationshipType(rel);
            if (relationshipTypes.hasOwnProperty(type)) {
                relationshipTypes[type]++;
            }
            
            // Track table connections
            const fromTable = rel.fromTable;
            const toTable = rel.toTable;
            
            if (!tableConnections.has(fromTable)) {
                tableConnections.set(fromTable, new Set());
            }
            if (!tableConnections.has(toTable)) {
                tableConnections.set(toTable, new Set());
            }
            
            tableConnections.get(fromTable).add(toTable);
            tableConnections.get(toTable).add(fromTable);
            
            // Check for self-referencing
            if (fromTable === toTable) {
                relationshipTypes['self-referencing']++;
            }
            
            // Calculate relationship complexity (could be enhanced with actual positions)
            relationshipLengths.push(this.calculateRelationshipComplexity(rel));
        });
        
        return {
            types: relationshipTypes,
            totalConnections: relationships.length,
            uniqueTablePairs: this.countUniqueTablePairs(relationships),
            averageConnectionsPerTable: this.calculateAverageConnections(tableConnections),
            mostConnectedTables: this.findMostConnectedTables(tableConnections, 5),
            relationshipComplexity: {
                average: relationshipLengths.reduce((a, b) => a + b, 0) / Math.max(relationshipLengths.length, 1),
                max: Math.max(...relationshipLengths, 0),
                min: Math.min(...relationshipLengths, 0)
            }
        };
    }

    /**
     * Analyze individual table metrics
     */
    analyzeTableMetrics(schemaData) {
        const tables = schemaData.tables || [];
        const relationships = schemaData.relationships || [];
        
        const tableMetrics = tables.map(table => {
            const tableRelationships = relationships.filter(rel => 
                rel.fromTable === table.name || rel.toTable === table.name
            );
            
            const incomingRels = relationships.filter(rel => rel.toTable === table.name);
            const outgoingRels = relationships.filter(rel => rel.fromTable === table.name);
            
            const columns = table.columns || [];
            const primaryKeys = columns.filter(col => col.isPrimary);
            const foreignKeys = columns.filter(col => col.isForeign);
            const requiredColumns = columns.filter(col => col.required || col.notNull);
            
            return {
                name: table.name,
                columnCount: columns.length,
                primaryKeyCount: primaryKeys.length,
                foreignKeyCount: foreignKeys.length,
                requiredColumnCount: requiredColumns.length,
                relationshipCount: tableRelationships.length,
                incomingRelationshipCount: incomingRels.length,
                outgoingRelationshipCount: outgoingRels.length,
                complexity: this.calculateTableComplexity(table, tableRelationships),
                dataTypes: this.analyzeTableDataTypes(columns),
                hasCompositeKey: primaryKeys.length > 1,
                isJunctionTable: this.isJunctionTable(table, tableRelationships)
            };
        });
        
        // Sort and categorize tables
        const sortedByComplexity = [...tableMetrics].sort((a, b) => b.complexity - a.complexity);
        const sortedByRelationships = [...tableMetrics].sort((a, b) => b.relationshipCount - a.relationshipCount);
        const sortedByColumns = [...tableMetrics].sort((a, b) => b.columnCount - a.columnCount);
        
        return {
            all: tableMetrics,
            tablesWithoutRelationships: tableMetrics.filter(t => t.relationshipCount === 0),
            tablesWithMostForeignKeys: sortedByRelationships.slice(0, 10),
            mostComplexTables: sortedByComplexity.slice(0, 10),
            largestTables: sortedByColumns.slice(0, 10),
            junctionTables: tableMetrics.filter(t => t.isJunctionTable),
            tablesWithCompositeKeys: tableMetrics.filter(t => t.hasCompositeKey),
            averageComplexity: tableMetrics.reduce((sum, t) => sum + t.complexity, 0) / Math.max(tableMetrics.length, 1)
        };
    }

    /**
     * Analyze column patterns and distributions
     */
    analyzeColumnMetrics(schemaData) {
        const tables = schemaData.tables || [];
        let allColumns = [];
        
        tables.forEach(table => {
            if (table.columns) {
                allColumns = allColumns.concat(table.columns.map(col => ({
                    ...col,
                    tableName: table.name
                })));
            }
        });
        
        const dataTypeDistribution = {};
        const columnNamePatterns = {};
        const constraintAnalysis = {
            primaryKeys: 0,
            foreignKeys: 0,
            requiredColumns: 0,
            uniqueColumns: 0,
            indexedColumns: 0
        };
        
        allColumns.forEach(column => {
            // Data type distribution
            const dataType = column.type || 'unknown';
            dataTypeDistribution[dataType] = (dataTypeDistribution[dataType] || 0) + 1;
            
            // Column name patterns
            const namePattern = this.identifyColumnNamePattern(column.name);
            columnNamePatterns[namePattern] = (columnNamePatterns[namePattern] || 0) + 1;
            
            // Constraint analysis
            if (column.isPrimary) constraintAnalysis.primaryKeys++;
            if (column.isForeign) constraintAnalysis.foreignKeys++;
            if (column.required || column.notNull) constraintAnalysis.requiredColumns++;
            if (column.unique) constraintAnalysis.uniqueColumns++;
            if (column.indexed) constraintAnalysis.indexedColumns++;
        });
        
        return {
            totalColumns: allColumns.length,
            dataTypeDistribution: dataTypeDistribution,
            columnNamePatterns: columnNamePatterns,
            constraints: constraintAnalysis,
            mostCommonDataType: Object.keys(dataTypeDistribution).reduce((a, b) => 
                dataTypeDistribution[a] > dataTypeDistribution[b] ? a : b, 'unknown'),
            averageColumnsPerTable: allColumns.length / Math.max(tables.length, 1),
            columnsWithConstraints: allColumns.filter(col => 
                col.isPrimary || col.isForeign || col.required || col.unique).length
        };
    }

    /**
     * Analyze connectivity patterns and network structure
     */
    analyzeConnectivity(schemaData) {
        const tables = schemaData.tables || [];
        const relationships = schemaData.relationships || [];
        
        // Build adjacency graph
        const graph = new Map();
        tables.forEach(table => {
            graph.set(table.name, new Set());
        });
        
        relationships.forEach(rel => {
            if (graph.has(rel.fromTable) && graph.has(rel.toTable)) {
                graph.get(rel.fromTable).add(rel.toTable);
                graph.get(rel.toTable).add(rel.fromTable);
            }
        });
        
        // Calculate connectivity metrics
        const connectivityMetrics = {
            connectedComponents: this.findConnectedComponents(graph),
            centralityScores: this.calculateCentralityScores(graph),
            clusteringCoefficient: this.calculateClusteringCoefficient(graph),
            networkDensity: this.calculateNetworkDensity(graph),
            shortestPaths: this.calculateShortestPaths(graph),
            hubTables: this.identifyHubTables(graph),
            isolatedTables: this.findIsolatedTables(graph)
        };
        
        return connectivityMetrics;
    }

    /**
     * Identify logical table groups based on relationships
     */
    identifyTableGroups(schemaData) {
        const tables = schemaData.tables || [];
        const relationships = schemaData.relationships || [];
        
        // Build relationship graph
        const graph = new Map();
        tables.forEach(table => {
            graph.set(table.name, new Set());
        });
        
        relationships.forEach(rel => {
            if (graph.has(rel.fromTable) && graph.has(rel.toTable)) {
                graph.get(rel.fromTable).add(rel.toTable);
                graph.get(rel.toTable).add(rel.fromTable);
            }
        });
        
        // Find connected components (groups)
        const visited = new Set();
        const groups = [];
        let groupId = 0;
        
        for (const tableName of graph.keys()) {
            if (!visited.has(tableName)) {
                const group = this.exploreGroup(graph, tableName, visited);
                if (group.length > 0) {
                    groups.push({
                        id: groupId++,
                        tables: group,
                        size: group.length,
                        relationships: this.countGroupRelationships(group, relationships),
                        color: this.colorScheme[groupId % this.colorScheme.length],
                        name: this.generateGroupName(group, relationships)
                    });
                }
            }
        }
        
        // Store groupings for later use
        this.groupings.clear();
        groups.forEach(group => {
            group.tables.forEach(tableName => {
                this.groupings.set(tableName, group);
            });
        });
        
        return {
            groups: groups,
            totalGroups: groups.length,
            largestGroup: groups.reduce((max, group) => 
                group.size > max.size ? group : max, { size: 0 }),
            averageGroupSize: groups.reduce((sum, group) => sum + group.size, 0) / Math.max(groups.length, 1),
            isolatedTables: groups.filter(group => group.size === 1).length
        };
    }

    /**
     * Assess overall schema quality and design patterns
     */
    assessSchemaQuality(schemaData) {
        const tables = schemaData.tables || [];
        const relationships = schemaData.relationships || [];
        
        const qualityMetrics = {
            namingConsistency: this.assessNamingConsistency(tables),
            normalizationLevel: this.assessNormalization(tables, relationships),
            relationshipIntegrity: this.assessRelationshipIntegrity(relationships),
            indexingCoverage: this.assessIndexingCoverage(tables),
            constraintCoverage: this.assessConstraintCoverage(tables),
            designPatterns: this.identifyDesignPatterns(tables, relationships),
            potentialIssues: this.identifyPotentialIssues(tables, relationships)
        };
        
        // Calculate overall quality score (0-100)
        const qualityScore = this.calculateOverallQualityScore(qualityMetrics);
        
        return {
            ...qualityMetrics,
            overallScore: qualityScore,
            grade: this.assignQualityGrade(qualityScore),
            recommendations: this.generateRecommendations(qualityMetrics)
        };
    }

    /**
     * Calculate complexity metrics for the schema
     */
    calculateComplexityMetrics(schemaData) {
        const tables = schemaData.tables || [];
        const relationships = schemaData.relationships || [];
        
        // Cyclomatic complexity (based on relationship cycles)
        const cyclomaticComplexity = this.calculateCyclomaticComplexity(tables, relationships);
        
        // Structural complexity
        const structuralComplexity = this.calculateStructuralComplexity(tables, relationships);
        
        // Cognitive complexity (how hard it is to understand)
        const cognitiveComplexity = this.calculateCognitiveComplexity(tables, relationships);
        
        return {
            cyclomatic: cyclomaticComplexity,
            structural: structuralComplexity,
            cognitive: cognitiveComplexity,
            overall: (cyclomaticComplexity + structuralComplexity + cognitiveComplexity) / 3,
            complexity_class: this.classifyComplexity(cyclomaticComplexity, structuralComplexity, cognitiveComplexity)
        };
    }

    /**
     * Helper method to determine relationship type
     */
    determineRelationshipType(relationship) {
        const fromCard = relationship.fromCardinality || '1';
        const toCard = relationship.toCardinality || '1';
        
        if (fromCard === '1' && toCard === '1') return 'one-to-one';
        if (fromCard === '1' && (toCard === 'many' || toCard === '*')) return 'one-to-many';
        if ((fromCard === 'many' || fromCard === '*') && toCard === '1') return 'many-to-one';
        if ((fromCard === 'many' || fromCard === '*') && (toCard === 'many' || toCard === '*')) return 'many-to-many';
        
        return 'unknown';
    }

    /**
     * Calculate relationship complexity score
     */
    calculateRelationshipComplexity(relationship) {
        let complexity = 1; // Base complexity
        
        // Add complexity for many-to-many relationships
        if (this.determineRelationshipType(relationship) === 'many-to-many') {
            complexity += 2;
        }
        
        // Add complexity for self-referencing relationships
        if (relationship.fromTable === relationship.toTable) {
            complexity += 1;
        }
        
        // Add complexity for composite foreign keys
        if (relationship.fromColumns && relationship.fromColumns.length > 1) {
            complexity += relationship.fromColumns.length - 1;
        }
        
        return complexity;
    }

    /**
     * Calculate table complexity score
     */
    calculateTableComplexity(table, relationships) {
        const columns = table.columns || [];
        let complexity = 0;
        
        // Base complexity from column count
        complexity += columns.length * 0.5;
        
        // Add complexity for primary keys
        complexity += columns.filter(col => col.isPrimary).length * 1;
        
        // Add complexity for foreign keys
        complexity += columns.filter(col => col.isForeign).length * 1.5;
        
        // Add complexity for relationships
        complexity += relationships.length * 2;
        
        // Add complexity for constraints
        complexity += columns.filter(col => col.unique || col.check).length * 0.5;
        
        return Math.round(complexity * 10) / 10;
    }

    /**
     * Analyze data types in a table
     */
    analyzeTableDataTypes(columns) {
        const types = {};
        columns.forEach(column => {
            const type = column.type || 'unknown';
            types[type] = (types[type] || 0) + 1;
        });
        return types;
    }

    /**
     * Check if table is a junction table
     */
    isJunctionTable(table, relationships) {
        const columns = table.columns || [];
        const foreignKeys = columns.filter(col => col.isForeign);
        
        // Junction table typically has mostly foreign keys and facilitates many-to-many relationships
        return foreignKeys.length >= 2 && 
               foreignKeys.length / columns.length >= 0.5 &&
               relationships.length >= 2;
    }

    /**
     * Identify column name pattern
     */
    identifyColumnNamePattern(columnName) {
        if (!columnName) return 'unknown';
        
        const name = columnName.toLowerCase();
        
        if (name.endsWith('_id') || name.endsWith('id')) return 'id_pattern';
        if (name.startsWith('is_') || name.startsWith('has_')) return 'boolean_pattern';
        if (name.includes('_at') || name.includes('_date') || name.includes('_time')) return 'timestamp_pattern';
        if (name.includes('_count') || name.includes('_number') || name.includes('_qty')) return 'numeric_pattern';
        if (name.includes('_name') || name.includes('_title') || name.includes('_desc')) return 'text_pattern';
        
        return 'other';
    }

    /**
     * Find connected components in graph
     */
    findConnectedComponents(graph) {
        const visited = new Set();
        const components = [];
        
        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                const component = [];
                this.dfs(graph, node, visited, component);
                components.push(component);
            }
        }
        
        return components;
    }

    /**
     * Depth-first search helper
     */
    dfs(graph, node, visited, component) {
        visited.add(node);
        component.push(node);
        
        if (graph.has(node)) {
            for (const neighbor of graph.get(node)) {
                if (!visited.has(neighbor)) {
                    this.dfs(graph, neighbor, visited, component);
                }
            }
        }
    }

    /**
     * Calculate centrality scores for nodes
     */
    calculateCentralityScores(graph) {
        const scores = new Map();
        
        for (const node of graph.keys()) {
            const connections = graph.get(node).size;
            scores.set(node, connections);
        }
        
        return Object.fromEntries(scores);
    }

    /**
     * Calculate clustering coefficient
     */
    calculateClusteringCoefficient(graph) {
        let totalCoefficient = 0;
        let nodeCount = 0;
        
        for (const [node, neighbors] of graph.entries()) {
            if (neighbors.size < 2) continue;
            
            let connectedPairs = 0;
            const neighborsArray = Array.from(neighbors);
            
            for (let i = 0; i < neighborsArray.length; i++) {
                for (let j = i + 1; j < neighborsArray.length; j++) {
                    if (graph.get(neighborsArray[i])?.has(neighborsArray[j])) {
                        connectedPairs++;
                    }
                }
            }
            
            const possiblePairs = (neighbors.size * (neighbors.size - 1)) / 2;
            totalCoefficient += connectedPairs / possiblePairs;
            nodeCount++;
        }
        
        return nodeCount > 0 ? totalCoefficient / nodeCount : 0;
    }

    /**
     * Calculate network density
     */
    calculateNetworkDensity(graph) {
        const nodeCount = graph.size;
        if (nodeCount < 2) return 0;
        
        let edgeCount = 0;
        for (const neighbors of graph.values()) {
            edgeCount += neighbors.size;
        }
        edgeCount /= 2; // Each edge is counted twice
        
        const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2;
        return edgeCount / maxPossibleEdges;
    }

    /**
     * Calculate shortest paths between all pairs
     */
    calculateShortestPaths(graph) {
        const paths = new Map();
        const nodes = Array.from(graph.keys());
        
        // Initialize distances
        for (const from of nodes) {
            paths.set(from, new Map());
            for (const to of nodes) {
                if (from === to) {
                    paths.get(from).set(to, 0);
                } else if (graph.get(from).has(to)) {
                    paths.get(from).set(to, 1);
                } else {
                    paths.get(from).set(to, Infinity);
                }
            }
        }
        
        // Floyd-Warshall algorithm
        for (const k of nodes) {
            for (const i of nodes) {
                for (const j of nodes) {
                    const currentDist = paths.get(i).get(j);
                    const newDist = paths.get(i).get(k) + paths.get(k).get(j);
                    if (newDist < currentDist) {
                        paths.get(i).set(j, newDist);
                    }
                }
            }
        }
        
        return Object.fromEntries(
            Array.from(paths.entries()).map(([from, toMap]) => [
                from,
                Object.fromEntries(toMap)
            ])
        );
    }

    /**
     * Identify hub tables (highly connected)
     */
    identifyHubTables(graph) {
        const connectionCounts = [];
        for (const [table, connections] of graph.entries()) {
            connectionCounts.push({ table, connections: connections.size });
        }
        
        connectionCounts.sort((a, b) => b.connections - a.connections);
        
        // Return top 20% as hub tables
        const hubCount = Math.max(1, Math.ceil(connectionCounts.length * 0.2));
        return connectionCounts.slice(0, hubCount);
    }

    /**
     * Find isolated tables (no relationships)
     */
    findIsolatedTables(graph) {
        const isolated = [];
        for (const [table, connections] of graph.entries()) {
            if (connections.size === 0) {
                isolated.push(table);
            }
        }
        return isolated;
    }

    /**
     * Explore group using DFS
     */
    exploreGroup(graph, startNode, visited) {
        const group = [];
        const stack = [startNode];
        
        while (stack.length > 0) {
            const node = stack.pop();
            if (!visited.has(node)) {
                visited.add(node);
                group.push(node);
                
                if (graph.has(node)) {
                    for (const neighbor of graph.get(node)) {
                        if (!visited.has(neighbor)) {
                            stack.push(neighbor);
                        }
                    }
                }
            }
        }
        
        return group;
    }

    /**
     * Count relationships within a group
     */
    countGroupRelationships(tableNames, relationships) {
        return relationships.filter(rel => 
            tableNames.includes(rel.fromTable) && tableNames.includes(rel.toTable)
        ).length;
    }

    /**
     * Generate a descriptive name for a table group
     */
    generateGroupName(tableNames, relationships) {
        if (tableNames.length === 1) {
            return `Isolated: ${tableNames[0]}`;
        }
        
        // Try to find common prefixes or themes
        const commonPrefixes = this.findCommonPrefixes(tableNames);
        if (commonPrefixes.length > 0) {
            return `${commonPrefixes[0]} Module`;
        }
        
        // Use the most connected table as the group name
        const connectionCounts = new Map();
        relationships.forEach(rel => {
            if (tableNames.includes(rel.fromTable)) {
                connectionCounts.set(rel.fromTable, (connectionCounts.get(rel.fromTable) || 0) + 1);
            }
            if (tableNames.includes(rel.toTable)) {
                connectionCounts.set(rel.toTable, (connectionCounts.get(rel.toTable) || 0) + 1);
            }
        });
        
        let mostConnected = tableNames[0];
        let maxConnections = 0;
        for (const [table, count] of connectionCounts.entries()) {
            if (count > maxConnections) {
                maxConnections = count;
                mostConnected = table;
            }
        }
        
        return `${mostConnected} Group`;
    }

    /**
     * Find common prefixes in table names
     */
    findCommonPrefixes(tableNames) {
        if (tableNames.length < 2) return [];
        
        const prefixes = new Map();
        
        tableNames.forEach(name => {
            const parts = name.toLowerCase().split(/[_-]/);
            if (parts.length > 1) {
                const prefix = parts[0];
                prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
            }
        });
        
        return Array.from(prefixes.entries())
            .filter(([prefix, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .map(([prefix]) => prefix);
    }

    /**
     * Assess naming consistency
     */
    assessNamingConsistency(tables) {
        const conventions = {
            tableNaming: this.analyzeTableNaming(tables),
            columnNaming: this.analyzeColumnNaming(tables),
            consistencyScore: 0
        };
        
        // Calculate overall consistency score
        conventions.consistencyScore = (
            conventions.tableNaming.consistencyScore + 
            conventions.columnNaming.consistencyScore
        ) / 2;
        
        return conventions;
    }

    /**
     * Analyze table naming patterns
     */
    analyzeTableNaming(tables) {
        const patterns = {
            camelCase: 0,
            snake_case: 0,
            PascalCase: 0,
            lowercase: 0,
            mixed: 0
        };
        
        tables.forEach(table => {
            const name = table.name;
            if (/^[a-z]+([A-Z][a-z]*)*$/.test(name)) patterns.camelCase++;
            else if (/^[a-z]+(_[a-z]+)*$/.test(name)) patterns.snake_case++;
            else if (/^[A-Z][a-z]*([A-Z][a-z]*)*$/.test(name)) patterns.PascalCase++;
            else if (/^[a-z]+$/.test(name)) patterns.lowercase++;
            else patterns.mixed++;
        });
        
        const total = tables.length;
        const dominant = Object.keys(patterns).reduce((a, b) => 
            patterns[a] > patterns[b] ? a : b);
        
        return {
            patterns,
            dominantPattern: dominant,
            consistencyScore: total > 0 ? patterns[dominant] / total : 0
        };
    }

    /**
     * Analyze column naming patterns
     */
    analyzeColumnNaming(tables) {
        const patterns = {
            camelCase: 0,
            snake_case: 0,
            PascalCase: 0,
            lowercase: 0,
            mixed: 0
        };
        
        let totalColumns = 0;
        
        tables.forEach(table => {
            if (table.columns) {
                table.columns.forEach(column => {
                    totalColumns++;
                    const name = column.name;
                    if (/^[a-z]+([A-Z][a-z]*)*$/.test(name)) patterns.camelCase++;
                    else if (/^[a-z]+(_[a-z]+)*$/.test(name)) patterns.snake_case++;
                    else if (/^[A-Z][a-z]*([A-Z][a-z]*)*$/.test(name)) patterns.PascalCase++;
                    else if (/^[a-z]+$/.test(name)) patterns.lowercase++;
                    else patterns.mixed++;
                });
            }
        });
        
        const dominant = Object.keys(patterns).reduce((a, b) =>
            patterns[a] > patterns[b] ? a : b);
        
        return {
            patterns,
            dominantPattern: dominant,
            consistencyScore: totalColumns > 0 ? patterns[dominant] / totalColumns : 0
        };
    }

    /**
     * Assess normalization level
     */
    assessNormalization(tables, relationships) {
        // This is a simplified assessment - real normalization analysis would be more complex
        let violations = [];
        let score = 100;
        
        tables.forEach(table => {
            const columns = table.columns || [];
            
            // Check for potential 1NF violations (repeating groups)
            const suspiciousColumns = columns.filter(col =>
                col.name.includes('1') || col.name.includes('2') || col.name.includes('3')
            );
            if (suspiciousColumns.length > 0) {
                violations.push({
                    table: table.name,
                    type: '1NF',
                    description: 'Potential repeating groups detected',
                    columns: suspiciousColumns.map(col => col.name)
                });
                score -= 10;
            }
            
            // Check for potential 2NF violations (partial dependencies)
            const primaryKeys = columns.filter(col => col.isPrimary);
            if (primaryKeys.length > 1) {
                const nonKeyColumns = columns.filter(col => !col.isPrimary);
                if (nonKeyColumns.length > primaryKeys.length * 2) {
                    violations.push({
                        table: table.name,
                        type: '2NF',
                        description: 'Potential partial dependencies with composite key'
                    });
                    score -= 15;
                }
            }
        });
        
        return {
            score: Math.max(0, score),
            violations,
            level: this.determineNormalizationLevel(score)
        };
    }

    /**
     * Determine normalization level based on score
     */
    determineNormalizationLevel(score) {
        if (score >= 90) return '3NF+';
        if (score >= 70) return '2NF';
        if (score >= 50) return '1NF';
        return 'Below 1NF';
    }

    /**
     * Assess relationship integrity
     */
    assessRelationshipIntegrity(relationships) {
        let issues = [];
        let score = 100;
        
        relationships.forEach(rel => {
            // Check for missing cardinality
            if (!rel.fromCardinality || !rel.toCardinality) {
                issues.push({
                    type: 'missing_cardinality',
                    relationship: `${rel.fromTable} -> ${rel.toTable}`,
                    description: 'Cardinality not specified'
                });
                score -= 5;
            }
            
            // Check for self-referencing without proper handling
            if (rel.fromTable === rel.toTable && !rel.fromColumns) {
                issues.push({
                    type: 'self_reference',
                    relationship: `${rel.fromTable} -> ${rel.toTable}`,
                    description: 'Self-referencing relationship without clear column mapping'
                });
                score -= 10;
            }
        });
        
        return {
            score: Math.max(0, score),
            issues,
            integrityLevel: score >= 90 ? 'High' : score >= 70 ? 'Medium' : 'Low'
        };
    }

    /**
     * Assess indexing coverage
     */
    assessIndexingCoverage(tables) {
        let totalColumns = 0;
        let indexedColumns = 0;
        let foreignKeysWithoutIndex = 0;
        
        tables.forEach(table => {
            const columns = table.columns || [];
            totalColumns += columns.length;
            
            columns.forEach(col => {
                if (col.indexed || col.isPrimary) {
                    indexedColumns++;
                }
                if (col.isForeign && !col.indexed) {
                    foreignKeysWithoutIndex++;
                }
            });
        });
        
        const coverage = totalColumns > 0 ? (indexedColumns / totalColumns) * 100 : 0;
        
        return {
            coverage,
            totalColumns,
            indexedColumns,
            foreignKeysWithoutIndex,
            recommendation: coverage < 20 ? 'Consider adding more indexes' :
                           coverage > 80 ? 'Indexing looks comprehensive' :
                           'Moderate indexing coverage'
        };
    }

    /**
     * Assess constraint coverage
     */
    assessConstraintCoverage(tables) {
        let totalColumns = 0;
        let constrainedColumns = 0;
        const constraintTypes = {
            primaryKey: 0,
            foreignKey: 0,
            unique: 0,
            notNull: 0,
            check: 0
        };
        
        tables.forEach(table => {
            const columns = table.columns || [];
            totalColumns += columns.length;
            
            columns.forEach(col => {
                let hasConstraint = false;
                
                if (col.isPrimary) {
                    constraintTypes.primaryKey++;
                    hasConstraint = true;
                }
                if (col.isForeign) {
                    constraintTypes.foreignKey++;
                    hasConstraint = true;
                }
                if (col.unique) {
                    constraintTypes.unique++;
                    hasConstraint = true;
                }
                if (col.required || col.notNull) {
                    constraintTypes.notNull++;
                    hasConstraint = true;
                }
                if (col.check) {
                    constraintTypes.check++;
                    hasConstraint = true;
                }
                
                if (hasConstraint) {
                    constrainedColumns++;
                }
            });
        });
        
        const coverage = totalColumns > 0 ? (constrainedColumns / totalColumns) * 100 : 0;
        
        return {
            coverage,
            totalColumns,
            constrainedColumns,
            constraintTypes,
            level: coverage >= 60 ? 'High' : coverage >= 30 ? 'Medium' : 'Low'
        };
    }

    /**
     * Identify design patterns
     */
    identifyDesignPatterns(tables, relationships) {
        const patterns = [];
        
        // Junction table pattern
        const junctionTables = tables.filter(table =>
            this.isJunctionTable(table, relationships.filter(rel =>
                rel.fromTable === table.name || rel.toTable === table.name))
        );
        
        if (junctionTables.length > 0) {
            patterns.push({
                type: 'Junction Table',
                count: junctionTables.length,
                tables: junctionTables.map(t => t.name),
                description: 'Tables that resolve many-to-many relationships'
            });
        }
        
        // Inheritance pattern (tables with similar structure)
        const inheritanceGroups = this.findInheritancePatterns(tables);
        if (inheritanceGroups.length > 0) {
            patterns.push({
                type: 'Inheritance/Subtyping',
                count: inheritanceGroups.length,
                groups: inheritanceGroups,
                description: 'Tables with similar column structures suggesting inheritance'
            });
        }
        
        // Audit pattern (tables with created_at, updated_at, etc.)
        const auditTables = tables.filter(table =>
            this.hasAuditPattern(table)
        );
        
        if (auditTables.length > 0) {
            patterns.push({
                type: 'Audit Pattern',
                count: auditTables.length,
                tables: auditTables.map(t => t.name),
                description: 'Tables with audit/timestamp columns'
            });
        }
        
        return patterns;
    }

    /**
     * Check if table has audit pattern
     */
    hasAuditPattern(table) {
        const columns = table.columns || [];
        const columnNames = columns.map(col => col.name.toLowerCase());
        
        const auditColumns = ['created_at', 'updated_at', 'created_by', 'updated_by', 'version'];
        return auditColumns.some(auditCol =>
            columnNames.some(colName => colName.includes(auditCol.replace('_', '')))
        );
    }

    /**
     * Find inheritance patterns
     */
    findInheritancePatterns(tables) {
        const groups = [];
        const processed = new Set();
        
        tables.forEach(table => {
            if (processed.has(table.name)) return;
            
            const similarTables = tables.filter(otherTable =>
                otherTable.name !== table.name &&
                !processed.has(otherTable.name) &&
                this.calculateTableSimilarity(table, otherTable) > 0.7
            );
            
            if (similarTables.length > 0) {
                const group = [table, ...similarTables];
                groups.push({
                    baseTable: table.name,
                    derivedTables: similarTables.map(t => t.name),
                    similarity: this.calculateGroupSimilarity(group)
                });
                
                group.forEach(t => processed.add(t.name));
            }
        });
        
        return groups;
    }

    /**
     * Calculate similarity between two tables
     */
    calculateTableSimilarity(table1, table2) {
        const cols1 = (table1.columns || []).map(col => col.name.toLowerCase());
        const cols2 = (table2.columns || []).map(col => col.name.toLowerCase());
        
        const intersection = cols1.filter(col => cols2.includes(col));
        const union = [...new Set([...cols1, ...cols2])];
        
        return union.length > 0 ? intersection.length / union.length : 0;
    }

    /**
     * Calculate group similarity
     */
    calculateGroupSimilarity(tables) {
        if (tables.length < 2) return 0;
        
        let totalSimilarity = 0;
        let comparisons = 0;
        
        for (let i = 0; i < tables.length; i++) {
            for (let j = i + 1; j < tables.length; j++) {
                totalSimilarity += this.calculateTableSimilarity(tables[i], tables[j]);
                comparisons++;
            }
        }
        
        return comparisons > 0 ? totalSimilarity / comparisons : 0;
    }

    /**
     * Identify potential issues
     */
    identifyPotentialIssues(tables, relationships) {
        const issues = [];
        
        // Tables without primary keys
        const tablesWithoutPK = tables.filter(table => {
            const columns = table.columns || [];
            return !columns.some(col => col.isPrimary);
        });
        
        if (tablesWithoutPK.length > 0) {
            issues.push({
                type: 'Missing Primary Keys',
                severity: 'High',
                count: tablesWithoutPK.length,
                tables: tablesWithoutPK.map(t => t.name),
                description: 'Tables without primary keys can cause data integrity issues'
            });
        }
        
        // Foreign keys without corresponding relationships
        const orphanedFKs = this.findOrphanedForeignKeys(tables, relationships);
        if (orphanedFKs.length > 0) {
            issues.push({
                type: 'Orphaned Foreign Keys',
                severity: 'Medium',
                count: orphanedFKs.length,
                details: orphanedFKs,
                description: 'Foreign key columns without corresponding relationships'
            });
        }
        
        // Very large tables (potential performance issues)
        const largeTables = tables.filter(table => {
            const columns = table.columns || [];
            return columns.length > 50;
        });
        
        if (largeTables.length > 0) {
            issues.push({
                type: 'Large Tables',
                severity: 'Low',
                count: largeTables.length,
                tables: largeTables.map(t => ({ name: t.name, columns: t.columns.length })),
                description: 'Tables with many columns may indicate normalization opportunities'
            });
        }
        
        return issues;
    }

    /**
     * Find orphaned foreign keys
     */
    findOrphanedForeignKeys(tables, relationships) {
        const orphaned = [];
        
        tables.forEach(table => {
            const columns = table.columns || [];
            const foreignKeys = columns.filter(col => col.isForeign);
            
            foreignKeys.forEach(fk => {
                const hasRelationship = relationships.some(rel =>
                    (rel.fromTable === table.name && rel.fromColumns && rel.fromColumns.includes(fk.name)) ||
                    (rel.toTable === table.name && rel.toColumns && rel.toColumns.includes(fk.name))
                );
                
                if (!hasRelationship) {
                    orphaned.push({
                        table: table.name,
                        column: fk.name,
                        type: fk.type
                    });
                }
            });
        });
        
        return orphaned;
    }

    /**
     * Calculate overall quality score
     */
    calculateOverallQualityScore(qualityMetrics) {
        const weights = {
            namingConsistency: 0.15,
            normalizationLevel: 0.25,
            relationshipIntegrity: 0.20,
            indexingCoverage: 0.15,
            constraintCoverage: 0.25
        };
        
        let totalScore = 0;
        totalScore += qualityMetrics.namingConsistency.consistencyScore * 100 * weights.namingConsistency;
        totalScore += qualityMetrics.normalizationLevel.score * weights.normalizationLevel;
        totalScore += qualityMetrics.relationshipIntegrity.score * weights.relationshipIntegrity;
        totalScore += qualityMetrics.indexingCoverage.coverage * weights.indexingCoverage;
        totalScore += qualityMetrics.constraintCoverage.coverage * weights.constraintCoverage;
        
        return Math.round(totalScore);
    }

    /**
     * Assign quality grade
     */
    assignQualityGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(qualityMetrics) {
        const recommendations = [];
        
        if (qualityMetrics.namingConsistency.consistencyScore < 0.8) {
            recommendations.push({
                type: 'Naming Consistency',
                priority: 'Medium',
                description: 'Standardize naming conventions across tables and columns'
            });
        }
        
        if (qualityMetrics.normalizationLevel.score < 70) {
            recommendations.push({
                type: 'Normalization',
                priority: 'High',
                description: 'Review table structure for normalization opportunities'
            });
        }
        
        if (qualityMetrics.indexingCoverage.coverage < 30) {
            recommendations.push({
                type: 'Indexing',
                priority: 'High',
                description: 'Add indexes to foreign keys and frequently queried columns'
            });
        }
        
        if (qualityMetrics.constraintCoverage.coverage < 40) {
            recommendations.push({
                type: 'Constraints',
                priority: 'Medium',
                description: 'Add appropriate constraints to ensure data integrity'
            });
        }
        
        return recommendations;
    }

    /**
     * Calculate cyclomatic complexity
     */
    calculateCyclomaticComplexity(tables, relationships) {
        // Simplified: based on relationship cycles
        const graph = new Map();
        tables.forEach(table => {
            graph.set(table.name, new Set());
        });
        
        relationships.forEach(rel => {
            if (graph.has(rel.fromTable) && graph.has(rel.toTable)) {
                graph.get(rel.fromTable).add(rel.toTable);
            }
        });
        
        const cycles = this.findCycles(graph);
        return cycles.length + 1; // +1 for base complexity
    }

    /**
     * Find cycles in directed graph
     */
    findCycles(graph) {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];
        
        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                this.findCyclesUtil(graph, node, visited, recursionStack, cycles, []);
            }
        }
        
        return cycles;
    }

    /**
     * Utility function to find cycles
     */
    findCyclesUtil(graph, node, visited, recursionStack, cycles, path) {
        visited.add(node);
        recursionStack.add(node);
        path.push(node);
        
        if (graph.has(node)) {
            for (const neighbor of graph.get(node)) {
                if (!visited.has(neighbor)) {
                    this.findCyclesUtil(graph, neighbor, visited, recursionStack, cycles, path);
                } else if (recursionStack.has(neighbor)) {
                    // Found a cycle
                    const cycleStart = path.indexOf(neighbor);
                    cycles.push(path.slice(cycleStart));
                }
            }
        }
        
        recursionStack.delete(node);
        path.pop();
    }

    /**
     * Calculate structural complexity
     */
    calculateStructuralComplexity(tables, relationships) {
        let complexity = 0;
        
        // Base complexity from table and relationship counts
        complexity += tables.length * 2;
        complexity += relationships.length * 3;
        
        // Add complexity for table structures
        tables.forEach(table => {
            const columns = table.columns || [];
            complexity += columns.length * 0.5;
            complexity += columns.filter(col => col.isForeign).length * 1.5;
        });
        
        return Math.round(complexity);
    }

    /**
     * Calculate cognitive complexity
     */
    calculateCognitiveComplexity(tables, relationships) {
        let complexity = 0;
        
        // Many-to-many relationships are cognitively complex
        relationships.forEach(rel => {
            if (this.determineRelationshipType(rel) === 'many-to-many') {
                complexity += 3;
            } else {
                complexity += 1;
            }
        });
        
        // Self-referencing relationships add cognitive load
        const selfRefs = relationships.filter(rel => rel.fromTable === rel.toTable);
        complexity += selfRefs.length * 2;
        
        // Deep inheritance hierarchies
        const inheritanceDepth = this.calculateInheritanceDepth(tables, relationships);
        complexity += inheritanceDepth * 2;
        
        return complexity;
    }

    /**
     * Calculate inheritance depth
     */
    calculateInheritanceDepth(tables, relationships) {
        // Simplified: look for patterns that suggest inheritance
        let maxDepth = 0;
        
        // This is a simplified heuristic - real inheritance detection would be more complex
        const potentialHierarchies = this.findInheritancePatterns(tables);
        potentialHierarchies.forEach(hierarchy => {
            maxDepth = Math.max(maxDepth, hierarchy.derivedTables.length);
        });
        
        return maxDepth;
    }

    /**
     * Classify complexity
     */
    classifyComplexity(cyclomatic, structural, cognitive) {
        const total = cyclomatic + structural + cognitive;
        
        if (total < 50) return 'Low';
        if (total < 150) return 'Medium';
        if (total < 300) return 'High';
        return 'Very High';
    }

    /**
     * Count unique table pairs in relationships
     */
    countUniqueTablePairs(relationships) {
        const pairs = new Set();
        relationships.forEach(rel => {
            const pair = [rel.fromTable, rel.toTable].sort().join('|');
            pairs.add(pair);
        });
        return pairs.size;
    }

    /**
     * Calculate average connections per table
     */
    calculateAverageConnections(tableConnections) {
        let totalConnections = 0;
        for (const connections of tableConnections.values()) {
            totalConnections += connections.size;
        }
        return totalConnections / Math.max(tableConnections.size, 1);
    }

    /**
     * Find most connected tables
     */
    findMostConnectedTables(tableConnections, limit = 5) {
        const sorted = Array.from(tableConnections.entries())
            .map(([table, connections]) => ({ table, connections: connections.size }))
            .sort((a, b) => b.connections - a.connections);
        
        return sorted.slice(0, limit);
    }

    /**
     * Emit analysis complete event
     */
    emitAnalysisComplete(analysis) {
        if (this.eventBus) {
            this.eventBus.emit('analysis:complete', analysis);
        }
    }

    /**
     * Get current analysis results
     */
    getAnalysisResults() {
        return this.analysisResults;
    }

    /**
     * Get table group for a specific table
     */
    getTableGroup(tableName) {
        return this.groupings.get(tableName);
    }

    /**
     * Get all table groups
     */
    getAllGroups() {
        const groups = new Map();
        for (const [table, group] of this.groupings.entries()) {
            if (!groups.has(group.id)) {
                groups.set(group.id, group);
            }
        }
        return Array.from(groups.values());
    }

    /**
     * Export analysis results
     */
    exportAnalysis(format = 'json') {
        if (!this.analysisResults) {
            throw new Error('No analysis results available. Run analysis first.');
        }
        
        const data = {
            analysis: this.analysisResults,
            exportedAt: new Date().toISOString(),
            format: format
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            return this.convertAnalysisToCSV(data);
        }
        
        return data;
    }

    /**
     * Convert analysis to CSV format
     */
    convertAnalysisToCSV(data) {
        const analysis = data.analysis;
        let csv = 'Metric,Value,Description\n';
        
        // Basic stats
        csv += `Total Tables,${analysis.basic.totalTables},Number of tables in schema\n`;
        csv += `Total Columns,${analysis.basic.totalColumns},Number of columns across all tables\n`;
        csv += `Total Relationships,${analysis.basic.totalRelationships},Number of relationships\n`;
        csv += `Avg Columns Per Table,${analysis.basic.avgColumnsPerTable.toFixed(2)},Average columns per table\n`;
        
        // Quality metrics
        csv += `Overall Quality Score,${analysis.quality.overallScore},Overall schema quality (0-100)\n`;
        csv += `Quality Grade,${analysis.quality.grade},Letter grade for schema quality\n`;
        
        return csv;
    }
}