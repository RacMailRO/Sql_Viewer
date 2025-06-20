/**
 * Enhanced ERD Renderer with Intelligent Routing and Margin Controls
 * Provides advanced visualization features with configurable spacing and smart connection routing
 */
import { ERDRenderer } from './ERDRenderer.js';

export class EnhancedERDRenderer extends ERDRenderer {
    constructor(containerId, eventBus) {
        super(containerId, eventBus);
        
        // Enhanced rendering settings
        this.settings = {
            tableMargin: 50,
            minTableSpacing: 30,
            connectionPadding: 15,
            gridSize: 20,
            snapToGrid: false,
            showGrid: false,
            preventOverlap: true,
            connectionStyle: 'orthogonal',
            arrowStyle: 'crowsfoot',
            lineThickness: 2,
            connectionOpacity: 1.0
        };
        
        // Routing and positioning
        this.tablePositions = new Map();
        this.connectionRoutes = new Map();
        this.occupiedSpaces = [];
        this.gridOverlay = null;
        
        // Enhanced features
        this.highlightedPaths = new Set();
        this.selectedElements = new Set();
        this.hoverTooltip = null;
        
        this.initializeEnhancedFeatures();
    }

    /**
     * Initialize enhanced features
     */
    initializeEnhancedFeatures() {
        this.createGridOverlay();
        this.setupEnhancedEventListeners();
        this.initializeTooltipSystem();
    }

    /**
     * Create grid overlay for alignment
     */
    createGridOverlay() {
        if (this.gridOverlay) {
            this.gridOverlay.remove();
        }
        
        this.gridOverlay = this.svg.append('g')
            .attr('class', 'grid-overlay')
            .style('display', this.settings.showGrid ? 'block' : 'none');
    }

    /**
     * Update settings from settings panel
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        
        // Update grid visibility
        if (this.gridOverlay) {
            this.gridOverlay.style('display', this.settings.showGrid ? 'block' : 'none');
        }
        
        // Redraw with new settings
        if (this.currentData) {
            this.render(this.currentData);
        }
    }

    /**
     * Enhanced render method with intelligent positioning
     */
    render(data) {
        this.currentData = data;
        this.clearVisualization();
        
        if (!data || !data.tables || data.tables.length === 0) {
            this.showEmptyState();
            return;
        }
        
        // Calculate intelligent positions
        this.calculateOptimalPositions(data);
        
        // Draw grid if enabled
        if (this.settings.showGrid) {
            this.drawGrid();
        }
        
        // Render tables with enhanced positioning
        this.renderEnhancedTables(data.tables);
        
        // Render relationships with intelligent routing
        if (data.relationships) {
            this.renderIntelligentRelationships(data.relationships);
        }
        
        // Apply zoom and pan
        this.setupZoomAndPan();
        
        // Emit render complete event
        this.emitEvent('render:complete', { data, settings: this.settings });
    }

    /**
     * Calculate optimal positions for tables to minimize overlaps and crossings
     */
    calculateOptimalPositions(data) {
        const tables = data.tables;
        const relationships = data.relationships || [];
        
        // Clear previous positions and occupied spaces
        this.tablePositions.clear();
        this.occupiedSpaces = [];
        
        if (tables.length === 0) return;
        
        // Use different layout algorithms based on settings
        switch (this.settings.autoLayout) {
            case 'force-directed':
                this.calculateForceDirectedLayout(tables, relationships);
                break;
            case 'hierarchical':
                this.calculateHierarchicalLayout(tables, relationships);
                break;
            case 'circular':
                this.calculateCircularLayout(tables, relationships);
                break;
            case 'grid':
                this.calculateGridLayout(tables);
                break;
            default:
                this.calculateForceDirectedLayout(tables, relationships);
        }
        
        // Apply overlap prevention if enabled
        if (this.settings.preventOverlap) {
            this.preventTableOverlaps();
        }
        
        // Snap to grid if enabled
        if (this.settings.snapToGrid) {
            this.snapPositionsToGrid();
        }
    }

    /**
     * Calculate force-directed layout
     */
    calculateForceDirectedLayout(tables, relationships) {
        const width = this.width || 1200;
        const height = this.height || 800;
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Initialize positions randomly
        tables.forEach((table, index) => {
            const angle = (index / tables.length) * 2 * Math.PI;
            const radius = Math.min(width, height) * 0.3;
            
            this.tablePositions.set(table.name, {
                x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 100,
                y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 100,
                width: this.calculateTableWidth(table),
                height: this.calculateTableHeight(table)
            });
        });
        
        // Apply force-directed algorithm
        this.applyForceDirectedAlgorithm(tables, relationships, 100); // 100 iterations
    }

