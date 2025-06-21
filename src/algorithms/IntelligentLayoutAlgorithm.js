/**
 * Intelligent Auto-Layout Algorithm
 * Prevents table overlapping with dynamic repositioning and minimum distance enforcement
 */
export class IntelligentLayoutAlgorithm {
    constructor(settings = {}) {
        this.settings = {
            minTableDistance: 80,
            minConnectionDistance: 40,
            gridSize: 20,
            maxIterations: 100,
            forceStrength: 0.8,
            dampingFactor: 0.85,
            repulsionForce: 2000,
            attractionForce: 0.1,
            centeringForce: 0.05,
            boundaryPadding: 50,
            relationshipWeight: 1.5,
            clusterSeparation: 150,
            ...settings
        };
        
        this.tablePositions = new Map();
        this.tableDimensions = new Map();
        this.relationships = [];
        this.clusters = [];
        this.forces = new Map();
        this.velocities = new Map();
        this.bounds = { width: 1200, height: 800 };
    }

    /**
     * Calculate optimal layout with overlap prevention
     */
    calculateLayout(schema, bounds = null) {
        if (bounds) {
            this.bounds = bounds;
        }
        
        const tables = schema.tables || [];
        const relationships = schema.relationships || [];
        
        if (tables.length === 0) {
            return { tables: [], relationships: [] };
        }
        
        // Initialize data structures
        this.initializeLayout(tables, relationships);
        
        // Detect table clusters based on relationships
        this.detectClusters();
        
        // Apply initial positioning strategy
        this.applyInitialPositioning();
        
        // Run force-directed algorithm with overlap prevention
        this.runForceDirectedLayout();
        
        // Final overlap resolution pass
        this.resolveRemainingOverlaps();
        
        // Optimize for readability
        this.optimizeForReadability();
        
        // Generate final layout
        return this.generateLayoutResult(tables, relationships);
    }

    /**
     * Initialize layout data structures
     */
    initializeLayout(tables, relationships) {
        this.relationships = relationships;
        this.tablePositions.clear();
        this.tableDimensions.clear();
        this.forces.clear();
        this.velocities.clear();
        
        // Calculate table dimensions
        tables.forEach(table => {
            const dimensions = this.calculateTableDimensions(table);
            this.tableDimensions.set(table.name, dimensions);
            
            // Initialize physics properties
            this.forces.set(table.name, { x: 0, y: 0 });
            this.velocities.set(table.name, { x: 0, y: 0 });
        });
    }

    /**
     * Calculate table dimensions based on content
     */
    calculateTableDimensions(table) {
        const headerHeight = 40;
        const rowHeight = 25;
        const minWidth = 200;
        const padding = 20;
        
        const columns = table.columns || [];
        const contentHeight = headerHeight + columns.length * rowHeight;
        
        // Calculate width based on content
        let maxContentWidth = table.name.length * 8;
        columns.forEach(column => {
            const contentWidth = (column.name.length + (column.type?.length || 0)) * 7;
            maxContentWidth = Math.max(maxContentWidth, contentWidth);
        });
        
        const contentWidth = Math.max(minWidth, maxContentWidth + padding);
        
        return {
            width: contentWidth,
            height: contentHeight,
            area: contentWidth * contentHeight
        };
    }

    /**
     * Detect table clusters based on relationship connectivity
     */
    detectClusters() {
        const graph = new Map();
        const visited = new Set();
        this.clusters = [];
        
        // Build adjacency graph
        this.tableDimensions.forEach((_, tableName) => {
            graph.set(tableName, new Set());
        });
        
        this.relationships.forEach(rel => {
            if (graph.has(rel.fromTable) && graph.has(rel.toTable)) {
                graph.get(rel.fromTable).add(rel.toTable);
                graph.get(rel.toTable).add(rel.fromTable);
            }
        });
        
        // Find connected components using DFS
        for (const tableName of graph.keys()) {
            if (!visited.has(tableName)) {
                const cluster = [];
                this.dfsCluster(graph, tableName, visited, cluster);
                if (cluster.length > 0) {
                    this.clusters.push({
                        tables: cluster,
                        size: cluster.length,
                        relationships: this.getClusterRelationships(cluster)
                    });
                }
            }
        }
        
        // Sort clusters by size (largest first)
        this.clusters.sort((a, b) => b.size - a.size);
    }

    /**
     * Depth-first search for cluster detection
     */
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

    /**
     * Get relationships within a cluster
     */
    getClusterRelationships(clusterTables) {
        const tableSet = new Set(clusterTables);
        return this.relationships.filter(rel => 
            tableSet.has(rel.fromTable) && tableSet.has(rel.toTable)
        );
    }

