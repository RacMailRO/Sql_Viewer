# ERD Generator - Interactive Entity Relationship Diagram Tool

## 🎯 Project Overview

The ERD Generator is a comprehensive, web-based Entity Relationship Diagram visualization tool that transforms database schemas into interactive, professional-grade ERD diagrams. Built with modern web technologies and D3.js, it provides enterprise-level features for database design, analysis, and documentation.

## 🚀 Features

### ✅ **Core Functionality (Implemented)**

#### **Multi-Format Schema Import**
- **JSON Schema**: Complete schema definitions with tables, columns, and relationships
- **SQL DDL**: Parse CREATE TABLE statements from MySQL, PostgreSQL, SQLite
- **CSV Files**: Import table structures from CSV data
- **Text Format**: Simple plain-text schema definitions

#### **Interactive Visualization**
- **Drag & Drop**: Real-time table positioning with connection updates
- **Zoom & Pan**: Smooth viewport navigation with mouse wheel and drag
- **Auto Layout**: Intelligent table positioning with multiple algorithms
- **Grid Snapping**: Optional grid alignment for precise positioning

#### **Professional Relationship Rendering**
- **Crow's Foot Notation**: Industry-standard cardinality symbols
- **Intelligent Routing**: Orthogonal connections that avoid table overlaps
- **Side-Only Connections**: Relationships connect from table sides at column level
- **Enhanced Hover Areas**: 12px invisible zones for easier relationship selection

#### **Advanced Export System**
- **Multiple Formats**: SVG, PDF, JSON, SQL DDL, YAML, Complete ERD State
- **Layout Persistence**: Save/load complete ERD layouts with visual state
- **Auto-save**: Automatic layout saving every 30 seconds
- **High Resolution**: Vector graphics for print-quality output

#### **Enhanced User Interface**
- **Properties Panel**: Detailed information display for selected elements
- **Settings Panel**: Comprehensive configuration options
- **Search & Filter**: Advanced filtering and table isolation capabilities
- **Statistical Analysis**: Deep insights into schema quality and patterns
- **Keyboard Shortcuts**: Professional keyboard navigation

### 🔧 **Advanced Features**

#### **Statistical Analysis Engine**
- **Schema Metrics**: Table count, column count, relationship analysis
- **Quality Assessment**: Naming consistency, normalization level evaluation
- **Connectivity Analysis**: Network topology, centrality scores, hub identification
- **Design Pattern Detection**: Junction tables, inheritance patterns, audit trails
- **Quality Scoring**: Comprehensive 0-100 quality rating with letter grades

#### **Filtering & Isolation System**
- **Quick Filters**: Isolated tables, hub tables, junction tables, large tables
- **Table Isolation**: Select specific tables and view only direct connections
- **Relationship Filtering**: Filter by cardinality types (1:1, 1:M, M:M)
- **Statistical Filters**: Complexity levels, connectivity levels, quality issues
- **Active Filter Management**: Visual filter display with remove capabilities

#### **Settings & Customization**
- **Table Margins**: Configurable spacing (10-200px)
- **Connection Padding**: Adjustable relationship line spacing (5-50px)
- **Grid Configuration**: Customizable grid size with snap-to-grid functionality
- **Visual Themes**: Light, dark, and auto theme selection
- **Connection Styles**: Orthogonal, straight, and curved relationship lines
- **Debug Mode**: Detailed console logging for troubleshooting

## 🏗️ Architecture

### **Technology Stack**
- **Frontend**: HTML5, CSS3, Modern JavaScript (ES2022+)
- **Visualization**: D3.js v7 with SVG rendering
- **Build Tool**: Vite for development and bundling
- **Styling**: CSS Custom Properties with modern CSS features
- **Dependencies**: D3.js, jsPDF, File-saver