    /**
     * Apply force-directed algorithm
     */
    applyForceDirectedAlgorithm(tables, relationships, iterations) {
        const k = 50; // Spring constant
        const repulsion = 1000; // Repulsion force
        const damping = 0.9; // Damping factor
        
        for (let i = 0; i < iterations; i++) {
            const forces = new Map();
            
            // Initialize forces
            tables.forEach(table => {
                forces.set(table.name, { x: 0, y: 0 });
            });
            
            // Calculate repulsion forces between all table pairs
            for (let i = 0; i < tables.length; i++) {
                for (let j = i + 1; j < tables.length; j++) {
                    const table1 = tables[i];
                    const table2 = tables[j];
                    const pos1 = this.tablePositions.get(table1.name);
                    const pos2 = this.tablePositions.get(table2.name);
                    
                    const dx = pos2.x - pos1.x;
                    const dy = pos2.y - pos1.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    
                    const force = repulsion / (distance * distance);
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    
                    forces.get(table1.name).x -= fx;
                    forces.get(table1.name).y -= fy;
                    forces.get(table2.name).x += fx;
                    forces.get(table2.name).y += fy;
                }
            }
            
            // Calculate attraction forces from relationships
            relationships.forEach(rel => {
                const pos1 = this.tablePositions.get(rel.fromTable);
                const pos2 = this.tablePositions.get(rel.toTable);
                
                if (pos1 && pos2) {
                    const dx = pos2.x - pos1.x;
                    const dy = pos2.y - pos1.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    
                    const force = (distance - k) * 0.1;
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    
                    forces.get(rel.fromTable).x += fx;
                    forces.get(rel.fromTable).y += fy;
                    forces.get(rel.toTable).x -= fx;
                    forces.get(rel.toTable).y -= fy;
                }
            });
            
            // Apply forces with damping
            tables.forEach(table => {
                const pos = this.tablePositions.get(table.name);
                const force = forces.get(table.name);
                
                pos.x += force.x * damping;
                pos.y += force.y * damping;
                
                // Keep within bounds
                pos.x = Math.max(this.settings.tableMargin, Math.min(this.width - pos.width - this.settings.tableMargin, pos.x));
                pos.y = Math.max(this.settings.tableMargin, Math.min(this.height - pos.height - this.settings.tableMargin, pos.y));
            });
        }
    }

    /**
     * Calculate hierarchical layout
     */
    calculateHierarchicalLayout(tables, relationships) {
        // Group tables by hierarchy level
        const levels = this.calculateHierarchyLevels(tables, relationships);
        const levelHeight = (this.height - 2 * this.settings.tableMargin) / levels.length;
        
        levels.forEach((levelTables, levelIndex) => {
            const levelWidth = this.width - 2 * this.settings.tableMargin;
            const tableWidth = levelWidth / levelTables.length;
            
            levelTables.forEach((table, tableIndex) => {
                this.tablePositions.set(table.name, {
                    x: this.settings.tableMargin + tableIndex * tableWidth + tableWidth / 2 - this.calculateTableWidth(table) / 2,
                    y: this.settings.tableMargin + levelIndex * levelHeight + levelHeight / 2 - this.calculateTableHeight(table) / 2,
                    width: this.calculateTableWidth(table),
                    height: this.calculateTableHeight(table)
                });
            });
        });
    }

    /**
     * Calculate hierarchy levels
     */
    calculateHierarchyLevels(tables, relationships) {
        const levels = [];
        const visited = new Set();
        const inDegree = new Map();
        
        // Calculate in-degrees
        tables.forEach(table => inDegree.set(table.name, 0));
        relationships.forEach(rel => {
            inDegree.set(rel.toTable, (inDegree.get(rel.toTable) || 0) + 1);
        });
        
        // Topological sort to determine levels
        let currentLevel = tables.filter(table => inDegree.get(table.name) === 0);
        
        while (currentLevel.length > 0) {
            levels.push([...currentLevel]);
            currentLevel.forEach(table => visited.add(table.name));
            
            const nextLevel = [];
            relationships.forEach(rel => {
                if (visited.has(rel.fromTable)) {
                    const newInDegree = inDegree.get(rel.toTable) - 1;
                    inDegree.set(rel.toTable, newInDegree);
                    
                    if (newInDegree === 0 && !visited.has(rel.toTable)) {
                        const table = tables.find(t => t.name === rel.toTable);
                        if (table && !nextLevel.includes(table)) {
                            nextLevel.push(table);
                        }
                    }
                }
            });
            
            currentLevel = nextLevel;
        }
        
        // Add remaining tables to the last level
        const remaining = tables.filter(table => !visited.has(table.name));
        if (remaining.length > 0) {
            levels.push(remaining);
        }
        
        return levels;
    }

    /**
     * Calculate circular layout
     */
    calculateCircularLayout(tables) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = Math.min(this.width, this.height) * 0.35;
        