    /**
     * Apply initial positioning strategy
     */
    applyInitialPositioning() {
        if (this.clusters.length === 0) return;
        
        // Position clusters in a grid layout
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

    /**
     * Position tables within a cluster
     */
    positionClusterTables(cluster, centerX, centerY, maxWidth, maxHeight) {
        const tables = cluster.tables;
        
        if (tables.length === 1) {
            // Single table - place at center
            const dimensions = this.tableDimensions.get(tables[0]);
            this.tablePositions.set(tables[0], {
                x: centerX - dimensions.width / 2,
                y: centerY - dimensions.height / 2
            });
            return;
        }
        
        // Use circular layout for small clusters, grid for larger ones
        if (tables.length <= 6) {
            this.positionTablesCircular(tables, centerX, centerY, Math.min(maxWidth, maxHeight) * 0.3);
        } else {
            this.positionTablesGrid(tables, centerX, centerY, maxWidth, maxHeight);
        }
    }

    /**
     * Position tables in circular layout
     */
    positionTablesCircular(tables, centerX, centerY, radius) {
        tables.forEach((tableName, index) => {
            const angle = (index / tables.length) * 2 * Math.PI - Math.PI / 2;
            const dimensions = this.tableDimensions.get(tableName);
            
            this.tablePositions.set(tableName, {
                x: centerX + Math.cos(angle) * radius - dimensions.width / 2,
                y: centerY + Math.sin(angle) * radius - dimensions.height / 2
            });
        });
    }

    /**
     * Position tables in grid layout
     */
    positionTablesGrid(tables, centerX, centerY, maxWidth, maxHeight) {
        const cols = Math.ceil(Math.sqrt(tables.length));
        const rows = Math.ceil(tables.length / cols);
        
        const cellWidth = maxWidth / cols;
        const cellHeight = maxHeight / rows;
        
        tables.forEach((tableName, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const dimensions = this.tableDimensions.get(tableName);
            
            const x = centerX - maxWidth / 2 + col * cellWidth + cellWidth / 2 - dimensions.width / 2;
            const y = centerY - maxHeight / 2 + row * cellHeight + cellHeight / 2 - dimensions.height / 2;
            
            this.tablePositions.set(tableName, { x, y });
        });
    }

    /**
     * Run force-directed layout algorithm
     */
    runForceDirectedLayout() {
        for (let iteration = 0; iteration < this.settings.maxIterations; iteration++) {
            // Clear forces
            this.forces.forEach(force => {
                force.x = 0;
                force.y = 0;
            });
            
            // Calculate forces
            this.calculateRepulsionForces();
            this.calculateAttractionForces();
            this.calculateCenteringForces();
            this.calculateBoundaryForces();
            
            // Apply forces and update positions
            this.applyForces();
            
            // Check for convergence
            if (this.hasConverged()) {
                console.log(`Layout converged after ${iteration + 1} iterations`);
                break;
            }
        }
    }

    /**
     * Calculate repulsion forces between tables
     */
    calculateRepulsionForces() {
        const tableNames = Array.from(this.tablePositions.keys());
        
        for (let i = 0; i < tableNames.length; i++) {
            for (let j = i + 1; j < tableNames.length; j++) {
                const table1 = tableNames[i];
                const table2 = tableNames[j];
                
                const pos1 = this.tablePositions.get(table1);
                const pos2 = this.tablePositions.get(table2);
                const dim1 = this.tableDimensions.get(table1);
                const dim2 = this.tableDimensions.get(table2);
                
                // Calculate center-to-center distance
                const dx = (pos2.x + dim2.width / 2) - (pos1.x + dim1.width / 2);
                const dy = (pos2.y + dim2.height / 2) - (pos1.y + dim1.height / 2);
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                
                let fx = 0;
                let fy = 0;

                // New: Dimension-aware repulsion if tables are too close (violating minTableDistance)
                const center1X = pos1.x + dim1.width / 2;
                const center1Y = pos1.y + dim1.height / 2;
                const center2X = pos2.x + dim2.width / 2;
                const center2Y = pos2.y + dim2.height / 2;

                const actualDxBetweenCenters = Math.abs(center1X - center2X);
                const actualDyBetweenCenters = Math.abs(center1Y - center2Y);

                const minSeparationX = dim1.width / 2 + dim2.width / 2 + this.settings.minTableDistance;
                const minSeparationY = dim1.height / 2 + dim2.height / 2 + this.settings.minTableDistance;

                const penetrationX = minSeparationX - actualDxBetweenCenters;
                const penetrationY = minSeparationY - actualDyBetweenCenters;

                let specificRepulsionApplied = false;
                if (penetrationX > 0 && penetrationY > 0) { // Check if centers are within the "too close" box
                    // Only apply if the bounding boxes (plus margin) are actually overlapping,
                    // not just if their center-to-center distance along one axis is small.
                    // This uses a simpler check than full getOverlap for performance in this hot loop.
                    // We are primarily concerned with pushing them apart if their "minimum distance boxes" overlap.

                    const overlapForceStrength = this.settings.repulsionForce * 1.2; // Moderated stronger force for overlap

                    // We want to push primarily along the axis of MINIMUM penetration to resolve overlap efficiently
                    // However, for simplicity here, we'll push along both axes if both penetrated.
                    // More sophisticated logic (like in separateOverlappingTables) could be used but adds complexity here.

                    // Calculate push based on how much they *need* to move to satisfy minDistance along each axis
                    // if their bounding boxes (plus margin) are indeed overlapping.
                    // This is a simplified check: if centers are too close AND they are also too close considering their full widths/heights

                    const agent_comment = `
                    The condition (penetrationX > 0 && penetrationY > 0) checks if the *centers* are too close
                    such that their *minimum separation boxes* (table_half_dim + minDistance) overlap.
                    If this is true, it means the tables are definitely closer than desired.
                    We then apply a force to push them apart.
                    The direction of the force is based on the vector connecting their centers (dx, dy).
                    The magnitude is boosted.
                    `;

                    const forceMagnitude = overlapForceStrength * Math.max(penetrationX, penetrationY) / distance; // Normalize by distance
                    fx += (dx / distance) * forceMagnitude;
                    fy += (dy / distance) * forceMagnitude;
                    specificRepulsionApplied = true;
                }

                // Standard repulsion force (inverse square law)
                // This force acts between centers.
                // Apply it if specific overlap repulsion wasn't strong enough or they aren't overlapping but still close.
                if (!specificRepulsionApplied) {
                    const distanceSquared = distance * distance;
                    const generalRepulsionStrength = this.settings.repulsionForce / (distanceSquared);
                    fx += (dx / distance) * generalRepulsionStrength;
                    fy += (dy / distance) * generalRepulsionStrength;
                } else {
                    // Optionally, add a smaller portion of general repulsion even if specific one was applied
                    const distanceSquared = distance * distance;
                    const generalRepulsionStrength = this.settings.repulsionForce * 0.25 / (distanceSquared); // Slightly increased residual force
                    fx += (dx / distance) * generalRepulsionStrength;
                    fy += (dy / distance) * generalRepulsionStrength;
                }
                
                // Apply forces
                this.forces.get(table1).x -= fx;
                this.forces.get(table1).y -= fy;
                this.forces.get(table2).x += fx;
                this.forces.get(table2).y += fy;
            }
        }
    }

    /**
     * Calculate attraction forces from relationships
     */
    calculateAttractionForces() {
        this.relationships.forEach(rel => {
            const pos1 = this.tablePositions.get(rel.fromTable);
            const pos2 = this.tablePositions.get(rel.toTable);
            
            if (!pos1 || !pos2) return;
            
            const dim1 = this.tableDimensions.get(rel.fromTable);
            const dim2 = this.tableDimensions.get(rel.toTable);
            
            const dx = (pos2.x + dim2.width / 2) - (pos1.x + dim1.width / 2);
            const dy = (pos2.y + dim2.height / 2) - (pos1.y + dim1.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Ideal distance for connected tables
            const idealDistance = this.calculateIdealConnectionDistance(dim1, dim2);
            const displacement = distance - idealDistance;
            
            const attractionStrength = this.settings.attractionForce * displacement * this.settings.relationshipWeight;
            const fx = (dx / distance) * attractionStrength;
            const fy = (dy / distance) * attractionStrength;
            
            this.forces.get(rel.fromTable).x += fx;
            this.forces.get(rel.fromTable).y += fy;
            this.forces.get(rel.toTable).x -= fx;
            this.forces.get(rel.toTable).y -= fy;
        });
    }

    /**
     * Calculate ideal distance for connected tables
     */
    calculateIdealConnectionDistance(dim1, dim2) {
        const avgWidth = (dim1.width + dim2.width) / 2;
        const avgHeight = (dim1.height + dim2.height) / 2;
        return Math.max(avgWidth, avgHeight) + this.settings.minConnectionDistance;
    }

    /**
     * Calculate centering forces to keep diagram centered
     */
    calculateCenteringForces() {
        const centerX = this.bounds.width / 2;
        const centerY = this.bounds.height / 2;
        
        // Calculate current center of mass
        let totalX = 0, totalY = 0, totalArea = 0;
        
        this.tablePositions.forEach((pos, tableName) => {
            const dim = this.tableDimensions.get(tableName);
            const area = dim.area;
            totalX += (pos.x + dim.width / 2) * area;
            totalY += (pos.y + dim.height / 2) * area;
            totalArea += area;
        });
        
        if (totalArea === 0) return;
        
        const currentCenterX = totalX / totalArea;
        const currentCenterY = totalY / totalArea;
        
        const dx = centerX - currentCenterX;
        const dy = centerY - currentCenterY;
        
        // Apply centering force to all tables
        this.forces.forEach(force => {
            force.x += dx * this.settings.centeringForce;
            force.y += dy * this.settings.centeringForce;
        });
    }

    /**
     * Calculate boundary forces to keep tables within bounds
     */
    calculateBoundaryForces() {
        this.tablePositions.forEach((pos, tableName) => {
            const dim = this.tableDimensions.get(tableName);
            const force = this.forces.get(tableName);
            
            // Left boundary
            if (pos.x < this.settings.boundaryPadding) {
                force.x += (this.settings.boundaryPadding - pos.x) * 0.1;
            }
            
            // Right boundary
            if (pos.x + dim.width > this.bounds.width - this.settings.boundaryPadding) {
                force.x -= (pos.x + dim.width - (this.bounds.width - this.settings.boundaryPadding)) * 0.1;
            }
            
            // Top boundary
            if (pos.y < this.settings.boundaryPadding) {
                force.y += (this.settings.boundaryPadding - pos.y) * 0.1;
            }
            
            // Bottom boundary
            if (pos.y + dim.height > this.bounds.height - this.settings.boundaryPadding) {
                force.y -= (pos.y + dim.height - (this.bounds.height - this.settings.boundaryPadding)) * 0.1;
            }
        });
    }

    /**
     * Apply forces and update positions
     */
    applyForces() {
        this.tablePositions.forEach((pos, tableName) => {
            const force = this.forces.get(tableName);
            const velocity = this.velocities.get(tableName);
            
            // Update velocity with damping
            velocity.x = (velocity.x + force.x * this.settings.forceStrength) * this.settings.dampingFactor;
            velocity.y = (velocity.y + force.y * this.settings.forceStrength) * this.settings.dampingFactor;
            
            // Update position
            pos.x += velocity.x;
            pos.y += velocity.y;
        });
    }

    /**
     * Check if layout has converged
     */
    hasConverged() {
        let totalVelocity = 0;
        this.velocities.forEach(velocity => {
            totalVelocity += Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        });
        
        const avgVelocity = totalVelocity / this.velocities.size;
        return avgVelocity < 0.1; // Convergence threshold
    }

    /**
     * Resolve any remaining overlaps with direct positioning
     */
    resolveRemainingOverlaps() {
        const tableNames = Array.from(this.tablePositions.keys());
        let totalOverlapsInIteration;
        let iterations = 0;
        const maxOverlapIterations = 50; // Safety break for the overlap resolution loop

        do {
            totalOverlapsInIteration = 0;
            for (let i = 0; i < tableNames.length; i++) {
                for (let j = i + 1; j < tableNames.length; j++) {
                    if (this.tablesOverlap(tableNames[i], tableNames[j])) {
                        this.separateOverlappingTables(tableNames[i], tableNames[j]);
                        totalOverlapsInIteration++;
                    }
                }
            }
            iterations++;
        } while (totalOverlapsInIteration > 0 && iterations < maxOverlapIterations);

        if (iterations >= maxOverlapIterations && totalOverlapsInIteration > 0) {
            console.warn(`Overlap resolution reached max iterations (${maxOverlapIterations}) with ${totalOverlapsInIteration} overlaps remaining.`);
        }
    }

    /**
     * Check if two tables overlap
     */
    getOverlap(pos1, dim1, pos2, dim2, desiredMargin) {
        const center1X = pos1.x + dim1.width / 2;
        const center1Y = pos1.y + dim1.height / 2;
        const center2X = pos2.x + dim2.width / 2;
        const center2Y = pos2.y + dim2.height / 2;

        const dx = Math.abs(center1X - center2X);
        const dy = Math.abs(center1Y - center2Y);

        const minSeparationX = dim1.width / 2 + dim2.width / 2 + desiredMargin;
        const minSeparationY = dim1.height / 2 + dim2.height / 2 + desiredMargin;

        return {
            x: minSeparationX - dx, // Positive if overlapping in X (penetration depth)
            y: minSeparationY - dy  // Positive if overlapping in Y (penetration depth)
        };
    }

    tablesOverlap(table1Name, table2Name) {
        const pos1 = this.tablePositions.get(table1Name);
        const pos2 = this.tablePositions.get(table2Name);
        const dim1 = this.tableDimensions.get(table1Name);
        const dim2 = this.tableDimensions.get(table2Name);
        
        const overlap = this.getOverlap(pos1, dim1, pos2, dim2, this.settings.minTableDistance);
        return overlap.x > 0 && overlap.y > 0;
    }

    /**
     * Separate overlapping tables
     */
    separateOverlappingTables(table1Name, table2Name) {
        const pos1 = this.tablePositions.get(table1Name);
        const pos2 = this.tablePositions.get(table2Name);
        const dim1 = this.tableDimensions.get(table1Name);
        const dim2 = this.tableDimensions.get(table2Name);

        const overlap = this.getOverlap(pos1, dim1, pos2, dim2, this.settings.minTableDistance);

        // This check is technically redundant if called from resolveRemainingOverlaps where tablesOverlap is true,
        // but good for direct calls or if minTableDistance is zero.
        if (overlap.x > 0 || overlap.y > 0) { // If there's any overlap (even if just touching with zero margin)
            const center1X = pos1.x + dim1.width / 2;
            const center1Y = pos1.y + dim1.height / 2;
            const center2X = pos2.x + dim2.width / 2;
            const center2Y = pos2.y + dim2.height / 2;

            let pushX1 = 0, pushY1 = 0, pushX2 = 0, pushY2 = 0;

            // Resolve X overlap
            if (overlap.x > 0) {
                const sign = (center1X < center2X) ? -1 : 1;
                pushX1 = sign * overlap.x / 2;
                pushX2 = -sign * overlap.x / 2;
            }

            // Resolve Y overlap
            if (overlap.y > 0) {
                const sign = (center1Y < center2Y) ? -1 : 1;
                pushY1 = sign * overlap.y / 2;
                pushY2 = -sign * overlap.y / 2;
            }

            // Prefer pushing along the axis of MINIMUM actual penetration to "escape" more easily
            // This helps prevent oscillations when pushed against other objects.
            // Note: overlap.x/y here are penetration depths including the margin.
            // For actual geometric overlap, we'd use margin = 0 in getOverlap.
            const geometricOverlap = this.getOverlap(pos1, dim1, pos2, dim2, 0);

            if (geometricOverlap.x > 0 && geometricOverlap.y > 0) { // Only apply axis preference if truly overlapping
                if (geometricOverlap.x < geometricOverlap.y) { // Less overlap in X, prioritize pushing in X
                    pos1.x += pushX1;
                    pos2.x += pushX2;
                    // Re-evaluate Y push based on new X positions
                    const tempOverlapY = this.getOverlap(pos1, dim1, pos2, dim2, this.settings.minTableDistance).y;
                    if (tempOverlapY > 0) {
                        const signY = (pos1.y + dim1.height/2 < pos2.y + dim2.height/2) ? -1 : 1;
                        pos1.y += signY * tempOverlapY / 2;
                        pos2.y -= signY * tempOverlapY / 2;
                    }
                } else { // Less or equal overlap in Y (or X is not overlapping), prioritize pushing in Y
                    pos1.y += pushY1;
                    pos2.y += pushY2;
                     // Re-evaluate X push based on new Y positions
                    const tempOverlapX = this.getOverlap(pos1, dim1, pos2, dim2, this.settings.minTableDistance).x;
                    if (tempOverlapX > 0) {
                        const signX = (pos1.x + dim1.width/2 < pos2.x + dim2.width/2) ? -1 : 1;
                        pos1.x += signX * tempOverlapX / 2;
                        pos2.x -= signX * tempOverlapX / 2;
                    }
                }
            } else if (geometricOverlap.x > 0) { // Only X overlap
                pos1.x += pushX1;
                pos2.x += pushX2;
            } else if (geometricOverlap.y > 0) { // Only Y overlap
                pos1.y += pushY1;
                pos2.y += pushY2;
            } else { // No geometric overlap, just margin violation. Push along combined vector.
                 const dx = center2X - center1X;
                 const dy = center2Y - center1Y;
                 const distance = Math.sqrt(dx*dx + dy*dy) || 1;
                 const totalPushNeeded = Math.max(overlap.x > 0 ? overlap.x : 0, overlap.y > 0 ? overlap.y : 0); // Simplified
                 if (totalPushNeeded > 0) {
                    pos1.x -= (dx / distance) * totalPushNeeded / 2;
                    pos1.y -= (dy / distance) * totalPushNeeded / 2;
                    pos2.x += (dx / distance) * totalPushNeeded / 2;
                    pos2.y += (dy / distance) * totalPushNeeded / 2;
                 }
            }
            this.constrainToBounds(table1Name);
            this.constrainToBounds(table2Name);
        }
    }

    /**
     * Constrain table position to bounds
     */
    constrainToBounds(tableName) {
        const pos = this.tablePositions.get(tableName);
        const dim = this.tableDimensions.get(tableName);
        
        pos.x = Math.max(this.settings.boundaryPadding, 
                Math.min(this.bounds.width - dim.width - this.settings.boundaryPadding, pos.x));
        pos.y = Math.max(this.settings.boundaryPadding, 
                Math.min(this.bounds.height - dim.height - this.settings.boundaryPadding, pos.y));
    }

    /**
     * Optimize layout for readability
     */
    optimizeForReadability() {
        // Align tables to grid if beneficial
        if (this.settings.gridSize > 0) {
            this.alignToGrid();
        }
        
        // Minimize connection crossings
        this.minimizeConnectionCrossings();
        
        // Balance cluster spacing
        this.balanceClusterSpacing();
    }

    /**
     * Align table positions to grid
     */
    alignToGrid() {
        this.tablePositions.forEach((pos, tableName) => {
            pos.x = Math.round(pos.x / this.settings.gridSize) * this.settings.gridSize;
            pos.y = Math.round(pos.y / this.settings.gridSize) * this.settings.gridSize;
        });
    }

    /**
     * Minimize connection crossings through local optimization
     */
    minimizeConnectionCrossings() {
        // Simple heuristic: for each table, try small adjustments to reduce crossings
        const tableNames = Array.from(this.tablePositions.keys());
        const adjustmentRange = 20;
        
        tableNames.forEach(tableName => {
            const originalPos = { ...this.tablePositions.get(tableName) };
            let bestPos = { ...originalPos };
            let bestCrossings = this.countCrossingsForTable(tableName);
            
            // Try small adjustments
            for (let dx = -adjustmentRange; dx <= adjustmentRange; dx += 10) {
                for (let dy = -adjustmentRange; dy <= adjustmentRange; dy += 10) {
                    const testPos = { x: originalPos.x + dx, y: originalPos.y + dy };
                    this.tablePositions.set(tableName, testPos);
                    
                    if (!this.hasCollisions(tableName)) {
                        const crossings = this.countCrossingsForTable(tableName);
                        if (crossings < bestCrossings) {
                            bestCrossings = crossings;
                            bestPos = { ...testPos };
                        }
                    }
                }
            }
            
            this.tablePositions.set(tableName, bestPos);
        });
    }

    /**
     * Count connection crossings for a specific table
     */
    countCrossingsForTable(tableName) {
        const tableRelationships = this.relationships.filter(rel => 
            rel.fromTable === tableName || rel.toTable === tableName
        );
        
        let crossings = 0;
        tableRelationships.forEach(rel1 => {
            this.relationships.forEach(rel2 => {
                if (rel1 !== rel2 && this.relationshipsIntersect(rel1, rel2)) {
                    crossings++;
                }
            });
        });
        
        return crossings / 2; // Each crossing is counted twice
    }

    /**
     * Check if two relationships intersect
     */
    relationshipsIntersect(rel1, rel2) {
        const line1 = this.getRelationshipLine(rel1);
        const line2 = this.getRelationshipLine(rel2);
        
        if (!line1 || !line2) return false;
        
        return this.linesIntersect(line1.start, line1.end, line2.start, line2.end);
    }

    /**
     * Get relationship line coordinates
     */
    getRelationshipLine(relationship) {
        const pos1 = this.tablePositions.get(relationship.fromTable);
        const pos2 = this.tablePositions.get(relationship.toTable);
        const dim1 = this.tableDimensions.get(relationship.fromTable);
        const dim2 = this.tableDimensions.get(relationship.toTable);
        
        if (!pos1 || !pos2 || !dim1 || !dim2) return null;
        
        return {
            start: { x: pos1.x + dim1.width / 2, y: pos1.y + dim1.height / 2 },
            end: { x: pos2.x + dim2.width / 2, y: pos2.y + dim2.height / 2 }
        };
    }

    /**
     * Check if two line segments intersect
     */
    linesIntersect(p1, q1, p2, q2) {
        const orientation = (p, q, r) => {
            const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
            if (val === 0) return 0;
            return val > 0 ? 1 : 2;
        };
        
        const onSegment = (p, q, r) => {
            return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
                   q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
        };
        
        const o1 = orientation(p1, q1, p2);
        const o2 = orientation(p1, q1, q2);
        const o3 = orientation(p2, q2, p1);
        const o4 = orientation(p2, q2, q1);
        
        // General case
        if (o1 !== o2 && o3 !== o4) return true;
        
        // Special cases
        if (o1 === 0 && onSegment(p1, p2, q1)) return true;
        if (o2 === 0 && onSegment(p1, q2, q1)) return true;
        if (o3 === 0 && onSegment(p2, p1, q2)) return true;
        if (o4 === 0 && onSegment(p2, q1, q2)) return true;
        
        return false;
    }

    /**
     * Check if table has collisions with other tables
     */
    hasCollisions(tableName) {
        const tableNames = Array.from(this.tablePositions.keys());
        
        for (const otherTable of tableNames) {
            if (otherTable !== tableName && this.tablesOverlap(tableName, otherTable)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Balance spacing between clusters
     */
    balanceClusterSpacing() {
        if (this.clusters.length <= 1) return;
        
        // Calculate cluster centers and adjust spacing
        this.clusters.forEach(cluster => {
            const clusterCenter = this.calculateClusterCenter(cluster.tables);
            const clusterBounds = this.calculateClusterBounds(cluster.tables);
            
            // Adjust cluster position if too close to others
            this.clusters.forEach(otherCluster => {
                if (cluster !== otherCluster) {
                    const otherCenter = this.calculateClusterCenter(otherCluster.tables);
                    const distance = Math.sqrt(
                        Math.pow(clusterCenter.x - otherCenter.x, 2) +
                        Math.pow(clusterCenter.y - otherCenter.y, 2)
                    );
                    
                    if (distance < this.settings.clusterSeparation) {
                        this.adjustClusterPosition(cluster, clusterCenter, otherCenter);
                    }
                }
            });
        });
    }

    /**
     * Calculate cluster center
     */
    calculateClusterCenter(tableNames) {
        let totalX = 0, totalY = 0;
        
        tableNames.forEach(tableName => {
            const pos = this.tablePositions.get(tableName);
            const dim = this.tableDimensions.get(tableName);
            totalX += pos.x + dim.width / 2;
            totalY += pos.y + dim.height / 2;
        });
        
        return {
            x: totalX / tableNames.length,
            y: totalY / tableNames.length
        };
    }

    /**
     * Calculate cluster bounds
     */
    calculateClusterBounds(tableNames) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        tableNames.forEach(tableName => {
            const pos = this.tablePositions.get(tableName);
            const dim = this.tableDimensions.get(tableName);
            
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + dim.width);
            maxY = Math.max(maxY, pos.y + dim.height);
        });
        
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * Adjust cluster position
     */
    adjustClusterPosition(cluster, clusterCenter, otherCenter) {
        const dx = clusterCenter.x - otherCenter.x;
        const dy = clusterCenter.y - otherCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const separation = this.settings.clusterSeparation - distance;
        const unitX = dx / distance;
        const unitY = dy / distance;
        
        // Move cluster tables away from other cluster
        cluster.tables.forEach(tableName => {
            const pos = this.tablePositions.get(tableName);
            pos.x += unitX * separation * 0.5;
            pos.y += unitY * separation * 0.5;
            this.constrainToBounds(tableName);
        });
    }

   
    /**
     * Position orphan tables in a separate grid
     */
    positionOrphanTables(allTableNames, layoutTables) {
        const relatedTableNames = new Set();
        this.relationships.forEach(rel => {
            relatedTableNames.add(rel.fromTable);
            relatedTableNames.add(rel.toTable);
        });

        const orphanTableNames = allTableNames.filter(name => !relatedTableNames.has(name));

        if (orphanTableNames.length === 0) {
            return; // No orphan tables to position
        }

        console.log(`Positioning ${orphanTableNames.length} orphan tables.`);

        let maxYOfConnectedGraph = this.settings.boundaryPadding;
        layoutTables.forEach(table => {
            if (relatedTableNames.has(table.name)) {
                maxYOfConnectedGraph = Math.max(maxYOfConnectedGraph, table.y + table.height);
            }
        });

        // If all tables are orphans, start from boundaryPadding
        if (relatedTableNames.size === 0) {
            maxYOfConnectedGraph = 0; // Will be adjusted by orphanStartY
        }


        const orphanStartY = maxYOfConnectedGraph + this.settings.minTableDistance * 2; // Start orphans below connected graph
        const orphanGridCols = Math.floor((this.bounds.width - 2 * this.settings.boundaryPadding) / (200 + this.settings.minTableDistance)) || 1; // Assume avg width 200 for orphans
        let currentOrphanCol = 0;
        let currentOrphanRow = 0;
        let maxRowHeightInCurrentOrphanRow = 0;

        orphanTableNames.forEach(tableName => {
            const tableDim = this.tableDimensions.get(tableName);
            if (!tableDim) return;

            const newX = this.settings.boundaryPadding + currentOrphanCol * (tableDim.width + this.settings.minTableDistance);
            const newY = orphanStartY + currentOrphanRow * (maxRowHeightInCurrentOrphanRow + this.settings.minTableDistance);

            // Update position in the main map
            this.tablePositions.set(tableName, { x: newX, y: newY });

            // Update the layoutTables array directly for consistency if it's used later
            const layoutTable = layoutTables.find(t => t.name === tableName);
            if (layoutTable) {
                layoutTable.x = newX;
                layoutTable.y = newY;
            }

            maxRowHeightInCurrentOrphanRow = Math.max(maxRowHeightInCurrentOrphanRow, tableDim.height);
            currentOrphanCol++;
            if (currentOrphanCol >= orphanGridCols) {
                currentOrphanCol = 0;
                currentOrphanRow++;
                maxRowHeightInCurrentOrphanRow = 0; // Reset for new row
            }
        });
         // Adjust bounds if orphans extend too far down
        let totalOrphanHeight = 0;
        if (orphanTableNames.length > 0) {
            const lastOrphanName = orphanTableNames[orphanTableNames.length -1];
            const lastOrphanPos = this.tablePositions.get(lastOrphanName);
            const lastOrphanDim = this.tableDimensions.get(lastOrphanName);
            if (lastOrphanPos && lastOrphanDim) {
                 totalOrphanHeight = lastOrphanPos.y + lastOrphanDim.height + this.settings.boundaryPadding;
                 this.bounds.height = Math.max(this.bounds.height, totalOrphanHeight);
            }
        }
    }

    /**
     * Generate final layout result
     */
    generateLayoutResult(tables, relationships) {
        // Generate the initial layout for all tables using the calculated positions
        const allTableNames = tables.map(t => t.name);
        const layoutTables = tables.map(table => ({
            ...table,
            x: this.tablePositions.get(table.name)?.x || 0,
            y: this.tablePositions.get(table.name)?.y || 0,
            width: this.tableDimensions.get(table.name)?.width || 200,
            height: this.tableDimensions.get(table.name)?.height || 100
        }));

        // Identify and position orphan tables separately at the bottom
        this.positionOrphanTables(allTableNames, layoutTables);

        // Re-map the final positions for ALL tables, as orphans have now been moved.
        const finalLayoutTables = tables.map(table => ({
            ...table,
            x: this.tablePositions.get(table.name)?.x || 0,
            y: this.tablePositions.get(table.name)?.y || 0,
            width: this.tableDimensions.get(table.name)?.width || 200,
            height: this.tableDimensions.get(table.name)?.height || 100
        }));

        // Now, generate statistics based on the final, complete layout
        const statistics = this.generateLayoutStatistics();

        return {
            tables: finalLayoutTables,
            relationships: relationships,
            clusters: this.clusters,
            bounds: this.bounds, // Bounds might have been updated by orphan placement
            statistics: statistics
        };
    }

    /**
     * Generate layout statistics
     */
    generateLayoutStatistics() {
        let totalOverlaps = 0;
        let totalCrossings = 0;
        const tableNames = Array.from(this.tablePositions.keys());
        
        // Count overlaps
        for (let i = 0; i < tableNames.length; i++) {
            for (let j = i + 1; j < tableNames.length; j++) {
                if (this.tablesOverlap(tableNames[i], tableNames[j])) {
                    totalOverlaps++;
                }
            }
        }
        
        // Count crossings
        for (let i = 0; i < this.relationships.length; i++) {
            for (let j = i + 1; j < this.relationships.length; j++) {
                if (this.relationshipsIntersect(this.relationships[i], this.relationships[j])) {
                    totalCrossings++;
                }
            }
        }
        
        return {
            totalTables: tableNames.length,
            totalRelationships: this.relationships.length,
            totalClusters: this.clusters.length,
            overlaps: totalOverlaps,
            crossings: totalCrossings,
            layoutEfficiency: this.calculateLayoutEfficiency(totalOverlaps, totalCrossings)
        };
    }

    /**
     * Calculate layout efficiency score (0-100)
     */
    calculateLayoutEfficiency(overlaps, crossings) {
        const tableCount = this.tablePositions.size;
        const relationshipCount = this.relationships.length;
        
        if (tableCount === 0) return 100;
        
        // Penalize overlaps and crossings
        const overlapPenalty = (overlaps / (tableCount * (tableCount - 1) / 2)) * 50;
        const crossingPenalty = relationshipCount > 0 ? (crossings / (relationshipCount * (relationshipCount - 1) / 2)) * 30 : 0;
        
        const efficiency = Math.max(0, 100 - overlapPenalty - crossingPenalty);
        return Math.round(efficiency);
    }

    /**
     * Update settings and recalculate if needed
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    /**
     * Get current table positions
     */
    getTablePositions() {
        return new Map(this.tablePositions);
    }

    /**
     * Set table position manually
     */
    setTablePosition(tableName, x, y) {
        if (this.tablePositions.has(tableName)) {
            this.tablePositions.set(tableName, { x, y });
        }
    }

    /**
     * Animate layout changes
     */
    animateToLayout(targetLayout, duration = 1000) {
        const startPositions = new Map(this.tablePositions);
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing function (ease-out)
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                
                // Interpolate positions
                targetLayout.tables.forEach(table => {
                    const startPos = startPositions.get(table.name);
                    if (startPos) {
                        const currentPos = this.tablePositions.get(table.name);
                        currentPos.x = startPos.x + (table.x - startPos.x) * easedProgress;
                        currentPos.y = startPos.y + (table.y - startPos.y) * easedProgress;
                    }
                });
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            
            animate();
        });
    }
}