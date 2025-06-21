/**
 * Intelligent Auto-Layout Algorithm
 * This is the final, stable version combining deterministic and force-based logic.
 * It works directly with the original `{ from: ..., to: ... }` relationship format.
 */
export class IntelligentLayoutAlgorithm {
    constructor(settings = {}) {
        this.settings = {
            minTableDistance: 60,
            minConnectionDistance: 40,
            gridSize: 20,
            maxIterations: 100,
            forceStrength: 0.9,
            dampingFactor: 0.85,
            repulsionForce: 5000,
            attractionForce: 0.1,
            boundaryPadding: 50,
            clusterSeparation: 90,
            orphanPadding: 100,
            ...settings
        };
        
        this.tablePositions = new Map();
        this.tableDimensions = new Map();
        this.clusters = [];
        this.forces = new Map();
        this.velocities = new Map();
        this.bounds = { width: 1200, height: 800 };
    }

    /**
     * Calculates a clean layout using a force-directed pass for untangling
     * followed by a deterministic Masonry placement of the resulting clusters.
     */
    calculateLayout(schema, bounds = null) {
        console.log('[Layout START] Starting final definitive pipeline');
        if (bounds) {
            this.bounds = bounds;
        }
        
        const tables = schema.tables || [];
        const relationships = schema.relationships || [];
        
        if (tables.length === 0) return { tables: [], relationships: [] };
        
        // --- The Corrected, Stable Pipeline ---
        this.initializeLayout(tables);
        this.detectClusters(relationships);
        this.runForceDirectedLayout(relationships);
        this.applyStructuredGridPlacement();
        
        const allTableNames = tables.map(t => t.name);
        this.positionOrphanTables(allTableNames, relationships);
        
        this.resolveRemainingOverlaps();
        
        const result = this.generateLayoutResult(tables, relationships);
        console.log('[Layout END] Finished final definitive pipeline');
        return result;
    }

    initializeLayout(tables) {
        this.tablePositions.clear();
        this.tableDimensions.clear();
        this.forces.clear();
        this.velocities.clear();
        
        tables.forEach(table => {
            const dimensions = this.calculateTableDimensions(table);
            this.tableDimensions.set(table.name, dimensions);
            this.forces.set(table.name, { x: 0, y: 0 });
            this.velocities.set(table.name, { x: 0, y: 0 });
        });
    }

    calculateTableDimensions(table) {
        const headerHeight = 40; const rowHeight = 25; const minWidth = 200; const padding = 20;
        const contentHeight = headerHeight + (table.columns || []).length * rowHeight;
        let maxContentWidth = (table.name || '').length * 8;
        (table.columns || []).forEach(column => {
            const colName = column.name || '';
            const colType = column.type || '';
            const contentWidth = (colName.length + colType.length) * 7;
            maxContentWidth = Math.max(maxContentWidth, contentWidth);
        });
        const contentWidth = Math.max(minWidth, maxContentWidth + padding * 2.5);
        return { width: contentWidth, height: contentHeight, area: contentWidth * contentHeight };
    }

    detectClusters(relationships) {
        const graph = new Map();
        const visited = new Set();
        this.clusters = [];
        
        this.tableDimensions.forEach((_, tableName) => graph.set(tableName, new Set()));
        
        relationships.forEach(rel => {
            if (rel.from && rel.to && graph.has(rel.from.table) && graph.has(rel.to.table)) {
                graph.get(rel.from.table).add(rel.to.table);
                graph.get(rel.to.table).add(rel.from.table);
            }
        });
        
        for (const tableName of graph.keys()) {
            if (!visited.has(tableName)) {
                const cluster = [];
                this.dfsCluster(graph, tableName, visited, cluster);
                if (cluster.length > 0) this.clusters.push({ tables: cluster, size: cluster.length });
            }
        }
        
        this.clusters.sort((a, b) => b.size - a.size);
    }

