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
        connectionGroup.relationshipData = {
            fromTable: fromTable.name,
            fromColumn: fromColumnName,
            toTable: toTable.name,
            toColumn: toColumnName,
            type: relationship.type
        };

        // Line
        const line = new Konva.Line({
            points: pathPoints,
            stroke: this.styles.connection.stroke,
            strokeWidth: this.styles.connection.strokeWidth,
            name: 'connection-line'
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
     * Generate orthogonal path points
     * @param {Object} sourcePoint - Source point
     * @param {Object} targetPoint - Target point
     * @returns {Array} Array of points [x1, y1, x2, y2, ...]
     */
    calculateOrthogonalPath(relationship, layout) {
        const fromTableName = relationship.from ? relationship.from.table : relationship.fromTable;
        const toTableName = relationship.to ? relationship.to.table : relationship.toTable;
        const fromColumnName = relationship.from ? relationship.from.column : relationship.fromColumn;
        const toColumnName = relationship.to ? relationship.to.column : relationship.toColumn;

        const fromTable = this.currentSchema.tables.find(t => t.name === fromTableName);
        const toTable = this.currentSchema.tables.find(t => t.name === toTableName);

        if (!fromTable || !toTable) {
            console.warn('Could not find tables for relationship:', relationship);
            return [];
        }


        const fromPos = this.getTablePosition(fromTable.name, layout);
        const fromSize = this.getTableSize(fromTable.name, layout);
        const toPos = this.getTablePosition(toTable.name, layout);
        const toSize = this.getTableSize(toTable.name, layout);

        // Determine connection sides
        const fromRight = fromPos.x + fromSize.width;
        const toRight = toPos.x + toSize.width;

        let fromSide, toSide;
        if (fromRight < toPos.x) {
            // fromTable is to the left of toTable
            fromSide = 'right';
            toSide = 'left';
        } else if (toRight < fromPos.x) {
            // toTable is to the left of fromTable
            fromSide = 'left';
            toSide = 'right';
        } else {
            // Tables are vertically aligned or overlapping
            if (fromPos.x < toPos.x) {
                fromSide = 'right';
                toSide = 'left';
            } else {
                fromSide = 'left';
                toSide = 'right';
            }
        }

        const sourcePoint = this.getColumnConnectionPoint(fromPos, fromSize, fromColumnName, fromTable, fromSide);
        const targetPoint = this.getColumnConnectionPoint(toPos, toSize, toColumnName, toTable, toSide);

        const points = [];
        points.push(sourcePoint.x, sourcePoint.y);

        const midX = sourcePoint.x + (targetPoint.x - sourcePoint.x) / 2;

        points.push(midX, sourcePoint.y);
        points.push(midX, targetPoint.y);

        points.push(targetPoint.x, targetPoint.y);

        return points;
    }


    /**
     * Add relationship markers (e.g., arrows)
     * @param {Konva.Group} connectionGroup - Connection group
     * @param {Object} connectionPoints - Source and target points
     * @param {Object} relationship - Relationship data
     */
    addRelationshipMarkers(connectionGroup, connectionPoints, relationship) {
        const dx = connectionPoints.target.x - connectionPoints.source.x;
        const dy = connectionPoints.target.y - connectionPoints.source.y;
        const angle = Math.atan2(dy, dx);

        const arrowLength = 10;
        const arrowAngle = Math.PI / 6;

        const arrowPoints = [
            0, 0,
            -arrowLength, -arrowAngle,
            -arrowLength, arrowAngle
        ];

        const arrow = new Konva.Line({
            points: arrowPoints,
            stroke: this.styles.connection.stroke,
            strokeWidth: this.styles.connection.strokeWidth,
            closed: true,
            fill: this.styles.connection.stroke,
            name: 'arrow-marker'
        });

        arrow.position({ x: connectionPoints.target.x, y: connectionPoints.target.y });
        arrow.rotation(angle * 180 / Math.PI);

        connectionGroup.add(arrow);
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
        const pathPoints = this.calculateOrthogonalPath(relationship, this.currentLayout);
        const line = connectionGroup.findOne('.connection-line');
        if (line) {
            line.points(pathPoints);
        }

        // Update markers
        connectionGroup.find('Line').forEach(marker => {
            if (marker.name() !== 'connection-line') {
                marker.destroy();
            }
        });
        this.addRelationshipMarkers(connectionGroup, { source: { x: pathPoints[0], y: pathPoints[1] }, target: { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] } }, relationship);

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
        this.tableGroups.forEach((group, name) => {
            const pos = this.getTablePosition(name, layout);
            group.position(pos);
        });
        this.connectionLines.forEach((group, key) => {
            this.updateConnectionLine(group, group.relationshipData);
        });
        this.tablesLayer.draw();
        this.connectionsLayer.draw();
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