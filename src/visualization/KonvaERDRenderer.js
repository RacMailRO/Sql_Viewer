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
        this.searchHighlightShape = null; // For highlighting search results
        this.initialized = false;

        // Object pools for performance
        this.tableGroups = new Map();
        this.connectionLines = new Map();
        this.drawnPaths = new Set(); // <-- ADD THIS LINE

        // Style constants
        this.styles = {
            table: {
                background: '#ffffff',
                border: '#e2e8f0',
                borderWidth: 1,
                cornerRadius: 4,
                headerBackground: '#cce5ff',
                headerHeight: 30,
                rowHeight: 25,
                padding: 8,
                isolateButton: {
                    size: 18,
                    padding: 5,
                    fill: '#f0f0f0',
                    stroke: '#cccccc',
                    strokeWidth: 1,
                    iconFill: '#555555',
                    hoverFill: '#e0e0e0',
                }
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
            },
            searchHighlight: {
                stroke: '#f59e0b', // Amber color
                strokeWidth: 3,
                dash: [10, 5],
                opacity: 0.8,
                cornerRadius: 5,
                animationDuration: 0.3 // seconds
            }
        };
    }

    /**
     * Checks if a table has any relationships.
     * @param {string} tableName - The name of the table to check.
     * @returns {boolean} True if the table has relationships, false otherwise.
     */
    hasRelationships(tableName) {
        if (!this.currentSchema || !this.currentSchema.relationships) {
            return false;
        }
        return this.currentSchema.relationships.some(
            rel => (rel.from?.table === tableName || rel.fromTable === tableName) ||
                (rel.to?.table === tableName || rel.toTable === tableName)
        );
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

        // Add Isolate Button if table has relationships
        if (this.hasRelationships(tableData.name)) {
            const btnStyle = this.styles.table.isolateButton;
            const isolateBtnGroup = new Konva.Group({
                x: size.width - btnStyle.size - btnStyle.padding,
                y: btnStyle.padding,
                name: 'isolate-btn-group',
                visible: false // Initially hidden
            });

            const isolateBtnBg = new Konva.Rect({
                width: btnStyle.size,
                height: btnStyle.size,
                fill: btnStyle.fill,
                stroke: btnStyle.stroke,
                strokeWidth: btnStyle.strokeWidth,
                cornerRadius: 3
            });

            // Simple icon (e.g., a target or filter symbol) - using text for simplicity
            // A Path or SVG would be better for a real icon
            const isolateBtnIcon = new Konva.Text({
                text: '🎯', // Target icon as an example
                fontSize: btnStyle.size * 0.6,
                fill: btnStyle.iconFill,
                width: btnStyle.size,
                height: btnStyle.size,
                align: 'center',
                verticalAlign: 'middle',
                listening: false, // Icon itself should not capture events
            });

            isolateBtnGroup.add(isolateBtnBg);
            isolateBtnGroup.add(isolateBtnIcon);

            isolateBtnGroup.on('mouseenter', () => {
                isolateBtnBg.fill(btnStyle.hoverFill);
                this.stage.container().style.cursor = 'pointer';
                this.tablesLayer.draw();
            });
            isolateBtnGroup.on('mouseleave', () => {
                isolateBtnBg.fill(btnStyle.fill);
                this.stage.container().style.cursor = 'default';
                this.tablesLayer.draw();
            });

            isolateBtnGroup.on('click tap', (evt) => {
                evt.cancelBubble = true; // Prevent table selection
                if (this.eventBus) {
                    this.eventBus.emit('table:isolate', tableData);
                }
            });
            tableGroup.add(isolateBtnGroup);
        }

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
     * Format column type for display
     * @param {string} type - Column type
     * @returns {string} Formatted type
     */
    formatColumnType(type) {
        return type.toUpperCase();
    }

    /**
     * Setup table interactions
     * @param {Konva.Group} tableGroup - Table group
     * @param {Object} tableData - Table data
     */
    setupTableInteractions(tableGroup, tableData) {
        tableGroup.on('click tap', (e) => this.onTableClick(e, tableData));
        tableGroup.on('mouseenter', (e) => {
            this.onTableMouseEnter(e, tableData);
            const isolateBtn = tableGroup.findOne('.isolate-btn-group');
            if (isolateBtn) {
                isolateBtn.visible(true);
                this.tablesLayer.batchDraw();
            }
        });
        tableGroup.on('mouseleave', (e) => {
            this.onTableMouseLeave(e, tableData);
            // Only hide if not over the button itself
            const isolateBtn = tableGroup.findOne('.isolate-btn-group');
            if (!isolateBtn) return;

            const pointerPos = this.stage.getPointerPosition();
            let mouseIsOverButton = false;

            if (pointerPos && isolateBtn.isVisible()) { // Check only if button is visible
                // Get button's absolute bounding box on the stage
                const btnRect = isolateBtn.getClientRect({ relativeTo: this.stage });

                if (
                    pointerPos.x >= btnRect.x &&
                    pointerPos.x <= btnRect.x + btnRect.width &&
                    pointerPos.y >= btnRect.y &&
                    pointerPos.y <= btnRect.y + btnRect.height
                ) {
                    mouseIsOverButton = true;
                }
            }

            if (!mouseIsOverButton) {
                isolateBtn.visible(false);
                this.tablesLayer.batchDraw();
            }
        });

        tableGroup.on('dragstart', (e) => this.onDragStart(e, tableData, tableGroup));
        tableGroup.on('dragmove', (e) => this.onDrag(e, tableData, tableGroup));
        tableGroup.on('dragend', (e) => this.onDragEnd(e, tableData, tableGroup));
    }

    /**
     * Setup column interactions
     * @param {Konva.Rect} columnBackground - Column background shape
     * @param {Object} column - Column data
     * @param {Object} tableData - Table data
     */
    setupColumnInteractions(columnBackground, column, tableData) {
        columnBackground.on('click tap', (e) => {
            e.cancelBubble = true;
            this.onColumnClick(e, column, tableData);
        });
    }

    /**
     * Check if a column is a primary key
     * @param {Object} column - Column data
     * @returns {boolean}
     */
    isPrimaryKey(column) {
        // This is a simplified check. A more robust implementation might
        // rely on explicit flags in the schema data.
        return column.isPrimaryKey || column.name.toLowerCase().includes('id');
    }

    /**
     * Check if a column is a foreign key
     * @param {Object} column - Column data
     * @returns {boolean}
     */
    isForeignKey(column) {
        // This is a simplified check. A more robust implementation might
        // rely on explicit flags in the schema data.
        return column.isForeignKey || column.name.toLowerCase().includes('_id');
    }

    /**
     * Render connections
     * @param {Array} relationships - Relationship data
     * @param {Object} layout - Layout data
     */
    renderConnections(relationships, layout) {
        this.drawnPaths.clear(); // <-- ADD THIS LINE
        relationships.forEach(relationship => {
            const connectionGroup = this.createConnectionLine(relationship, layout);
            if (connectionGroup) {
                this.connectionsLayer.add(connectionGroup);
                // Use a unique key for each relationship
                const fromTable = relationship.from ? relationship.from.table : relationship.sourceTable;
                const fromColumn = relationship.from ? relationship.from.column : relationship.sourceColumn;
                const toTable = relationship.to ? relationship.to.table : relationship.targetTable;
                const toColumn = relationship.to ? relationship.to.column : relationship.targetColumn;
                const connectionKey = `${fromTable}-${fromColumn}-${toTable}-${toColumn}`;
                this.connectionLines.set(connectionKey, connectionGroup);
            }
        });
        this.connectionsLayer.draw();
    }

    /**
     * Create a connection line
     * @param {Object} relationship - Relationship data
     * @param {Object} layout - Layout data
     * @returns {Konva.Group} Connection group
     */
    createConnectionLine(relationship, layout) {
        const fromTableName = relationship.from ? relationship.from.table : relationship.sourceTable;
        const toTableName = relationship.to ? relationship.to.table : relationship.targetTable;
        const fromColumnName = relationship.from ? relationship.from.column : relationship.sourceColumn;
        const toColumnName = relationship.to ? relationship.to.column : relationship.targetColumn;

        const fromTable = this.currentSchema.tables.find(t => t.name === fromTableName);
        const toTable = this.currentSchema.tables.find(t => t.name === toTableName);

        if (!fromTable || !toTable) {
            console.warn('Could not find tables for relationship:', relationship);
            return null;
        }

        const pathPoints = this.calculateOrthogonalPath(relationship, layout);

        if (!pathPoints || pathPoints.length === 0) {
            return null;
        }

        const connectionGroup = new Konva.Group({
            name: 'connection-group',
            draggable: false
        });

        // Store relationship data
        connectionGroup.relationshipData = relationship;

        // Line
        const line = new Konva.Line({
            points: pathPoints,
            stroke: this.styles.connection.stroke,
            strokeWidth: this.styles.connection.strokeWidth,
            name: 'connection-line',
            lineCap: 'round',  // <-- ADD THIS
            lineJoin: 'round'  // <-- AND THIS
        });

        connectionGroup.add(line);

        // Add markers
        this.addRelationshipMarkers(connectionGroup, { source: { x: pathPoints[0], y: pathPoints[1] }, target: { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] } }, relationship);

        // Setup interactions
        this.setupConnectionInteractions(connectionGroup, relationship);

        return connectionGroup;
    }

    /**
     * Calculate connection points between two tables
     * @param {Object} fromPos - From table position
     * @param {Object} fromSize - From table size
     * @param {Object} toPos - To table position
     * @param {Object} toSize - To table size
     * @param {string} fromColumn - From column name
     * @param {string} toColumn - To column name
     * @param {Object} fromTable - From table data
     * @param {Object} toTable - To table data
     * @returns {Object} Source and target points
     */
    calculateConnectionPoints(fromPos, fromSize, toPos, toSize, fromColumn, toColumn, fromTable, toTable) {
        // Simplified: connect table centers
        const sourcePoint = this.getColumnConnectionPoint(fromPos, fromSize, fromColumn, fromTable, 'right');
        const targetPoint = this.getColumnConnectionPoint(toPos, toSize, toColumn, toTable, 'left');

        return {
            source: sourcePoint,
            target: targetPoint
        };
    }

    /**
     * Get the connection point for a specific column
     * @param {Object} tablePos - Table position
     * @param {Object} tableSize - Table size
     * @param {string} columnName - Column name
     * @param {Object} tableData - Table data
     * @param {string} type - 'left' or 'right'
     * @returns {Object} Point with x and y
     */
    getColumnConnectionPoint(tablePos, tableSize, columnName, tableData, type) {
        const columnIndex = tableData.columns.findIndex(c => c.name === columnName);
        const y = tablePos.y + this.styles.table.headerHeight + (columnIndex * this.styles.table.rowHeight) + (this.styles.table.rowHeight / 2);

        if (type === 'left') {
            return {
                x: tablePos.x,
                y: y
            };
        } else { // right
            return {
                x: tablePos.x + tableSize.width,
                y: y
            };
        }
    }

    /**
     * Optimize connection sides to minimize line length and crossings
     * @param {Object} fromPos - From table position
     * @param {Object} fromSize - From table size
     * @param {Object} toPos - To table position
     * @param {Object} toSize - To table size
     * @param {Object} sourcePoint - Original source point
     * @param {Object} targetPoint - Original target point
     * @returns {Object} Optimized source and target points
     */
    optimizeConnectionSides(fromPos, fromSize, toPos, toSize, sourcePoint, targetPoint) {
        const fromSides = {
            left: { x: fromPos.x, y: sourcePoint.y },
            right: { x: fromPos.x + fromSize.width, y: sourcePoint.y }
        };
        const toSides = {
            left: { x: toPos.x, y: targetPoint.y },
            right: { x: toPos.x + toSize.width, y: targetPoint.y }
        };

        let bestSource = fromSides.right;
        let bestTarget = toSides.left;
        let minDistance = this.getDistance(bestSource, bestTarget);

        // Check all 4 combinations
        const combinations = [
            { source: fromSides.right, target: toSides.left },
            { source: fromSides.left, target: toSides.right },
            { source: fromSides.right, target: toSides.right },
            { source: fromSides.left, target: toSides.left }
        ];

        combinations.forEach(combo => {
            const distance = this.getDistance(combo.source, combo.target);
            if (distance < minDistance) {
                minDistance = distance;
                bestSource = combo.source;
                bestTarget = combo.target;
            }
        });

        return {
            source: bestSource,
            target: bestTarget
        };
    }



    /**
     * Get a connection point on the side of a table's bounding box.
     * @param {Object} tableLayoutInfo - Object containing { x, y, width, height } for the table.
     * @param {string} side - 'left' or 'right'.
     * @returns {Object} Point with x and y.
     */
    getTableSideConnectionPoint(tableLayoutInfo, side) {
        let x;
        const y = tableLayoutInfo.y + tableLayoutInfo.height / 2; // Vertical midpoint

        if (side === 'left') {
            x = tableLayoutInfo.x;
        } else { // right
            x = tableLayoutInfo.x + tableLayoutInfo.width;
        }
        return { x, y };
    }







    // /**
    //  * Calculates a clean, predictable orthogonal path for a relationship line.
    //  * This version prioritizes readability over complex obstacle avoidance.
    //  * @param {Object} relationship - The relationship data.
    //  * @param {Object} layout - The current layout data.
    //  * @returns {Array} An array of points for the Konva.Line, e.g., [x1, y1, x2, y2, ...].
    //  */
    // calculateOrthogonalPath(relationship, layout) {
    //     const fromTableName = relationship.from?.table || relationship.fromTable;
    //     const toTableName = relationship.to?.table || relationship.toTable;
    //     const fromColumnName = relationship.from?.column || relationship.fromColumn;
    //     const toColumnName = relationship.to?.column || relationship.toColumn;

    //     const fromTableData = this.currentSchema.tables.find(t => t.name === fromTableName);
    //     const toTableData = this.currentSchema.tables.find(t => t.name === toTableName);

    //     if (!fromTableData || !toTableData) {
    //         console.warn('Could not find tables for relationship:', relationship);
    //         return [];
    //     }

    //     const fromPos = this.getTablePosition(fromTableName, layout);
    //     const fromSize = this.getTableSize(fromTableName, layout);
    //     const toPos = this.getTablePosition(toTableName, layout);
    //     const toSize = this.getTableSize(toTableName, layout);

    //     const fromRightEdgeX = fromPos.x + fromSize.width;
    //     const toRightEdgeX = toPos.x + toSize.width;

    //     let sourceSide, targetSide;

    //     // Determine which side of each table the connection should come from.
    //     if (fromRightEdgeX + 30 < toPos.x) { // fromTable is clearly to the left of toTable
    //         sourceSide = 'right';
    //         targetSide = 'left';
    //     } else if (toRightEdgeX + 30 < fromPos.x) { // toTable is clearly to the left of fromTable
    //         sourceSide = 'left';
    //         targetSide = 'right';
    //     } else { // Tables are vertically aligned or overlapping horizontally.
    //         // Default to an "outward" facing connection based on relative position.
    //         if (fromPos.x < toPos.x) {
    //             sourceSide = 'right';
    //             targetSide = 'right';
    //         } else {
    //             sourceSide = 'left';
    //             targetSide = 'left';
    //         }
    //     }

    //     const sourcePoint = this.getColumnConnectionPoint(fromPos, fromSize, fromColumnName, fromTableData, sourceSide);
    //     const targetPoint = this.getColumnConnectionPoint(toPos, toSize, toColumnName, toTableData, targetSide);

    //     const standoff = 30; // The horizontal distance the line extends from the table before turning.
    //     const points = [];

    //     points.push(sourcePoint.x, sourcePoint.y);

    //     // Point 2: Standoff from source
    //     const p2x = (sourceSide === 'right') ? sourcePoint.x + standoff : sourcePoint.x - standoff;
    //     points.push(p2x, sourcePoint.y);

    //     // Midpoint X for the main horizontal segment
    //     const p_mid_x = (sourceSide === targetSide) 
    //         ? Math.max(p2x, (targetSide === 'right' ? targetPoint.x + standoff : targetPoint.x - standoff)) + standoff 
    //         : (p2x + (targetSide === 'right' ? targetPoint.x - standoff : targetPoint.x + standoff)) / 2;

    //     const p3x = p_mid_x;
    //     const p4y = targetPoint.y;

    //     // Point 3: Vertical turn
    //     points.push(p2x, p4y);

    //     // Point 4: Horizontal segment to align with target standoff
    //     const p5x = (targetSide === 'right') ? targetPoint.x + standoff : targetPoint.x - standoff;
    //     points.push(p5x, p4y);

    //     // Point 5: Standoff from target
    //     points.push(p5x, targetPoint.y);

    //     // Final Point
    //     points.push(targetPoint.x, targetPoint.y);

    //     // Return the simplified, clean path
    //     return this.simplifyPath(points);
    // }

    // /**
    //  * Calculates an obstacle-avoiding path for a relationship line using A*.
    //  */
    // calculateOrthogonalPath(relationship, layout) {
    //     const gridSize = 20; // The resolution of our pathfinding grid.

    //     const fromTableName = relationship.from?.table || relationship.fromTable;
    //     const toTableName = relationship.to?.table || relationship.toTable;
    //     const fromColumnName = relationship.from?.column || relationship.fromColumn;
    //     const toColumnName = relationship.to?.column || relationship.toColumn;

    //     // 1. Get Source and Target Information
    //     const fromTableData = this.currentSchema.tables.find(t => t.name === fromTableName);
    //     const toTableData = this.currentSchema.tables.find(t => t.name === toTableName);
    //     if (!fromTableData || !toTableData) return [];

    //     const fromPos = this.getTablePosition(fromTableName, layout);
    //     const fromSize = this.getTableSize(fromTableName, layout);
    //     const toPos = this.getTablePosition(toTableName, layout);
    //     const toSize = this.getTableSize(toTableName, layout);

    //     // 2. Define the Routing Grid based on diagram bounds
    //     const bounds = this.stage.getClientRect({ skipTransform: true });
    //     const gridWidth = Math.ceil(bounds.width / gridSize) + 1;
    //     const gridHeight = Math.ceil(bounds.height / gridSize) + 1;
    //     const gridOriginX = bounds.x;
    //     const gridOriginY = bounds.y;

    //     const grid = Array(gridWidth).fill(0).map(() => Array(gridHeight).fill(0));

    //     // 3. Mark Obstacles on the Grid (all other tables)
    //     const tablePadding = 1; // Number of grid cells to pad around tables
    //     this.currentSchema.tables.forEach(table => {
    //         if (table.name === fromTableName || table.name === toTableName) return;
    //         const pos = this.getTablePosition(table.name, layout);
    //         const size = this.getTableSize(table.name, layout);

    //         const startX = Math.max(0, Math.floor((pos.x - gridOriginX) / gridSize) - tablePadding);
    //         const endX = Math.min(gridWidth - 1, Math.ceil((pos.x + size.width - gridOriginX) / gridSize) + tablePadding);
    //         const startY = Math.max(0, Math.floor((pos.y - gridOriginY) / gridSize) - tablePadding);
    //         const endY = Math.min(gridHeight - 1, Math.ceil((pos.y + size.height - gridOriginY) / gridSize) + tablePadding);

    //         for (let x = startX; x <= endX; x++) {
    //             for (let y = startY; y <= endY; y++) {
    //                 grid[x][y] = 1; // Mark as obstacle
    //             }
    //         }
    //     });

    //     // 4. Determine Start and End points for the router
    //     const sourceSide = (fromPos.x + fromSize.width / 2 < toPos.x + toSize.width / 2) ? 'right' : 'left';
    //     const targetSide = (toPos.x + toSize.width / 2 < fromPos.x + fromSize.width / 2) ? 'right' : 'left';

    //     const sourcePoint = this.getColumnConnectionPoint(fromPos, fromSize, fromColumnName, fromTableData, sourceSide);
    //     const targetPoint = this.getColumnConnectionPoint(toPos, toSize, toColumnName, toTableData, targetSide);

    //     const startNode = {
    //         x: Math.floor((sourcePoint.x - gridOriginX) / gridSize),
    //         y: Math.floor((sourcePoint.y - gridOriginY) / gridSize)
    //     };
    //     const endNode = {
    //         x: Math.floor((targetPoint.x - gridOriginX) / gridSize),
    //         y: Math.floor((targetPoint.y - gridOriginY) / gridSize)
    //     };

    //     // Ensure start/end nodes are not inside an obstacle (can happen with padding)
    //     if (grid[startNode.x] && grid[startNode.x][startNode.y] === 1) grid[startNode.x][startNode.y] = 0;
    //     if (grid[endNode.x] && grid[endNode.x][endNode.y] === 1) grid[endNode.x][endNode.y] = 0;

    //     // 5. Find the Path
    //     const router = new AStarRouter(grid);
    //     const path = router.findPath(startNode, endNode);

    //     if (!path) {
    //         console.warn(`A* could not find a path for ${fromTableName} -> ${toTableName}. Drawing straight line.`);
    //         return [sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y];
    //     }

    //     // 6. Convert Grid Path to Pixel Coordinates and Simplify
    //     const pixelPath = path.map(p => [
    //         p.x * gridSize + gridOriginX + gridSize / 2,
    //         p.y * gridSize + gridOriginY + gridSize / 2
    //     ]);

    //     // Add actual start/end points for precision
    //     pixelPath.unshift([sourcePoint.x, sourcePoint.y]);
    //     pixelPath.push([targetPoint.x, targetPoint.y]);

    //     return this.simplifyPath(pixelPath.flat());
    // }

    // /**
    //  * Calculates an obstacle-avoiding path for a relationship line using A*.
    //  * This is the definitive, complete version.
    //  */
    // calculateOrthogonalPath(relationship, layout) {
    //     const gridSize = 20; // The resolution of our pathfinding grid.

    //     const fromTableName = relationship.from?.table || relationship.fromTable;
    //     const toTableName = relationship.to?.table || relationship.toTable;
    //     const fromColumnName = relationship.from?.column || relationship.fromColumn;
    //     const toColumnName = relationship.to?.column || relationship.toColumn;

    //     // --- Start of Bounding Box Calculation ---
    //     let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    //     this.currentSchema.tables.forEach(table => {
    //         const pos = this.getTablePosition(table.name, layout);
    //         const size = this.getTableSize(table.name, layout);
    //         minX = Math.min(minX, pos.x);
    //         minY = Math.min(minY, pos.y);
    //         maxX = Math.max(maxX, pos.x + size.width);
    //         maxY = Math.max(maxY, pos.y + size.height);
    //     });

    //     const padding = 50; // Pixel padding around the diagram
    //     const gridOriginX = minX - padding;
    //     const gridOriginY = minY - padding;
    //     const gridWidth = Math.ceil((maxX - minX + 2 * padding) / gridSize);
    //     const gridHeight = Math.ceil((maxY - minY + 2 * padding) / gridSize);

    //     if (!isFinite(gridWidth) || !isFinite(gridHeight)) return [];
    //     // --- End of Bounding Box Calculation ---



    //     // Get Source and Target Information
    //     const fromTableData = this.currentSchema.tables.find(t => t.name === fromTableName);
    //     const toTableData = this.currentSchema.tables.find(t => t.name === toTableName);
    //     if (!fromTableData || !toTableData) return [];

    //     // ** THIS WAS THE MISSING PART **
    //     const fromPos = this.getTablePosition(fromTableName, layout);
    //     const fromSize = this.getTableSize(fromTableName, layout);
    //     const toPos = this.getTablePosition(toTableName, layout);
    //     const toSize = this.getTableSize(toTableName, layout);
    //     // ** END MISSING PART **

    //     // --- ** ADD THIS SAFETY BLOCK ** ---
    //     const MAX_GRID_CELLS = 250000; // Corresponds to a ~500x500 grid
    //     if (gridWidth * gridHeight > MAX_GRID_CELLS) {
    //         console.warn(`Routing grid is too large (${gridWidth}x${gridHeight}). Skipping A* for performance.`, relationship);
    //         const fromTableName = relationship.from?.table || relationship.fromTable;
    //         const toTableName = relationship.to?.table || relationship.toTable;
    //         const fromPos = this.getTablePosition(fromTableName, layout);
    //         const toPos = this.getTablePosition(toTableName, layout);
    //         const fromSize = this.getTableSize(fromTableName, layout);
    //         const toSize = this.getTableSize(toTableName, layout);
    //         // Fallback to a simple line
    //         return [fromPos.x + fromSize.width / 2, fromPos.y + fromSize.height / 2, toPos.x + toSize.width / 2, toPos.y + toSize.height / 2];
    //     }
    //     // --- ** END SAFETY BLOCK ** ---

    //     // Create the grid for A*
    //     const grid = Array(gridWidth).fill(0).map(() => Array(gridHeight).fill(0));

    //     // Mark Obstacles on the Grid (all other tables)
    //     const tablePadding = 1; // Number of grid cells to pad around tables
    //     this.currentSchema.tables.forEach(table => {
    //         // Do not treat the source and target tables as obstacles for their own connection lines
    //         if (table.name === fromTableName || table.name === toTableName) return;
    //         const pos = this.getTablePosition(table.name, layout);
    //         const size = this.getTableSize(table.name, layout);

    //         const startX = Math.max(0, Math.floor((pos.x - gridOriginX) / gridSize) - tablePadding);
    //         const endX = Math.min(gridWidth - 1, Math.ceil((pos.x + size.width - gridOriginX) / gridSize) + tablePadding);
    //         const startY = Math.max(0, Math.floor((pos.y - gridOriginY) / gridSize) - tablePadding);
    //         const endY = Math.min(gridHeight - 1, Math.ceil((pos.y + size.height - gridOriginY) / gridSize) + tablePadding);

    //         for (let x = startX; x <= endX; x++) {
    //             for (let y = startY; y <= endY; y++) {
    //                 if (grid[x] && grid[x][y] !== undefined) {
    //                     grid[x][y] = 1; // Mark as obstacle
    //                 }
    //             }
    //         }
    //     });

    //     // Determine Start and End points for the router
    //     const sourceSide = (fromPos.x + fromSize.width / 2 < toPos.x + toSize.width / 2) ? 'right' : 'left';
    //     const targetSide = (toPos.x + toSize.width / 2 < fromPos.x + fromSize.width / 2) ? 'right' : 'left';

    //     const sourcePoint = this.getColumnConnectionPoint(fromPos, fromSize, fromColumnName, fromTableData, sourceSide);
    //     const targetPoint = this.getColumnConnectionPoint(toPos, toSize, toColumnName, toTableData, targetSide);

    //     const startNode = {
    //         x: Math.round((sourcePoint.x - gridOriginX) / gridSize),
    //         y: Math.round((sourcePoint.y - gridOriginY) / gridSize)
    //     };
    //     const endNode = {
    //         x: Math.round((targetPoint.x - gridOriginX) / gridSize),
    //         y: Math.round((targetPoint.y - gridOriginY) / gridSize)
    //     };

    //     // Ensure start/end nodes are within grid bounds
    //     startNode.x = Math.max(0, Math.min(gridWidth - 1, startNode.x));
    //     startNode.y = Math.max(0, Math.min(gridHeight - 1, startNode.y));
    //     endNode.x = Math.max(0, Math.min(gridWidth - 1, endNode.x));
    //     endNode.y = Math.max(0, Math.min(gridHeight - 1, endNode.y));

    //     // Ensure start/end nodes are not inside an obstacle (can happen with padding)
    //     if (grid[startNode.x] && grid[startNode.x][startNode.y] === 1) grid[startNode.x][startNode.y] = 0;
    //     if (grid[endNode.x] && grid[endNode.x][endNode.y] === 1) grid[endNode.x][endNode.y] = 0;

    //     // Find the Path using the A* helper
    //     const router = new AStarRouter(grid);
    //     const path = router.findPath(startNode, endNode);

    //     if (!path) {
    //         console.warn(`A* could not find a path for ${fromTableName} -> ${toTableName}. Drawing straight line.`);
    //         return [sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y];
    //     }

    //     // Convert Grid Path to Pixel Coordinates and Simplify
    //     const pixelPath = path.map(p => [
    //         p.x * gridSize + gridOriginX + gridSize / 2,
    //         p.y * gridSize + gridOriginY + gridSize / 2
    //     ]);

    //     // Add actual start/end points for precision
    //     pixelPath.unshift([sourcePoint.x, sourcePoint.y]);
    //     pixelPath.push([targetPoint.x, targetPoint.y]);

    //     return this.simplifyPath(pixelPath.flat());
    // }

    /**
         * Calculates an obstacle-avoiding path. This version relies entirely on the
         * provided layout object, ensuring a consistent world view.
         */
    calculateOrthogonalPath(relationship) {
        const fromTableName = relationship.from.table;
        const toTableName = relationship.to.table;
        console.log(`[calculateOrthogonalPath] Starting for ${fromTableName} -> ${toTableName}`);
        const gridSize = 20;
        const standoffGridCells = 3;

        // Get live table groups
        const fromTableGroup = this.tableGroups.get(relationship.from.table);
        const toTableGroup = this.tableGroups.get(relationship.to.table);
        if (!fromTableGroup || !toTableGroup) {
            console.error(`Could not find Konva group for ${fromTableName} or ${toTableName}`);
            return [];
        }

        const fromNode = { name: fromTableName, ...fromTableGroup.position(), ...fromTableGroup.size() };
        const toNode = { name: toTableName, ...toTableGroup.position(), ...toTableGroup.size() };

        const { sourceSide, targetSide } = this.getOptimalSides(fromNode, toNode);

        // --- Bounding Box from LIVE positions ---
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.tableGroups.forEach(group => {
            const pos = group.position(); const size = group.size();
            minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + size.width); maxY = Math.max(maxY, pos.y + size.height);
        });

        const padding = 100; // Increase padding to give router more space
        const gridOriginX = minX - padding; const gridOriginY = minY - padding;
        const gridWidth = Math.ceil((maxX - minX + 2 * padding) / gridSize);
        const gridHeight = Math.ceil((maxY - minY + 2 * padding) / gridSize);
        if (!isFinite(gridWidth) || !isFinite(gridHeight)) return [];

        const grid = Array(gridWidth).fill(0).map(() => Array(gridHeight).fill(0));

        // --- Obstacle and Margin Marking ---
        this.tableGroups.forEach(group => {
            const pos = group.position(); const size = group.size();
            const margin = 2; // Margin of 2 grid cells around tables

            // Inner "hard wall" for the table itself
            const startX = Math.floor((pos.x - gridOriginX) / gridSize);
            const endX = Math.ceil((pos.x + size.width - gridOriginX) / gridSize);
            const startY = Math.floor((pos.y - gridOriginY) / gridSize);
            const endY = Math.ceil((pos.y + size.height - gridOriginY) / gridSize);
            for (let x = startX; x <= endX; x++) {
                for (let y = startY; y <= endY; y++) {
                    if (grid[x]?.[y] !== undefined) grid[x][y] = 1; // Wall
                }
            }

            // Outer "soft wall" margin with high cost
            const marginStartX = Math.max(0, startX - margin);
            const marginEndX = Math.min(gridWidth - 1, endX + margin);
            const marginStartY = Math.max(0, startY - margin);
            const marginEndY = Math.min(gridHeight - 1, endY + margin);
            for (let x = marginStartX; x <= marginEndX; x++) {
                for (let y = marginStartY; y <= marginEndY; y++) {
                    if (grid[x]?.[y] === 0) grid[x][y] = 50; // High cost
                }
            }
        });


        const sourcePoint = this.getColumnConnectionPoint(fromNode, fromNode, relationship.from.column, fromTableGroup.tableData, sourceSide);
        const targetPoint = this.getColumnConnectionPoint(toNode, toNode, relationship.to.column, toTableGroup.tableData, targetSide);

        const startNode = { x: Math.round((sourcePoint.x - gridOriginX) / gridSize) + (sourceSide === 'right' ? standoffGridCells : -standoffGridCells), y: Math.round((sourcePoint.y - gridOriginY) / gridSize) };
        const endNode = { x: Math.round((targetPoint.x - gridOriginX) / gridSize) + (targetSide === 'right' ? -standoffGridCells : standoffGridCells), y: Math.round((targetPoint.y - gridOriginY) / gridSize) };

        // Ensure start/end points are clear
        const clearRadius = standoffGridCells;
        for (let dx = -clearRadius; dx <= clearRadius; dx++) {
            for (let dy = -clearRadius; dy <= clearRadius; dy++) {
                if (grid[startNode.x + dx]?.[startNode.y + dy] !== undefined) grid[startNode.x + dx][startNode.y + dy] = 0;
                if (grid[endNode.x + dx]?.[endNode.y + dy] !== undefined) grid[endNode.x + dx][endNode.y + dy] = 0;
            }
        }

        const router = new AStarRouter(grid);
        const path = router.findPath(startNode, endNode);

        if (!path) { console.warn(`A* could not find a path for ${relationship.from.table} -> ${relationship.to.table}.`); return []; }

        this.drawnPaths.add(path.map(p => `${p.x},${p.y}`).join('|'));

        const pixelPath = path.map(p => [p.x * gridSize + gridOriginX + gridSize / 2, p.y * gridSize + gridOriginY + gridSize / 2]);

        // Rebuild the final path with the standoff segments
        const firstPathPoint = { x: pixelPath[0][0], y: pixelPath[0][1] };
        const lastPathPoint = { x: pixelPath[pixelPath.length - 1][0], y: pixelPath[pixelPath.length - 1][1] };
        pixelPath.unshift([firstPathPoint.x, sourcePoint.y]);
        pixelPath.unshift([sourcePoint.x, sourcePoint.y]);
        pixelPath.push([lastPathPoint.x, targetPoint.y]);
        pixelPath.push([targetPoint.x, targetPoint.y]);

        return this.simplifyPath(pixelPath.flat());
    }

    getOptimalSides(fromNode, toNode) {
        console.log(`%c[getOptimalSides] Determining sides for ${fromNode.name} -> ${toNode.name}`, 'color: blue');

        const fromCenter = fromNode.x + fromNode.width / 2;
        const toCenter = toNode.x + toNode.width / 2;

        let sourceSide, targetSide;

        // Determine the primary horizontal relationship
        if (fromNode.x + fromNode.width < toNode.x) {
            // fromNode is entirely to the left of toNode
            sourceSide = 'right';
            targetSide = 'left';
            console.log(`[getOptimalSides] Choice: from is LEFT of to. Sides: [${sourceSide}, ${targetSide}]`);
        } else if (toNode.x + toNode.width < fromNode.x) {
            // toNode is entirely to the left of fromNode
            sourceSide = 'left';
            targetSide = 'right';
            console.log(`[getOptimalSides] Choice: from is RIGHT of to. Sides: [${sourceSide}, ${targetSide}]`);
        } else {
            // Tables are vertically overlapping. Choose sides to go "outward".
            if (fromCenter < toCenter) {
                sourceSide = 'right';
                targetSide = 'left';
            } else {
                sourceSide = 'left';
                targetSide = 'right';
            }
            console.log(`[getOptimalSides] Choice: Vertically aligned. Sides: [${sourceSide}, ${targetSide}]`);
        }

        return { sourceSide, targetSide };
    }

    /**
     * Helper: Simplify path by removing redundant collinear points.
     * This is crucial for creating clean lines.
     */
    simplifyPath(points) {
        if (points.length <= 4) return points; // Cannot simplify

        const simplified = [points[0], points[1]];

        for (let i = 2; i < points.length - 2; i += 2) {
            const [x1, y1] = [simplified[simplified.length - 2], simplified[simplified.length - 1]];
            const [x2, y2] = [points[i], points[i + 1]];
            const [x3, y3] = [points[i + 2], points[i + 3]];

            // Check for collinearity (both points are on the same horizontal or vertical line)
            const isCollinear = (x1 === x2 && x2 === x3) || (y1 === y2 && y2 === y3);

            if (!isCollinear) {
                simplified.push(x2, y2);
            }
        }

        // Add the last point
        simplified.push(points[points.length - 2], points[points.length - 1]);

        return simplified;
    }


    /**
      * Adds circular markers at the start and end of a connection line.
      */
    addRelationshipMarkers(connectionGroup, connectionPoints, relationship) {
        const markerRadius = 5;
        const markerStrokeWidth = 2;

        // Start marker
        const startMarker = new Konva.Circle({
            x: connectionPoints.source.x,
            y: connectionPoints.source.y,
            radius: markerRadius,
            fill: this.styles.table.background, // White fill
            stroke: this.styles.connection.stroke,
            strokeWidth: markerStrokeWidth,
            name: 'start-marker' // Critical for the drag-trail fix
        });

        // End marker
        const endMarker = new Konva.Circle({
            x: connectionPoints.target.x,
            y: connectionPoints.target.y,
            radius: markerRadius,
            fill: this.styles.table.background,
            stroke: this.styles.connection.stroke,
            strokeWidth: markerStrokeWidth,
            name: 'end-marker' // Critical for the drag-trail fix
        });

        connectionGroup.add(startMarker);
        connectionGroup.add(endMarker);
    }

    /**
     * Setup connection interactions
     * @param {Konva.Group} connectionGroup - Connection group
     * @param {Object} relationship - Relationship data
     */
    setupConnectionInteractions(connectionGroup, relationship) {
        connectionGroup.on('click tap', (e) => this.onConnectionClick(e, relationship));
        connectionGroup.on('mouseenter', (e) => this.onConnectionMouseEnter(e, relationship));
        connectionGroup.on('mouseleave', (e) => this.onConnectionMouseLeave(e, relationship));
    }

    /**
     * Get table position from layout data
     * @param {string} tableName - Table name
     * @param {Object} layout - Layout data
     * @returns {Object} Position with x and y
     */
    getTablePosition(tableName, layout) {
        if (!layout || !layout.tables) return { x: 0, y: 0 };
        const tableLayout = layout.tables.find(t => t.name === tableName);
        return tableLayout ? { x: tableLayout.x, y: tableLayout.y } : { x: 0, y: 0 };
    }

    /**
     * Get table size from layout data
     * @param {string} tableName - Table name
     * @param {Object} layout - Layout data
     * @returns {Object} Size with width and height
     */
    getTableSize(tableName, layout) {
        if (layout && layout.tables) {
            const tableLayout = layout.tables.find(t => t.name === tableName);
            if (tableLayout && tableLayout.width && tableLayout.height) {
                return {
                    width: tableLayout.width,
                    height: tableLayout.height
                };
            }
        }
        // Fallback to calculating size based on content if not in layout
        const tableData = this.currentSchema.tables.find(t => t.name === tableName);
        const height = this.styles.table.headerHeight + (tableData.columns.length * this.styles.table.rowHeight) + this.styles.table.padding;
        return { width: 200, height: height }; // Default width
    }

    onTableClick(event, data) {
        this.selectTable(data);
        if (this.eventBus) {
            this.eventBus.emit('table:selected', data);
        }
    }
    onColumnClick(event, columnData, tableData) {
        if (this.eventBus) {
            this.eventBus.emit('column:selected', { table: tableData, column: columnData });
        }
    }

    onTableMouseEnter(event, data) {
        const tableGroup = this.tableGroups.get(data.name);
        if (tableGroup) {
            // Simple hover effect, e.g., change cursor
            this.stage.container().style.cursor = 'pointer';
            this.hoveredTable = data;
        }
    }

    onTableMouseLeave(event, data) {
        this.stage.container().style.cursor = 'default';
        this.hoveredTable = null;
    }
    onConnectionClick(event, data) {
        if (this.eventBus) {
            this.eventBus.emit('connection:selected', data);
        }
    }

    onConnectionMouseEnter(event, data) {
        const fromTable = data.from ? data.from.table : data.sourceTable;
        const fromColumn = data.from ? data.from.column : data.sourceColumn;
        const toTable = data.to ? data.to.table : data.targetTable;
        const toColumn = data.to ? data.to.column : data.targetColumn;
        const connectionKey = `${fromTable}-${fromColumn}-${toTable}-${toColumn}`;
        const connectionGroup = this.connectionLines.get(connectionKey);
        if (connectionGroup) {
            const line = connectionGroup.findOne('.connection-line');
            line.stroke(this.styles.connection.selectedStroke);
            line.strokeWidth(this.styles.connection.selectedStrokeWidth);
            this.connectionsLayer.draw();

            this.highlightRelatedColumns(fromTable, fromColumn, toTable, toColumn, true);
        }
    }

    onConnectionMouseLeave(event, data) {
        const fromTable = data.from ? data.from.table : data.sourceTable;
        const fromColumn = data.from ? data.from.column : data.sourceColumn;
        const toTable = data.to ? data.to.table : data.targetTable;
        const toColumn = data.to ? data.to.column : data.targetColumn;
        const connectionKey = `${fromTable}-${fromColumn}-${toTable}-${toColumn}`;
        const connectionGroup = this.connectionLines.get(connectionKey);
        if (connectionGroup) {
            const line = connectionGroup.findOne('.connection-line');
            line.stroke(this.styles.connection.stroke);
            line.strokeWidth(this.styles.connection.strokeWidth);
            this.connectionsLayer.draw();
            this.highlightRelatedColumns(fromTable, fromColumn, toTable, toColumn, false);
        }
    }

    /**
     * Highlight related columns in tables
     */
    highlightRelatedColumns(fromTable, fromColumn, toTable, toColumn, highlight) {
        this.highlightTableColumn(fromTable, fromColumn, highlight);
        this.highlightTableColumn(toTable, toColumn, highlight);
    }

    /**
     * Highlight a specific column in a table
     */
    highlightTableColumn(tableName, columnName, highlight) {
        const tableGroup = this.tableGroups.get(tableName);
        if (tableGroup) {
            tableGroup.find('.column-background').forEach(bg => {
                if (bg.getAttr('columnData').name === columnName) {
                    bg.fill(highlight ? 'rgba(37, 99, 235, 0.1)' : 'transparent');
                    this.tablesLayer.draw();
                }
            });
        }
    }
    onDragStart(event, data, element) {
        element.moveToTop();
        this.tablesLayer.draw();
    }
    onDrag(event, data, element) {
        // This handler provides smooth, LIVE feedback during the drag.
        console.log(`Dragging ${data.name}...`);

        // 1. Update the layout object with the table's current position.
        const tableInLayout = this.currentLayout.tables.find(t => t.name === data.name);
        if (tableInLayout) {
            tableInLayout.x = element.x();
            tableInLayout.y = element.y();
        }

        // 2. Redraw connections for this table.
        this.updateConnectionsForTable(data.name);

        // 3. IMPORTANT: Tell Konva to redraw the connections layer on the next frame.
        this.connectionsLayer.batchDraw();
    }

    onDragEnd(event, data, element) {
        // When the drag is finished, we ensure the entire diagram is in a consistent state.
        console.log(`Drag ended for ${data.name}. Finalizing layout.`);

        // The layout object is already up-to-date from the onDrag handler.
        // We just do a final redraw of all connections to clean up any artifacts.
        this.redrawAllConnections();

        if (this.eventBus) {
            this.eventBus.emit('diagram:changed');
        }
    }

    redrawAllConnections() {
        // Clear all drawn path data for the A* router
        this.drawnPaths.clear();

        this.connectionLines.forEach((connectionGroup, key) => {
            this.updateConnectionLine(connectionGroup, connectionGroup.relationshipData);
        });
    }

    /**
      * Update connections for a moved table by reading from the currentLayout state.
      */
    updateConnectionsForTable(tableName) {
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
     * Update a connection line, ensuring old markers are destroyed before creating new ones.
     * This version correctly defines sourcePoint and targetPoint.
     */
    updateConnectionLine(connectionGroup, relationship) {
        // Find and destroy all previous markers to prevent trails.
        connectionGroup.find('.start-marker').forEach(marker => marker.destroy());
        connectionGroup.find('.end-marker').forEach(marker => marker.destroy());

        const pathPoints = this.calculateOrthogonalPath(relationship, this.currentLayout);
        const line = connectionGroup.findOne('.connection-line');

        // If a path is found, update the line and markers.
        if (pathPoints && pathPoints.length > 0) {
            if (line) {
                line.points(pathPoints);
            }

            // ** THIS IS THE FIX **
            // We must define sourcePoint and targetPoint here from the new path.
            const sourcePoint = { x: pathPoints[0], y: pathPoints[1] };
            const targetPoint = { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] };

            // Add the new markers
            this.addRelationshipMarkers(connectionGroup, { source: sourcePoint, target: targetPoint }, relationship);

        } else {
            // If no path is found (e.g., during a complex drag), hide the line.
            if (line) {
                line.points([]);
            }
        }

        this.connectionsLayer.batchDraw();
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

        const bounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };

        const stageWidth = this.stage.width();
        const stageHeight = this.stage.height();
        const padding = 50;

        const scaleX = (stageWidth - padding * 2) / bounds.width;
        const scaleY = (stageHeight - padding * 2) / bounds.height;
        const scale = Math.min(scaleX, scaleY, 1); // Cap scale at 1

        this.stage.scale({ x: scale, y: scale });

        const newX = (stageWidth - bounds.width * scale) / 2 - bounds.x * scale;
        const newY = (stageHeight - bounds.height * scale) / 2 - bounds.y * scale;

        this.stage.position({ x: newX, y: newY });
    }

    /**
     * Reset zoom and pan to default
     */
    resetZoom() {
        this.stage.scale({ x: 1, y: 1 });
        this.stage.position({ x: 0, y: 0 });
        this.fitToView();
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
        const newScale = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, level));
        this.stage.scale({ x: newScale, y: newScale });
    }

    /**
     * Update the layout of the diagram
     * @param {Object} layout - New layout data
     */
    updateLayout(layout) {
        this.currentLayout = layout;

        // Move all tables to their new positions from the layout.
        this.tableGroups.forEach((group, name) => {
            const tableLayout = layout.tables.find(t => t.name === name);
            if (tableLayout) {
                group.position({ x: tableLayout.x, y: tableLayout.y });
            }
        });

        this.tablesLayer.draw();

        // Redraw all connections based on the new layout.
        this.redrawAllConnections();
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.stage) {
            this.stage.destroy();
        }
        this.tableGroups.clear();
        this.connectionLines.clear();
        this.initialized = false;
    }

    /**
     * Navigate to and highlight an element on the canvas.
     * @param {Object} navigationData - Data about the element to navigate to.
     *                                 Expected to have `type` ('table' or 'column')
     *                                 and `target` (the search result object).
     */
    navigateToElement(navigationData) {
        if (!navigationData || !navigationData.target) {
            console.warn('[KonvaERDRenderer] Invalid navigation data received.', navigationData);
            return;
        }

        const targetItem = navigationData.target;
        let konvaElement = null;
        let elementBounds = null;

        this.clearSearchHighlight(); // Clear previous highlight first

        if (targetItem.type === 'table') {
            konvaElement = this.tableGroups.get(targetItem.name);
            if (konvaElement) {
                elementBounds = konvaElement.getClientRect();
            }
        } else if (targetItem.type === 'column') {
            const tableGroup = this.tableGroups.get(targetItem.table);
            if (tableGroup) {
                // Find the visual representation of the column.
                // This assumes column backgrounds store 'columnData' as an attribute.
                const columnShape = tableGroup.findOne((node) => {
                    return node.name() === 'column-background' && node.getAttr('columnData')?.name === targetItem.name;
                });
                if (columnShape) {
                    konvaElement = columnShape; // For focusing, we might focus the table, then highlight column
                    // Get bounds relative to the stage
                    const columnRect = columnShape.getClientRect({ relativeTo: tableGroup });
                    elementBounds = {
                        x: tableGroup.x() + columnRect.x,
                        y: tableGroup.y() + columnRect.y,
                        width: columnRect.width,
                        height: columnRect.height,
                    };
                } else {
                    // Fallback to table if specific column visual not found
                    konvaElement = tableGroup;
                    elementBounds = tableGroup.getClientRect();
                }
            }
        } else if (targetItem.type === 'relationship') {
            // Find relationship
            const relKey = `${targetItem.fromTable}-${targetItem.fromColumn || targetItem.data.from.column}-${targetItem.toTable}-${targetItem.toColumn || targetItem.data.to.column}`;
            konvaElement = this.connectionLines.get(relKey);
            if (konvaElement) {
                elementBounds = konvaElement.getClientRect();
            }
        }


        if (!konvaElement && !elementBounds) {
            console.warn(`[KonvaERDRenderer] Element not found for search result:`, targetItem);
            return;
        }

        // If only elementBounds is available (e.g. for column), use that. Otherwise, use konvaElement's bounds.
        const finalBounds = elementBounds || konvaElement.getClientRect();

        // 1. Pan and Zoom to the element
        const scale = Math.min(this.stage.width() / (finalBounds.width + 100), this.stage.height() / (finalBounds.height + 100), 1.5); // Add padding, cap zoom

        this.stage.to({
            x: -finalBounds.x * scale + this.stage.width() / 2 - (finalBounds.width * scale / 2),
            y: -finalBounds.y * scale + this.stage.height() / 2 - (finalBounds.height * scale / 2),
            scaleX: scale,
            scaleY: scale,
            duration: this.styles.searchHighlight.animationDuration, // Use animation duration from styles
            onFinish: () => {
                if (this.eventBus) {
                    this.eventBus.emit('zoom:changed', scale);
                }
            }
        });


        // 2. Highlight the element
        if (navigationData.highlight) {
            this.searchHighlightShape = new Konva.Rect({
                x: finalBounds.x,
                y: finalBounds.y,
                width: finalBounds.width,
                height: finalBounds.height,
                stroke: this.styles.searchHighlight.stroke,
                strokeWidth: this.styles.searchHighlight.strokeWidth,
                dash: this.styles.searchHighlight.dash,
                opacity: this.styles.searchHighlight.opacity,
                cornerRadius: this.styles.searchHighlight.cornerRadius,
                listening: false, // Don't let it interfere with mouse events
            });
            this.uiLayer.add(this.searchHighlightShape);
            this.uiLayer.batchDraw(); // Use batchDraw for efficiency
        }
        // Also select the table in the properties panel if it's a table or column
        if (targetItem.type === 'table' && this.eventBus) {
            this.eventBus.emit('table:selected', targetItem.data);
        } else if (targetItem.type === 'column' && this.eventBus) {
            this.eventBus.emit('column:selected', { table: targetItem.data.table, column: targetItem.data.column });
        } else if (targetItem.type === 'relationship' && this.eventBus) {
            this.eventBus.emit('relationship:selected', targetItem.data);
        }
    }

    /**
     * Clears any visual highlight applied for search results.
     */
    clearSearchHighlight() {
        if (this.searchHighlightShape) {
            this.searchHighlightShape.destroy();
            this.searchHighlightShape = null;
            this.uiLayer.batchDraw();
        }
    }
}

