/**
 * ERD renderer using D3.js and SVG
 */
export class ERDRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.eventBus = options.eventBus;
        this.d3 = null; // Will be initialized async
        this.options = {
            width: options.width || 1200,
            height: options.height || 800,
            minZoom: 0.1,
            maxZoom: 5,
            ...options
        };

        this.svg = null;
        this.mainGroup = null;
        this.tablesGroup = null;
        this.connectionsGroup = null;
        
        this.zoomBehavior = null;
        this.dragBehavior = null;
        
        this.currentSchema = null;
        this.currentLayout = null;
        
        this.selectedTable = null;
        this.hoveredTable = null;
        this.initialized = false;
    }

    /**
     * Async initialization to load D3.js
     */
    async init() {
        if (this.initialized) return;
        
        try {
            // Try to import D3.js from CDN for production compatibility
            this.d3 = await import('https://cdn.skypack.dev/d3@7');
        } catch (error) {
            console.warn('Failed to load D3.js from CDN, trying local import:', error);
            try {
                // Fallback to local import
                this.d3 = await import('d3');
            } catch (localError) {
                console.error('Failed to load D3.js:', localError);
                throw new Error('D3.js could not be loaded');
            }
        }
        
        this.initialize();
        this.initialized = true;
    }

    /**
     * Initialize the SVG and groups
     */
    initialize() {
        const d3 = this.d3;
        // Clear existing content
        d3.select(this.container).selectAll('*').remove();

        // Create main SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.options.width} ${this.options.height}`)
            .style('background-color', 'var(--bg-secondary)');

        // Create main group for zoom/pan
        this.mainGroup = this.svg.append('g')
            .attr('class', 'main-group');

        // Create groups for different elements (order matters for z-index)
        this.connectionsGroup = this.mainGroup.append('g')
            .attr('class', 'connections-group');

        this.tablesGroup = this.mainGroup.append('g')
            .attr('class', 'tables-group');

        // Setup zoom and pan
        this.setupZoomAndPan();

        // Setup drag behavior
        this.setupDragBehavior();
    }

    /**
     * Setup zoom and pan behavior
     */
    setupZoomAndPan() {
        const d3 = this.d3;
        this.zoomBehavior = d3.zoom()
            .scaleExtent([this.options.minZoom, this.options.maxZoom])
            .on('zoom', (event) => {
                this.mainGroup.attr('transform', event.transform);
                
                if (this.eventBus) {
                    this.eventBus.emit('zoom:changed', event.transform.k);
                }
            });

        this.svg.call(this.zoomBehavior);
    }

    /**
     * Setup drag behavior for tables
     */
    setupDragBehavior() {
        const d3 = this.d3;
        this.dragBehavior = d3.drag()
            .on('start', (event, d) => {
                this.onDragStart(event, d);
            })
            .on('drag', (event, d) => {
                this.onDrag(event, d);
            })
            .on('end', (event, d) => {
                this.onDragEnd(event, d);
            });
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
        this.tablesGroup.selectAll('*').remove();
        this.connectionsGroup.selectAll('*').remove();

        if (!schema || !schema.tables || schema.tables.length === 0) {
            return;
        }

        // Render tables
        this.renderTables(schema.tables, layout);

        // Render connections
        this.renderConnections(schema.relationships || [], layout);

        // Fit to view
        this.fitToView();
    }

    /**
     * Render tables
     * @param {Array} tables - Table data
     * @param {Object} layout - Layout data
     */
    renderTables(tables, layout) {
        const d3 = this.d3;
        const tableGroups = this.tablesGroup
            .selectAll('.table-group')
            .data(tables, d => d.name)
            .enter()
            .append('g')
            .attr('class', 'table-group erd-table')
            .attr('transform', d => {
                const pos = this.getTablePosition(d.name, layout);
                return `translate(${pos.x}, ${pos.y})`;
            })
            .call(this.dragBehavior)
            .on('click', (event, d) => {
                this.onTableClick(event, d);
            })
            .on('mouseenter', (event, d) => {
                this.onTableMouseEnter(event, d);
            })
            .on('mouseleave', (event, d) => {
                this.onTableMouseLeave(event, d);
            });

        // Render each table
        tableGroups.each((tableData, index, nodes) => {
            this.renderTable(d3.select(nodes[index]), tableData, layout);
        });
    }

    /**
     * Render individual table
     * @param {Object} tableGroup - D3 selection of table group
     * @param {Object} tableData - Table data
     * @param {Object} layout - Layout data
     */
    renderTable(tableGroup, tableData, layout) {
        const tableSize = this.getTableSize(tableData.name, layout);
        const headerHeight = 30;
        const rowHeight = 25;

        // Table background
        tableGroup.append('rect')
            .attr('class', 'table-body')
            .attr('width', tableSize.width)
            .attr('height', tableSize.height)
            .attr('rx', 4)
            .attr('ry', 4);

        // Table header
        tableGroup.append('rect')
            .attr('class', 'table-header')
            .attr('width', tableSize.width)
            .attr('height', headerHeight)
            .attr('rx', 4)
            .attr('ry', 4);

        // Header bottom border (to make it look like separate sections)
        tableGroup.append('rect')
            .attr('class', 'table-header')
            .attr('width', tableSize.width)
            .attr('height', headerHeight)
            .attr('rx', 0)
            .attr('ry', 0)
            .attr('y', 4);

        // Table name
        tableGroup.append('text')
            .attr('class', 'table-header-text')
            .attr('x', tableSize.width / 2)
            .attr('y', headerHeight / 2)
            .text(tableData.displayName || tableData.name);

        // Columns
        const columnsGroup = tableGroup.append('g')
            .attr('class', 'columns-group')
            .attr('transform', `translate(0, ${headerHeight})`);

        tableData.columns.forEach((column, index) => {
            this.renderColumn(columnsGroup, column, index, tableSize.width, rowHeight);
        });
    }

    /**
     * Render individual column
     * @param {Object} columnsGroup - D3 selection of columns group
     * @param {Object} columnData - Column data
     * @param {number} index - Column index
     * @param {number} tableWidth - Table width
     * @param {number} rowHeight - Row height
     */
    renderColumn(columnsGroup, columnData, index, tableWidth, rowHeight) {
        const d3 = this.d3;
        const columnGroup = columnsGroup.append('g')
            .attr('class', 'column-group')
            .attr('transform', `translate(0, ${index * rowHeight})`);

        // Column background (for hover effects)
        columnGroup.append('rect')
            .attr('class', 'table-row')
            .attr('width', tableWidth)
            .attr('height', rowHeight)
            .on('mouseenter', (event) => {
                d3.select(event.target).classed('hover', true);
            })
            .on('mouseleave', (event) => {
                d3.select(event.target).classed('hover', false);
            });

        // Key indicator
        if (columnData.isPrimaryKey || this.isPrimaryKey(columnData)) {
            columnGroup.append('text')
                .attr('class', 'key-indicator')
                .attr('x', 6)
                .attr('y', rowHeight / 2)
                .attr('text-anchor', 'start')
                .attr('dominant-baseline', 'central')
                .text('🔑')
                .style('font-size', '12px');
        } else if (columnData.isForeignKey || this.isForeignKey(columnData)) {
            columnGroup.append('text')
                .attr('class', 'key-indicator')
                .attr('x', 6)
                .attr('y', rowHeight / 2)
                .attr('text-anchor', 'start')
                .attr('dominant-baseline', 'central')
                .text('🔗')
                .style('font-size', '12px');
        }

        // Column name
        const nameX = (columnData.isPrimaryKey || columnData.isForeignKey || 
                      this.isPrimaryKey(columnData) || this.isForeignKey(columnData)) ? 24 : 8;
        
        columnGroup.append('text')
            .attr('class', `column-name ${this.getColumnClass(columnData)}`)
            .attr('x', nameX)
            .attr('y', rowHeight / 2)
            .text(columnData.name);

        // Column type
        columnGroup.append('text')
            .attr('class', 'column-type')
            .attr('x', tableWidth - 8)
            .attr('y', rowHeight / 2)
            .text(this.formatColumnType(columnData.type));
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
     * Get CSS class for column based on its properties
     * @param {Object} column - Column data
     * @returns {string} CSS class
     */
    getColumnClass(column) {
        if (this.isPrimaryKey(column)) {
            return 'primary-key';
        } else if (this.isForeignKey(column)) {
            return 'foreign-key';
        }
        return '';
    }

    /**
     * Format column type for display
     * @param {string} type - Column type
     * @returns {string} Formatted type
     */
    formatColumnType(type) {
        // Truncate long types
        return type.length > 15 ? type.substring(0, 12) + '...' : type;
    }

    /**
     * Render connections between tables
     * @param {Array} relationships - Relationship data
     * @param {Object} layout - Layout data
     */
    renderConnections(relationships, layout) {
        const d3 = this.d3;
        if (!relationships || relationships.length === 0) {
            return;
        }

        const connections = this.connectionsGroup
            .selectAll('.connection')
            .data(relationships, d => `${d.sourceTable}-${d.targetTable}-${d.sourceColumn}-${d.targetColumn}`)
            .enter()
            .append('g')
            .attr('class', 'connection');

        connections.each((relationshipData, index, nodes) => {
            this.renderConnection(d3.select(nodes[index]), relationshipData, layout);
        });
    }

    /**
     * Render individual connection
     * @param {Object} connectionGroup - D3 selection of connection group
     * @param {Object} relationshipData - Relationship data
     * @param {Object} layout - Layout data
     */
    renderConnection(connectionGroup, relationshipData, layout) {
        const sourcePos = this.getTablePosition(relationshipData.sourceTable, layout);
        const targetPos = this.getTablePosition(relationshipData.targetTable, layout);
        const sourceSize = this.getTableSize(relationshipData.sourceTable, layout);
        const targetSize = this.getTableSize(relationshipData.targetTable, layout);

        // Calculate connection points
        const sourcePoint = this.calculateConnectionPoint(
            sourcePos, sourceSize, targetPos, relationshipData.sourceColumn
        );
        const targetPoint = this.calculateConnectionPoint(
            targetPos, targetSize, sourcePos, relationshipData.targetColumn
        );

        // Generate path
        const path = this.generateConnectionPath(sourcePoint, targetPoint);

        // Draw connection line
        connectionGroup.append('path')
            .attr('class', 'connection-line')
            .attr('d', path)
            .on('mouseenter', (event) => {
                this.onConnectionMouseEnter(event, relationshipData);
            })
            .on('mouseleave', (event) => {
                this.onConnectionMouseLeave(event, relationshipData);
            });

        // Add relationship markers
        this.addRelationshipMarkers(connectionGroup, sourcePoint, targetPoint, relationshipData.type);
    }

    /**
     * Calculate connection point on table edge
     * @param {Object} tablePos - Table position
     * @param {Object} tableSize - Table size
     * @param {Object} targetPos - Target table position
     * @param {string} columnName - Column name for connection
     * @returns {Object} Connection point
     */
    calculateConnectionPoint(tablePos, tableSize, targetPos, columnName) {
        const headerHeight = 40;
        const rowHeight = 24;
        
        // Find the column position within the table
        const table = this.currentSchema.tables.find(t =>
            this.currentLayout.tables.find(lt => lt.name === t.name &&
                (lt.x === tablePos.x && lt.y === tablePos.y))
        );
        
        let columnY = tablePos.y + headerHeight;
        if (table && columnName) {
            const columnIndex = table.columns.findIndex(col => col.name === columnName);
            if (columnIndex >= 0) {
                columnY = tablePos.y + headerHeight + (columnIndex * rowHeight) + (rowHeight / 2);
            }
        }

        const tableCenterX = tablePos.x + tableSize.width / 2;
        const targetCenterX = targetPos.x + (targetPos.width || tableSize.width) / 2;
        const targetCenterY = targetPos.y + (targetPos.height || tableSize.height) / 2;

        // Determine which side of the table to connect to
        const dx = targetCenterX - tableCenterX;
        const dy = targetCenterY - columnY;

        let connectionX, connectionY;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Connect to left or right side at column level
            if (dx > 0) {
                // Connect to right side
                connectionX = tablePos.x + tableSize.width;
                connectionY = columnY;
            } else {
                // Connect to left side
                connectionX = tablePos.x;
                connectionY = columnY;
            }
        } else {
            // Connect to top or bottom side
            if (dy > 0) {
                // Connect to bottom side
                connectionX = tableCenterX;
                connectionY = tablePos.y + tableSize.height;
            } else {
                // Connect to top side
                connectionX = tableCenterX;
                connectionY = tablePos.y;
            }
        }

        return { x: connectionX, y: connectionY };
    }

    /**
     * Generate SVG path for connection
     * @param {Object} sourcePoint - Source connection point
     * @param {Object} targetPoint - Target connection point
     * @returns {string} SVG path string
     */
    generateConnectionPath(sourcePoint, targetPoint) {
        // Use orthogonal (right-angle) connections
        const midX = (sourcePoint.x + targetPoint.x) / 2;
        
        return `M ${sourcePoint.x} ${sourcePoint.y} 
                L ${midX} ${sourcePoint.y} 
                L ${midX} ${targetPoint.y} 
                L ${targetPoint.x} ${targetPoint.y}`;
    }

    /**
     * Add relationship markers (arrows, etc.)
     * @param {Object} connectionGroup - Connection group
     * @param {Object} sourcePoint - Source point
     * @param {Object} targetPoint - Target point
     * @param {string} relationshipType - Type of relationship
     */
    addRelationshipMarkers(connectionGroup, sourcePoint, targetPoint, relationshipType) {
        // Add arrow marker at target point
        const arrowSize = 6;
        const angle = Math.atan2(targetPoint.y - sourcePoint.y, targetPoint.x - sourcePoint.x);
        
        connectionGroup.append('polygon')
            .attr('class', 'connection-marker')
            .attr('points', `0,0 ${-arrowSize},${arrowSize/2} ${-arrowSize},${-arrowSize/2}`)
            .attr('transform', `translate(${targetPoint.x}, ${targetPoint.y}) rotate(${angle * 180 / Math.PI})`);

        // Add relationship type indicator
        if (relationshipType && relationshipType !== 'one-to-many') {
            const midX = (sourcePoint.x + targetPoint.x) / 2;
            const midY = (sourcePoint.y + targetPoint.y) / 2;
            
            connectionGroup.append('text')
                .attr('class', 'relationship-label')
                .attr('x', midX)
                .attr('y', midY - 5)
                .text(this.formatRelationshipType(relationshipType));
        }
    }

    /**
     * Format relationship type for display
     * @param {string} type - Relationship type
     * @returns {string} Formatted type
     */
    formatRelationshipType(type) {
        const typeMap = {
            'one-to-one': '1:1',
            'one-to-many': '1:N',
            'many-to-many': 'N:M'
        };
        return typeMap[type] || type;
    }

    /**
     * Get table position from layout
     * @param {string} tableName - Table name
     * @param {Object} layout - Layout data
     * @returns {Object} Position object
     */
    getTablePosition(tableName, layout) {
        const tableLayout = layout.tables?.find(t => t.name === tableName);
        return tableLayout ? { x: tableLayout.x, y: tableLayout.y } : { x: 0, y: 0 };
    }

    /**
     * Get table size from layout
     * @param {string} tableName - Table name
     * @param {Object} layout - Layout data
     * @returns {Object} Size object
     */
    getTableSize(tableName, layout) {
        const tableLayout = layout.tables?.find(t => t.name === tableName);
        return tableLayout ? 
            { width: tableLayout.width, height: tableLayout.height } : 
            { width: 200, height: 100 };
    }

    /**
     * Handle drag start
     * @param {Object} event - Drag event
     * @param {Object} data - Table data
     */
    onDragStart(event, data) {
        const d3 = this.d3;
        d3.select(event.sourceEvent.target.parentNode).classed('dragging', true);
        
        if (this.eventBus) {
            this.eventBus.emit('table:drag-start', data);
        }
    }

    /**
     * Handle drag
     * @param {Object} event - Drag event
     * @param {Object} data - Table data
     */
    onDrag(event, data) {
        const d3 = this.d3;
        const transform = d3.select(event.sourceEvent.target.parentNode)
            .attr('transform', `translate(${event.x}, ${event.y})`);
        
        // Update connections in real-time
        this.updateConnectionsForTable(data.name, event.x, event.y);
        
        if (this.eventBus) {
            this.eventBus.emit('table:drag', { table: data, x: event.x, y: event.y });
        }
    }

    /**
     * Handle drag end
     * @param {Object} event - Drag event
     * @param {Object} data - Table data
     */
    onDragEnd(event, data) {
        const d3 = this.d3;
        d3.select(event.sourceEvent.target.parentNode).classed('dragging', false);
        
        if (this.eventBus) {
            this.eventBus.emit('table:drag-end', { table: data, x: event.x, y: event.y });
        }
    }

    /**
     * Update connections for a moved table
     * @param {string} tableName - Table name
     * @param {number} newX - New X position
     * @param {number} newY - New Y position
     */
    updateConnectionsForTable(tableName, newX, newY) {
        // Update layout data
        if (this.currentLayout && this.currentLayout.tables) {
            const tableLayout = this.currentLayout.tables.find(t => t.name === tableName);
            if (tableLayout) {
                tableLayout.x = newX;
                tableLayout.y = newY;
            }
        }

        // Re-render connections
        this.connectionsGroup.selectAll('*').remove();
        this.renderConnections(this.currentSchema?.relationships || [], this.currentLayout);
    }

    /**
     * Handle table click
     * @param {Object} event - Click event
     * @param {Object} data - Table data
     */
    onTableClick(event, data) {
        // Clear previous selection
        this.tablesGroup.selectAll('.erd-table').classed('selected', false);
        
        // Select clicked table
        const d3 = this.d3;
        d3.select(event.currentTarget).classed('selected', true);
        this.selectedTable = data;
        
        if (this.eventBus) {
            this.eventBus.emit('table:selected', data);
        }
    }

    /**
     * Handle table mouse enter
     * @param {Object} event - Mouse event
     * @param {Object} data - Table data
     */
    onTableMouseEnter(event, data) {
        const d3 = this.d3;
        d3.select(event.currentTarget).classed('hover', true);
        this.hoveredTable = data;
        
        // Highlight related connections
        this.highlightRelatedConnections(data.name);
        
        if (this.eventBus) {
            this.eventBus.emit('table:hover', data);
        }
    }

    /**
     * Handle table mouse leave
     * @param {Object} event - Mouse event
     * @param {Object} data - Table data
     */
    onTableMouseLeave(event, data) {
        const d3 = this.d3;
        d3.select(event.currentTarget).classed('hover', false);
        this.hoveredTable = null;
        
        // Remove connection highlights
        this.connectionsGroup.selectAll('.connection-line').classed('highlighted', false);
        
        if (this.eventBus) {
            this.eventBus.emit('table:hover-end', data);
        }
    }

    /**
     * Handle connection mouse enter
     * @param {Object} event - Mouse event
     * @param {Object} data - Relationship data
     */
    onConnectionMouseEnter(event, data) {
        const d3 = this.d3;
        d3.select(event.currentTarget).classed('highlighted', true);
        
        // Show tooltip
        this.showTooltip(event, data);
        
        if (this.eventBus) {
            this.eventBus.emit('connection:hover', data);
        }
    }

    /**
     * Handle connection mouse leave
     * @param {Object} event - Mouse event
     * @param {Object} data - Relationship data
     */
    onConnectionMouseLeave(event, data) {
        const d3 = this.d3;
        d3.select(event.currentTarget).classed('highlighted', false);
        
        // Hide tooltip
        this.hideTooltip();
        
        if (this.eventBus) {
            this.eventBus.emit('connection:hover-end', data);
        }
    }

    /**
     * Highlight connections related to a table
     * @param {string} tableName - Table name
     */
    highlightRelatedConnections(tableName) {
        this.connectionsGroup.selectAll('.connection-line')
            .classed('highlighted', function(d) {
                return d.sourceTable === tableName || d.targetTable === tableName;
            });
    }

    /**
     * Show tooltip
     * @param {Object} event - Mouse event
     * @param {Object} data - Data to show
     */
    showTooltip(event, data) {
        const d3 = this.d3;
        const tooltip = d3.select('#tooltip');
        if (tooltip.empty()) return;

        const content = `
            <strong>${data.sourceTable}.${data.sourceColumn}</strong><br>
            → <strong>${data.targetTable}.${data.targetColumn}</strong><br>
            <em>${this.formatRelationshipType(data.type)}</em>
        `;

        tooltip.select('.tooltip-content').html(content);
        tooltip.style('display', 'block')
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        const d3 = this.d3;
        const tooltip = d3.select('#tooltip');
        if (!tooltip.empty()) {
            tooltip.style('display', 'none');
        }
    }

    /**
     * Fit view to show all tables
     */
    fitToView() {
        const d3 = this.d3;
        if (!this.currentLayout || !this.currentLayout.tables || this.currentLayout.tables.length === 0) {
            return;
        }

        const tables = this.currentLayout.tables;
        
        // Calculate bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        tables.forEach(table => {
            minX = Math.min(minX, table.x);
            minY = Math.min(minY, table.y);
            maxX = Math.max(maxX, table.x + table.width);
            maxY = Math.max(maxY, table.y + table.height);
        });

        const width = maxX - minX;
        const height = maxY - minY;
        const padding = 50;

        // Calculate scale and translation
        const scale = Math.min(
            (this.options.width - padding * 2) / width,
            (this.options.height - padding * 2) / height,
            1 // Don't zoom in beyond 100%
        );

        const translateX = (this.options.width - width * scale) / 2 - minX * scale;
        const translateY = (this.options.height - height * scale) / 2 - minY * scale;

        // Apply transform
        this.svg.transition()
            .duration(750)
            .call(
                this.zoomBehavior.transform,
                d3.zoomIdentity.translate(translateX, translateY).scale(scale)
            );
    }

    /**
     * Reset zoom to fit all content
     */
    resetZoom() {
        this.fitToView();
    }

    /**
     * Update layout without full re-render
     * @param {Object} layout - New layout data
     */
    updateLayout(layout) {
        this.currentLayout = layout;

        // Update table positions
        this.tablesGroup.selectAll('.table-group')
            .transition()
            .duration(300)
            .attr('transform', d => {
                const pos = this.getTablePosition(d.name, layout);
                return `translate(${pos.x}, ${pos.y})`;
            });

        // Update connections
        setTimeout(() => {
            this.connectionsGroup.selectAll('*').remove();
            this.renderConnections(this.currentSchema?.relationships || [], layout);
        }, 300);
    }

    /**
     * Get SVG element for export
     * @returns {SVGElement} SVG element
     */
    getSVGElement() {
        return this.svg.node();
    }

    /**
     * Get current zoom level
     * @returns {number} Zoom level
     */
    getZoomLevel() {
        const d3 = this.d3;
        const transform = d3.zoomTransform(this.svg.node());
        return transform.k;
    }

    /**
     * Set zoom level
     * @param {number} level - Zoom level
     */
    setZoomLevel(level) {
        const d3 = this.d3;
        const transform = d3.zoomTransform(this.svg.node());
        this.svg.transition()
            .duration(300)
            .call(
                this.zoomBehavior.transform,
                d3.zoomIdentity.translate(transform.x, transform.y).scale(level)
            );
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.svg) {
            this.svg.remove();
        }
        
        this.svg = null;
        this.mainGroup = null;
        this.tablesGroup = null;
        this.connectionsGroup = null;
        this.currentSchema = null;
        this.currentLayout = null;
    }
}