    dfsCluster(graph, tableName, visited, cluster) {
        visited.add(tableName);
        cluster.push(tableName);
        const neighbors = graph.get(tableName) || new Set();
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                this.dfsCluster(graph, neighbor, visited, cluster);
            }
        }
    }

    runForceDirectedLayout(relationships) {
        console.log('[Layout Step] RUNNING FORCE-DIRECTED LAYOUT');
        this.applyInitialPositioning();

        for (let iteration = 0; iteration < this.settings.maxIterations; iteration++) {
            this.forces.forEach(force => { force.x = 0; force.y = 0; });
            this.calculateRepulsionForces();
            this.calculateAttractionForces(relationships);
            this.calculateBoundaryForces();
            this.applyForces();
            if (this.hasConverged()) {
                console.log(`Layout converged after ${iteration + 1} iterations`);
                break;
            }
        }
    }

    applyInitialPositioning() {
        if (this.clusters.length === 0) return;
        
        const clustersPerRow = Math.ceil(Math.sqrt(this.clusters.length));
        const clusterWidth = (this.bounds.width - 2 * this.settings.boundaryPadding) / clustersPerRow;
        const clusterHeight = (this.bounds.height - 2 * this.settings.boundaryPadding) / Math.ceil(this.clusters.length / clustersPerRow);
        
        this.clusters.forEach((cluster, clusterIndex) => {
            const clusterRow = Math.floor(clusterIndex / clustersPerRow);
            const clusterCol = clusterIndex % clustersPerRow;
            
            const clusterCenterX = this.settings.boundaryPadding + clusterCol * clusterWidth + clusterWidth / 2;
            const clusterCenterY = this.settings.boundaryPadding + clusterRow * clusterHeight + clusterHeight / 2;
            
            this.positionClusterTables(cluster, clusterCenterX, clusterCenterY, clusterWidth * 0.8, clusterHeight * 0.8);
        });
    }

    positionClusterTables(cluster, centerX, centerY, maxWidth, maxHeight) {
        const tables = cluster.tables;
        
        if (tables.length === 1) {
            const dimensions = this.tableDimensions.get(tables[0]);
            this.tablePositions.set(tables[0], { x: centerX - dimensions.width / 2, y: centerY - dimensions.height / 2 });
            return;
        }

        const radius = Math.min(maxWidth, maxHeight) * 0.4;
        tables.forEach((tableName, index) => {
            const angle = (index / tables.length) * 2 * Math.PI;
            const dimensions = this.tableDimensions.get(tableName);
            this.tablePositions.set(tableName, { 
                x: centerX + Math.cos(angle) * radius - (dimensions?.width || 200) / 2, 
                y: centerY + Math.sin(angle) * radius - (dimensions?.height || 100) / 2 
            });
        });
    }
    
    calculateRepulsionForces() {
        const tableNames = Array.from(this.tablePositions.keys());
        for (let i = 0; i < tableNames.length; i++) {
            for (let j = i + 1; j < tableNames.length; j++) {
                const table1 = tableNames[i];
                const table2 = tableNames[j];
                const pos1 = this.tablePositions.get(table1); const pos2 = this.tablePositions.get(table2);
                const dim1 = this.tableDimensions.get(table1); const dim2 = this.tableDimensions.get(table2);
                if (!pos1 || !pos2 || !dim1 || !dim2) continue;

                const dx = (pos2.x + dim2.width / 2) - (pos1.x + dim1.width / 2);
                const dy = (pos2.y + dim2.height / 2) - (pos1.y + dim1.height / 2);
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = this.settings.repulsionForce / (distance * distance);

                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                this.forces.get(table1).x -= fx; this.forces.get(table1).y -= fy;
                this.forces.get(table2).x += fx; this.forces.get(table2).y += fy;
            }
        }
    }

    calculateAttractionForces(relationships) {
        relationships.forEach(rel => {
            if (!rel.from || !rel.to) return;
            const fromTable = rel.from.table;
            const toTable = rel.to.table;
            const pos1 = this.tablePositions.get(fromTable); const pos2 = this.tablePositions.get(toTable);
            const dim1 = this.tableDimensions.get(fromTable); const dim2 = this.tableDimensions.get(toTable);
            if (!pos1 || !pos2 || !dim1 || !dim2) return;

            const dx = (pos2.x + dim2.width / 2) - (pos1.x + dim1.width / 2);
            const dy = (pos2.y + dim2.height / 2) - (pos1.y + dim1.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            
            const idealDistance = (dim1.width + dim2.width) / 2 + this.settings.minConnectionDistance;
            const displacement = distance - idealDistance;
            
            const attractionStrength = this.settings.attractionForce * displacement;
            const fx = (dx / distance) * attractionStrength;
            const fy = (dy / distance) * attractionStrength;
            
            this.forces.get(fromTable).x += fx; this.forces.get(fromTable).y += fy;
            this.forces.get(toTable).x -= fx; this.forces.get(toTable).y -= fy;
        });
    }

    calculateBoundaryForces() {
        this.tablePositions.forEach((pos, tableName) => {
            const dim = this.tableDimensions.get(tableName); const force = this.forces.get(tableName);
            if (!pos || !dim || !force) return;
            if (pos.x < this.settings.boundaryPadding) force.x += (this.settings.boundaryPadding - pos.x) * 0.1;
            if (pos.x + dim.width > this.bounds.width - this.settings.boundaryPadding) force.x -= (pos.x + dim.width - (this.bounds.width - this.settings.boundaryPadding)) * 0.1;
            if (pos.y < this.settings.boundaryPadding) force.y += (this.settings.boundaryPadding - pos.y) * 0.1;
            if (pos.y + dim.height > this.bounds.height - this.settings.boundaryPadding) force.y -= (pos.y + dim.height - (this.bounds.height - this.settings.boundaryPadding)) * 0.1;
        });
    }

    applyForces() {
        this.tablePositions.forEach((pos, tableName) => {
            const force = this.forces.get(tableName); const velocity = this.velocities.get(tableName);
            if (!force || !velocity) return;
            velocity.x = (velocity.x + force.x) * this.settings.dampingFactor;
            velocity.y = (velocity.y + force.y) * this.settings.dampingFactor;
            pos.x += velocity.x;
            pos.y += velocity.y;
        });
    }

    hasConverged() {
        let totalVelocity = 0;
        this.velocities.forEach(v => { totalVelocity += Math.sqrt(v.x * v.x + v.y * v.y); });
        return totalVelocity / this.velocities.size < 0.1;
    }

    applyStructuredGridPlacement() {
        console.log('[Layout Step] applyStructuredGridPlacement (Masonry)');
        if (this.clusters.length === 0) return;

        const clusterBlocks = this.clusters.map(cluster => {
            const bounds = this.calculateClusterBounds(cluster.tables);
            return { cluster, bounds };
        });

        clusterBlocks.sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height));

        const layoutPadding = this.settings.boundaryPadding;
        const clusterSeparation = this.settings.clusterSeparation;
        const canvasWidth = this.bounds.width;
        
        const avgWidth = clusterBlocks.reduce((acc, b) => acc + b.bounds.width, 0) / (clusterBlocks.length || 1);
        const numColumns = Math.max(1, Math.floor((canvasWidth - 2 * layoutPadding) / (avgWidth + clusterSeparation)));

        const columnHeights = Array(numColumns).fill(layoutPadding);

        clusterBlocks.forEach(block => {
            let shortestColumnIndex = 0;
            for (let i = 1; i < columnHeights.length; i++) {
                if (columnHeights[i] < columnHeights[shortestColumnIndex]) {
                    shortestColumnIndex = i;
                }
            }
            
            const columnWidth = (canvasWidth - 2 * layoutPadding) / numColumns;
            const targetX = layoutPadding + shortestColumnIndex * columnWidth;
            const targetY = columnHeights[shortestColumnIndex];

            const deltaX = targetX - block.bounds.minX;
            const deltaY = targetY - block.bounds.minY;

            block.cluster.tables.forEach(tableName => {
                const pos = this.tablePositions.get(tableName);
                if (pos) {
                    pos.x += deltaX;
                    pos.y += deltaY;
                }
            });

            columnHeights[shortestColumnIndex] += block.bounds.height + clusterSeparation;
        });
    }

    calculateClusterBounds(tableNames) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasValidTables = false;
        tableNames.forEach(tableName => {
            const pos = this.tablePositions.get(tableName);
            const dim = this.tableDimensions.get(tableName);
            if (pos && dim) {
                hasValidTables = true;
                minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x + dim.width); maxY = Math.max(maxY, pos.y + dim.height);
            }
        });
        if (!hasValidTables) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    positionOrphanTables(allTableNames, relationships) {
        console.log('[Layout Step] positionOrphanTables');
        const relatedTableNames = new Set();
        relationships.forEach(rel => {
            if (rel.from && rel.to) {
                relatedTableNames.add(rel.from.table);
                relatedTableNames.add(rel.to.table);
            }
        });

        const orphanTableNames = allTableNames.filter(name => !relatedTableNames.has(name));
        if (orphanTableNames.length === 0) return;
        
        console.log(`Positioning ${orphanTableNames.length} orphan tables.`);

        let maxYOfConnectedGraph = this.settings.boundaryPadding;
        this.tablePositions.forEach((pos, tableName) => {
            if (relatedTableNames.has(tableName)) {
                const dim = this.tableDimensions.get(tableName);
                if (pos && dim) {
                    maxYOfConnectedGraph = Math.max(maxYOfConnectedGraph, pos.y + dim.height);
                }
            }
        });
        
        const orphanStartY = maxYOfConnectedGraph + this.settings.orphanPadding;
        const avgOrphanWidth = 200;
        const orphanGridCols = Math.max(1, Math.floor((this.bounds.width - 2 * this.settings.boundaryPadding) / (avgOrphanWidth + this.settings.minTableDistance)));
        let currentOrphanCol = 0;
        let currentOrphanRow = 0;
        let maxRowHeightInCurrentOrphanRow = 0;

        orphanTableNames.forEach(tableName => {
            const tableDim = this.tableDimensions.get(tableName);
            if (!tableDim) return;
            const newX = this.settings.boundaryPadding + currentOrphanCol * (avgOrphanWidth + this.settings.minTableDistance);
            const newY = orphanStartY + currentOrphanRow * (maxRowHeightInCurrentOrphanRow + this.settings.minTableDistance);
            this.tablePositions.set(tableName, { x: newX, y: newY });
            maxRowHeightInCurrentOrphanRow = Math.max(maxRowHeightInCurrentOrphanRow, tableDim.height);
            currentOrphanCol++;
            if (currentOrphanCol >= orphanGridCols) {
                currentOrphanCol = 0;
                currentOrphanRow++;
                maxRowHeightInCurrentOrphanRow = 0;
            }
        });
    }

    resolveRemainingOverlaps() {
        console.log('[Layout Step] resolveRemainingOverlaps');
        const tableNames = Array.from(this.tablePositions.keys());
        const maxIterations = 200;
        for (let i = 0; i < maxIterations; i++) {
            let overlapsFound = 0;
            for (let j = 0; j < tableNames.length; j++) {
                for (let k = j + 1; k < tableNames.length; k++) {
                    if (this.tablesOverlap(tableNames[j], tableNames[k])) {
                        this.separateOverlappingTables(tableNames[j], tableNames[k]);
                        overlapsFound++;
                    }
                }
            }
            if (overlapsFound === 0) {
                console.log(`Overlap resolution complete after ${i + 1} iterations.`);
                return;
            }
        }
        console.warn(`Overlap resolution finished after ${maxIterations} iterations.`);
    }

    tablesOverlap(table1Name, table2Name) {
        const pos1 = this.tablePositions.get(table1Name); const pos2 = this.tablePositions.get(table2Name);
        const dim1 = this.tableDimensions.get(table1Name); const dim2 = this.tableDimensions.get(table2Name);
        if (!pos1 || !pos2 || !dim1 || !dim2) return false;
        
        const overlap = this.getOverlap(pos1, dim1, pos2, dim2, this.settings.minTableDistance);
        return overlap.x > 0 && overlap.y > 0;
    }
    
    getOverlap(pos1, dim1, pos2, dim2, desiredMargin) {
        const center1X = pos1.x + dim1.width / 2; const center1Y = pos1.y + dim1.height / 2;
        const center2X = pos2.x + dim2.width / 2; const center2Y = pos2.y + dim2.height / 2;
        const dx = Math.abs(center1X - center2X); const dy = Math.abs(center1Y - center2Y);
        const minSeparationX = dim1.width / 2 + dim2.width / 2 + desiredMargin;
        const minSeparationY = dim1.height / 2 + dim2.height / 2 + desiredMargin;
        return { x: minSeparationX - dx, y: minSeparationY - dy };
    }

    separateOverlappingTables(table1Name, table2Name) {
        const pos1 = this.tablePositions.get(table1Name); const pos2 = this.tablePositions.get(table2Name);
        const dim1 = this.tableDimensions.get(table1Name); const dim2 = this.tableDimensions.get(table2Name);
        if (!pos1 || !pos2 || !dim1 || !dim2) return;

        const overlap = this.getOverlap(pos1, dim1, pos2, dim2, this.settings.minTableDistance);
        if (overlap.x > 0 && overlap.y > 0) {
            const center1X = pos1.x + dim1.width / 2; const center2X = pos2.x + dim2.width / 2;
            if (overlap.x < overlap.y) {
                const pushAmount = overlap.x / 2; const sign = (center1X < center2X) ? -1 : 1;
                pos1.x += sign * pushAmount; pos2.x -= sign * pushAmount;
            } else {
                const pushAmount = overlap.y / 2; const center1Y = pos1.y + dim1.height / 2;
                const center2Y = pos2.y + dim2.height / 2; const sign = (center1Y < center2Y) ? -1 : 1;
                pos1.y += sign * pushAmount; pos2.y -= sign * pushAmount;
            }
        }
    }

    generateLayoutResult(tables, relationships) {
        const layoutTables = tables.map(table => ({
            ...table,
            x: this.tablePositions.get(table.name)?.x || 0,
            y: this.tablePositions.get(table.name)?.y || 0,
            width: this.tableDimensions.get(table.name)?.width || 200,
            height: this.tableDimensions.get(table.name)?.height || 100
        }));
        
        const statistics = this.generateLayoutStatistics(relationships);
        return { tables: layoutTables, relationships, clusters: this.clusters, bounds: this.bounds, statistics };
    }

    generateLayoutStatistics(relationships) {
        let totalOverlaps = 0; let totalCrossings = 0;
        const tableNames = Array.from(this.tablePositions.keys());
        for (let i = 0; i < tableNames.length; i++) {
            for (let j = i + 1; j < tableNames.length; j++) {
                if (this.tablesOverlap(tableNames[i], tableNames[j])) totalOverlaps++;
            }
        }
        return { totalTables: tableNames.length, totalRelationships: relationships.length, totalClusters: this.clusters.length, overlaps: totalOverlaps, crossings: totalCrossings, layoutEfficiency: this.calculateLayoutEfficiency(totalOverlaps, totalCrossings, relationships) };
    }

    calculateLayoutEfficiency(overlaps, crossings, relationships) {
        const tableCount = this.tablePositions.size;
        const relationshipCount = relationships.length;
        if (tableCount === 0) return 100;
        
        const maxPossibleOverlaps = (tableCount * (tableCount - 1)) / 2;
        const maxPossibleCrossings = relationshipCount > 1 ? (relationshipCount * (relationshipCount - 1)) / 2 : 1;
        const overlapPenaltyScore = maxPossibleOverlaps > 0 ? Math.min(1, overlaps / maxPossibleOverlaps) : 0;
        const crossingPenaltyScore = maxPossibleCrossings > 0 ? Math.min(1, crossings / maxPossibleCrossings) : 0;
        const overlapWeight = 60; const crossingWeight = 40;
        const totalPenalty = (overlapPenaltyScore * overlapWeight) + (crossingPenaltyScore * crossingWeight);
        
        return Math.round(Math.max(0, 100 - totalPenalty));
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        console.log('[Layout] Settings updated:', this.settings);
    }
}