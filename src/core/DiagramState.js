/**
 * Manages the state of the ERD diagram including layout, selection, and history
 */
export class DiagramState {
    constructor() {
        this.layout = new Map(); // table positions and sizes
        this.selectedElement = null;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.zoomLevel = 1.0;
        this.panOffset = { x: 0, y: 0 };
        this.viewBox = { x: 0, y: 0, width: 0, height: 0 };
    }

    /**
     * Set the layout for all tables
     * @param {Object} layoutData - Layout data with table positions
     */
    setLayout(layoutData) {
        this.saveState();
        
        this.layout.clear();
        
        if (layoutData.tables) {
            layoutData.tables.forEach(tableLayout => {
                this.layout.set(tableLayout.name, {
                    x: tableLayout.x || 0,
                    y: tableLayout.y || 0,
                    width: tableLayout.width || 200,
                    height: tableLayout.height || 100,
                    zIndex: tableLayout.zIndex || 0
                });
            });
        }
    }

    /**
     * Get the layout for all tables
     * @returns {Object} Layout data
     */
    getLayout() {
        const tables = [];
        
        for (const [tableName, position] of this.layout.entries()) {
            tables.push({
                name: tableName,
                x: position.x,
                y: position.y,
                width: position.width,
                height: position.height,
                zIndex: position.zIndex
            });
        }

        return {
            tables,
            zoomLevel: this.zoomLevel,
            panOffset: { ...this.panOffset },
            viewBox: { ...this.viewBox }
        };
    }

    /**
     * Set the position of a specific table
     * @param {string} tableName - Name of the table
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    setTablePosition(tableName, x, y) {
        if (!this.layout.has(tableName)) {
            this.layout.set(tableName, { x: 0, y: 0, width: 200, height: 100, zIndex: 0 });
        }

        const tableLayout = this.layout.get(tableName);
        tableLayout.x = x;
        tableLayout.y = y;
    }

    /**
     * Get the position of a specific table
     * @param {string} tableName - Name of the table
     * @returns {Object|null} Position object or null if not found
     */
    getTablePosition(tableName) {
        return this.layout.get(tableName) || null;
    }

    /**
     * Set the size of a specific table
     * @param {string} tableName - Name of the table
     * @param {number} width - Width
     * @param {number} height - Height
     */
    setTableSize(tableName, width, height) {
        if (!this.layout.has(tableName)) {
            this.layout.set(tableName, { x: 0, y: 0, width: 200, height: 100, zIndex: 0 });
        }

        const tableLayout = this.layout.get(tableName);
        tableLayout.width = width;
        tableLayout.height = height;
    }

    /**
     * Get the size of a specific table
     * @param {string} tableName - Name of the table
     * @returns {Object|null} Size object or null if not found
     */
    getTableSize(tableName) {
        const layout = this.layout.get(tableName);
        return layout ? { width: layout.width, height: layout.height } : null;
    }

    /**
     * Set the currently selected element
     * @param {Object|null} element - Selected element or null to clear selection
     */
    setSelectedElement(element) {
        this.selectedElement = element;
    }

    /**
     * Get the currently selected element
     * @returns {Object|null} Selected element or null
     */
    getSelectedElement() {
        return this.selectedElement;
    }

    /**
     * Clear the selection
     */
    clearSelection() {
        this.selectedElement = null;
    }

    /**
     * Set the zoom level
     * @param {number} level - Zoom level (1.0 = 100%)
     */
    setZoomLevel(level) {
        this.zoomLevel = Math.max(0.1, Math.min(5.0, level));
    }

    /**
     * Get the current zoom level
     * @returns {number} Zoom level
     */
    getZoomLevel() {
        return this.zoomLevel;
    }

    /**
     * Set the pan offset
     * @param {number} x - X offset
     * @param {number} y - Y offset
     */
    setPanOffset(x, y) {
        this.panOffset.x = x;
        this.panOffset.y = y;
    }

    /**
     * Get the pan offset
     * @returns {Object} Pan offset object
     */
    getPanOffset() {
        return { ...this.panOffset };
    }

    /**
     * Set the view box
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} width - Width
     * @param {number} height - Height
     */
    setViewBox(x, y, width, height) {
        this.viewBox = { x, y, width, height };
    }

    /**
     * Get the view box
     * @returns {Object} View box object
     */
    getViewBox() {
        return { ...this.viewBox };
    }