class AStarRouter {
    constructor(grid) {
        this.grid = grid;
        this.width = grid.length;
        this.height = grid[0].length;
    }

    findPath(start, end) {
        const openSet = new Set([`${start.x},${start.y}`]);
        const cameFrom = new Map();

        const gScore = {}; // Cost from start to current
        for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) gScore[`${x},${y}`] = Infinity;
        gScore[`${start.x},${start.y}`] = 0;

        const fScore = {}; // Total cost (gScore + heuristic)
        for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) fScore[`${x},${y}`] = Infinity;
        fScore[`${start.x},${start.y}`] = this.heuristic(start, end);

        while (openSet.size > 0) {
            let currentKey = null;
            let minFScore = Infinity;
            for (const key of openSet) {
                if (fScore[key] < minFScore) {
                    minFScore = fScore[key];
                    currentKey = key;
                }
            }

            const current = this.keyToPoint(currentKey);

            if (current.x === end.x && current.y === end.y) {
                return this.reconstructPath(cameFrom, currentKey);
            }

            openSet.delete(currentKey);

            this.getNeighbors(current).forEach(neighbor => {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                // Penalize turns to get straighter lines
                const movementCost = 1 + this.grid[neighbor.x][neighbor.y]; // Base cost of 1 + penalty
                const turnPenalty = this.isTurn(cameFrom, currentKey, neighbor) ? 25 : 0;
                const tentativeGScore = gScore[currentKey] + 1 + turnPenalty;

                if (tentativeGScore < gScore[neighborKey]) {
                    cameFrom.set(neighborKey, currentKey);
                    gScore[neighborKey] = tentativeGScore;
                    fScore[neighborKey] = tentativeGScore + this.heuristic(neighbor, end);
                    if (!openSet.has(neighborKey)) {
                        openSet.add(neighborKey);
                    }
                }
            });
        }
        return null; // No path found
    }

    isTurn(cameFrom, currentKey, neighbor) {
        if (!cameFrom.has(currentKey)) return false;
        const parentKey = cameFrom.get(currentKey);
        const parent = this.keyToPoint(parentKey);
        const current = this.keyToPoint(currentKey);
        return (current.x - parent.x) !== (neighbor.x - current.x) || (current.y - parent.y) !== (neighbor.y - current.y);
    }

    heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // Manhattan distance
    }

    keyToPoint(key) {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
    }

    getNeighbors(point) {
        const neighbors = [];
        const { x, y } = point;
        // The check changes from `=== 0` to `!== 1` to allow costly cells
        if (x > 0 && this.grid[x - 1][y] !== 1) neighbors.push({ x: x - 1, y });
        if (x < this.width - 1 && this.grid[x + 1][y] !== 1) neighbors.push({ x: x + 1, y });
        if (y > 0 && this.grid[x][y - 1] !== 1) neighbors.push({ x, y: y - 1 });
        if (y < this.height - 1 && this.grid[x][y + 1] !== 1) neighbors.push({ x, y: y + 1 });
        return neighbors;
    }

    reconstructPath(cameFrom, currentKey) {
        const totalPath = [this.keyToPoint(currentKey)];
        while (cameFrom.has(currentKey)) {
            currentKey = cameFrom.get(currentKey);
            totalPath.unshift(this.keyToPoint(currentKey));
        }
        return totalPath;
    }
}