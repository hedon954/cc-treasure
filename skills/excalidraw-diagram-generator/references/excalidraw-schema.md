# Excalidraw JSON Schema Reference

This document describes the structure of Excalidraw `.excalidraw` files for diagram generation.

## Top-Level Structure

```typescript
interface ExcalidrawFile {
  type: "excalidraw";
  version: number;           // Always 2
  source: string;            // "https://excalidraw.com"
  elements: ExcalidrawElement[];
  appState: AppState;
  files: Record<string, any>; // Usually empty {}
}
```

## AppState

```typescript
interface AppState {
  viewBackgroundColor: string; // Hex color, e.g., "#ffffff"
  gridSize: number;            // Typically 20
}
```

## ExcalidrawElement Base Properties

All elements share these common properties:

```typescript
interface BaseElement {
  id: string;                  // Unique identifier
  type: ElementType;           // See Element Types below
  x: number;                   // X coordinate (pixels from top-left)
  y: number;                   // Y coordinate (pixels from top-left)
  width: number;               // Width in pixels
  height: number;              // Height in pixels
  angle: number;               // Rotation angle in radians (usually 0)
  strokeColor: string;         // Hex color, e.g., "#1e1e1e"
  backgroundColor: string;     // Hex color or "transparent"
  fillStyle: "solid" | "hachure" | "cross-hatch";
  strokeWidth: number;         // 1-4 typically
  strokeStyle: "solid" | "dashed" | "dotted";
  roughness: number;           // 0-2, controls hand-drawn effect (1 = default)
  opacity: number;             // 0-100
  groupIds: string[];          // IDs of groups this element belongs to
  frameId: null;               // Usually null
  index: string;               // Stacking order identifier
  roundness: Roundness | null;
  seed: number;                // Random seed for deterministic rendering
  version: number;             // Element version (increment on edit)
  versionNonce: number;        // Random number changed on edit
  isDeleted: boolean;          // Should be false
  boundElements: any;          // Usually null
  updated: number;             // Timestamp in milliseconds
  link: null;                  // External link (usually null)
  locked: boolean;             // Whether element is locked
}
```

## Element Types

### Rectangle

```typescript
interface RectangleElement extends BaseElement {
  type: "rectangle";
  roundness: { type: 3 };      // 3 = rounded corners
}
```

