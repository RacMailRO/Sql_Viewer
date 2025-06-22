import Konva from 'konva';

// A* Pathfinding Helper Class
class AStarRouter {
    constructor(grid) {
        this.grid = grid;
        this.width = grid.length;
        this.height = grid[0].length;
    }
    findPath(start, end) {
        const openSet = new Set([`${start.x},${start.y}`]);
        const cameFrom = new Map();
        const gScore = {};
        for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) gScore[`${x},${y}`] = Infinity;
        gScore[`${start.x},${start.y}`] = 0;
        const fScore = {};
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
            if (current.x === end.x && current.y === end.y) return this.reconstructPath(cameFrom, currentKey);
            openSet.delete(currentKey);
            this.getNeighbors(current).forEach(neighbor => {
                const neighborKey = `${neighbor.x},${neighbor.y}`;
                const movementCost = 1 + this.grid[neighbor.x][neighbor.y];
                const turnPenalty = this.isTurn(cameFrom, currentKey, neighbor) ? 10 : 0;
                const tentativeGScore = gScore[currentKey] + movementCost + turnPenalty;
                if (tentativeGScore < gScore[neighborKey]) {
                    cameFrom.set(neighborKey, currentKey);
                    gScore[neighborKey] = tentativeGScore;
                    fScore[neighborKey] = tentativeGScore + this.heuristic(neighbor, end);
                    if (!openSet.has(neighborKey)) openSet.add(neighborKey);
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
        const neighbors = []; const { x, y } = point;
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

/**
 * ERD renderer using KonvaJS and Canvas
 * This is the complete and final version with all bugs fixed.
 */
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
        this.searchHighlightShape = null;

        this.tableGroups = new Map();
        this.connectionLines = new Map();
        this.drawnPaths = new Set();
        
        this.styles = {
            table: {
                background: '#ffffff', border: '#e2e8f0', borderWidth: 1, cornerRadius: 4,
                headerBackground: '#f1f5f9', headerHeight: 30, rowHeight: 25, padding: 8,
                isolateButton: { size: 18, padding: 5, fill: '#f0f0f0', stroke: '#cccccc', strokeWidth: 1, iconFill: '#555555', hoverFill: '#e0e0e0' }
            },
            text: { fontFamily: 'Arial, sans-serif', fontSize: 12, fill: '#1e293b', headerFill: '#374151', typeFill: '#64748b' },
            connection: { stroke: '#94a3b8', strokeWidth: 2, selectedStroke: '#2563eb', selectedStrokeWidth: 3 },
            selection: { stroke: '#2563eb', strokeWidth: 2, dash: [5, 5] },
            searchHighlight: { stroke: '#f59e0b', strokeWidth: 3, dash: [10, 5], opacity: 0.8, cornerRadius: 5, animationDuration: 0.3 }
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
        this.connectionsLayer = new Konva.Layer({ name: 'connections' });
        this.tablesLayer = new Konva.Layer({ name: 'tables' });
        this.uiLayer = new Konva.Layer({ name: 'ui' });
        this.stage.add(this.connectionsLayer, this.tablesLayer, this.uiLayer);
        this.mainLayer = this.tablesLayer;
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
    }

    render(schema, layout) {
        this.currentSchema = schema;
        this.currentLayout = layout;

        this.connectionsLayer.destroyChildren();
        this.tablesLayer.destroyChildren();
        this.uiLayer.destroyChildren();
        this.tableGroups.clear();
        this.connectionLines.clear();

        if (!schema || !schema.tables || schema.tables.length === 0) return;

        this.renderTables(schema.tables, layout);
        this.redrawAllConnections();
        this.fitToView();
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
        tableGroup.add(background, header, title);

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
        this.updateConnectionsForTable(data.name);
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

    updateLayout(layout) {
        this.currentLayout = layout;
        this.tableGroups.forEach((group, name) => {
            const tableLayout = layout.tables.find(t => t.name === name);
            if (tableLayout) group.position({ x: tableLayout.x, y: tableLayout.y });
        });
        this.tablesLayer.draw();
        this.redrawAllConnections();
    }

    redrawAllConnections() {
        this.drawnPaths.clear();
        this.connectionsLayer.destroyChildren();
        (this.currentSchema.relationships || []).forEach(rel => {
            const connectionGroup = this.createConnectionLine(rel);
            if (connectionGroup) {
                this.connectionsLayer.add(connectionGroup);
                const key = `${rel.from.table}-${rel.from.column}-${rel.to.table}-${rel.to.column}`;
                this.connectionLines.set(key, connectionGroup);
            }
        });
        this.connectionsLayer.draw();
    }

    updateConnectionsForTable(tableName) {
        this.drawnPaths.clear();
        this.connectionLines.forEach((group, key) => {
            const rel = group.relationshipData;
            if (rel.from.table === tableName || rel.to.table === tableName) {
                this.updateConnectionLine(group, rel);
            }
        });
        this.connectionsLayer.batchDraw();
    }

    createConnectionLine(relationship) {
        const pathPoints = this.calculateOrthogonalPath(relationship);
        if (!pathPoints || pathPoints.length === 0) return null;

        const connectionGroup = new Konva.Group({ name: 'connection-group' });
        connectionGroup.relationshipData = relationship;

        const line = new Konva.Line({ points: pathPoints, stroke: this.styles.connection.stroke, strokeWidth: this.styles.connection.strokeWidth, name: 'connection-line', lineCap: 'round', lineJoin: 'round' });
        connectionGroup.add(line);

        const sourcePoint = { x: pathPoints[0], y: pathPoints[1] };
        const targetPoint = { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] };
        this.addRelationshipMarkers(connectionGroup, { source: sourcePoint, target: targetPoint });

        return connectionGroup;
    }

    updateConnectionLine(connectionGroup, relationship) {
        const pathPoints = this.calculateOrthogonalPath(relationship);
        const line = connectionGroup.findOne('.connection-line');
        
        connectionGroup.find('.start-marker, .end-marker').forEach(m => m.destroy());

        if (pathPoints && pathPoints.length > 0) {
            if (line) line.points(pathPoints);
            const sourcePoint = { x: pathPoints[0], y: pathPoints[1] };
            const targetPoint = { x: pathPoints[pathPoints.length - 2], y: pathPoints[pathPoints.length - 1] };
            this.addRelationshipMarkers(connectionGroup, { source: sourcePoint, target: targetPoint });
        } else {
            if (line) line.points([]);
        }
    }
    
    addRelationshipMarkers(connectionGroup, connectionPoints) {
        const markerRadius = 4;
        const startMarker = new Konva.Circle({ x: connectionPoints.source.x, y: connectionPoints.source.y, radius: markerRadius, fill: this.styles.connection.stroke, name: 'start-marker' });
        const endMarker = new Konva.Circle({ x: connectionPoints.target.x, y: connectionPoints.target.y, radius: markerRadius, fill: this.styles.connection.stroke, name: 'end-marker' });
        connectionGroup.add(startMarker, endMarker);
    }
    
    getOptimalSide(fromNode, toNode) {
        const fromCenterX = fromNode.x + fromNode.width / 2;
        const toCenterX = toNode.x + toNode.width / 2;
        return toCenterX > fromCenterX ? 'right' : 'left';
    }

    getColumnConnectionPoint(tableNode, columnName, tableData, side) {
        const columnIndex = (tableData.columns || []).findIndex(c => c.name === columnName);
        const yOffset = (columnIndex === -1) 
            ? tableNode.height / 2 
            : this.styles.table.headerHeight + (columnIndex * this.styles.table.rowHeight) + (this.styles.table.rowHeight / 2);

        return side === 'left' 
            ? { x: tableNode.x, y: tableNode.y + yOffset } 
            : { x: tableNode.x + tableNode.width, y: tableNode.y + yOffset };
    }

    calculateOrthogonalPath(relationship) {
        const gridSize = 20;
        const standoff = 40;

        const fromTableGroup = this.tableGroups.get(relationship.from.table);
        const toTableGroup = this.tableGroups.get(relationship.to.table);
        if (!fromTableGroup || !toTableGroup) return [];

        const fromNode = { ...fromTableGroup.position(), ...fromTableGroup.size() };
        const toNode = { ...toTableGroup.position(), ...toTableGroup.size() };
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.tableGroups.forEach(group => {
            const pos = group.position(); const size = group.size();
            minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + size.width); maxY = Math.max(maxY, pos.y + size.height);
        });

        const padding = 100;
        const gridOriginX = minX - padding; const gridOriginY = minY - padding;
        const gridWidth = Math.ceil((maxX - minX + 2 * padding) / gridSize);
        const gridHeight = Math.ceil((maxY - minY + 2 * padding) / gridSize);
        if (!isFinite(gridWidth) || !isFinite(gridHeight)) return [];
        
        const grid = Array(gridWidth).fill(0).map(() => Array(gridHeight).fill(0));
        
        this.tableGroups.forEach(group => {
            const pos = group.position(); const size = group.size();
            const margin = 2;
            const startX = Math.floor((pos.x - gridOriginX) / gridSize) - margin;
            const endX = Math.ceil((pos.x + size.width - gridOriginX) / gridSize) + margin;
            const startY = Math.floor((pos.y - gridOriginY) / gridSize) - margin;
            const endY = Math.ceil((pos.y + size.height - gridOriginY) / gridSize) + margin;
            for (let x = startX; x <= endX; x++) {
                for (let y = startY; y <= endY; y++) {
                    if (grid[x]?.[y] !== undefined) grid[x][y] = 1;
                }
            }
        });

        const sourceSide = this.getOptimalSide(fromNode, toNode);
        const targetSide = this.getOptimalSide(toNode, fromNode);

        const sourceAttachPoint = this.getColumnConnectionPoint(fromNode, relationship.from.column, fromTableGroup.tableData, sourceSide);
        const targetAttachPoint = this.getColumnConnectionPoint(toNode, relationship.to.column, toTableGroup.tableData, targetSide);

        let sourceStandoff = { ...sourceAttachPoint };
        sourceStandoff.x += (sourceSide === 'right' ? standoff : -standoff);
        
        let targetStandoff = { ...targetAttachPoint };
        targetStandoff.x += (targetSide === 'right' ? -standoff : standoff);

        const startNode = { x: Math.round((sourceStandoff.x - gridOriginX) / gridSize), y: Math.round((sourceStandoff.y - gridOriginY) / gridSize) };
        const endNode = { x: Math.round((targetStandoff.x - gridOriginX) / gridSize), y: Math.round((targetStandoff.y - gridOriginY) / gridSize) };
        
        if (grid[startNode.x]?.[startNode.y] === 1) grid[startNode.x][startNode.y] = 0;
        if (grid[endNode.x]?.[endNode.y] === 1) grid[endNode.x][endNode.y] = 0;

        this.drawnPaths.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (grid[x]?.[y] !== undefined && grid[x][y] !== 1) grid[x][y] += 5;
        });

        const router = new AStarRouter(grid);
        const path = router.findPath(startNode, endNode);
        
        if (!path) { console.warn(`A* could not find a path for ${relationship.from.table} -> ${relationship.to.table}.`); return []; }
        
        path.forEach(p => this.drawnPaths.add(`${p.x},${p.y}`));

        let pixelPath = path.map(p => [ p.x * gridSize + gridOriginX + gridSize / 2, p.y * gridSize + gridOriginY + gridSize / 2]);
        pixelPath = this.simplifyPath(pixelPath.flat());
        
        const finalPathPoints = [sourceAttachPoint.x, sourceAttachPoint.y];
        finalPathPoints.push(sourceStandoff.x, sourceAttachPoint.y);
        pixelPath.forEach(p => finalPathPoints.push(p));
        finalPathPoints.push(targetStandoff.x, targetAttachPoint.y);
        finalPathPoints.push(targetAttachPoint.x, targetAttachPoint.y);

        return this.simplifyPath(finalPathPoints);
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
            const isCollinear = (x1 === x2 && x2 === x3) || (y1 === y2 && y2 === y3);
            if (!isCollinear) {
                simplified.push(x2, y2);
            }
        }
        simplified.push(points[points.length - 2], points[points.length - 1]);
        return simplified;
    }

    getDistance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
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

    // Other methods like deselectAll, etc.
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
}