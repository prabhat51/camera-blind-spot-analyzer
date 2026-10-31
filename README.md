# Camera Blind Spot Analyzer

An interactive web tool for visualizing and optimizing security camera placement, coverage, and blind spots. Upload floor plans, place cameras and obstacles, and analyze real-time coverage analytics.

## Features

- Upload a floor plan image or PDF as the background (aspect ratio preserved)
- Calibrate real-world scale so ranges, sizes and areas are shown in metres
- Draw the area you want to protect; coverage is measured only inside it
- Place configurable cameras (position, angle, FOV, range)
- Draw walls, and add obstacles; both block camera views
- Drag cameras, obstacles and walls directly on the plan; rotate cameras and resize obstacles with handles
- Undo/redo, automatic saving in the browser, and project files you can save and reopen
- Visualize camera coverage, blind spots, and light rays
- Real-time analytics: coverage %, blind spots, analyzed area, security rating

## Usage

1. Open `index.html` in your browser.
2. **Load Floor Plan** to set the background (image, or the first page of a PDF; PDFs need an internet connection the first time to load the reader).
3. **Set Scale**: click two points a known distance apart (e.g. both ends of a wall) and enter the distance in metres.
4. **Draw Area**: click the corners of the area to protect, then click the first point, double-click or press Enter to finish. Without an area, the floor plan (or the whole canvas) is analyzed.
5. Choose **Wall** mode and **Draw Walls**: click to start, click to end each wall; walls chain until you double-click or press Enter. Ends snap to nearby walls, and returning to the first corner closes the room.
6. Place cameras and obstacles. Click anything on the plan to select it, then drag to move it. Drag the handle at the tip of a selected camera to rotate it, the corner of a selected obstacle to resize it, or the ends of a selected wall to reshape it.

Your work is saved in the browser automatically. Use **Save** to download a project file (including the floor plan) and **Open** to load one.

### Keyboard shortcuts

| Key | Action |
|---|---|
| Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) | Undo / redo |
| Ctrl+S | Save project file |
| Delete / Backspace | Delete the selected item |
| Shift (while drawing or dragging) | Snap walls to 45° and camera rotation to 15° |
| Enter | Finish the area or wall chain |
| Esc | Cancel the current tool |

## Project structure

- `js/geometry.js` – pure geometry (ray casting, visibility polygons, angle maths), shared with the tests
- `js/main.js` – app state, UI and canvas rendering
- `tests/` – unit tests for the geometry

## Tests

Requires Node.js 18+:

```
node --test "tests/*.test.js"
```
