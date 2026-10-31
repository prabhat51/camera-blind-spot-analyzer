# Camera Blind Spot Analyzer

An interactive web tool for visualizing and optimizing security camera placement, coverage, and blind spots. Upload floor plans, place cameras and obstacles, and analyze real-time coverage analytics.

## Features

- Upload a floor plan image as the background (aspect ratio preserved)
- Calibrate real-world scale so ranges, sizes and areas are shown in metres
- Draw the area you want to protect; coverage is measured only inside it
- Place configurable cameras (position, angle, FOV, range)
- Add and manage obstacles, which block camera views and are excluded from coverage
- Visualize camera coverage, blind spots, and light rays
- Real-time analytics: coverage %, blind spots, analyzed area, security rating

## Usage

1. Open `index.html` in your browser.
2. **Load Floor Plan** to set the background image.
3. **Set Scale**: click two points a known distance apart (e.g. both ends of a wall) and enter the distance in metres.
4. **Draw Area**: click the corners of the area to protect, then click the first point, double-click or press Enter to finish. Without an area, the floor plan (or the whole canvas) is analyzed.
5. Place cameras and obstacles, then adjust them from the sidebar.
6. Press **Esc** to cancel any tool.

## Project structure

- `js/geometry.js` – pure geometry (ray casting, visibility polygons, angle maths), shared with the tests
- `js/main.js` – app state, UI and canvas rendering
- `tests/` – unit tests for the geometry

## Tests

Requires Node.js 18+:

```
node --test "tests/*.test.js"
```