    /**
     * Calculate bounds of all tables
     * @returns {Object} Bounds object with min/max coordinates
     */
    calculateBounds() {
        if (this.layout.size === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const position of this.layout.values()) {
            minX = Math.min(minX, position.x);
            minY = Math.min(minY, position.y);
            maxX = Math.max(maxX, position.x + position.width);
            maxY = Math.max(maxY, position.y + position.height);
        }

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * Save current state to history
     */
    saveState() {
        // Remove any history after current index (when undoing then making new changes)
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Create state snapshot
        const state = {
            layout: new Map(this.layout),
            selectedElement: this.selectedElement,
            zoomLevel: this.zoomLevel,
            panOffset: { ...this.panOffset },
            viewBox: { ...this.viewBox },
            timestamp: Date.now()
        };

        this.history.push(state);
        this.historyIndex = this.history.length - 1;

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    /**
     * Undo last action
     * @returns {boolean} True if undo was performed
     */
    undo() {
        if (!this.canUndo()) {
            return false;
        }

        this.historyIndex--;
        this.restoreState(this.history[this.historyIndex]);
        return true;
    }

    /**
     * Redo last undone action
     * @returns {boolean} True if redo was performed
     */
    redo() {
        if (!this.canRedo()) {
            return false;
        }

        this.historyIndex++;
        this.restoreState(this.history[this.historyIndex]);
        return true;
    }

    /**
     * Check if undo is possible
     * @returns {boolean} True if undo is possible
     */
    canUndo() {
        return this.historyIndex > 0;
    }

    /**
     * Check if redo is possible
     * @returns {boolean} True if redo is possible
     */
    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Restore state from history entry
     * @param {Object} state - State to restore
     */
    restoreState(state) {
        this.layout = new Map(state.layout);
        this.selectedElement = state.selectedElement;
        this.zoomLevel = state.zoomLevel;
        this.panOffset = { ...state.panOffset };
        this.viewBox = { ...state.viewBox };
    }

    /**
     * Clear all history
     */
    clearHistory() {
        this.history = [];
        this.historyIndex = -1;
    }

    /**
     * Get history information
     * @returns {Object} History info
     */
    getHistoryInfo() {
        return {
            currentIndex: this.historyIndex,
            totalStates: this.history.length,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }

    /**
     * Check if a point is inside a table
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {string} tableName - Table name to check
     * @returns {boolean} True if point is inside table
     */
    isPointInTable(x, y, tableName) {
        const position = this.getTablePosition(tableName);
        if (!position) {
            return false;
        }

        return x >= position.x && 
               x <= position.x + position.width &&
               y >= position.y && 
               y <= position.y + position.height;
    }

    /**
     * Get table at specific coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {string|null} Table name or null if none found
     */
    getTableAt(x, y) {
        // Check tables in reverse z-index order (top to bottom)
        const sortedTables = Array.from(this.layout.entries())
            .sort((a, b) => (b[1].zIndex || 0) - (a[1].zIndex || 0));

        for (const [tableName] of sortedTables) {
            if (this.isPointInTable(x, y, tableName)) {
                return tableName;
            }
        }

        return null;
    }

    /**
     * Check if two tables overlap
     * @param {string} tableName1 - First table name
     * @param {string} tableName2 - Second table name
     * @returns {boolean} True if tables overlap
     */
    doTablesOverlap(tableName1, tableName2) {
        const pos1 = this.getTablePosition(tableName1);
        const pos2 = this.getTablePosition(tableName2);

        if (!pos1 || !pos2) {
            return false;
        }

        return !(pos1.x + pos1.width < pos2.x || 
                pos2.x + pos2.width < pos1.x || 
                pos1.y + pos1.height < pos2.y || 
                pos2.y + pos2.height < pos1.y);
    }

    /**
     * Get all overlapping tables for a given table
     * @param {string} tableName - Table name to check
     * @returns {Array} Array of overlapping table names
     */
    getOverlappingTables(tableName) {
        const overlapping = [];

        for (const [otherTableName] of this.layout.entries()) {
            if (otherTableName !== tableName && this.doTablesOverlap(tableName, otherTableName)) {
                overlapping.push(otherTableName);
            }
        }

        return overlapping;
    }

    /**
     * Move table to avoid overlaps
     * @param {string} tableName - Table to move
     * @param {number} stepSize - Step size for movement (default: 20)
     * @returns {boolean} True if table was moved
     */
    resolveTableOverlap(tableName, stepSize = 20) {
        const overlapping = this.getOverlappingTables(tableName);
        if (overlapping.length === 0) {
            return false;
        }

        const position = this.getTablePosition(tableName);
        if (!position) {
            return false;
        }

        // Try moving in different directions
        const directions = [
            { x: stepSize, y: 0 },      // right
            { x: -stepSize, y: 0 },     // left
            { x: 0, y: stepSize },      // down
            { x: 0, y: -stepSize },     // up
            { x: stepSize, y: stepSize }, // diagonal down-right
            { x: -stepSize, y: -stepSize } // diagonal up-left
        ];

        for (const direction of directions) {
            const newX = position.x + direction.x;
            const newY = position.y + direction.y;

            // Temporarily move table
            this.setTablePosition(tableName, newX, newY);

            // Check if overlaps are resolved
            if (this.getOverlappingTables(tableName).length === 0) {
                return true;
            }
        }

        // If no direction worked, restore original position
        this.setTablePosition(tableName, position.x, position.y);
        return false;
    }

    /**
     * Clear all layout data
     */
    clear() {
        this.layout.clear();
        this.selectedElement = null;
        this.zoomLevel = 1.0;
        this.panOffset = { x: 0, y: 0 };
        this.viewBox = { x: 0, y: 0, width: 0, height: 0 };
        this.clearHistory();
    }

    /**
     * Get debug information
     * @returns {Object} Debug information
     */
    getDebugInfo() {
        return {
            layoutSize: this.layout.size,
            selectedElement: this.selectedElement?.name || null,
            zoomLevel: this.zoomLevel,
            panOffset: this.panOffset,
            viewBox: this.viewBox,
            historyInfo: this.getHistoryInfo(),
            bounds: this.calculateBounds()
        };
    }
}