        tables.forEach((table, index) => {
            const angle = (index / tables.length) * 2 * Math.PI - Math.PI / 2; // Start from top
            
            this.tablePositions.set(table.name, {
                x: centerX + Math.cos(angle) * radius - this.calculateTableWidth(table) / 2,
                y: centerY + Math.sin(angle) * radius - this.calculateTableHeight(table) / 2,
                width: this.calculateTableWidth(table),
                height: this.calculateTableHeight(table)
            });
        });
    }

    /**
     * Calculate grid layout
     */
    calculateGridLayout(tables) {
        const cols = Math.ceil(Math.sqrt(tables.length));
        const rows = Math.ceil(tables.length / cols);
        
        const cellWidth = (this.width - 2 * this.settings.tableMargin) / cols;
        const cellHeight = (this.height - 2 * this.settings.tableMargin) / rows;
        
        tables.forEach((table, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            
            this.tablePositions.set(table.name, {
                x: this.settings.tableMargin + col * cellWidth + cellWidth / 2 - this.calculateTableWidth(table) / 2,
                y: this.settings.tableMargin + row * cellHeight + cellHeight / 2 - this.calculateTableHeight(table) / 2,
                width: this.calculateTableWidth(table),
                height: this.calculateTableHeight(table)
            });
        });
    }

    /**
     * Prevent table overlaps
     */
    preventTableOverlaps() {
        const positions = Array.from(this.tablePositions.values());
        let hasOverlap = true;
        let iterations = 0;
        const maxIterations = 50;
        
        while (hasOverlap && iterations < maxIterations) {
            hasOverlap = false;
            iterations++;
            
            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    const pos1 = positions[i];
                    const pos2 = positions[j];
                    
                    if (this.tablesOverlap(pos1, pos2)) {
                        hasOverlap = true;
                        this.separateOverlappingTables(pos1, pos2);
                    }
                }
            }
        }
    }

    /**
     * Check if two tables overlap
     */
    tablesOverlap(pos1, pos2) {
        const margin = this.settings.minTableSpacing;
        
        return !(pos1.x + pos1.width + margin < pos2.x ||
                pos2.x + pos2.width + margin < pos1.x ||
                pos1.y + pos1.height + margin < pos2.y ||
                pos2.y + pos2.height + margin < pos1.y);
    }

    /**
     * Separate overlapping tables
     */
    separateOverlappingTables(pos1, pos2) {
        const centerX1 = pos1.x + pos1.width / 2;
        const centerY1 = pos1.y + pos1.height / 2;
        const centerX2 = pos2.x + pos2.width / 2;
        const centerY2 = pos2.y + pos2.height / 2;
        
        const dx = centerX2 - centerX1;
        const dy = centerY2 - centerY1;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        
        const minDistance = (pos1.width + pos2.width) / 2 + this.settings.minTableSpacing;
        const pushDistance = (minDistance - distance) / 2;
        
        const pushX = (dx / distance) * pushDistance;
        const pushY = (dy / distance) * pushDistance;
        
        pos1.x -= pushX;
        pos1.y -= pushY;
        pos2.x += pushX;
        pos2.y += pushY;
        
        // Keep within bounds
        pos1.x = Math.max(this.settings.tableMargin, Math.min(this.width - pos1.width - this.settings.tableMargin, pos1.x));
        pos1.y = Math.max(this.settings.tableMargin, Math.min(this.height - pos1.height - this.settings.tableMargin, pos1.y));
        pos2.x = Math.max(this.settings.tableMargin, Math.min(this.width - pos2.width - this.settings.tableMargin, pos2.x));
        pos2.y = Math.max(this.settings.tableMargin, Math.min(this.height - pos2.height - this.settings.tableMargin, pos2.y));
    }

    /**
     * Snap positions to grid
     */
    snapPositionsToGrid() {
        const gridSize = this.settings.gridSize;
        
        this.tablePositions.forEach(pos => {
            pos.x = Math.round(pos.x / gridSize) * gridSize;
            pos.y = Math.round(pos.y / gridSize) * gridSize;
        });
    }

    /**
     * Draw grid overlay
     */
    drawGrid() {
        const gridSize = this.settings.gridSize;
        const width = this.width;
        const height = this.height;
        
        this.gridOverlay.selectAll('*').remove();
        
        // Vertical lines
        for (let x = 0; x <= width; x += gridSize) {
            this.gridOverlay.append('line')
                .attr('x1', x)
                .attr('y1', 0)
                .attr('x2', x)
                .attr('y2', height)
                .attr('class', 'grid-line');
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += gridSize) {
            this.gridOverlay.append('line')
                .attr('x1', 0)
                .attr('y1', y)
                .attr('x2', width)
                .attr('y2', y)
                .attr('class', 'grid-line');
        }
    }

    /**
     * Render tables with enhanced positioning
     */
    renderEnhancedTables(tables) {
        const tableGroups = this.tablesGroup.selectAll('.table-group')
            .data(tables)
            .enter()
            .append('g')
            .attr('class', 'table-group')
            .attr('transform', d => {
                const pos = this.tablePositions.get(d.name);
                return `translate(${pos.x}, ${pos.y})`;
            });
        
        // Add table backgrounds with enhanced styling
        tableGroups.append('rect')
            .attr('class', 'table-background')
            .attr('width', d => this.tablePositions.get(d.name).width)
            .attr('height', d => this.tablePositions.get(d.name).height)
            .attr('rx', 8)
            .attr('ry', 8);
        
        // Add table headers
        this.addEnhancedTableHeaders(tableGroups);
        
        // Add table columns
        this.addEnhancedTableColumns(tableGroups);
        
        // Add interaction handlers
        this.addTableInteractionHandlers(tableGroups);
    }

    /**
     * Add enhanced table headers
     */
    addEnhancedTableHeaders(tableGroups) {
        const headerHeight = 40;
        
        tableGroups.append('rect')
            .attr('class', 'table-header')
            .attr('width', d => this.tablePositions.get(d.name).width)
            .attr('height', headerHeight)
            .attr('rx', 8)
            .attr('ry', 8);
        
        tableGroups.append('text')
            .attr('class', 'table-name')
            .attr('x', d => this.tablePositions.get(d.name).width / 2)
            .attr('y', headerHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .text(d => d.name);
        
        // Add table statistics badge
        tableGroups.append('circle')
            .attr('class', 'table-stats-badge')
            .attr('cx', d => this.tablePositions.get(d.name).width - 15)
            .attr('cy', 15)
            .attr('r', 8);
        
        tableGroups.append('text')
            .attr('class', 'table-stats-text')
            .attr('x', d => this.tablePositions.get(d.name).width - 15)
            .attr('y', 15)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .text(d => (d.columns || []).length);
    }

    /**
     * Add enhanced table columns
     */
    addEnhancedTableColumns(tableGroups) {
        const headerHeight = 40;
        const rowHeight = 25;
        
        tableGroups.each((table, i, nodes) => {
            const group = d3.select(nodes[i]);
            const columns = table.columns || [];
            
            columns.forEach((column, index) => {
                const y = headerHeight + index * rowHeight;
                
                // Column background (for hover effects)
                group.append('rect')
                    .attr('class', 'column-background')
                    .attr('x', 2)
                    .attr('y', y + 2)
                    .attr('width', this.tablePositions.get(table.name).width - 4)
                    .attr('height', rowHeight - 2)
                    .attr('rx', 3);
                
                // Column name
                group.append('text')
                    .attr('class', `column-name ${column.isPrimary ? 'primary-key' : ''} ${column.isForeign ? 'foreign-key' : ''}`)
                    .attr('x', 10)
                    .attr('y', y + rowHeight / 2)
                    .attr('dominant-baseline', 'middle')
                    .text(column.name);
                
                // Column type (if enabled in settings)
                if (this.settings.showColumnTypes) {
                    group.append('text')
                        .attr('class', 'column-type')
                        .attr('x', this.tablePositions.get(table.name).width - 10)
                        .attr('y', y + rowHeight / 2)
                        .attr('text-anchor', 'end')
                        .attr('dominant-baseline', 'middle')
                        .text(column.type || '');
                }
                
                // Column indicators
                this.addColumnIndicators(group, column, y, rowHeight);
            });
        });
    }

    /**
     * Add column indicators (PK, FK, etc.)
     */
    addColumnIndicators(group, column, y, rowHeight) {
        let indicatorX = 0;
        
        if (column.isPrimary) {
            group.append('rect')
                .attr('class', 'pk-indicator')
                .attr('x', indicatorX)
                .attr('y', y + 3)
                .attr('width', 3)
                .attr('height', rowHeight - 6);
            indicatorX += 5;
        }
        
        if (column.isForeign) {
            group.append('rect')
                .attr('class', 'fk-indicator')
                .attr('x', indicatorX)
                .attr('y', y + 3)
                .attr('width', 3)
                .attr('height', rowHeight - 6);
            indicatorX += 5;
        }
        
        if (column.required || column.notNull) {
            group.append('circle')
                .attr('class', 'required-indicator')
                .attr('cx', indicatorX + 2)
                .attr('cy', y + rowHeight / 2)
                .attr('r', 2);
        }
    }

    /**
     * Render relationships with intelligent routing
     */
    renderIntelligentRelationships(relationships) {
        this.connectionRoutes.clear();
        
        relationships.forEach(relationship => {
            const route = this.calculateOptimalRoute(relationship);
            if (route) {
                this.connectionRoutes.set(this.getRelationshipId(relationship), route);
                this.renderIntelligentConnection(relationship, route);
            }
        });
    }

    /**
     * Calculate optimal route for a relationship
     */
    calculateOptimalRoute(relationship) {
        const fromPos = this.tablePositions.get(relationship.fromTable);
        const toPos = this.tablePositions.get(relationship.toTable);
        
        if (!fromPos || !toPos) return null;
        
        // Calculate optimal connection points
        const connectionPoints = this.calculateOptimalConnectionPoints(fromPos, toPos);
        
        // Generate route based on connection style
        switch (this.settings.connectionStyle) {
            case 'straight':
                return this.generateStraightRoute(connectionPoints);
            case 'curved':
                return this.generateCurvedRoute(connectionPoints);
            case 'orthogonal':
            default:
                return this.generateOrthogonalRoute(connectionPoints);
        }
    }

    /**
     * Calculate optimal connection points on table edges
     */
    calculateOptimalConnectionPoints(fromPos, toPos) {
        // Calculate centers
        const fromCenter = {
            x: fromPos.x + fromPos.width / 2,
            y: fromPos.y + fromPos.height / 2
        };
        const toCenter = {
            x: toPos.x + toPos.width / 2,
            y: toPos.y + toPos.height / 2
        };
        
        // Calculate direction vector
        const dx = toCenter.x - fromCenter.x;
        const dy = toCenter.y - fromCenter.y;
        
        // Determine best connection sides
        const fromSide = this.determineBestConnectionSide(fromPos, dx, dy);
        const toSide = this.determineBestConnectionSide(toPos, -dx, -dy);
        
        // Calculate exact connection points
        const fromPoint = this.getConnectionPoint(fromPos, fromSide);
        const toPoint = this.getConnectionPoint(toPos, toSide);
        
        return { from: fromPoint, to: toPoint, fromSide, toSide };
    }

    /**
     * Determine best connection side for a table
     */
    determineBestConnectionSide(pos, dx, dy) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        
        if (absX > absY) {
            return dx > 0 ? 'right' : 'left';
        } else {
            return dy > 0 ? 'bottom' : 'top';
        }
    }

    /**
     * Get connection point on table edge
     */
    getConnectionPoint(pos, side) {
        const padding = this.settings.connectionPadding;
        
        switch (side) {
            case 'left':
                return {
                    x: pos.x - padding,
                    y: pos.y + pos.height / 2
                };
            case 'right':
                return {
                    x: pos.x + pos.width + padding,
                    y: pos.y + pos.height / 2
                };
            case 'top':
                return {
                    x: pos.x + pos.width / 2,
                    y: pos.y - padding
                };
            case 'bottom':
                return {
                    x: pos.x + pos.width / 2,
                    y: pos.y + pos.height + padding
                };
            default:
                return {
                    x: pos.x + pos.width / 2,
                    y: pos.y + pos.height / 2
                };
        }
    }

    /**
     * Generate orthogonal route
     */
    generateOrthogonalRoute(connectionPoints) {
        const { from, to, fromSide, toSide } = connectionPoints;
        const points = [from];
        
        // Add intermediate points for orthogonal routing
        if (fromSide === 'left' || fromSide === 'right') {
            if (toSide === 'left' || toSide === 'right') {
                // Horizontal to horizontal
                const midX = (from.x + to.x) / 2;
                points.push({ x: midX, y: from.y });
                points.push({ x: midX, y: to.y });
            } else {
                // Horizontal to vertical
                points.push({ x: to.x, y: from.y });
            }
        } else {
            if (toSide === 'top' || toSide === 'bottom') {
                // Vertical to vertical
                const midY = (from.y + to.y) / 2;
                points.push({ x: from.x, y: midY });
                points.push({ x: to.x, y: midY });
            } else {
                // Vertical to horizontal
                points.push({ x: from.x, y: to.y });
            }
        }
        
        points.push(to);
        return { points, style: 'orthogonal' };
    }

    /**
     * Generate straight route
     */
    generateStraightRoute(connectionPoints) {
        return {
            points: [connectionPoints.from, connectionPoints.to],
            style: 'straight'
        };
    }

    /**
     * Generate curved route
     */
    generateCurvedRoute(connectionPoints) {
        const { from, to } = connectionPoints;
        const controlPoint1 = {
            x: from.x + (to.x - from.x) * 0.3,
            y: from.y
        };
        const controlPoint2 = {
            x: from.x + (to.x - from.x) * 0.7,
            y: to.y
        };
        
        return {
            points: [from, controlPoint1, controlPoint2, to],
            style: 'curved'
        };
    }

    /**
     * Render intelligent connection
     */
    renderIntelligentConnection(relationship, route) {
        const connectionId = this.getRelationshipId(relationship);
        const pathData = this.generatePathData(route);
        
        // Main connection line
        const connection = this.connectionsGroup.append('path')
            .attr('class', 'connection-line')
            .attr('d', pathData)
            .attr('stroke-width', this.settings.lineThickness)
            .attr('stroke-opacity', this.settings.connectionOpacity)
            .attr('data-relationship-id', connectionId);
        
        // Add relationship markers
        this.addRelationshipMarkers(connection, relationship, route);
        
        // Add relationship label if enabled
        if (this.settings.showRelationshipLabels) {
            this.addRelationshipLabel(relationship, route);
        }
        
        // Add interaction handlers
        this.addConnectionInteractionHandlers(connection, relationship);
    }

    /**
     * Generate SVG path data from route
     */
    generatePathData(route) {
        const points = route.points;
        if (!points || points.length === 0) return '';
        
        if (route.style === 'curved' && points.length >= 4) {
            // Bezier curve
            return `M ${points[0].x} ${points[0].y} C ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`;
        } else {
            // Line segments
            let path = `M ${points[0].x} ${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                path += ` L ${points[i].x} ${points[i].y}`;
            }
            return path;
        }
    }

    /**
     * Add relationship markers (arrows, crow's foot, etc.)
     */
    addRelationshipMarkers(connection, relationship, route) {
        const points = route.points;
        if (points.length < 2) return;
        
        const lastPoint = points[points.length - 1];
        const secondLastPoint = points[points.length - 2];
        
        // Calculate arrow direction
        const dx = lastPoint.x - secondLastPoint.x;
        const dy = lastPoint.y - secondLastPoint.y;
        const angle = Math.atan2(dy, dx);
        
        // Add marker based on relationship type
        const markerType = this.determineMarkerType(relationship);
        this.addMarker(lastPoint, angle, markerType, connection);
    }

    /**
     * Determine marker type based on relationship
     */
    determineMarkerType(relationship) {
        const toCardinality = relationship.toCardinality || '1';
        
        if (toCardinality === 'many' || toCardinality === '*') {
            return 'crowsfoot';
        } else if (toCardinality === '1') {
            return 'one';
        } else {
            return 'simple';
        }
    }

    /**
     * Add marker at connection point
     */
    addMarker(point, angle, type, connection) {
        const markerSize = 12;
        const group = this.connectionsGroup.append('g')
            .attr('class', `connection-marker marker-${type}`)
            .attr('transform', `translate(${point.x}, ${point.y}) rotate(${angle * 180 / Math.PI})`);
        
        switch (type) {
            case 'crowsfoot':
                // Crow's foot notation
                group.append('path')
                    .attr('d', `M -${markerSize} -6 L 0 0 L -${markerSize} 6 M -${markerSize} 0 L 0 0`)
                    .attr('stroke-width', 2)
                    .attr('fill', 'none');
                break;
            case 'one':
                // Single line for "one" cardinality
                group.append('line')
                    .attr('x1', -markerSize)
                    .attr('y1', -6)
                    .attr('x2', -markerSize)
                    .attr('y2', 6)
                    .attr('stroke-width', 2);
                break;
            case 'simple':
            default:
                // Simple arrow
                group.append('path')
                    .attr('d', `M 0 0 L -${markerSize} -6 L -${markerSize/2} 0 L -${markerSize} 6 Z`)
                    .attr('fill', 'currentColor');
                break;
        }
    }

    /**
     * Add relationship label
     */
    addRelationshipLabel(relationship, route) {
        const points = route.points;
        if (points.length < 2) return;
        
        // Find midpoint of the route
        const midIndex = Math.floor(points.length / 2);
        const labelPoint = points[midIndex];
        
        // Create label
        const label = this.connectionsGroup.append('g')
            .attr('class', 'relationship-label')
            .attr('transform', `translate(${labelPoint.x}, ${labelPoint.y})`);
        
        // Background
        const text = relationship.name || `${relationship.fromCardinality || '1'}:${relationship.toCardinality || '1'}`;
        const textElement = label.append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('class', 'relationship-label-text')
            .text(text);
        
        // Get text dimensions for background
        const bbox = textElement.node().getBBox();
        label.insert('rect', 'text')
            .attr('class', 'relationship-label-background')
            .attr('x', bbox.x - 4)
            .attr('y', bbox.y - 2)
            .attr('width', bbox.width + 8)
            .attr('height', bbox.height + 4)
            .attr('rx', 3);
    }

    /**
     * Add table interaction handlers
     */
    addTableInteractionHandlers(tableGroups) {
        tableGroups
            .on('click', (event, table) => {
                this.handleTableClick(event, table);
            })
            .on('mouseenter', (event, table) => {
                this.handleTableHover(event, table, true);
            })
            .on('mouseleave', (event, table) => {
                this.handleTableHover(event, table, false);
            })
            .call(this.createDragBehavior());
    }

    /**
     * Add connection interaction handlers
     */
    addConnectionInteractionHandlers(connection, relationship) {
        connection
            .on('click', (event) => {
                this.handleConnectionClick(event, relationship);
            })
            .on('mouseenter', (event) => {
                this.handleConnectionHover(event, relationship, true);
            })
            .on('mouseleave', (event) => {
                this.handleConnectionHover(event, relationship, false);
            });
    }

    /**
     * Handle table click
     */
    handleTableClick(event, table) {
        event.stopPropagation();
        
        // Toggle selection
        if (this.selectedElements.has(table.name)) {
            this.selectedElements.delete(table.name);
        } else {
            this.selectedElements.add(table.name);
        }
        
        this.updateSelectionHighlight();
        this.emitEvent('table:click', { table, event });
    }

    /**
     * Handle table hover
     */
    handleTableHover(event, table, isEnter) {
        if (isEnter) {
            this.showAdvancedTooltip(event, table, 'table');
            this.highlightTableConnections(table.name);
        } else {
            this.hideAdvancedTooltip();
            this.clearConnectionHighlights();
        }
    }

    /**
     * Handle connection click
     */
    handleConnectionClick(event, relationship) {
        event.stopPropagation();
        
        const relationshipId = this.getRelationshipId(relationship);
        
        // Toggle selection
        if (this.selectedElements.has(relationshipId)) {
            this.selectedElements.delete(relationshipId);
        } else {
            this.selectedElements.add(relationshipId);
        }
        
        this.updateSelectionHighlight();
        this.emitEvent('connection:click', { relationship, event });
    }

    /**
     * Handle connection hover
     */
    handleConnectionHover(event, relationship, isEnter) {
        if (isEnter) {
            this.showAdvancedTooltip(event, relationship, 'relationship');
            this.highlightRelationshipPath(relationship);
        } else {
            this.hideAdvancedTooltip();
            this.clearPathHighlights();
        }
    }

    /**
     * Create drag behavior with enhanced positioning
     */
    createDragBehavior() {
        return d3.drag()
            .on('start', (event, table) => {
                this.emitEvent('table:dragstart', { table, event });
            })
            .on('drag', (event, table) => {
                const pos = this.tablePositions.get(table.name);
                if (pos) {
                    pos.x = Math.max(this.settings.tableMargin,
                        Math.min(this.width - pos.width - this.settings.tableMargin,
                            pos.x + event.dx));
                    pos.y = Math.max(this.settings.tableMargin,
                        Math.min(this.height - pos.height - this.settings.tableMargin,
                            pos.y + event.dy));
                    
                    // Snap to grid if enabled
                    if (this.settings.snapToGrid) {
                        pos.x = Math.round(pos.x / this.settings.gridSize) * this.settings.gridSize;
                        pos.y = Math.round(pos.y / this.settings.gridSize) * this.settings.gridSize;
                    }
                    
                    // Update table position
                    d3.select(event.sourceEvent.target.closest('.table-group'))
                        .attr('transform', `translate(${pos.x}, ${pos.y})`);
                    
                    // Update connected relationships
                    this.updateConnectedRelationships(table.name);
                }
            })
            .on('end', (event, table) => {
                this.emitEvent('table:dragend', { table, event });
            });
    }

    /**
     * Update relationships connected to a table
     */
    updateConnectedRelationships(tableName) {
        if (!this.currentData?.relationships) return;
        
        const connectedRelationships = this.currentData.relationships.filter(rel =>
            rel.fromTable === tableName || rel.toTable === tableName
        );
        
        connectedRelationships.forEach(relationship => {
            const route = this.calculateOptimalRoute(relationship);
            if (route) {
                const connectionId = this.getRelationshipId(relationship);
                this.connectionRoutes.set(connectionId, route);
                
                // Update the path
                const pathElement = this.connectionsGroup.select(`[data-relationship-id="${connectionId}"]`);
                if (!pathElement.empty()) {
                    pathElement.attr('d', this.generatePathData(route));
                }
                
                // Update markers and labels
                this.updateConnectionMarkers(connectionId, relationship, route);
            }
        });
    }

    /**
     * Update connection markers
     */
    updateConnectionMarkers(connectionId, relationship, route) {
        // Remove existing markers
        this.connectionsGroup.selectAll(`.connection-marker[data-connection="${connectionId}"]`).remove();
        this.connectionsGroup.selectAll(`.relationship-label[data-connection="${connectionId}"]`).remove();
        
        // Add new markers
        const connection = this.connectionsGroup.select(`[data-relationship-id="${connectionId}"]`);
        this.addRelationshipMarkers(connection, relationship, route);
        
        if (this.settings.showRelationshipLabels) {
            this.addRelationshipLabel(relationship, route);
        }
    }

    /**
     * Highlight table connections
     */
    highlightTableConnections(tableName) {
        if (!this.currentData?.relationships) return;
        
        const connectedRelationships = this.currentData.relationships.filter(rel =>
            rel.fromTable === tableName || rel.toTable === tableName
        );
        
        connectedRelationships.forEach(relationship => {
            const connectionId = this.getRelationshipId(relationship);
            this.highlightedPaths.add(connectionId);
        });
        
        this.updatePathHighlights();
    }

    /**
     * Highlight relationship path
     */
    highlightRelationshipPath(relationship) {
        const connectionId = this.getRelationshipId(relationship);
        this.highlightedPaths.add(connectionId);
        this.updatePathHighlights();
    }

    /**
     * Update path highlights
     */
    updatePathHighlights() {
        // Clear existing highlights
        this.connectionsGroup.selectAll('.connection-line').classed('highlighted', false);
        
        // Apply highlights
        this.highlightedPaths.forEach(connectionId => {
            this.connectionsGroup.select(`[data-relationship-id="${connectionId}"]`)
                .classed('highlighted', true);
        });
    }

    /**
     * Clear connection highlights
     */
    clearConnectionHighlights() {
        this.highlightedPaths.clear();
        this.updatePathHighlights();
    }

    /**
     * Clear path highlights
     */
    clearPathHighlights() {
        this.highlightedPaths.clear();
        this.updatePathHighlights();
    }

    /**
     * Update selection highlight
     */
    updateSelectionHighlight() {
        // Clear existing selections
        this.svg.selectAll('.selected').classed('selected', false);
        
        // Apply selections
        this.selectedElements.forEach(elementId => {
            // Check if it's a table or relationship
            if (this.tablePositions.has(elementId)) {
                // It's a table
                this.tablesGroup.selectAll('.table-group')
                    .filter(d => d.name === elementId)
                    .classed('selected', true);
            } else {
                // It's a relationship
                this.connectionsGroup.select(`[data-relationship-id="${elementId}"]`)
                    .classed('selected', true);
            }
        });
    }

    /**
     * Show advanced tooltip
     */
    showAdvancedTooltip(event, data, type) {
        this.hideAdvancedTooltip();
        
        const tooltip = d3.select('body').append('div')
            .attr('class', 'erd-tooltip advanced-tooltip')
            .style('opacity', 0);
        
        const content = this.generateTooltipContent(data, type);
        tooltip.html(content);
        
        // Position tooltip
        const rect = tooltip.node().getBoundingClientRect();
        const x = event.pageX + 10;
        const y = event.pageY - rect.height / 2;
        
        tooltip
            .style('left', x + 'px')
            .style('top', y + 'px')
            .transition()
            .duration(200)
            .style('opacity', 1);
        
        this.hoverTooltip = tooltip;
    }

    /**
     * Generate tooltip content
     */
    generateTooltipContent(data, type) {
        if (type === 'table') {
            const columns = data.columns || [];
            const primaryKeys = columns.filter(col => col.isPrimary);
            const foreignKeys = columns.filter(col => col.isForeign);
            
            return `
                <div class="tooltip-header">
                    <strong>${data.name}</strong>
                    <span class="tooltip-type">Table</span>
                </div>
                <div class="tooltip-stats">
                    <div class="stat">
                        <span class="stat-label">Columns:</span>
                        <span class="stat-value">${columns.length}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Primary Keys:</span>
                        <span class="stat-value">${primaryKeys.length}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Foreign Keys:</span>
                        <span class="stat-value">${foreignKeys.length}</span>
                    </div>
                </div>
                ${columns.length > 0 ? `
                    <div class="tooltip-columns">
                        <div class="tooltip-section-title">Columns:</div>
                        ${columns.slice(0, 10).map(col => `
                            <div class="tooltip-column">
                                <span class="column-name ${col.isPrimary ? 'primary' : ''} ${col.isForeign ? 'foreign' : ''}">${col.name}</span>
                                <span class="column-type">${col.type || ''}</span>
                            </div>
                        `).join('')}
                        ${columns.length > 10 ? `<div class="tooltip-more">... and ${columns.length - 10} more</div>` : ''}
                    </div>
                ` : ''}
            `;
        } else if (type === 'relationship') {
            return `
                <div class="tooltip-header">
                    <strong>${data.fromTable} → ${data.toTable}</strong>
                    <span class="tooltip-type">Relationship</span>
                </div>
                <div class="tooltip-stats">
                    <div class="stat">
                        <span class="stat-label">Type:</span>
                        <span class="stat-value">${this.determineRelationshipType(data)}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Cardinality:</span>
                        <span class="stat-value">${data.fromCardinality || '1'}:${data.toCardinality || '1'}</span>
                    </div>
                </div>
                ${data.name ? `
                    <div class="tooltip-detail">
                        <span class="detail-label">Name:</span>
                        <span class="detail-value">${data.name}</span>
                    </div>
                ` : ''}
                ${data.fromColumns && data.fromColumns.length > 0 ? `
                    <div class="tooltip-detail">
                        <span class="detail-label">From Columns:</span>
                        <span class="detail-value">${data.fromColumns.join(', ')}</span>
                    </div>
                ` : ''}
                ${data.toColumns && data.toColumns.length > 0 ? `
                    <div class="tooltip-detail">
                        <span class="detail-label">To Columns:</span>
                        <span class="detail-value">${data.toColumns.join(', ')}</span>
                    </div>
                ` : ''}
            `;
        }
        
        return '';
    }

    /**
     * Determine relationship type
     */
    determineRelationshipType(relationship) {
        const fromCard = relationship.fromCardinality || '1';
        const toCard = relationship.toCardinality || '1';
        
        if (fromCard === '1' && toCard === '1') return 'One-to-One';
        if (fromCard === '1' && (toCard === 'many' || toCard === '*')) return 'One-to-Many';
        if ((fromCard === 'many' || fromCard === '*') && toCard === '1') return 'Many-to-One';
        if ((fromCard === 'many' || fromCard === '*') && (toCard === 'many' || toCard === '*')) return 'Many-to-Many';
        if (relationship.fromTable === relationship.toTable) return 'Self-Referencing';
        
        return 'Unknown';
    }

    /**
     * Hide advanced tooltip
     */
    hideAdvancedTooltip() {
        if (this.hoverTooltip) {
            this.hoverTooltip
                .transition()
                .duration(200)
                .style('opacity', 0)
                .remove();
            this.hoverTooltip = null;
        }
    }

    /**
     * Setup enhanced event listeners
     */
    setupEnhancedEventListeners() {
        if (this.eventBus) {
            this.eventBus.on('settings:changed', (data) => {
                this.updateSettings({ [data.key]: data.value });
            });
            
            this.eventBus.on('settings:reset', (settings) => {
                this.updateSettings(settings);
            });
        }
        
        // Clear selections on background click
        this.svg.on('click', () => {
            this.selectedElements.clear();
            this.updateSelectionHighlight();
        });
    }

    /**
     * Initialize tooltip system
     */
    initializeTooltipSystem() {
        // Add tooltip styles to document if not already present
        if (!document.getElementById('erd-tooltip-styles')) {
            const style = document.createElement('style');
            style.id = 'erd-tooltip-styles';
            style.textContent = `
                .erd-tooltip {
                    position: absolute;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    max-width: 300px;
                    z-index: 10000;
                    pointer-events: none;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }
                
                .tooltip-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                    padding-bottom: 6px;
                }
                
                .tooltip-type {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                }
                
                .tooltip-stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                
                .stat {
                    text-align: center;
                }
                
                .stat-label {
                    display: block;
                    font-size: 10px;
                    opacity: 0.7;
                }
                
                .stat-value {
                    display: block;
                    font-weight: bold;
                    font-size: 14px;
                }
                
                .tooltip-columns {
                    max-height: 200px;
                    overflow-y: auto;
                }
                
                .tooltip-section-title {
                    font-weight: bold;
                    margin-bottom: 4px;
                    font-size: 11px;
                }
                
                .tooltip-column {
                    display: flex;
                    justify-content: space-between;
                    padding: 2px 0;
                    font-size: 11px;
                }
                
                .column-name.primary {
                    color: #ffd700;
                }
                
                .column-name.foreign {
                    color: #87ceeb;
                }
                
                .column-type {
                    opacity: 0.7;
                }
                
                .tooltip-detail {
                    margin: 4px 0;
                    font-size: 11px;
                }
                
                .detail-label {
                    font-weight: bold;
                    margin-right: 6px;
                }
                
                .tooltip-more {
                    font-style: italic;
                    opacity: 0.7;
                    text-align: center;
                    margin-top: 4px;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Calculate table dimensions
     */
    calculateTableWidth(table) {
        const minWidth = 200;
        const padding = 20;
        const columns = table.columns || [];
        
        // Calculate based on content
        let maxContentWidth = table.name.length * 8; // Rough estimate
        columns.forEach(column => {
            const contentWidth = (column.name.length + (column.type?.length || 0)) * 7;
            maxContentWidth = Math.max(maxContentWidth, contentWidth);
        });
        
        return Math.max(minWidth, maxContentWidth + padding);
    }

    calculateTableHeight(table) {
        const headerHeight = 40;
        const rowHeight = 25;
        const columns = table.columns || [];
        
        return headerHeight + columns.length * rowHeight;
    }

    /**
     * Get relationship ID
     */
    getRelationshipId(relationship) {
        return `${relationship.fromTable}-${relationship.toTable}-${relationship.fromColumns?.join(',') || ''}-${relationship.toColumns?.join(',') || ''}`;
    }

    /**
     * Emit event through event bus
     */
    emitEvent(eventName, data) {
        if (this.eventBus) {
            this.eventBus.emit(eventName, data);
        }
    }

    /**
     * Clear visualization
     */
    clearVisualization() {
        if (this.svg) {
            this.svg.selectAll('*').remove();
            this.createSVGStructure();
        }
    }

    /**
     * Create SVG structure
     */
    createSVGStructure() {
        // Create main groups
        this.gridOverlay = this.svg.append('g').attr('class', 'grid-overlay');
        this.connectionsGroup = this.svg.append('g').attr('class', 'connections-group');
        this.tablesGroup = this.svg.append('g').attr('class', 'tables-group');
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        
        const emptyGroup = this.svg.append('g')
            .attr('class', 'empty-state')
            .attr('transform', `translate(${centerX}, ${centerY})`);
        
        emptyGroup.append('text')
            .attr('text-anchor', 'middle')
            .attr('class', 'empty-state-text')
            .text('No schema data available')
            .style('font-size', '18px')
            .style('fill', '#666');
        
        emptyGroup.append('text')
            .attr('text-anchor', 'middle')
            .attr('y', 25)
            .attr('class', 'empty-state-subtext')
            .text('Import a schema file to begin')
            .style('font-size', '14px')
            .style('fill', '#999');
    }

    /**
     * Export current visualization state
     */
    exportVisualizationState() {
        return {
            tablePositions: Object.fromEntries(this.tablePositions),
            settings: this.settings,
            selectedElements: Array.from(this.selectedElements),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Import visualization state
     */
    importVisualizationState(state) {
        if (state.tablePositions) {
            this.tablePositions = new Map(Object.entries(state.tablePositions));
        }
        
        if (state.settings) {
            this.updateSettings(state.settings);
        }
        
        if (state.selectedElements) {
            this.selectedElements = new Set(state.selectedElements);
        }
        
        // Re-render with imported state
        if (this.currentData) {
            this.render(this.currentData);
        }
    }
}