### **Project Structure**
```
erd-generator/
├── src/
│   ├── core/                    # Core application logic
│   │   ├── ERDApplication.js    # Main application orchestrator
│   │   ├── EventBus.js         # Event communication system
│   │   ├── SchemaModel.js      # Schema data model
│   │   ├── DiagramState.js     # Diagram state management
│   │   └── LayoutManager.js    # Layout algorithm management
│   ├── parsers/                # Schema format parsers
│   │   ├── JsonParser.js       # JSON schema parser
│   │   ├── SqlParser.js        # SQL DDL parser
│   │   ├── TextParser.js       # Plain text parser
│   │   └── CsvParser.js        # CSV data parser
│   ├── visualization/          # Rendering engines
│   │   ├── ERDRenderer.js      # Main SVG renderer
│   │   └── EnhancedERDRenderer.js # Advanced renderer with intelligence
│   ├── algorithms/             # Layout and routing algorithms
│   │   ├── LayoutAlgorithm.js  # Basic layout algorithms
│   │   └── IntelligentLayoutAlgorithm.js # Advanced positioning
│   ├── analysis/               # Statistical analysis
│   │   └── StatisticalAnalyzer.js # Schema quality analysis
│   ├── export/                 # Export functionality
│   │   ├── ExportManager.js    # Basic export manager
│   │   └── EnhancedExportManager.js # Advanced export features
│   └── ui/                     # User interface components
│       ├── FileImporter.js     # File import handling
│       ├── PropertiesPanel.js  # Element properties display
│       ├── SettingsPanel.js    # Application settings
│       ├── SearchManager.js    # Search functionality
│       ├── FilteringManager.js # Advanced filtering
│       └── EnhancedControls.js # UI control enhancements
├── assets/
│   └── styles/                 # CSS styling
│       ├── main.css           # Main application styles
│       └── components.css     # Component-specific styles
├── sample-data/               # Example schema files
├── index.html                 # Main HTML page
├── main.js                   # Application entry point
└── package.json              # Project configuration
```

### **Event-Driven Architecture**
The application uses a centralized EventBus system for component communication:
- **Schema Events**: Load, validate, update schema data
- **Rendering Events**: Update visualization, handle interactions
- **UI Events**: Panel updates, settings changes, filter operations
- **Export Events**: Generate and download various formats

## 🚧 **Current Status & Issues**

### **⚠️ Critical Issue: Table Drag Behavior**
**Status**: UNRESOLVED - Active debugging in progress

**Problem**: Tables do not follow mouse cursor smoothly during drag operations
- **Symptoms**: Fractional delta values from D3 drag events (`-1.3016357421875`)
- **Impact**: Tables jump or move incorrectly instead of smooth 1:1 mouse tracking
- **Root Cause**: D3.js providing sub-pixel mouse deltas on high-DPI displays

**Recent Attempts**:
1. **Zoom Compensation**: Attempted to compensate for zoom transform scaling
2. **Delta Scaling**: Tried adjusting D3 delta values by zoom factor
3. **Mouse Position Tracking**: Latest attempt using raw mouse coordinates instead of D3 deltas

**Current Implementation**: Mouse tracking approach using `event.sourceEvent.clientX/Y`
```javascript
// Latest approach - direct mouse coordinate tracking
const mouseDeltaX = currentMouseX - startMouseX;
const mouseDeltaY = currentMouseY - startMouseY;
const svgDeltaX = mouseDeltaX / zoomTransform.k;
const svgDeltaY = mouseDeltaY / zoomTransform.k;
```

**Debug Output** (showing the issue):
```
🖱️ DRAG EVENT [MOUSE-TRACKING] - Table: table_name
   Mouse Delta: (-10, 0)
   SVG Delta: (-10, 0)
   New Position: (90, 180)
```

### **✅ Successfully Implemented Features**

#### **Enhanced Export System**
- Multiple export formats working correctly
- Layout persistence and auto-save functional
- High-quality SVG and PDF generation

#### **Statistical Analysis**
- Comprehensive schema quality assessment
- Relationship pattern analysis
- Design pattern detection
- Quality scoring system (0-100 with letter grades)

#### **Advanced Filtering**
- Table isolation by various criteria
- Relationship filtering by cardinality
- Statistical and quality-based filters
- Active filter management UI

#### **Professional UI**
- Settings panel with comprehensive controls
- Properties panel with detailed element information
- Search functionality
- Keyboard shortcuts system

#### **Visual Enhancements**
- Crow's Foot notation for relationships
- Intelligent connection routing
- Enhanced hover effects
- Professional table styling

## 📋 **Remaining Tasks**

