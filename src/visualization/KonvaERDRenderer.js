import Konva from 'konva';

// A* Pathfinding Helper Class
class AStarRouter {
    constructor(grid) {
        this.grid = grid;
        this.width = grid.length;
        this.height = grid[0].length;
    }
    findPath(start, end) {
        const openSet = new PriorityQueue((a, b) => fScore[a.key] < fScore[b.key]);
        openSet.push({ key: `${start.x},${start.y}`, point: start });
        const cameFrom = new Map();
        const gScore = {};
        const fScore = {};
        for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) {
            gScore[`${x},${y}`] = Infinity;
            fScore[`${x},${y}`] = Infinity;
        }
        gScore[`${start.x},${start.y}`] = 0;
        fScore[`${start.x},${start.y}`] = this.heuristic(start, end);

        while (!openSet.isEmpty()) {
            const { key: currentKey, point: current } = openSet.pop();
            if (current.x === end.x && current.y === end.y) return this.reconstructPath(cameFrom, currentKey);
            this.getNeighbors(current).forEach(neighbor => {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                const movementCost = 1 + (this.grid[neighbor.x][neighbor.y] || 0) * 50; // Higher penalty
                const turnPenalty = this.isTurn(cameFrom, currentKey, neighbor) ? 10 : 0;
                const tentativeGScore = gScore[currentKey] + movementCost + turnPenalty;
                if (tentativeGScore < gScore[neighborKey]) {
                    cameFrom.set(neighborKey, currentKey);
                    gScore[neighborKey] = tentativeGScore;
                    fScore[neighborKey] = tentativeGScore + this.heuristic(neighbor, end);
                    openSet.push({ key: neighborKey, point: neighbor });
                }
            });
        }
        return null;
    }
    isTurn(cameFrom, currentKey, neighbor) {
        if (!cameFrom.has(currentKey)) return false;
        const parent = this.keyToPoint(cameFrom.get(currentKey));
        const current = this.keyToPoint(currentKey);
        return (current.x - parent.x) !== (neighbor.x - current.x) || (current.y - parent.y) !== (neighbor.y - current.y);
    }
    heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    keyToPoint = (key) => { const [x, y] = key.split(',').map(Number); return { x, y }; };
    getNeighbors(point) {
        const neighbors = [];
        const { x, y } = point;
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        directions.forEach(([dx, dy]) => {
            const newX = x + dx;
            const newY = y + dy;
            if (newX >= 0 && newX < this.width && newY >= 0 && newY < this.height && this.grid[newX][newY] !== 1) {
                neighbors.push({ x: newX, y: newY });
            }
        });
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

class PriorityQueue {
    constructor(comparator) {
        this.items = [];
        this.comparator = comparator;
    }
    push(item) {
        this.items.push(item);
        this.items.sort(this.comparator);
    }
    pop() {
        return this.items.shift();
    }
    isEmpty() {
        return this.items.length === 0;
    }
}

export class KonvaERDRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.eventBus = options.eventBus;
        this.options = {
            width: options.width || 1200,
            height: options.height || 800,
            minZoom: 0.1,
            maxZoom: 5,
            ...options
        };
        this.stage = null;
        this.mainLayer = null;
        this.connectionsLayer = null;
        this.tablesLayer = null;
        this.uiLayer = null;
        this.currentSchema = null;
        this.currentLayout = null;
        this.selectedTable = null;
        this.selectedConnection = null;
        this.searchHighlightShape = null;
        this.tableGroups = new Map();
        this.connectionLines = new Map();
        this.drawnPaths = new Set();
        this.styles = {
            table: { background: '#ffffff', border: '#e2e8f0', borderWidth: 1, cornerRadius: 4, headerBackground: '#f1f5f9', headerHeight: 30, rowHeight: 25, padding: 8, isolateButton: { size: 18, padding: 5, fill: '#f0f0f0', stroke: '#cccccc', strokeWidth: 1, iconFill: '#555555', hoverFill: '#e0e0e0' } },
            text: { fontFamily: 'Arial, sans-serif', fontSize: 12, fill: '#1e293b', headerFill: '#374151', typeFill: '#64748b' },
            connection: { stroke: '#94a3b8', strokeWidth: 2, selectedStroke: '#2563eb', selectedStrokeWidth: 3 },
            selection: { stroke: '#2563eb', strokeWidth: 2, dash: [5, 5] },
            searchHighlight: { stroke: '#f59e0b', strokeWidth: 3, dash: [10, 5], opacity: 0.8, cornerRadius: 5, animationDuration: 0.3 },
            marginBorder: { stroke: 'red', strokeWidth: 20, opacity: 0.2 }
        };
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        try {
            this.initializeStage();
            this.setupLayers();
            this.setupEventHandlers();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize Konva ERD Renderer:', error);
            throw error;
        }
    }

    initializeStage() {
        if (this.container) this.container.innerHTML = '';
        this.stage = new Konva.Stage({ container: this.container, width: this.options.width, height: this.options.height });
        this.setupResponsiveStage();
    }

    setupResponsiveStage() {
        const resizeStage = () => {
            if (!this.container) return;
            const containerRect = this.container.getBoundingClientRect();
            this.stage.width(containerRect.width);
            this.stage.height(containerRect.height);
        };
        resizeStage();
        new ResizeObserver(resizeStage).observe(this.container);
    }

    setupLayers() {
        this.tablesLayer = new Konva.Layer({ name: 'tables' });
        this.connectionsLayer = new Konva.Layer({ name: 'connections' });
        this.uiLayer = new Konva.Layer({ name: 'ui' });
        this.stage.add(this.tablesLayer, this.connectionsLayer, this.uiLayer);
    }

    setupEventHandlers() {
        this.stage.draggable(true);
        this.stage.on('wheel', (e) => {
            e.evt.preventDefault();
            const oldScale = this.stage.scaleX();
            const pointer = this.stage.getPointerPosition();
            const mousePointTo = { x: (pointer.x - this.stage.x()) / oldScale, y: (pointer.y - this.stage.y()) / oldScale };
            const direction = e.evt.deltaY > 0 ? -1 : 1;
            const newScale = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, direction > 0 ? oldScale * 1.1 : oldScale / 1.1));
            this.stage.scale({ x: newScale, y: newScale });
            const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale };
            this.stage.position(newPos);
            if (this.eventBus) this.eventBus.emit('zoom:changed', newScale);
        });
        this.stage.on('click tap', (e) => { if (e.target === this.stage) this.deselectAll(); });
        this.connectionsLayer.on('click tap', (e) => {
            const connection = e.target.getParent();
            if (connection && connection.name() === 'connection') {
                this.deselectAll();
                this.selectConnection(connection);
                this.highlightRelatedTablesAndColumns(connection.relationshipData);
                this.connectionsLayer.draw();
                this.tablesLayer.draw();
            }
        });
    }

    selectConnection(connection) {
        this.selectedConnection = connection;
        const line = connection.findOne('.connection-line');
        if (line) {
            line.stroke(this.styles.connection.selectedStroke);
            line.strokeWidth(this.styles.connection.selectedStrokeWidth);
        }
    }

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
            this.selectedTable = null;
        }
        if (this.selectedConnection) {
            const line = this.selectedConnection.findOne('.connection-line');
            if (line) {
                line.stroke(this.styles.connection.stroke);
                line.strokeWidth(this.styles.connection.strokeWidth);
            }
            this.selectedConnection = null;
        }
        this.clearHighlights();
        this.tablesLayer.draw();
        this.connectionsLayer.draw();
    }

    highlightRelatedTablesAndColumns(relationship) {
        const fromTable = this.tableGroups.get(relationship.from.table);
        const toTable = this.tableGroups.get(relationship.to.table);
        if (fromTable) this.highlightTableAndColumn(fromTable, relationship.from.column);
        if (toTable) this.highlightTableAndColumn(toTable, relationship.to.column);
    }

    highlightTableAndColumn(tableGroup, columnName) {
        const background = tableGroup.findOne('.table-background');
        if (background) {
            background.stroke(this.styles.selection.stroke);
            background.strokeWidth(this.styles.selection.strokeWidth);
            background.dash(this.styles.selection.dash);
        }
        const columnIndex = (tableGroup.tableData.columns || []).findIndex(c => c.name === columnName);
        if (columnIndex !== -1) {
            const y = this.styles.table.headerHeight + (columnIndex * this.styles.table.rowHeight) + (this.styles.table.rowHeight / 2);
            const highlight = new Konva.Rect({
                x: 0,
                y: y - this.styles.table.rowHeight / 2,
                width: tableGroup.width(),
                height: this.styles.table.rowHeight,
                fill: 'rgba(37, 99, 235, 0.1)',
                name: 'highlight'
            });
            tableGroup.add(highlight);
        }
    }

    clearHighlights() {
        this.tablesLayer.find('.highlight').forEach(h => h.destroy());
    }

    render(schema, layout) {
        console.time('Render Total');
        this.currentSchema = schema;
        this.currentLayout = layout;
        this.connectionsLayer.destroyChildren();
        this.tablesLayer.destroyChildren();
        this.uiLayer.destroyChildren();
        this.tableGroups.clear();
        this.connectionLines.clear();
        if (!schema || !schema.tables || schema.tables.length === 0) {
            console.timeEnd('Render Total');
            return;
        }
        console.time('Render Tables');
        this.renderTables(schema.tables, layout);
        console.timeEnd('Render Tables');
        console.time('Redraw Connections');
        this.redrawAllConnections();
        console.timeEnd('Redraw Connections');
        console.time('Fit to View');
        this.fitToView();
        console.timeEnd('Fit to View');
        console.timeEnd('Render Total');
    }

    renderTables(tables, layout) {
        tables.forEach(tableData => {
            const tableGroup = this.createTableGroup(tableData, layout.tables.find(t => t.name === tableData.name));
            this.tablesLayer.add(tableGroup);
            this.tableGroups.set(tableData.name, tableGroup);
        });
        this.tablesLayer.draw();
    }

    createTableGroup(tableData, layoutData) {
        const tableGroup = new Konva.Group({ x: layoutData.x, y: layoutData.y, draggable: true, name: 'table-group' });
        tableGroup.tableData = tableData;
        const size = { width: layoutData.width, height: layoutData.height };
        const background = new Konva.Rect({ width: size.width, height: size.height, fill: this.styles.table.background, stroke: this.styles.table.border, strokeWidth: this.styles.table.borderWidth, cornerRadius: this.styles.table.cornerRadius, name: 'table-background' });
        const header = new Konva.Rect({ width: size.width, height: this.styles.table.headerHeight, fill: this.styles.table.headerBackground, cornerRadius: [this.styles.table.cornerRadius, this.styles.table.cornerRadius, 0, 0] });
        const title = new Konva.Text({ x: this.styles.table.padding, y: 0, text: tableData.displayName || tableData.name, fontSize: this.styles.text.fontSize + 2, fontFamily: this.styles.text.fontFamily, fill: this.styles.text.headerFill, fontStyle: 'bold' });
        title.y((this.styles.table.headerHeight - title.height()) / 2);
        const marginBorder = new Konva.Rect({ width: size.width + this.styles.marginBorder.strokeWidth * 2, height: size.height + this.styles.marginBorder.strokeWidth * 2, x: -this.styles.marginBorder.strokeWidth, y: -this.styles.marginBorder.strokeWidth, stroke: this.styles.marginBorder.stroke, strokeWidth: this.styles.marginBorder.strokeWidth, opacity: this.styles.marginBorder.opacity });
        tableGroup.add(marginBorder, background, header, title);
        this.addColumnsToTable(tableGroup, tableData, size);
        this.setupTableInteractions(tableGroup, tableData);
        return tableGroup;
    }

    addColumnsToTable(tableGroup, tableData, size) {
        (tableData.columns || []).forEach((column, index) => {
            const y = this.styles.table.headerHeight + (index * this.styles.table.rowHeight);
            let nameXOffset = this.styles.table.padding;
            if (column.isPrimaryKey || column.name.toLowerCase().includes('id')) {
                const keyIndicator = new Konva.Text({ x: 6, y: y + (this.styles.table.rowHeight / 2), text: '🔑', fontSize: 12, verticalAlign: 'middle' });
                keyIndicator.y(y + (this.styles.table.rowHeight - keyIndicator.height()) / 2);
                tableGroup.add(keyIndicator);
                nameXOffset = 24;
            }
            const colName = new Konva.Text({ x: nameXOffset, y: y + (this.styles.table.rowHeight / 2), text: column.name, fontSize: this.styles.text.fontSize, fontFamily: this.styles.text.fontFamily, fill: this.styles.text.fill, verticalAlign: 'middle' });
            const colType = new Konva.Text({ x: size.width - this.styles.table.padding, y: y + (this.styles.table.rowHeight / 2), text: (column.type || '').toUpperCase(), fontSize: this.styles.text.fontSize - 1, fontFamily: this.styles.text.fontFamily, fill: this.styles.text.typeFill, verticalAlign: 'middle', align: 'right' });
            colType.x(size.width - colType.width() - this.styles.table.padding);
            colName.y(y + (this.styles.table.rowHeight - colName.height()) / 2);
            colType.y(y + (this.styles.table.rowHeight - colType.height()) / 2);
            tableGroup.add(colName, colType);
        });
    }

    setupTableInteractions(tableGroup, tableData) {
        tableGroup.on('dragstart', () => { tableGroup.moveToTop(); this.tablesLayer.draw(); });
        tableGroup.on('dragmove', (e) => this.onDrag(e, tableData, tableGroup));
        tableGroup.on('dragend', (e) => this.onDragEnd(e, tableData, tableGroup));
    }

    onDrag(event, data, element) {
        const tableName = data.name;
        this.updateConnectionsForTable(tableName, element);
        this.tablesLayer.batchDraw();
        this.connectionsLayer.batchDraw();
    }

    onDragEnd(event, data, element) {
        const tableInLayout = this.currentLayout.tables.find(t => t.name === data.name);
        if (tableInLayout) {
            tableInLayout.x = element.x();
            tableInLayout.y = element.y();
        }
        this.redrawAllConnections();
        if (this.eventBus) this.eventBus.emit('diagram:changed');
    }

    updateConnectionsForTable(tableName, draggedElement) {
        console.time('Update Connections for Table');
        const affectedConnections = [];
        this.connectionLines.forEach((group, key) => {
            const rel = group.relationshipData;
            if (rel.from.table === tableName || rel.to.table === tableName) {
                affectedConnections.push({ group, rel });
            }
        });
        affectedConnections.forEach(({ group, rel }) => this.updateConnectionLine(group, rel, draggedElement));
        console.timeEnd('Update Connections for Table');
    }

    redrawAllConnections() {
        console.time('Redraw All Connections');
        this.drawnPaths.clear();
        this.connectionsLayer.destroyChildren();
        console.log(`Rendering ${this.currentSchema.relationships.length} relationships`);
        (this.currentSchema.relationships || []).forEach((rel, index) => {
            console.time(`Connection ${index + 1}`);
            const connectionGroup = this.createConnectionLine(rel);
            if (connectionGroup) {
                this.connectionsLayer.add(connectionGroup);
                const key = `${rel.from.table}-${rel.from.column}-${rel.to.table}-${rel.to.column}`;
                this.connectionLines.set(key, connectionGroup);
            }
            console.timeEnd(`Connection ${index + 1}`);
        });
        this.connectionsLayer.draw();
        console.timeEnd('Redraw All Connections');
    }

    createConnectionLine(relationship) {
        const pathPoints = this.calculateOrthogonalPath(relationship);
        if (!pathPoints || pathPoints.length === 0) return null;
        const connectionGroup = new Konva.Group({ name: 'connection' });
        connectionGroup.relationshipData = relationship;
        const line = new Konva.Line({ points: pathPoints, stroke: this.styles.connection.stroke, strokeWidth: this.styles.connection.strokeWidth, name: 'connection-line', lineCap: 'round', lineJoin: 'round' });
        connectionGroup.add(line);
        const sourcePoint = { x: pathPoints[0], y: pathPoints[1] };
        const targetPoint = { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] };
        this.addRelationshipMarkers(connectionGroup, { source: sourcePoint, target: targetPoint });
        return connectionGroup;
    }

    updateConnectionLine(connectionGroup, relationship, draggedElement) {
        const pathPoints = this.calculateOrthogonalPath(relationship, draggedElement);
        const line = connectionGroup.findOne('.connection-line');
        connectionGroup.find('.marker').forEach(m => m.destroy());
        if (pathPoints && pathPoints.length > 0) {
            if (line) line.points(pathPoints);
            const sourcePoint = { x: pathPoints[0], y: pathPoints[1] };
            const targetPoint = { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] };
            this.addRelationshipMarkers(connectionGroup, { source: sourcePoint, target: targetPoint });
        } else if (line) {
            line.points([]);
        }
    }

    addRelationshipMarkers(connectionGroup, points) {
        const markerRadius = 3;
        const startMarker = new Konva.Circle({ x: points.source.x, y: points.source.y, radius: markerRadius, fill: this.styles.connection.stroke, name: 'marker' });
        const endMarker = new Konva.Circle({ x: points.target.x, y: points.target.y, radius: markerRadius, fill: this.styles.connection.stroke, name: 'marker' });
        connectionGroup.add(startMarker, endMarker);
    }

    getOptimalSide(fromNode, toNode) {
        console.time('Get Optimal Side');
        const fromLeftX = fromNode.x;
        const fromRightX = fromNode.x + fromNode.width;
        const toCenterX = toNode.x + toNode.width / 2 || 0; // Fallback to 0 for NaN
        const toCenterY = toNode.y + toNode.height / 2 || 0;
        const leftDistance = Math.sqrt(Math.pow(toCenterX - fromLeftX, 2) + Math.pow(toCenterY - (fromNode.y + fromNode.height / 2), 2)) || Infinity;
        const rightDistance = Math.sqrt(Math.pow(toCenterX - fromRightX, 2) + Math.pow(toCenterY - (fromNode.y + fromNode.height / 2), 2)) || Infinity;
        const checkPathClear = (sideX, targetX) => {
            console.time('Check Path Clear');
            const direction = sideX < targetX ? 1 : -1;
            let x = sideX;
            let clear = true;
            while (x !== targetX && Math.abs(x - targetX) > 5) { // Reduced step to 5px
                x += direction * 5;
                this.tableGroups.forEach(group => {
                    const pos = group.position();
                    const size = group.size();
                    if (x > pos.x - this.styles.marginBorder.strokeWidth && x < pos.x + size.width + this.styles.marginBorder.strokeWidth &&
                        Math.abs(fromNode.y + fromNode.height / 2 - (pos.y + size.height / 2)) < size.height + this.styles.marginBorder.strokeWidth * 2) {
                        clear = false;
                    }
                });
                if (!clear) break;
            }
            console.timeEnd('Check Path Clear');
            return clear;
        };
        const leftClear = checkPathClear(fromLeftX, toCenterX);
        const rightClear = checkPathClear(fromRightX, toCenterX);
        console.log(`Left Distance: ${leftDistance}, Right Distance: ${rightDistance}, Left Clear: ${leftClear}, Right Clear: ${rightClear}`);
        let side = rightDistance <= leftDistance ? 'right' : 'left';
        if (leftClear && !rightClear) side = 'left';
        else if (rightClear && !leftClear) side = 'right';
        console.timeEnd('Get Optimal Side');
        return side;
    }

    getColumnConnectionPoint(tableNode, columnName, tableData, side) {
        const columnIndex = (tableData.columns || []).findIndex(c => c.name === columnName);
        const yOffset = columnIndex === -1 ? tableNode.height / 2 : this.styles.table.headerHeight + (columnIndex * this.styles.table.rowHeight) + (this.styles.table.rowHeight / 2);
        return side === 'left' ? { x: tableNode.x, y: tableNode.y + yOffset } : { x: tableNode.x + tableNode.width, y: tableNode.y + yOffset };
    }

    calculateOrthogonalPath(relationship, draggedElement = null) {
        console.time('Calculate Orthogonal Path');
        const gridSize = 10; // Increased for performance
        const minStandoff = 30;

        const fromTableGroup = this.tableGroups.get(relationship.from.table);
        const toTableGroup = this.tableGroups.get(relationship.to.table);
        if (!fromTableGroup || !toTableGroup) {
            console.timeEnd('Calculate Orthogonal Path');
            return [];
        }

        const fromNode = draggedElement && draggedElement.tableData.name === relationship.from.table ? draggedElement.position() : { ...fromTableGroup.position(), width: fromTableGroup.width(), height: fromTableGroup.height() };
        const toNode = draggedElement && draggedElement.tableData.name === relationship.to.table ? draggedElement.position() : { ...toTableGroup.position(), width: toTableGroup.width(), height: toTableGroup.height() };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.tableGroups.forEach(group => {
            const pos = group.position();
            const size = group.size();
            minX = Math.min(minX, pos.x - this.styles.marginBorder.strokeWidth);
            minY = Math.min(minY, pos.y - this.styles.marginBorder.strokeWidth);
            maxX = Math.max(maxX, pos.x + size.width + this.styles.marginBorder.strokeWidth);
            maxY = Math.max(maxY, pos.y + size.height + this.styles.marginBorder.strokeWidth);
        });

        const padding = 50;
        const gridOriginX = minX - padding;
        const gridOriginY = minY - padding;
        const gridWidth = Math.ceil((maxX - minX + 2 * padding) / gridSize);
        const gridHeight = Math.ceil((maxY - minY + 2 * padding) / gridSize);
        console.log(`Grid Size: ${gridWidth}x${gridHeight}`);

        const grid = Array(gridWidth).fill().map(() => Array(gridHeight).fill(0));
        console.time('Build Grid');
        this.tableGroups.forEach(group => {
            if (draggedElement && group === draggedElement) return; // Skip dragged table for dynamic update
            const pos = group.position();
            const size = group.size();
            const startX = Math.max(0, Math.floor((pos.x - this.styles.marginBorder.strokeWidth - gridOriginX) / gridSize));
            const endX = Math.min(gridWidth - 1, Math.ceil((pos.x + size.width + this.styles.marginBorder.strokeWidth - gridOriginX) / gridSize));
            const startY = Math.max(0, Math.floor((pos.y - this.styles.marginBorder.strokeWidth - gridOriginY) / gridSize));
            const endY = Math.min(gridHeight - 1, Math.ceil((pos.y + size.height + this.styles.marginBorder.strokeWidth - gridOriginY) / gridSize));
            for (let x = startX; x <= endX; x++) for (let y = startY; y <= endY; y++) grid[x][y] = 1;
        });
        console.timeEnd('Build Grid');

        const sourceSide = this.getOptimalSide(fromNode, toNode);
        const targetSide = this.getOptimalSide(toNode, fromNode);

        const sourcePoint = this.getColumnConnectionPoint(fromNode, relationship.from.column, fromTableGroup.tableData, sourceSide);
        const targetPoint = this.getColumnConnectionPoint(toNode, relationship.to.column, toTableGroup.tableData, targetSide);

        const sourceStandoff = { x: sourcePoint.x + (sourceSide === 'right' ? minStandoff : -minStandoff), y: sourcePoint.y };
        const targetStandoff = { x: targetPoint.x + (targetSide === 'left' ? -minStandoff : minStandoff), y: targetPoint.y };

        const startNode = { x: Math.round((sourceStandoff.x - gridOriginX) / gridSize), y: Math.round((sourceStandoff.y - gridOriginY) / gridSize) };
        const endNode = { x: Math.round((targetStandoff.x - gridOriginX) / gridSize), y: Math.round((targetStandoff.y - gridOriginY) / gridSize) };

        if (grid[startNode.x]?.[startNode.y] === 1) grid[startNode.x][startNode.y] = 0;
        if (grid[endNode.x]?.[endNode.y] === 1) grid[endNode.x][endNode.y] = 0;

        console.time('A* Pathfinding');
        const router = new AStarRouter(grid);
        const path = router.findPath(startNode, endNode);
        console.timeEnd('A* Pathfinding');
        if (!path) {
            console.warn(`No path found for ${relationship.from.table} -> ${relationship.to.table}`);
            console.timeEnd('Calculate Orthogonal Path');
            return [];
        }

        path.forEach(p => this.drawnPaths.add(`${p.x},${p.y}`));

        let pixelPath = path.map(p => [
            p.x * gridSize + gridOriginX + gridSize / 2,
            p.y * gridSize + gridOriginY + gridSize / 2
        ]).flat();

        pixelPath = this.simplifyPath(pixelPath);

        const finalPath = [
            sourcePoint.x, sourcePoint.y,
            sourceStandoff.x, sourceStandoff.y,
            ...pixelPath,
            targetStandoff.x, targetStandoff.y,
            targetPoint.x, targetPoint.y
        ];

        console.timeEnd('Calculate Orthogonal Path');
        return this.simplifyPath(finalPath);
    }

    simplifyPath(points) {
        if (points.length <= 4) return points;
        const simplified = [points[0], points[1]];
        for (let i = 2; i < points.length - 2; i += 2) {
            const x1 = simplified[simplified.length - 2];
            const y1 = simplified[simplified.length - 1];
            const x2 = points[i];
            const y2 = points[i + 1];
            const x3 = points[i + 2];
            const y3 = points[i + 3];
            const isCollinear = Math.abs(x1 - x2) < 0.1 && Math.abs(x2 - x3) < 0.1;
            if (!isCollinear) simplified.push(x2, y2);
        }
        simplified.push(points[points.length - 2], points[points.length - 1]);
        return simplified;
    }

    fitToView() {
        if (this.tablesLayer.children.length === 0) return;
        const bounds = this.tablesLayer.getClientRect();
        const stageWidth = this.stage.width();
        const stageHeight = this.stage.height();
        const padding = 50;
        const scale = Math.min((stageWidth - padding * 2) / bounds.width, (stageHeight - padding * 2) / bounds.height, 1);
        this.stage.scale({ x: scale, y: scale });
        const newX = (stageWidth - bounds.width * scale) / 2 - bounds.x * scale;
        const newY = (stageHeight - bounds.height * scale) / 2 - bounds.y * scale;
        this.stage.position({ x: newX, y: newY });
    }

    resetZoom() {
        this.stage.position({ x: 0, y: 0 });
        this.stage.scale({ x: 1, y: 1 });
        this.fitToView();
    }
}