> Shapes no longer carry text fields. Use a separate `text` element with `containerId` instead (see [Recommended Labeling Strategy](#recommended-labeling-strategy)).

**Example (rectangle + bound text element):**
```json
[
  {
    "id": "rect1",
    "type": "rectangle",
    "x": 100,
    "y": 100,
    "width": 200,
    "height": 100,
    "strokeColor": "#1e1e1e",
    "backgroundColor": "#a5d8ff",
    "roundness": { "type": 3 },
    "boundElements": [{ "id": "rect1-text", "type": "text" }]
  },
  {
    "id": "rect1-text",
    "type": "text",
    "x": 130,
    "y": 130,
    "width": 140,
    "height": 40,
    "containerId": "rect1",
    "text": "My Box",
    "fontSize": 20,
    "fontFamily": 5,
    "textAlign": "center",
    "verticalAlign": "middle"
  }
]
```

### Ellipse

```typescript
interface EllipseElement extends BaseElement {
  type: "ellipse";
}
```

### Diamond

```typescript
interface DiamondElement extends BaseElement {
  type: "diamond";
}
```

### Arrow

```typescript
interface ArrowElement extends BaseElement {
  type: "arrow";
  points: [number, number][];  // Array of [x, y] coordinates relative to element
  startBinding: Binding | null;
  endBinding: Binding | null;
  roundness: { type: 2 };      // 2 = curved arrow
}
```

**Example:**
```json
{
  "id": "arrow1",
  "type": "arrow",
  "x": 100,
  "y": 100,
  "width": 200,
  "height": 0,
  "points": [
    [0, 0],
    [200, 0]
  ],
  "roundness": { "type": 2 },
  "startBinding": null,
  "endBinding": null
}
```

**Points explanation:**
- First point `[0, 0]` is relative to `(x, y)`
- Subsequent points are relative to the first point
- For straight horizontal arrow: `[[0, 0], [width, 0]]`
- For straight vertical arrow: `[[0, 0], [0, height]]`

### Line

```typescript
interface LineElement extends BaseElement {
  type: "line";
  points: [number, number][];
  startBinding: Binding | null;
  endBinding: Binding | null;
  roundness: { type: 2 } | null;
}
```

### Text

```typescript
interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: number;          // Prefer 5 = Excalifont for stable document exports
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  roundness: null;             // Text has no roundness
}
```

**Example:**
```json
{
  "id": "text1",
  "type": "text",
  "x": 100,
  "y": 100,
  "width": 150,
  "height": 25,
  "text": "Hello World",
  "fontSize": 20,
  "fontFamily": 5,
  "textAlign": "left",
  "verticalAlign": "top",
  "roundness": null
}
```

**Width/Height calculation:**
- Width ≈ `text.length * fontSize * 0.6`
- Height ≈ `fontSize * 1.2 * numberOfLines`

## Recommended Labeling Strategy

For stable exports, especially when using `export-to-png.mjs`, prefer this structure:

1. Draw the node shape (`rectangle`, `ellipse`, `diamond`) without inline text.
2. Add a separate `text` element bound via `containerId`.
3. Use `fontFamily: 5` for all `text` elements.

This is more reliable than embedding labels directly in shape elements.

## Bindings

Bindings connect arrows to shapes:

```typescript
interface Binding {
  elementId: string;           // ID of bound element
  focus: number;               // -1 to 1, position along edge
  gap: number;                 // Distance from element edge
}
```

## Common Colors

| Color Name | Hex Code | Use Case |
|------------|----------|----------|
| Black | `#1e1e1e` | Default stroke |
| Light Blue | `#a5d8ff` | Primary entities |
| Light Green | `#b2f2bb` | Process steps |
| Yellow | `#ffd43b` | Important/Central |
| Light Red | `#ffc9c9` | Warnings/Errors |
| Cyan | `#96f2d7` | Secondary items |
| Transparent | `transparent` | No fill |
| White | `#ffffff` | Background |

## ID Generation

IDs should be unique strings. Common patterns:

```javascript
// Timestamp-based
const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

// Sequential
const id = "element-" + counter++;

// Descriptive
const id = "step-1", "entity-user", "arrow-1-to-2";
```

## Seed Generation

Seeds are used for deterministic randomness in hand-drawn effect:

```javascript
const seed = Math.floor(Math.random() * 2147483647);
```

## Version and VersionNonce

```javascript
const version = 1;  // Increment when element is edited
const versionNonce = Math.floor(Math.random() * 2147483647);
```

## Coordinate System

- Origin `(0, 0)` is top-left corner
- X increases to the right
- Y increases downward
- All units are in pixels

## Recommended Spacing

| Context | Spacing |
|---------|---------|
| Horizontal gap between elements | 200-300px |
| Vertical gap between rows | 100-150px |
| Minimum margin from edge | 50px |
| Arrow-to-box clearance | 20-30px |

## Font Families

| ID | Name | Description |
|----|------|-------------|
| 1 | Virgil | Hand-drawn style |
| 2 | Helvetica | Clean sans-serif |
| 3 | Cascadia | Monospace |
| 5 | Excalifont | Recommended default for stable exports |

## Validation Rules

✅ **Required:**
- All IDs must be unique
- `type` must match actual element type
- `version` must be an integer ≥ 1
- `opacity` must be 0-100

⚠️ **Recommended:**
- Keep `roughness` at 1 for consistency
- Use `strokeWidth` of 2 for clarity
- Set `isDeleted` to `false`
- Set `locked` to `false`
- Keep `frameId`, `boundElements`, `link` as `null`

## Complete Minimal Example

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "box1",
      "type": "rectangle",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 100,
      "angle": 0,
      "strokeColor": "#1e1e1e",
      "backgroundColor": "#a5d8ff",
      "fillStyle": "solid",
      "strokeWidth": 2,
      "strokeStyle": "solid",
      "roughness": 1,
      "opacity": 100,
      "groupIds": [],
      "frameId": null,
      "index": "a0",
      "roundness": { "type": 3 },
      "seed": 1234567890,
      "version": 1,
      "versionNonce": 987654321,
      "isDeleted": false,
      "boundElements": [{ "id": "box1-text", "type": "text" }],
      "updated": 1706659200000,
      "link": null,
      "locked": false
    },
    {
      "id": "box1-text",
      "type": "text",
      "x": 160,
      "y": 138,
      "width": 80,
      "height": 24,
      "containerId": "box1",
      "angle": 0,
      "strokeColor": "#1e1e1e",
      "backgroundColor": "transparent",
      "fillStyle": "solid",
      "strokeWidth": 2,
      "strokeStyle": "solid",
      "roughness": 1,
      "opacity": 100,
      "groupIds": [],
      "frameId": null,
      "index": "a0G",
      "roundness": null,
      "seed": 1234567891,
      "version": 1,
      "versionNonce": 987654322,
      "isDeleted": false,
      "boundElements": null,
      "updated": 1706659200000,
      "link": null,
      "locked": false,
      "text": "Hello",
      "fontSize": 20,
      "fontFamily": 5,
      "textAlign": "center",
      "verticalAlign": "middle"
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": 20
  },
  "files": {}
}
```