### **High Priority**
1. **🔥 Fix Table Drag Behavior** - Critical usability issue
   - Investigate high-DPI display mouse tracking
   - Consider alternative drag implementation approaches
   - Test on different browsers and display configurations

2. **Enhance Layout Algorithms**
   - Minimize relationship line crossings
   - Improve automatic table grouping
   - Implement grid alignment system

3. **Relationship Management**
   - Manual relationship creation/editing
   - Relationship property editing
   - Constraint visualization (ON DELETE/UPDATE)

### **Medium Priority**
1. **Advanced Visual Features**
   - Table grouping with visual boundaries
   - Background color coding for groups
   - Minimap for large diagrams
   - Layer management system

2. **Interactive Enhancements**
   - Relationship path highlighting
   - Advanced tooltips with full constraint details
   - Detail level toggling
   - Breadcrumb navigation

3. **Schema Intelligence**
   - Missing relationship detection
   - ENUM to lookup table suggestions
   - Schema validation with issue highlighting
   - Index and constraint visualization

### **Low Priority**
1. **Collaboration Features**
   - Real-time multi-user editing
   - Comment system for schema elements
   - Version control and change tracking
   - Review and approval workflows

2. **Advanced Export Options**
   - Additional export formats
   - Custom styling options
   - Print layout optimization
   - Presentation mode

3. **Integration Capabilities**
   - Database connection for live schema import
   - API integrations with external tools
   - Plugin system for extensibility

## 🚀 **Getting Started**

### **Prerequisites**
- Node.js 16+ 
- Modern web browser with ES2022+ support
- npm or yarn package manager

### **Installation**
```bash
# Clone the repository
git clone <repository-url>
cd erd-generator

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### **Usage**
1. **Import Schema**: Click "Import Schema" and select a JSON, SQL, CSV, or text file
2. **Auto Layout**: Use "Auto Layout" button for intelligent table positioning
3. **Drag Tables**: Click and drag tables to reposition (Note: currently experiencing issues)
4. **Explore Relationships**: Hover over relationship lines to see details
5. **Use Properties Panel**: Click on tables/relationships to view detailed information
6. **Apply Filters**: Use the filter panel to isolate specific tables or relationships
7. **Export**: Use the export button to generate SVG, PDF, or schema files

### **Keyboard Shortcuts**
- `Ctrl+K` or `Alt+Q`: Open search
- `Alt+F`: Open filters panel
- `Alt+S`: Open settings panel
- `Ctrl+Shift+E`: Export diagram
- `Ctrl+Shift+S`: Save layout
- `Ctrl+Shift+L`: Manage layouts
- `Ctrl+Z`: Undo (when implemented)
- `Ctrl+Y`: Redo (when implemented)

## 🔍 **Debugging**

### **Enable Debug Mode**
Debug logging can be enabled through:
1. Settings panel checkbox
2. Console command: `window.ERD_DEBUG_ENABLED = true`
3. localStorage: `localStorage.setItem('erd_debug_enabled', 'true')`

### **Debug Output**
When debug mode is enabled, detailed console logs show:
- Drag event coordinates and calculations
- Layout algorithm decisions
- Performance metrics
- Error diagnostics

### **Known Issues**
1. **Drag Behavior**: Tables don't follow mouse smoothly (critical)
2. **Performance**: Large schemas (50+ tables) may experience slowdowns
3. **Browser Compatibility**: Some features may not work in older browsers

## 🤝 **Contributing**

The project follows a modular architecture making it easy to:
- Add new parsers for additional file formats
- Implement new layout algorithms
- Create custom export formats
- Enhance UI components

Key areas for contribution:
- Fix the critical drag behavior issue
- Implement missing layout algorithms
- Add new export formats
- Enhance accessibility features
- Improve performance for large schemas

## 📄 **License**

MIT License - see LICENSE file for details

## 🔗 **Related Documentation**

- [ERD_Generator_Development_Plan.md](ERD_Generator_Development_Plan.md) - Comprehensive development plan
- [STATUS.md](STATUS.md) - Feature implementation status
- [ENHANCED_ERD_FEATURES.md](ENHANCED_ERD_FEATURES.md) - Recent feature enhancements
- [d3.md](d3.md) - D3.js implementation notes

---

**Note**: This project is actively developed with regular feature additions and improvements. The drag behavior issue is the current top priority for resolution.