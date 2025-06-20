import Konva from 'konva';

/**
 * ERD renderer using KonvaJS and Canvas
 * Replaces D3.js SVG-based rendering with Konva canvas-based rendering
 */
export class KonvaERDRenderer {
    constructor(container, options = {}) {
        this.instanceId = `KonvaERDRenderer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        console.log(`%c[CONSTRUCTOR] Creating new Konva ERD Renderer instance: ${this.instanceId}`, 'color: green; font-weight: bold;');

        this.container = container;
        this.eventBus = options.eventBus;
        this.options = {
            width: options.width || 1200,
            height: options.height || 800,
            minZoom: 0.1,
            maxZoom: 5,
            ...options
        };

        // Konva components
        this.stage = null;
        this.mainLayer = null;
        this.connectionsLayer = null;
        this.tablesLayer = null;
        this.uiLayer = null;

        // State management
        this.currentSchema = null;
        this.currentLayout = null;
        this.selectedTable = null;
        this.hoveredTable = null;
        this.initialized = false;

        // Object pools for performance
        this.tableGroups = new Map();
        this.connectionLines = new Map();
        
        // Style constants
        this.styles = {
            table: {
                background: '#ffffff',
                border: '#e2e8f0',
                borderWidth: 1,
                cornerRadius: 4,
                headerBackground: '#f8fafc',
                headerHeight: 30,
                rowHeight: 25,
                padding: 8
            },
            text: {
                fontFamily: 'Arial, sans-serif',
                fontSize: 12,
                fill: '#1e293b',
                headerFill: '#374151',
                typeFill: '#64748b'
            },
            connection: {
                stroke: '#64748b',
                strokeWidth: 2,
                selectedStroke: '#2563eb',
                selectedStrokeWidth: 3
            },
            selection: {
                stroke: '#2563eb',
                strokeWidth: 2,
                dash: [5, 5]
            }
        };
    }

    /**
     * Initialize the Konva renderer
     */
    async init() {
        if (this.initialized) return;

        try {
            this.initializeStage();
            this.setupLayers();
            this.setupEventHandlers();
            this.initialized = true;
            console.log(`%c[INIT] Konva ERD Renderer initialized successfully`, 'color: green;');
        } catch (error) {
            console.error('Failed to initialize Konva ERD Renderer:', error);
            throw error;
        }
    }

    /**
     * Initialize the Konva stage
     */
    initializeStage() {
        // Clear existing content
        if (this.container) {
            this.container.innerHTML = '';
        }

        // Create Konva stage
        this.stage = new Konva.Stage({
            container: this.container,
            width: this.options.width,
            height: this.options.height
        });

        // Set up responsive sizing
        this.setupResponsiveStage();
    }

    /**
     * Setup responsive stage sizing
     */
    setupResponsiveStage() {
        const resizeStage = () => {
            const containerRect = this.container.getBoundingClientRect();
            this.stage.width(containerRect.width);
            this.stage.height(containerRect.height);
        };

        // Initial sizing
        resizeStage();

        // Listen for container resize
        const resizeObserver = new ResizeObserver(resizeStage);
        resizeObserver.observe(this.container);
    }

    /**
     * Setup Konva layers
     */
    setupLayers() {
        // Create layers in proper z-order
        this.connectionsLayer = new Konva.Layer({ name: 'connections' });
        this.tablesLayer = new Konva.Layer({ name: 'tables' });
        this.uiLayer = new Konva.Layer({ name: 'ui' });

        // Add layers to stage
        this.stage.add(this.connectionsLayer);
        this.stage.add(this.tablesLayer);
        this.stage.add(this.uiLayer);

        // Set up main layer reference for zoom/pan
        this.mainLayer = this.tablesLayer; // Primary interaction layer
    }

    /**
     * Setup event handlers for stage interactions
     */
    setupEventHandlers() {
        this.setupZoomAndPan();
        this.setupStageEvents();
    }

    /**
     * Setup zoom and pan behavior
     */
    setupZoomAndPan() {
        let lastCenter = null;
        let lastDist = 0;

        // Mouse wheel zoom
        this.stage.on('wheel', (e) => {
            e.evt.preventDefault();

            const oldScale = this.stage.scaleX();
            const pointer = this.stage.getPointerPosition();

            const mousePointTo = {
                x: (pointer.x - this.stage.x()) / oldScale,
                y: (pointer.y - this.stage.y()) / oldScale,
            };

            const direction = e.evt.deltaY > 0 ? -1 : 1;
            const scaleBy = 1.1;
            const newScale = Math.max(
                this.options.minZoom,
                Math.min(this.options.maxZoom, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy)
            );

            this.stage.scale({ x: newScale, y: newScale });

            const newPos = {
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            };

            this.stage.position(newPos);

            // Emit zoom event
            if (this.eventBus) {
                this.eventBus.emit('zoom:changed', newScale);
            }
        });

        // Touch zoom
        this.stage.on('touchmove', (e) => {
            e.evt.preventDefault();
            const touch1 = e.evt.touches[0];
            const touch2 = e.evt.touches[1];

            if (touch1 && touch2) {
                const dist = this.getDistance(
                    { x: touch1.clientX, y: touch1.clientY },
                    { x: touch2.clientX, y: touch2.clientY }
                );

                if (!lastDist) {
                    lastDist = dist;
                }

                const scale = this.stage.scaleX() * (dist / lastDist);
                this.stage.scaleX(Math.max(this.options.minZoom, Math.min(this.options.maxZoom, scale)));
                this.stage.scaleY(Math.max(this.options.minZoom, Math.min(this.options.maxZoom, scale)));
                lastDist = dist;
            }
        });

        this.stage.on('touchend', () => {
            lastDist = 0;
        });

        // Pan behavior (only when not dragging tables)
        let isDragging = false;
        this.stage.on('mousedown touchstart', (e) => {
            if (e.target === this.stage) {
                isDragging = true;
            }
        });

        this.stage.on('mousemove touchmove', (e) => {
            if (!isDragging) return;
            if (e.target !== this.stage) return;

            e.evt.preventDefault();
            this.stage.container().style.cursor = 'move';
        });

        this.stage.on('mouseup touchend', () => {
            isDragging = false;
            this.stage.container().style.cursor = 'default';
        });

        // Make stage draggable for panning
        this.stage.draggable(true);
        this.stage.dragBoundFunc((pos) => {
            // Allow free dragging
            return pos;
        });
    }

    /**
     * Setup general stage events
     */
    setupStageEvents() {
        // Click on empty space to deselect
        this.stage.on('click tap', (e) => {
            if (e.target === this.stage) {
                this.deselectAll();
            }
        });

        // Context menu prevention
        this.stage.on('contextmenu', (e) => {
            e.evt.preventDefault();
        });
    }

    /**
     * Get distance between two points
     */
    getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Render the ERD
     * @param {Object} schema - Schema data
     * @param {Object} layout - Layout data
     */
    render(schema, layout) {
        this.currentSchema = schema;
        this.currentLayout = layout;

        // Clear existing elements
        this.clearCanvas();

        if (!schema || !schema.tables || schema.tables.length === 0) {
            return;
        }

        // Render tables
        this.renderTables(schema.tables, layout);

        // Render connections
        this.renderConnections(schema.relationships || [], layout);

        // Fit to view
        try {
            this.fitToView();
        } catch (fitError) {
            console.error('Fit to view error:', fitError);
        }
    }

    /**
     * Clear the canvas
     */
    clearCanvas() {
        this.connectionsLayer.destroyChildren();
        this.tablesLayer.destroyChildren();
        this.uiLayer.destroyChildren();
        
        // Clear object pools
        this.tableGroups.clear();
        this.connectionLines.clear();
    }

    /**
     * Render tables
     * @param {Array} tables - Table data
     * @param {Object} layout - Layout data
     */
    renderTables(tables, layout) {
        console.log('%c[DEBUG] Rendering tables with Konva:', 'color: green; font-weight: bold;', tables);

        tables.forEach(tableData => {
            const tableGroup = this.createTableGroup(tableData, layout);
            this.tablesLayer.add(tableGroup);
            this.tableGroups.set(tableData.name, tableGroup);
        });

        this.tablesLayer.draw();
    }

    /**
     * Create a table group with all its components
     * @param {Object} tableData - Table data
     * @param {Object} layout - Layout data
     * @returns {Konva.Group} Table group
     */
    createTableGroup(tableData, layout) {
        const pos = this.getTablePosition(tableData.name, layout);
        const size = this.getTableSize(tableData.name, layout);

        // Main table group
        const tableGroup = new Konva.Group({
            x: pos.x,
            y: pos.y,
            draggable: true,
            name: 'table-group'
        });

        // Store table data
        tableGroup.tableData = tableData;

        // Table background
        const tableBackground = new Konva.Rect({
            width: size.width,
            height: size.height,
            fill: this.styles.table.background,
            stroke: this.styles.table.border,
            strokeWidth: this.styles.table.borderWidth,
            cornerRadius: this.styles.table.cornerRadius,
            name: 'table-background'
        });

        // Table header
        const headerBackground = new Konva.Rect({
            width: size.width,
            height: this.styles.table.headerHeight,
            fill: this.styles.table.headerBackground,
            cornerRadius: [this.styles.table.cornerRadius, this.styles.table.cornerRadius, 0, 0],
            name: 'table-header'
        });

        // Table title
        const tableTitle = new Konva.Text({
            x: this.styles.table.padding,
            y: this.styles.table.headerHeight / 2,
            text: tableData.displayName || tableData.name,
            fontSize: this.styles.text.fontSize + 2,
            fontFamily: this.styles.text.fontFamily,
            fill: this.styles.text.headerFill,
            fontStyle: 'bold',
            verticalAlign: 'middle',
            name: 'table-title'
        });

        // Center the title
        tableTitle.y((this.styles.table.headerHeight - tableTitle.height()) / 2);

        // Add components to group
        tableGroup.add(tableBackground);
        tableGroup.add(headerBackground);
        tableGroup.add(tableTitle);

        // Add columns
        this.addColumnsToTable(tableGroup, tableData, size);

        // Setup table interactions
        this.setupTableInteractions(tableGroup, tableData);

        return tableGroup;
    }

    /**
     * Add columns to table group
     * @param {Konva.Group} tableGroup - Table group
     * @param {Object} tableData - Table data
     * @param {Object} size - Table size
     */
    addColumnsToTable(tableGroup, tableData, size) {
        tableData.columns.forEach((column, index) => {
            const y = this.styles.table.headerHeight + (index * this.styles.table.rowHeight);
            
            // Column background (for hover effects)
            const columnBackground = new Konva.Rect({
                x: 0,
                y: y,
                width: size.width,
                height: this.styles.table.rowHeight,
                fill: 'transparent',
                name: 'column-background'
            });

            // Store column data for highlighting
            columnBackground.setAttr('columnData', column);

            // Key indicator
            let keyIndicator = null;
            let nameXOffset = this.styles.table.padding;

            if (this.isPrimaryKey(column)) {
                keyIndicator = new Konva.Text({
                    x: 6,
                    y: y + (this.styles.table.rowHeight / 2),
                    text: '🔑',
                    fontSize: 12,
                    verticalAlign: 'middle',
                    name: 'key-indicator'
                });
                nameXOffset = 24;
            } else if (this.isForeignKey(column)) {
                keyIndicator = new Konva.Text({
                    x: 6,
                    y: y + (this.styles.table.rowHeight / 2),
                    text: '🔗',
                    fontSize: 12,
                    verticalAlign: 'middle',
                    name: 'key-indicator'
                });
                nameXOffset = 24;
            }

            // Column name
            const columnName = new Konva.Text({
                x: nameXOffset,
                y: y + (this.styles.table.rowHeight / 2),
                text: column.name,
                fontSize: this.styles.text.fontSize,
                fontFamily: this.styles.text.fontFamily,
                fill: this.styles.text.fill,
                verticalAlign: 'middle',
                name: 'column-name'
            });

            // Column type
            const columnType = new Konva.Text({
                x: size.width - this.styles.table.padding,
                y: y + (this.styles.table.rowHeight / 2),
                text: this.formatColumnType(column.type),
                fontSize: this.styles.text.fontSize - 1,
                fontFamily: this.styles.text.fontFamily,
                fill: this.styles.text.typeFill,
                verticalAlign: 'middle',
                align: 'right',
                name: 'column-type'
            });

            // Adjust column type position
            columnType.x(size.width - columnType.width() - this.styles.table.padding);

            // Add elements to group
            tableGroup.add(columnBackground);
            if (keyIndicator) {
                keyIndicator.y(y + (this.styles.table.rowHeight - keyIndicator.height()) / 2);
                tableGroup.add(keyIndicator);
            }
            columnName.y(y + (this.styles.table.rowHeight - columnName.height()) / 2);
            tableGroup.add(columnName);
            columnType.y(y + (this.styles.table.rowHeight - columnType.height()) / 2);
            tableGroup.add(columnType);

            // Setup column interactions
            this.setupColumnInteractions(columnBackground, column, tableData);
        });
    }

    /**
     * Setup table interaction events
     * @param {Konva.Group} tableGroup - Table group
     * @param {Object} tableData - Table data
     */
    setupTableInteractions(tableGroup, tableData) {
        // Click event
        tableGroup.on('click tap', (e) => {
            e.cancelBubble = true;
            this.onTableClick(e, tableData);
        });

        // Hover events
        tableGroup.on('mouseenter', (e) => {
            this.onTableMouseEnter(e, tableData);
            this.stage.container().style.cursor = 'move';
        });

        tableGroup.on('mouseleave', (e) => {
            this.onTableMouseLeave(e, tableData);
            this.stage.container().style.cursor = 'default';
        });

        // Drag events
        tableGroup.on('dragstart', (e) => {
            this.onDragStart(e, tableData, tableGroup);
        });

        tableGroup.on('dragmove', (e) => {
            this.onDrag(e, tableData, tableGroup);
        });

        tableGroup.on('dragend', (e) => {
            this.onDragEnd(e, tableData, tableGroup);
        });
    }

    /**
     * Setup column interaction events
     * @param {Konva.Rect} columnBackground - Column background shape
     * @param {Object} column - Column data
     * @param {Object} tableData - Table data
     */
    setupColumnInteractions(columnBackground, column, tableData) {
        columnBackground.on('click tap', (e) => {
            e.cancelBubble = true;
            this.onColumnClick(e, column, tableData);
        });

        columnBackground.on('mouseenter', () => {
            columnBackground.fill('#f1f5f9');
            this.tablesLayer.draw();
        });

        columnBackground.on('mouseleave', () => {
            columnBackground.fill('transparent');
            this.tablesLayer.draw();
        });
    }

    /**
     * Check if column is primary key
     * @param {Object} column - Column data
     * @returns {boolean} True if primary key
     */
    isPrimaryKey(column) {
        return column.isPrimaryKey ||
            (column.constraints && column.constraints.some(c =>
                c.toUpperCase().includes('PRIMARY KEY')));
    }

    /**
     * Check if column is foreign key
     * @param {Object} column - Column data
     * @returns {boolean} True if foreign key
     */
    isForeignKey(column) {
        return column.isForeignKey ||
            (column.constraints && column.constraints.some(c =>
                c.toUpperCase().includes('FOREIGN KEY') ||
                c.toUpperCase().includes('REFERENCES')));
    }

    /**
     * Format column type for display
     * @param {string} type - Column type
     * @returns {string} Formatted type
     */
    formatColumnType(type) {
        return type.length > 15 ? type.substring(0, 12) + '...' : type;
    }

    /**
     * Render connections between tables
     * @param {Array} relationships - Relationship data
     * @param {Object} layout - Layout data
     */
    renderConnections(relationships, layout) {
        relationships.forEach((relationship, index) => {
            const connectionLine = this.createConnectionLine(relationship, layout);
            if (connectionLine) {
                // Use normalized property names for the key
                const fromTable = relationship.fromTable || relationship.sourceTable;
                const toTable = relationship.toTable || relationship.targetTable;
                
                this.connectionsLayer.add(connectionLine);
                this.connectionLines.set(`${fromTable}-${toTable}`, connectionLine);
            }
        });

        this.connectionsLayer.draw();
    }

    /**
     * Create a connection line between tables
     * @param {Object} relationship - Relationship data
     * @param {Object} layout - Layout data
     * @returns {Konva.Group} Connection group
     */
    createConnectionLine(relationship, layout) {
        // Handle different property names for relationships
        const fromTable = relationship.fromTable || relationship.sourceTable;
        const toTable = relationship.toTable || relationship.targetTable;
        const fromColumn = relationship.fromColumn || relationship.sourceColumn;
        const toColumn = relationship.toColumn || relationship.targetColumn;

        const fromPos = this.getTablePosition(fromTable, layout);
        const toPos = this.getTablePosition(toTable, layout);
        const fromSize = this.getTableSize(fromTable, layout);
        const toSize = this.getTableSize(toTable, layout);

        if (!fromPos || !toPos) {
            return null;
        }

        // Get table data for column-based connections
        const fromTableData = this.currentSchema.tables.find(t => t.name === fromTable);
        const toTableData = this.currentSchema.tables.find(t => t.name === toTable);

        // Calculate connection points with orthogonal routing
        const connectionPoints = this.calculateConnectionPoints(
            fromPos, fromSize, toPos, toSize, fromColumn, toColumn, fromTableData, toTableData
        );

        console.log('Connection points:', connectionPoints);
        console.log('Orthogonal path:', connectionPoints.orthogonalPath);

        // Create connection group
        const connectionGroup = new Konva.Group({
            name: 'connection-group'
        });

        // Store relationship data with normalized properties
        connectionGroup.relationshipData = {
            ...relationship,
            fromTable,
            toTable,
            fromColumn,
            toColumn,
            fromTableData,
            toTableData
        };

        // Create orthogonal connection line using the generated path
        const line = new Konva.Line({
            points: connectionPoints.orthogonalPath,
            stroke: this.styles.connection.stroke,
            strokeWidth: this.styles.connection.strokeWidth,
            lineCap: 'round',
            lineJoin: 'round',
            name: 'connection-line'
        });

        connectionGroup.add(line);

        // Add relationship markers
        this.addRelationshipMarkers(connectionGroup, connectionPoints, relationship);

        // Setup connection interactions
        this.setupConnectionInteractions(connectionGroup, relationship);

        return connectionGroup;
    }

    /**
     * Calculate connection points between tables based on specific columns
     * @param {Object} fromPos - From table position
     * @param {Object} fromSize - From table size
     * @param {Object} toPos - To table position
     * @param {Object} toSize - To table size
     * @param {string} fromColumn - Source column name
     * @param {string} toColumn - Target column name
     * @param {Object} fromTable - Source table data
     * @param {Object} toTable - Target table data
     * @returns {Object} Connection points with orthogonal routing
     */
    calculateConnectionPoints(fromPos, fromSize, toPos, toSize, fromColumn, toColumn, fromTable, toTable) {
        // Calculate column-specific connection points
        const sourcePoint = this.getColumnConnectionPoint(fromPos, fromSize, fromColumn, fromTable, 'source');
        const targetPoint = this.getColumnConnectionPoint(toPos, toSize, toColumn, toTable, 'target');
        
        // Determine which side of each table to connect to based on shortest distance
        const optimizedPoints = this.optimizeConnectionSides(fromPos, fromSize, toPos, toSize, sourcePoint, targetPoint);
        
        // Generate orthogonal path
        const orthogonalPath = this.generateOrthogonalPath(optimizedPoints.source, optimizedPoints.target);
        
        return {
            source: optimizedPoints.source,
            target: optimizedPoints.target,
            orthogonalPath: orthogonalPath
        };
    }

    /**
     * Get connection point for a specific column
     */
    getColumnConnectionPoint(tablePos, tableSize, columnName, tableData, type) {
        const headerHeight = this.styles.table.headerHeight;
        const rowHeight = this.styles.table.rowHeight;
        
        // Find column index
        let columnIndex = -1;
        if (tableData && tableData.columns) {
            columnIndex = tableData.columns.findIndex(col => col.name === columnName);
        }
        
        if (columnIndex === -1) {
            // Fallback to table center if column not found
            return {
                x: tablePos.x + tableSize.width / 2,
                y: tablePos.y + tableSize.height / 2,
                columnIndex: -1
            };
        }
        
        // Calculate Y position for the specific column
        const columnY = tablePos.y + headerHeight + (columnIndex * rowHeight) + (rowHeight / 2);
        
        return {
            x: tablePos.x + tableSize.width / 2, // Will be adjusted in optimizeConnectionSides
            y: columnY,
            columnIndex: columnIndex
        };
    }

    /**
     * Optimize connection sides based on shortest distance
     */
    optimizeConnectionSides(fromPos, fromSize, toPos, toSize, sourcePoint, targetPoint) {
        // Calculate potential connection points on all four sides of each table
        const fromSides = {
            left: { x: fromPos.x, y: sourcePoint.y },
            right: { x: fromPos.x + fromSize.width, y: sourcePoint.y },
            top: { x: fromPos.x + fromSize.width / 2, y: fromPos.y },
            bottom: { x: fromPos.x + fromSize.width / 2, y: fromPos.y + fromSize.height }
        };
        
        const toSides = {
            left: { x: toPos.x, y: targetPoint.y },
            right: { x: toPos.x + toSize.width, y: targetPoint.y },
            top: { x: toPos.x + toSize.width / 2, y: toPos.y },
            bottom: { x: toPos.x + toSize.width / 2, y: toPos.y + toSize.height }
        };
        
        // Find the combination with shortest distance
        let shortestDistance = Infinity;
        let bestFromSide = 'right';
        let bestToSide = 'left';
        
        for (const [fromSideName, fromSidePoint] of Object.entries(fromSides)) {
            for (const [toSideName, toSidePoint] of Object.entries(toSides)) {
                // Skip same-side connections for better routing
                if ((fromSideName === 'left' && toSideName === 'right') ||
                    (fromSideName === 'right' && toSideName === 'left') ||
                    (fromSideName === 'top' && toSideName === 'bottom') ||
                    (fromSideName === 'bottom' && toSideName === 'top')) {
                    
                    const distance = Math.sqrt(
                        Math.pow(toSidePoint.x - fromSidePoint.x, 2) +
                        Math.pow(toSidePoint.y - fromSidePoint.y, 2)
                    );
                    
                    if (distance < shortestDistance) {
                        shortestDistance = distance;
                        bestFromSide = fromSideName;
                        bestToSide = toSideName;
                    }
                }
            }
        }
        
        return {
            source: { ...fromSides[bestFromSide], side: bestFromSide, columnIndex: sourcePoint.columnIndex },
            target: { ...toSides[bestToSide], side: bestToSide, columnIndex: targetPoint.columnIndex }
        };
    }

    /**
     * Generate orthogonal path with only horizontal and vertical lines
     */
    generateOrthogonalPath(sourcePoint, targetPoint) {
        const points = [sourcePoint.x, sourcePoint.y];
        
        const spacing = 30; // Minimum spacing for elbow connections
        
        // Determine routing based on connection sides
        if (sourcePoint.side === 'right' && targetPoint.side === 'left') {
            // Right to left connection
            const midX = sourcePoint.x + Math.max(spacing, (targetPoint.x - sourcePoint.x) / 2);
            points.push(midX, sourcePoint.y);      // Horizontal line from source
            points.push(midX, targetPoint.y);      // Vertical line
            points.push(targetPoint.x, targetPoint.y); // Horizontal line to target
        }
        else if (sourcePoint.side === 'left' && targetPoint.side === 'right') {
            // Left to right connection
            const midX = sourcePoint.x - Math.max(spacing, (sourcePoint.x - targetPoint.x) / 2);
            points.push(midX, sourcePoint.y);      // Horizontal line from source
            points.push(midX, targetPoint.y);      // Vertical line
            points.push(targetPoint.x, targetPoint.y); // Horizontal line to target
        }
        else if (sourcePoint.side === 'bottom' && targetPoint.side === 'top') {
            // Bottom to top connection
            const midY = sourcePoint.y + Math.max(spacing, (targetPoint.y - sourcePoint.y) / 2);
            points.push(sourcePoint.x, midY);      // Vertical line from source
            points.push(targetPoint.x, midY);      // Horizontal line
            points.push(targetPoint.x, targetPoint.y); // Vertical line to target
        }
        else if (sourcePoint.side === 'top' && targetPoint.side === 'bottom') {
            // Top to bottom connection
            const midY = sourcePoint.y - Math.max(spacing, (sourcePoint.y - targetPoint.y) / 2);
            points.push(sourcePoint.x, midY);      // Vertical line from source
            points.push(targetPoint.x, midY);      // Horizontal line
            points.push(targetPoint.x, targetPoint.y); // Vertical line to target
        }
        else {
            // Default L-shaped routing for other combinations
            if (Math.abs(targetPoint.x - sourcePoint.x) > Math.abs(targetPoint.y - sourcePoint.y)) {
                // Horizontal first, then vertical
                points.push(targetPoint.x, sourcePoint.y);
                points.push(targetPoint.x, targetPoint.y);
            } else {
                // Vertical first, then horizontal
                points.push(sourcePoint.x, targetPoint.y);
                points.push(targetPoint.x, targetPoint.y);
            }
        }
        
        return points;
    }

    /**
     * Add relationship markers (arrows, etc.)
     * @param {Konva.Group} connectionGroup - Connection group
     * @param {Object} connectionPoints - Connection points
     * @param {Object} relationship - Relationship data
     */
    addRelationshipMarkers(connectionGroup, connectionPoints, relationship) {
        // Calculate arrow angle
        const dx = connectionPoints.target.x - connectionPoints.source.x;
        const dy = connectionPoints.target.y - connectionPoints.source.y;
        const angle = Math.atan2(dy, dx);

        // Create arrow marker
        const arrowLength = 10;
        const arrowAngle = Math.PI / 6; // 30 degrees

        const arrowPoints = [
            connectionPoints.target.x,
            connectionPoints.target.y,
            connectionPoints.target.x - arrowLength * Math.cos(angle - arrowAngle),
            connectionPoints.target.y - arrowLength * Math.sin(angle - arrowAngle),
            connectionPoints.target.x - arrowLength * Math.cos(angle + arrowAngle),
            connectionPoints.target.y - arrowLength * Math.sin(angle + arrowAngle)
        ];

        const arrow = new Konva.Line({
            points: arrowPoints,
            fill: this.styles.connection.stroke,
            stroke: this.styles.connection.stroke,
            strokeWidth: this.styles.connection.strokeWidth,
            closed: true,
            name: 'arrow-marker'
        });

        connectionGroup.add(arrow);
    }

    /**
     * Setup connection interaction events
     * @param {Konva.Group} connectionGroup - Connection group
     * @param {Object} relationship - Relationship data
     */
    setupConnectionInteractions(connectionGroup, relationship) {
        connectionGroup.on('click tap', (e) => {
            e.cancelBubble = true;
            this.onConnectionClick(e, relationship);
        });

        connectionGroup.on('mouseenter', (e) => {
            this.onConnectionMouseEnter(e, relationship);
            this.stage.container().style.cursor = 'pointer';
        });

        connectionGroup.on('mouseleave', (e) => {
            this.onConnectionMouseLeave(e, relationship);
            this.stage.container().style.cursor = 'default';
        });
    }

    /**
     * Get table position from layout
     * @param {string} tableName - Table name
     * @param {Object} layout - Layout data
     * @returns {Object} Position {x, y}
     */
    getTablePosition(tableName, layout) {
        if (layout && layout.tables) {
            const table = layout.tables.find(t => t.name === tableName);
            if (table) {
                return { x: table.x || 0, y: table.y || 0 };
            }
        }
        return { x: 100, y: 100 }; // Default position
    }

    /**
     * Get table size from layout
     * @param {string} tableName - Table name
     * @param {Object} layout - Layout data
     * @returns {Object} Size {width, height}
     */
    getTableSize(tableName, layout) {
        if (layout && layout.tables) {
            const table = layout.tables.find(t => t.name === tableName);
            if (table) {
                return {
                    width: table.width || 200,
                    height: table.height || 150
                };
            }
        }
        return { width: 200, height: 150 }; // Default size
    }

    /**
     * Event handlers
     */

    onTableClick(event, data) {
        this.selectTable(data);
        if (this.eventBus) {
            this.eventBus.emit('table:selected', data);
        }
    }

    onColumnClick(event, columnData, tableData) {
        if (this.eventBus) {
            this.eventBus.emit('column:selected', { column: columnData, table: tableData });
        }
    }

    onTableMouseEnter(event, data) {
        this.hoveredTable = data;
        // Add hover effect
        const tableGroup = this.tableGroups.get(data.name);
        if (tableGroup) {
            const background = tableGroup.findOne('.table-background');
            if (background) {
                background.stroke('#94a3b8');
                background.strokeWidth(2);
                this.tablesLayer.draw();
            }
        }
    }

    onTableMouseLeave(event, data) {
        this.hoveredTable = null;
        // Remove hover effect
        const tableGroup = this.tableGroups.get(data.name);
        if (tableGroup) {
            const background = tableGroup.findOne('.table-background');
            if (background && data !== this.selectedTable) {
                background.stroke(this.styles.table.border);
                background.strokeWidth(this.styles.table.borderWidth);
                this.tablesLayer.draw();
            }
        }
    }

    onConnectionClick(event, data) {
        if (this.eventBus) {
            this.eventBus.emit('relationship:selected', data);
        }
    }

    onConnectionMouseEnter(event, data) {
        // Highlight connection
        const fromTable = data.fromTable || data.sourceTable;
        const toTable = data.toTable || data.targetTable;
        const fromColumn = data.fromColumn || data.sourceColumn;
        const toColumn = data.toColumn || data.targetColumn;
        
        const connectionGroup = this.connectionLines.get(`${fromTable}-${toTable}`);
        if (connectionGroup) {
            const line = connectionGroup.findOne('.connection-line');
            if (line) {
                line.stroke(this.styles.connection.selectedStroke);
                line.strokeWidth(this.styles.connection.selectedStrokeWidth);
                this.connectionsLayer.draw();
            }
        }
        
        // Highlight related columns
        this.highlightRelatedColumns(fromTable, fromColumn, toTable, toColumn, true);
    }

    onConnectionMouseLeave(event, data) {
        // Remove connection highlight
        const fromTable = data.fromTable || data.sourceTable;
        const toTable = data.toTable || data.targetTable;
        const fromColumn = data.fromColumn || data.sourceColumn;
        const toColumn = data.toColumn || data.targetColumn;
        
        const connectionGroup = this.connectionLines.get(`${fromTable}-${toTable}`);
        if (connectionGroup) {
            const line = connectionGroup.findOne('.connection-line');
            if (line) {
                line.stroke(this.styles.connection.stroke);
                line.strokeWidth(this.styles.connection.strokeWidth);
                this.connectionsLayer.draw();
            }
        }
        
        // Remove column highlights
        this.highlightRelatedColumns(fromTable, fromColumn, toTable, toColumn, false);
    }

    /**
     * Highlight columns related to a relationship
     */
    highlightRelatedColumns(fromTable, fromColumn, toTable, toColumn, highlight) {
        // Highlight source column
        this.highlightTableColumn(fromTable, fromColumn, highlight);
        
        // Highlight target column
        this.highlightTableColumn(toTable, toColumn, highlight);
    }

    /**
     * Highlight a specific column in a table
     */
    highlightTableColumn(tableName, columnName, highlight) {
        const tableGroup = this.tableGroups.get(tableName);
        if (!tableGroup) return;
        
        // Find the column background element
        tableGroup.children.forEach(child => {
            if (child.name() === 'column-background') {
                const columnData = child.getAttr('columnData');
                if (columnData && columnData.name === columnName) {
                    if (highlight) {
                        child.fill('#e3f2fd'); // Light blue highlight
                        child.stroke('#2196f3'); // Blue border
                        child.strokeWidth(2);
                    } else {
                        child.fill('transparent');
                        child.stroke('transparent');
                        child.strokeWidth(0);
                    }
                }
            }
        });
        
        this.tablesLayer.draw();
    }

    onDragStart(event, data, element) {
        // Bring to front
        element.moveToTop();
        this.tablesLayer.draw();
    }

    onDrag(event, data, element) {
        // Update connections for this table
        this.updateConnectionsForTable(data.name, element.x(), element.y());
    }

    onDragEnd(event, data, element) {
        // Update layout data
        if (this.currentLayout && this.currentLayout.tables) {
            const table = this.currentLayout.tables.find(t => t.name === data.name);
            if (table) {
                table.x = element.x();
                table.y = element.y();
            }
        }

        if (this.eventBus) {
            this.eventBus.emit('diagram:changed');
        }
    }

    /**
     * Update connections for a moved table
     * @param {string} tableName - Table name
     * @param {number} newX - New X position
     * @param {number} newY - New Y position
     */
    updateConnectionsForTable(tableName, newX, newY) {
        // Update layout data temporarily
        if (this.currentLayout && this.currentLayout.tables) {
            const table = this.currentLayout.tables.find(t => t.name === tableName);
            if (table) {
                table.x = newX;
                table.y = newY;
            }
        }

        // Redraw affected connections
        this.connectionLines.forEach((connectionGroup, key) => {
            const relationship = connectionGroup.relationshipData;
            if (relationship && (relationship.fromTable === tableName || relationship.toTable === tableName)) {
                this.updateConnectionLine(connectionGroup, relationship);
            }
        });
    }

    /**
     * Update a connection line
     * @param {Konva.Group} connectionGroup - Connection group
     * @param {Object} relationship - Relationship data
     */
    updateConnectionLine(connectionGroup, relationship) {
        const fromPos = this.getTablePosition(relationship.fromTable, this.currentLayout);
        const toPos = this.getTablePosition(relationship.toTable, this.currentLayout);
        const fromSize = this.getTableSize(relationship.fromTable, this.currentLayout);
        const toSize = this.getTableSize(relationship.toTable, this.currentLayout);

        if (!fromPos || !toPos) return;

        // Calculate new connection points
        const connectionPoints = this.calculateConnectionPoints(
            fromPos, fromSize, toPos, toSize, relationship.fromColumn
        );

        // Update line points
        const line = connectionGroup.findOne('.connection-line');
        if (line) {
            line.points([
                connectionPoints.source.x, connectionPoints.source.y,
                connectionPoints.target.x, connectionPoints.target.y
            ]);
        }

        // Update arrow marker
        const arrow = connectionGroup.findOne('.arrow-marker');
        if (arrow) {
            const dx = connectionPoints.target.x - connectionPoints.source.x;
            const dy = connectionPoints.target.y - connectionPoints.source.y;
            const angle = Math.atan2(dy, dx);

            const arrowLength = 10;
            const arrowAngle = Math.PI / 6;

            const arrowPoints = [
                connectionPoints.target.x,
                connectionPoints.target.y,
                connectionPoints.target.x - arrowLength * Math.cos(angle - arrowAngle),
                connectionPoints.target.y - arrowLength * Math.sin(angle - arrowAngle),
                connectionPoints.target.x - arrowLength * Math.cos(angle + arrowAngle),
                connectionPoints.target.y - arrowLength * Math.sin(angle + arrowAngle)
            ];

            arrow.points(arrowPoints);
        }

        this.connectionsLayer.draw();
    }

    /**
     * Select a table
     * @param {Object} tableData - Table data
     */
    selectTable(tableData) {
        // Deselect previous selection
        this.deselectAll();

        this.selectedTable = tableData;
        const tableGroup = this.tableGroups.get(tableData.name);
        if (tableGroup) {
            const background = tableGroup.findOne('.table-background');
            if (background) {
                background.stroke(this.styles.selection.stroke);
                background.strokeWidth(this.styles.selection.strokeWidth);
                background.dash(this.styles.selection.dash);
                this.tablesLayer.draw();
            }
        }
    }

    /**
     * Deselect all elements
     */
    deselectAll() {
        if (this.selectedTable) {
            const tableGroup = this.tableGroups.get(this.selectedTable.name);
            if (tableGroup) {
                const background = tableGroup.findOne('.table-background');
                if (background) {
                    background.stroke(this.styles.table.border);
                    background.strokeWidth(this.styles.table.borderWidth);
                    background.dash([]);
                    this.tablesLayer.draw();
                }
            }
        }
        this.selectedTable = null;
    }

    /**
     * Fit diagram to view
     */
    fitToView() {
        if (this.tablesLayer.children.length === 0) return;

        // Calculate bounding box of all tables
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.tablesLayer.children.forEach(child => {
            const box = child.getClientRect();
            minX = Math.min(minX, box.x);
            minY = Math.min(minY, box.y);
            maxX = Math.max(maxX, box.x + box.width);
            maxY = Math.max(maxY, box.y + box.height);
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const stageWidth = this.stage.width();
        const stageHeight = this.stage.height();

        // Calculate scale to fit content
        const scaleX = stageWidth / (contentWidth + 100); // 100px padding
        const scaleY = stageHeight / (contentHeight + 100);
        const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

        // Calculate center position
        const centerX = (stageWidth - contentWidth * scale) / 2 - minX * scale;
        const centerY = (stageHeight - contentHeight * scale) / 2 - minY * scale;

        // Apply transform
        this.stage.scale({ x: scale, y: scale });
        this.stage.position({ x: centerX, y: centerY });

        // Emit zoom event
        if (this.eventBus) {
            this.eventBus.emit('zoom:changed', scale);
        }
    }

    /**
     * Reset zoom to 100%
     */
    resetZoom() {
        this.stage.scale({ x: 1, y: 1 });
        this.stage.position({ x: 0, y: 0 });

        if (this.eventBus) {
            this.eventBus.emit('zoom:changed', 1);
        }
    }

    /**
     * Get current zoom level
     * @returns {number} Zoom level
     */
    getZoomLevel() {
        return this.stage.scaleX();
    }

    /**
     * Set zoom level
     * @param {number} level - Zoom level
     */
    setZoomLevel(level) {
        const clampedLevel = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, level));
        this.stage.scale({ x: clampedLevel, y: clampedLevel });

        if (this.eventBus) {
            this.eventBus.emit('zoom:changed', clampedLevel);
        }
    }

    /**
     * Update layout
     * @param {Object} layout - New layout data
     */
    updateLayout(layout) {
        this.currentLayout = layout;
        
        // Update table positions
        this.tableGroups.forEach((tableGroup, tableName) => {
            const pos = this.getTablePosition(tableName, layout);
            tableGroup.position({ x: pos.x, y: pos.y });
        });

        // Update all connections
        this.connectionLines.forEach((connectionGroup, key) => {
            const relationship = connectionGroup.relationshipData;
            if (relationship) {
                this.updateConnectionLine(connectionGroup, relationship);
            }
        });

        this.tablesLayer.draw();
        this.connectionsLayer.draw();
    }

    /**
     * Destroy the renderer and clean up resources
     */
    destroy() {
        if (this.stage) {
            this.stage.destroy();
        }
        
        // Clear object pools
        this.tableGroups.clear();
        this.connectionLines.clear();
        
        // Reset state
        this.initialized = false;
        this.selectedTable = null;
        this.hoveredTable = null;
        
        console.log(`%c[DESTROY] Konva ERD Renderer destroyed: ${this.instanceId}`, 'color: red;');
    }
}