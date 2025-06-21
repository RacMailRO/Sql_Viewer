/**
 * Properties Panel Component
 * Displays detailed information about selected tables, columns, and relationships
 */
export class PropertiesPanel {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.currentSelection = null;
        this.currentSelectionType = null;
        this.panelElement = null;
        this.isVisible = false;
        
        this.initialize();
        this.setupEventListeners();
    }

    /**
     * Initialize the properties panel
     */
    initialize() {
        this.panelElement = document.getElementById('property-panel');
        if (!this.panelElement) {
            this.createPropertiesPanel();
        }
        
        this.contentElement = document.getElementById('panel-content');
        this.setupPanelControls();
    }

    /**
     * Create properties panel if it doesn't exist
     */
    createPropertiesPanel() {
        const panel = document.createElement('div');
        panel.id = 'property-panel';
        panel.className = 'properties-panel';
        panel.innerHTML = `
            <div class="panel-header">
                <h3 class="panel-title">Properties</h3>
                <div class="panel-controls">
                    <button id="pin-panel" class="panel-btn" title="Pin Panel">📌</button>
                    <button id="close-panel" class="panel-btn" title="Close Panel">✕</button>
                </div>
            </div>
            <div id="panel-content" class="panel-content">
                <div class="panel-placeholder">
                    <div class="placeholder-icon">ℹ️</div>
                    <div class="placeholder-text">Select a table, column, or relationship to view properties</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.panelElement = panel;
        this.contentElement = document.getElementById('panel-content');
    }

    /**
     * Setup panel controls
     */
    setupPanelControls() {
        const closeBtn = document.getElementById('close-panel');
        const pinBtn = document.getElementById('pin-panel');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        if (pinBtn) {
            pinBtn.addEventListener('click', () => this.togglePin());
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (this.eventBus) {
            // Listen for selection events
            // These are now handled by ERDApplication calling the generic `render` method
            // this.eventBus.on('table:click', (data) => this.showTableProperties(data));
            // this.eventBus.on('column:click', (data) => this.showColumnProperties(data));
            // this.eventBus.on('connection:click', (data) => this.showRelationshipProperties(data));
            
            // Listen for hover events (optional preview)
            this.eventBus.on('table:hover', (data) => this.previewTableInfo(data));
            this.eventBus.on('connection:hover', (data) => this.previewRelationshipInfo(data));
        }
    }

    /**
     * Generic render method to display properties based on element type.
     * @param {Object} element - The selected element (table, column, or relationship)
     */
    render(element) {
        if (!element) {
            this.updateContent('<div class="panel-placeholder"><div class="placeholder-icon">ℹ️</div><div class="placeholder-text">No element selected.</div></div>');
            this.show();
            return;
        }

        // Determine element type and call the appropriate method
        // Note: `element.type` might be a more robust way if the schema consistently provides it.
        // For now, duck typing based on properties.
        if (element.hasOwnProperty('columns') && element.hasOwnProperty('name') && !element.hasOwnProperty('sourceTable')) { // Likely a table
            this.showTableProperties(element);
        } else if (element.hasOwnProperty('sourceTable') && element.hasOwnProperty('targetTable')) { // Likely a relationship
            this.showRelationshipProperties(element);
        } else if (element.hasOwnProperty('table') && element.hasOwnProperty('column') && element.column.hasOwnProperty('name')) { // Likely a column selection event data from ERDApplication
            // The event data for column selection is often { table: tableData, column: columnData }
            // Or if a direct column object is passed, it might have `name` and `type` but not `columns` or `sourceTable`
            this.showColumnProperties(element.column);
        } else if (element.hasOwnProperty('name') && element.hasOwnProperty('type') && !element.hasOwnProperty('columns') && !element.hasOwnProperty('sourceTable')) { // Likely a direct column object
             this.showColumnProperties(element);
        }
        else {
            console.warn('PropertiesPanel: Unknown element type for rendering', element);
            this.updateContent('<div class="panel-placeholder"><div class="placeholder-icon">❓</div><div class="placeholder-text">Unknown element type.</div></div>');
            this.show();
        }
    }

    /**
     * Show table properties
     * @param {Object} tableData - Table data
     */
    showTableProperties(tableData) {
        this.currentSelection = tableData;
        this.currentSelectionType = 'table';
        
        const content = `
            <div class="property-section">
                <div class="section-header">
                    <h4>Table: ${tableData.name}</h4>
                    <span class="table-type-badge">${tableData.type || 'TABLE'}</span>
                </div>
                
                <div class="property-group">
                    <label>Table Name:</label>
                    <div class="property-value editable" data-field="name">${tableData.name}</div>
                </div>
                
                <div class="property-group">
                    <label>Display Name:</label>
                    <div class="property-value editable" data-field="displayName">${tableData.displayName || tableData.name}</div>
                </div>
                
                <div class="property-group">
                    <label>Description:</label>
                    <div class="property-value editable textarea" data-field="description">${tableData.description || 'No description provided'}</div>
                </div>
                
                <div class="property-group">
                    <label>Column Count:</label>
                    <div class="property-value">${tableData.columns?.length || 0}</div>
                </div>
                
                <div class="property-group">
                    <label>Primary Keys:</label>
                    <div class="property-value">${this.getPrimaryKeyColumns(tableData).join(', ') || 'None'}</div>
                </div>
                
                <div class="property-group">
                    <label>Foreign Keys:</label>
                    <div class="property-value">${this.getForeignKeyColumns(tableData).join(', ') || 'None'}</div>
                </div>
            </div>
            
            <div class="property-section">
                <div class="section-header">
                    <h4>Columns (${tableData.columns?.length || 0})</h4>
                    <button class="btn btn-sm" onclick="this.expandAllColumns()">Expand All</button>
                </div>
                <div class="columns-list">
                    ${this.renderColumnsList(tableData.columns)}
                </div>
            </div>
            
            <div class="property-section">
                <div class="section-header">
                    <h4>Relationships</h4>
                </div>
                <div class="relationships-list">
                    ${this.renderRelationshipsList(tableData)}
                </div>
            </div>
            
            <div class="property-section">
                <div class="section-header">
                    <h4>Indexes</h4>
                </div>
                <div class="indexes-list">
                    ${this.renderIndexesList(tableData.indexes)}
                </div>
            </div>
            
            <div class="property-section">
                <div class="section-header">
                    <h4>User Notes</h4>
                    <button class="btn btn-sm" onclick="this.addNote()">Add Note</button>
                </div>
                <div class="notes-list">
                    ${this.renderNotesList(tableData)}
                </div>
            </div>
        `;
        
        this.updateContent(content);
        this.show();
    }

    /**
     * Show column properties
     * @param {Object} columnData - Column data
     */
    showColumnProperties(columnData) {
        this.currentSelection = columnData;
        this.currentSelectionType = 'column';
        
        const content = `
            <div class="property-section">
                <div class="section-header">
                    <h4>Column: ${columnData.name}</h4>
                    <div class="column-badges">
                        ${columnData.isPrimaryKey ? '<span class="badge badge-primary">PK</span>' : ''}
                        ${columnData.isForeignKey ? '<span class="badge badge-foreign">FK</span>' : ''}
                        ${columnData.nullable === false ? '<span class="badge badge-required">NOT NULL</span>' : ''}
                    </div>
                </div>
                
                <div class="property-group">
                    <label>Column Name:</label>
                    <div class="property-value editable" data-field="name">${columnData.name}</div>
                </div>
                
                <div class="property-group">
                    <label>Data Type:</label>
                    <div class="property-value editable" data-field="type">${columnData.type}</div>
                </div>
                
                <div class="property-group">
                    <label>Nullable:</label>
                    <div class="property-value">
                        <input type="checkbox" ${columnData.nullable !== false ? 'checked' : ''} data-field="nullable">
                    </div>
                </div>
                
                <div class="property-group">
                    <label>Default Value:</label>
                    <div class="property-value editable" data-field="defaultValue">${columnData.defaultValue || 'None'}</div>
                </div>
                
                <div class="property-group">
                    <label>Description:</label>
                    <div class="property-value editable textarea" data-field="description">${columnData.description || 'No description provided'}</div>
                </div>
                
                <div class="property-group">
                    <label>Constraints:</label>
                    <div class="property-value">
                        <div class="constraints-list">
                            ${this.renderConstraintsList(columnData.constraints)}
                        </div>
                    </div>
                </div>
                
                ${columnData.isForeignKey ? this.renderForeignKeyInfo(columnData) : ''}
            </div>
            
            <div class="property-section">
                <div class="section-header">
                    <h4>User Notes</h4>
                    <button class="btn btn-sm" onclick="this.addColumnNote()">Add Note</button>
                </div>
                <div class="notes-list">
                    ${this.renderNotesList(columnData)}
                </div>
            </div>
        `;
        
        this.updateContent(content);
        this.show();
    }

    /**
     * Show relationship properties
     * @param {Object} relationshipData - Relationship data
     */
    showRelationshipProperties(relationshipData) {
        this.currentSelection = relationshipData;
        this.currentSelectionType = 'relationship';
        
        const content = `
            <div class="property-section">
                <div class="section-header">
                    <h4>Relationship</h4>
                    <span class="relationship-type-badge">${relationshipData.type || 'one-to-many'}</span>
                </div>
                
                <div class="property-group">
                    <label>Type:</label>
                    <div class="property-value">
                        <select data-field="type">
                            <option value="one-to-one" ${relationshipData.type === 'one-to-one' ? 'selected' : ''}>One-to-One</option>
                            <option value="one-to-many" ${relationshipData.type === 'one-to-many' ? 'selected' : ''}>One-to-Many</option>
                            <option value="many-to-many" ${relationshipData.type === 'many-to-many' ? 'selected' : ''}>Many-to-Many</option>
                        </select>
                    </div>
                </div>
                
                <div class="property-group">
                    <label>Source:</label>
                    <div class="property-value relationship-endpoint">
                        <span class="table-name">${relationshipData.sourceTable}</span>
                        <span class="column-name">${relationshipData.sourceColumn}</span>
                    </div>
                </div>
                
                <div class="property-group">
                    <label>Target:</label>
                    <div class="property-value relationship-endpoint">
                        <span class="table-name">${relationshipData.targetTable}</span>
                        <span class="column-name">${relationshipData.targetColumn}</span>
                    </div>
                </div>
                
                <div class="property-group">
                    <label>On Delete:</label>
                    <div class="property-value">
                        <select data-field="onDelete">
                            <option value="RESTRICT" ${relationshipData.onDelete === 'RESTRICT' ? 'selected' : ''}>RESTRICT</option>
                            <option value="CASCADE" ${relationshipData.onDelete === 'CASCADE' ? 'selected' : ''}>CASCADE</option>
                            <option value="SET NULL" ${relationshipData.onDelete === 'SET NULL' ? 'selected' : ''}>SET NULL</option>
                            <option value="NO ACTION" ${relationshipData.onDelete === 'NO ACTION' ? 'selected' : ''}>NO ACTION</option>
                        </select>
                    </div>
                </div>
                
                <div class="property-group">
                    <label>On Update:</label>
                    <div class="property-value">
                        <select data-field="onUpdate">
                            <option value="RESTRICT" ${relationshipData.onUpdate === 'RESTRICT' ? 'selected' : ''}>RESTRICT</option>
                            <option value="CASCADE" ${relationshipData.onUpdate === 'CASCADE' ? 'selected' : ''}>CASCADE</option>
                            <option value="SET NULL" ${relationshipData.onUpdate === 'SET NULL' ? 'selected' : ''}>SET NULL</option>
                            <option value="NO ACTION" ${relationshipData.onUpdate === 'NO ACTION' ? 'selected' : ''}>NO ACTION</option>
                        </select>
                    </div>
                </div>
                
                <div class="property-group">
                    <label>Description:</label>
                    <div class="property-value editable textarea" data-field="description">${relationshipData.description || 'No description provided'}</div>
                </div>
            </div>
            
            <div class="property-section">
                <div class="section-header">
                    <h4>Visual Settings</h4>
                </div>
                
                <div class="property-group">
                    <label>Show Label:</label>
                    <div class="property-value">
                        <input type="checkbox" ${relationshipData.showLabel !== false ? 'checked' : ''} data-field="showLabel">
                    </div>
                </div>
                
                <div class="property-group">
                    <label>Custom Color:</label>
                    <div class="property-value">
                        <input type="color" value="${relationshipData.customColor || '#64748b'}" data-field="customColor">
                    </div>
                </div>
                
                <div class="property-group">
                    <label>Line Style:</label>
                    <div class="property-value">
                        <select data-field="lineStyle">
                            <option value="solid" ${relationshipData.lineStyle === 'solid' ? 'selected' : ''}>Solid</option>
                            <option value="dashed" ${relationshipData.lineStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
                            <option value="dotted" ${relationshipData.lineStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="property-section">
                <div class="section-header">
                    <h4>User Notes</h4>
                    <button class="btn btn-sm" onclick="this.addRelationshipNote()">Add Note</button>
                </div>
                <div class="notes-list">
                    ${this.renderNotesList(relationshipData)}
                </div>
            </div>
        `;
        
        this.updateContent(content);
        this.show();
    }

    /**
     * Helper methods for rendering content
     */
    getPrimaryKeyColumns(tableData) {
        if (!tableData.columns) return [];
        return tableData.columns
            .filter(col => col.isPrimaryKey)
            .map(col => col.name);
    }

    getForeignKeyColumns(tableData) {
        if (!tableData.columns) return [];
        return tableData.columns
            .filter(col => col.isForeignKey)
            .map(col => col.name);
    }

    renderColumnsList(columns) {
        if (!columns || columns.length === 0) {
            return '<div class="empty-state">No columns defined</div>';
        }
        
        return columns.map(column => `
            <div class="column-item" data-column="${column.name}">
                <div class="column-header">
                    <span class="column-name">${column.name}</span>
                    <span class="column-type">${column.type}</span>
                    <div class="column-badges">
                        ${column.isPrimaryKey ? '<span class="badge badge-primary">PK</span>' : ''}
                        ${column.isForeignKey ? '<span class="badge badge-foreign">FK</span>' : ''}
                        ${column.nullable === false ? '<span class="badge badge-required">NOT NULL</span>' : ''}
                    </div>
                </div>
                <div class="column-details">
                    ${column.description ? `<div class="column-description">${column.description}</div>` : ''}
                    ${column.defaultValue ? `<div class="column-default">Default: ${column.defaultValue}</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    renderRelationshipsList(tableData) {
        // This would be populated from the relationship data
        return '<div class="empty-state">Relationship information will be populated from schema data</div>';
    }

    renderIndexesList(indexes) {
        if (!indexes || indexes.length === 0) {
            return '<div class="empty-state">No indexes defined</div>';
        }
        
        return indexes.map(index => `
            <div class="index-item">
                <div class="index-name">${index.name}</div>
                <div class="index-columns">${index.columns?.join(', ')}</div>
                <div class="index-type">${index.type || 'BTREE'}</div>
            </div>
        `).join('');
    }

    renderConstraintsList(constraints) {
        if (!constraints || constraints.length === 0) {
            return '<div class="empty-state">No constraints</div>';
        }
        
        return constraints.map(constraint => `
            <div class="constraint-item">${constraint}</div>
        `).join('');
    }

    renderForeignKeyInfo(columnData) {
        return `
            <div class="property-section">
                <div class="section-header">
                    <h4>Foreign Key Details</h4>
                </div>
                <div class="property-group">
                    <label>References:</label>
                    <div class="property-value">${columnData.referencesTable || 'Unknown'}.${columnData.referencesColumn || 'Unknown'}</div>
                </div>
            </div>
        `;
    }

    renderNotesList(data) {
        const notes = data.userNotes || [];
        if (notes.length === 0) {
            return '<div class="empty-state">No notes added</div>';
        }
        
        return notes.map((note, index) => `
            <div class="note-item" data-note-index="${index}">
                <div class="note-content">${note.content}</div>
                <div class="note-meta">
                    <span class="note-date">${new Date(note.date).toLocaleDateString()}</span>
                    <button class="btn btn-sm btn-danger" onclick="this.deleteNote(${index})">Delete</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Panel visibility methods
     */
    show() {
        if (this.panelElement) {
            this.panelElement.classList.add('visible');
            this.isVisible = true;
        }
    }

    hide() {
        if (this.panelElement) {
            this.panelElement.classList.remove('visible');
            this.isVisible = false;
        }
    }

    togglePin() {
        if (this.panelElement) {
            this.panelElement.classList.toggle('pinned');
        }
    }

    updateContent(content) {
        if (this.contentElement) {
            this.contentElement.innerHTML = content;
            this.setupContentEventListeners();
        }
    }

    /**
     * Setup event listeners for content
     */
    setupContentEventListeners() {
        // Setup editable fields
        const editableElements = this.contentElement.querySelectorAll('.property-value.editable');
        editableElements.forEach(element => {
            element.addEventListener('click', () => this.makeEditable(element));
            element.addEventListener('blur', () => this.saveEdit(element));
        });

        // Setup form controls
        const formControls = this.contentElement.querySelectorAll('select, input[type="checkbox"], input[type="color"]');
        formControls.forEach(control => {
            control.addEventListener('change', () => this.handleFormChange(control));
        });
    }

    /**
     * Handle inline editing
     */
    makeEditable(element) {
        const currentValue = element.textContent.trim();
        const field = element.dataset.field;
        const isTextarea = element.classList.contains('textarea');
        
        if (isTextarea) {
            element.innerHTML = `<textarea class="inline-editor">${currentValue}</textarea>`;
        } else {
            element.innerHTML = `<input type="text" class="inline-editor" value="${currentValue}">`;
        }
        
        const editor = element.querySelector('.inline-editor');
        editor.focus();
        editor.select();
    }

    saveEdit(element) {
        const editor = element.querySelector('.inline-editor');
        if (!editor) return;
        
        const newValue = editor.value;
        const field = element.dataset.field;
        
        element.textContent = newValue;
        
        // Save to current selection
        if (this.currentSelection && field) {
            this.currentSelection[field] = newValue;
            this.notifyChange(field, newValue);
        }
    }

    handleFormChange(control) {
        const field = control.dataset.field;
        let value;
        
        if (control.type === 'checkbox') {
            value = control.checked;
        } else {
            value = control.value;
        }
        
        if (this.currentSelection && field) {
            this.currentSelection[field] = value;
            this.notifyChange(field, value);
        }
    }

    notifyChange(field, value) {
        if (this.eventBus) {
            this.eventBus.emit('properties:changed', {
                type: this.currentSelectionType,
                field: field,
                value: value,
                selection: this.currentSelection
            });
        }
    }

    /**
     * Preview methods for hover events
     */
    previewTableInfo(tableData) {
        // Show brief preview without changing main content
        // This could be implemented as a small tooltip or side preview
    }

    previewRelationshipInfo(relationshipData) {
        // Show brief relationship preview
    }
}