// Canvas tools; each has a toolbar button that turns into "Cancel" while active
const TOOLS = {
    camera: {
        buttonId: 'placeCameraBtn',
        label: '<i class="fas fa-plus"></i> Place Camera',
        hint: 'Click on the plan to place a camera. Press Esc to cancel.'
    },
    obstacle: {
        buttonId: 'placeObstacleBtn',
        label: '<i class="fas fa-plus"></i> Place Obstacle',
        hint: 'Click on the plan to place an obstacle. Press Esc to cancel.'
    },
    area: {
        buttonId: 'drawAreaBtn',
        label: '<i class="fas fa-draw-polygon"></i> Draw Area',
        hint: 'Click to add the corners of the area to protect. Click the first point, double-click or press Enter to finish.'
    },
    scale: {
        buttonId: 'setScaleBtn',
        label: '<i class="fas fa-ruler"></i> Set Scale',
        hint: 'Click two points a known distance apart, such as both ends of a wall.'
    }
};

// Size of the sampling grid used for coverage analysis, in canvas pixels
const CELL_SIZE = 10;

// Coverage hues per camera; reds are left out so coverage never looks like a blind spot
const COVERAGE_HUES = [170, 210, 120, 260, 40, 190, 290, 90];

class CameraAnalyzer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.cameras = [];
        this.obstacles = [];
        this.selectedCamera = null;
        this.selectedObstacle = null;
        this.backgroundImage = null;
        this.imageRect = null;
        this.areaPolygon = null;
        this.pixelsPerMeter = null;
        this.showCoverage = true;
        this.showBlindSpots = true;
        this.showRays = false;
        this.tool = null;
        this.draftPoints = [];
        this.pointer = null;
        this.currentMode = 'camera';
        this.scale = 1;
        this.cameraIdCounter = 1;
        this.obstacleIdCounter = 1;
        this.analysis = { polygons: [], blindCells: [], totalCells: 0, coveredCells: 0 };

        this.initEventListeners();
        this.refresh();
    }

    initEventListeners() {
        // File upload
        document.getElementById('imageUpload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        // Canvas interaction
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });

        this.canvas.addEventListener('dblclick', () => {
            if (this.tool === 'area') this.finishArea();
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.tool === 'area' || this.tool === 'scale') {
                this.pointer = this.getCanvasPoint(e);
                this.draw();
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.pointer = null;
            if (this.tool) this.draw();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.tool) {
                this.setTool(null);
            } else if (e.key === 'Enter' && this.tool === 'area') {
                this.finishArea();
            }
        });

        // Mode switching
        document.getElementById('cameraModeBtn').addEventListener('click', () => {
            this.switchMode('camera');
        });

        document.getElementById('obstacleModeBtn').addEventListener('click', () => {
            this.switchMode('obstacle');
        });

        // Tool buttons
        document.getElementById('placeCameraBtn').addEventListener('click', () => {
            this.toggleTool('camera');
        });

        document.getElementById('placeObstacleBtn').addEventListener('click', () => {
            this.toggleTool('obstacle');
        });

        document.getElementById('drawAreaBtn').addEventListener('click', () => {
            this.toggleTool('area');
        });

        document.getElementById('clearAreaBtn').addEventListener('click', () => {
            this.clearArea();
        });

        document.getElementById('setScaleBtn').addEventListener('click', () => {
            this.toggleTool('scale');
        });

        document.getElementById('applyScale').addEventListener('click', () => {
            this.applyScale();
        });

        document.getElementById('scaleDistance').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.applyScale();
        });

        // Toggle buttons
        document.getElementById('toggleCoverage').addEventListener('click', () => {
            this.toggleCoverage();
        });

        document.getElementById('toggleBlindSpots').addEventListener('click', () => {
            this.toggleBlindSpots();
        });

        document.getElementById('toggleRays').addEventListener('click', () => {
            this.toggleRays();
        });

        // Zoom slider
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            this.setZoom(parseFloat(e.target.value));
        });

        // Camera settings
        this.initCameraSettings();
        this.initObstacleSettings();
    }

    initCameraSettings() {
        document.getElementById('cameraName').addEventListener('input', (e) => {
            this.updateSelectedCamera({ name: e.target.value });
        });

        document.getElementById('angleSlider').addEventListener('input', (e) => {
            this.updateSelectedCamera({ angle: parseInt(e.target.value) });
            document.getElementById('angleValue').textContent = e.target.value + '°';
        });

        document.getElementById('fovSlider').addEventListener('input', (e) => {
            this.updateSelectedCamera({ fov: parseInt(e.target.value) });
            document.getElementById('fovValue').textContent = e.target.value + '°';
        });

        document.getElementById('rangeSlider').addEventListener('input', (e) => {
            this.updateSelectedCamera({ range: parseInt(e.target.value) });
            document.getElementById('rangeValue').textContent = this.formatLength(parseInt(e.target.value));
        });

        document.getElementById('xPosition').addEventListener('input', (e) => {
            this.updateSelectedCamera({ x: parseInt(e.target.value) || 0 });
        });

        document.getElementById('yPosition').addEventListener('input', (e) => {
            this.updateSelectedCamera({ y: parseInt(e.target.value) || 0 });
        });

        document.getElementById('deleteCamera').addEventListener('click', () => {
            this.deleteSelectedCamera();
        });
    }

    initObstacleSettings() {
        document.getElementById('obstacleName').addEventListener('input', (e) => {
            this.updateSelectedObstacle({ name: e.target.value });
        });

        document.getElementById('obstacleWidthSlider').addEventListener('input', (e) => {
            this.updateSelectedObstacle({ width: parseInt(e.target.value) });
            document.getElementById('obstacleWidthValue').textContent = this.formatLength(parseInt(e.target.value));
        });

        document.getElementById('obstacleHeightSlider').addEventListener('input', (e) => {
            this.updateSelectedObstacle({ height: parseInt(e.target.value) });
            document.getElementById('obstacleHeightValue').textContent = this.formatLength(parseInt(e.target.value));
        });

        document.getElementById('obstacleXPosition').addEventListener('input', (e) => {
            this.updateSelectedObstacle({ x: parseInt(e.target.value) || 0 });
        });

        document.getElementById('obstacleYPosition').addEventListener('input', (e) => {
            this.updateSelectedObstacle({ y: parseInt(e.target.value) || 0 });
        });

        document.getElementById('deleteObstacle').addEventListener('click', () => {
            this.deleteSelectedObstacle();
        });
    }

    switchMode(mode) {
        this.currentMode = mode;
        document.getElementById('cameraModeBtn').classList.toggle('active', mode === 'camera');
        document.getElementById('obstacleModeBtn').classList.toggle('active', mode === 'obstacle');

        document.getElementById('placeCameraBtn').style.display = mode === 'camera' ? 'inline-flex' : 'none';
        document.getElementById('placeObstacleBtn').style.display = mode === 'obstacle' ? 'inline-flex' : 'none';

        this.setTool(null);
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.backgroundImage = img;
                    this.imageRect = this.fitRect(img.width, img.height);
                    this.refresh();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    // Largest rectangle with the image's aspect ratio that fits the canvas, centred
    fitRect(width, height) {
        const ratio = Math.min(this.canvas.width / width, this.canvas.height / height);
        const fitWidth = width * ratio;
        const fitHeight = height * ratio;
        return {
            x: (this.canvas.width - fitWidth) / 2,
            y: (this.canvas.height - fitHeight) / 2,
            width: fitWidth,
            height: fitHeight
        };
    }

    // Mouse position in canvas pixels, independent of zoom and border
    getCanvasPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = this.canvas.width / this.canvas.clientWidth;
        return {
            x: (event.clientX - rect.left - this.canvas.clientLeft) * ratio,
            y: (event.clientY - rect.top - this.canvas.clientTop) * ratio
        };
    }

    handleCanvasClick(event) {
        const { x, y } = this.getCanvasPoint(event);

        switch (this.tool) {
            case 'camera':
                this.addCamera(x, y);
                this.setTool(null);
                break;
            case 'obstacle':
                this.addObstacle(x, y);
                this.setTool(null);
                break;
            case 'area':
                this.addAreaPoint(x, y);
                break;
            case 'scale':
                this.addScalePoint(x, y);
                break;
        }
    }

    addCamera(x, y) {
        const id = this.cameraIdCounter++;
        const camera = {
            id: id,
            name: `Camera ${id}`,
            x: x,
            y: y,
            angle: 0,
            fov: 90,
            range: 150
        };

        this.cameras.push(camera);
        this.updateCameraList();
        this.refresh();
    }

    addObstacle(x, y) {
        const id = this.obstacleIdCounter++;
        const obstacle = {
            id: id,
            name: `Obstacle ${id}`,
            x: x - 20,
            y: y - 20,
            width: 40,
            height: 40
        };

        this.obstacles.push(obstacle);
        this.updateObstacleList();
        this.refresh();
    }

    toggleTool(tool) {
        this.setTool(this.tool === tool ? null : tool);
    }

    setTool(tool) {
        this.tool = tool;
        this.draftPoints = [];

        for (const [name, { buttonId, label }] of Object.entries(TOOLS)) {
            const btn = document.getElementById(buttonId);
            const active = name === tool;
            btn.classList.toggle('btn-active', active);
            btn.innerHTML = active ? '<i class="fas fa-times"></i> Cancel' : label;
        }

        this.canvas.style.cursor = tool ? 'crosshair' : 'default';
        document.getElementById('scaleForm').style.display = 'none';
        this.setHint(tool ? TOOLS[tool].hint : '');
        this.draw();
    }

    setHint(text) {
        document.getElementById('toolHint').style.display = text ? 'flex' : 'none';
        document.getElementById('toolHintText').textContent = text;
    }

    addAreaPoint(x, y) {
        const points = this.draftPoints;

        // Clicking back on the first point closes the shape
        if (points.length >= 3 && Geometry.distance(x, y, points[0][0], points[0][1]) < 10) {
            this.finishArea();
            return;
        }

        // Ignore the repeated click that comes with a double-click
        const last = points[points.length - 1];
        if (last && Geometry.distance(x, y, last[0], last[1]) < 3) return;

        points.push([x, y]);
        this.draw();
    }

    finishArea() {
        if (this.draftPoints.length < 3) {
            this.setHint('An area needs at least 3 corners. Keep clicking, or press Esc to cancel.');
            return;
        }

        this.areaPolygon = this.draftPoints;
        this.setTool(null);
        this.updateAreaControls();
        this.refresh();
    }

    clearArea() {
        this.areaPolygon = null;
        this.updateAreaControls();
        this.refresh();
    }

    updateAreaControls() {
        document.getElementById('clearAreaBtn').style.display = this.areaPolygon ? 'inline-flex' : 'none';
    }

    addScalePoint(x, y) {
        if (this.draftPoints.length === 2) this.draftPoints = [];
        this.draftPoints.push([x, y]);

        const ready = this.draftPoints.length === 2;
        document.getElementById('scaleForm').style.display = ready ? 'flex' : 'none';
        this.setHint(ready ? 'Enter the real distance between the two points:' : TOOLS.scale.hint);
        if (ready) document.getElementById('scaleDistance').focus();
        this.draw();
    }

    applyScale() {
        const meters = parseFloat(document.getElementById('scaleDistance').value);
        if (this.draftPoints.length !== 2 || !(meters > 0)) return;

        const [[x1, y1], [x2, y2]] = this.draftPoints;
        const pixels = Geometry.distance(x1, y1, x2, y2);
        if (pixels < 5) {
            this.setHint('Those points are too close together. Click two points further apart.');
            return;
        }

        this.pixelsPerMeter = pixels / meters;
        this.setTool(null);
        this.refreshUnits();
    }

    // Re-render everything that displays a length after the scale changes
    refreshUnits() {
        document.getElementById('scaleValue').textContent =
            `Scale: 1 m = ${this.pixelsPerMeter.toFixed(1)} px`;
        this.updateCameraList();
        this.updateObstacleList();
        if (this.selectedCamera) this.showCameraSettings();
        if (this.selectedObstacle) this.showObstacleSettings();
        this.updateStats();
    }

    formatLength(pixels) {
        if (!this.pixelsPerMeter) return `${Math.round(pixels)}px`;
        return `${(pixels / this.pixelsPerMeter).toFixed(1)} m`;
    }

    formatArea(squarePixels) {
        if (!this.pixelsPerMeter) return '— (set scale)';
        return `${(squarePixels / this.pixelsPerMeter ** 2).toFixed(1)} m²`;
    }

    toggleCoverage() {
        this.showCoverage = !this.showCoverage;
        const btn = document.getElementById('toggleCoverage');
        btn.classList.toggle('btn-active');
        this.draw();
    }

    toggleBlindSpots() {
        this.showBlindSpots = !this.showBlindSpots;
        const btn = document.getElementById('toggleBlindSpots');
        btn.classList.toggle('btn-active');
        this.draw();
    }

    toggleRays() {
        this.showRays = !this.showRays;
        const btn = document.getElementById('toggleRays');
        btn.classList.toggle('btn-active');
        this.draw();
    }

    setZoom(value) {
        // Resize the element (not a CSS transform) so the wrapper scrolls when zoomed in
        this.scale = value;
        this.canvas.style.width = `${this.canvas.width * value}px`;
        this.canvas.style.height = `${this.canvas.height * value}px`;
        document.getElementById('zoomValue').textContent = Math.round(value * 100) + '%';
    }

    // The region coverage is measured over: a drawn area, else the floor plan, else the canvas
    getAnalysisArea() {
        if (this.areaPolygon) {
            return { label: 'Custom area', polygon: this.areaPolygon };
        }
        if (this.imageRect) {
            return { label: 'Floor plan', polygon: Geometry.rectCorners(this.imageRect) };
        }
        return {
            label: 'Whole canvas',
            polygon: Geometry.rectCorners({ x: 0, y: 0, width: this.canvas.width, height: this.canvas.height })
        };
    }

    // Sample the analysis area on a grid; the same result drives the overlay and the stats
    analyze() {
        const polygons = this.cameras.map(camera => Geometry.visibilityPolygon(camera, this.obstacles));
        const area = this.getAnalysisArea().polygon;
        const blindCells = [];
        let totalCells = 0;
        let coveredCells = 0;

        for (let x = 0; x < this.canvas.width; x += CELL_SIZE) {
            for (let y = 0; y < this.canvas.height; y += CELL_SIZE) {
                const cx = x + CELL_SIZE / 2;
                const cy = y + CELL_SIZE / 2;

                // Only open floor inside the area counts; obstacles are solid
                if (!Geometry.pointInPolygon(cx, cy, area)) continue;
                if (this.obstacles.some(obstacle => Geometry.pointInRect(cx, cy, obstacle))) continue;

                totalCells++;
                if (this.cameras.some((camera, i) => Geometry.cameraSees(camera, polygons[i], cx, cy))) {
                    coveredCells++;
                } else {
                    blindCells.push([x, y]);
                }
            }
        }

        this.analysis = { polygons, blindCells, totalCells, coveredCells };
    }

    // Recompute coverage and redraw; use after anything that changes the scene
    refresh() {
        this.analyze();
        this.draw();
        this.updateStats();
    }

    updateCameraList() {
        this.renderList('cameras', 'camera-item', this.cameras, this.selectedCamera,
            camera => [
                `Position: (${Math.round(camera.x)}, ${Math.round(camera.y)})`,
                `Range: ${this.formatLength(camera.range)} | FOV: ${camera.fov}°`
            ],
            id => this.selectCamera(id),
            id => this.deleteCamera(id));
    }

    updateObstacleList() {
        this.renderList('obstacles', 'obstacle-item', this.obstacles, this.selectedObstacle,
            obstacle => [
                `Position: (${Math.round(obstacle.x)}, ${Math.round(obstacle.y)})`,
                `Size: ${this.formatLength(obstacle.width)} × ${this.formatLength(obstacle.height)}`
            ],
            id => this.selectObstacle(id),
            id => this.deleteObstacle(id));
    }

    // Builds list items with textContent so user-entered names are never parsed as HTML
    renderList(containerId, className, items, selectedId, describe, onSelect, onDelete) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = className;
            div.classList.toggle('selected', item.id === selectedId);

            const info = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'item-title';
            title.textContent = item.name;
            info.appendChild(title);

            describe(item).forEach(line => {
                const detail = document.createElement('div');
                detail.className = 'item-detail';
                detail.textContent = line;
                info.appendChild(detail);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger btn-icon';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener('click', () => onDelete(item.id));

            const row = document.createElement('div');
            row.className = 'item-row';
            row.append(info, deleteBtn);
            div.appendChild(row);

            div.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    onSelect(item.id);
                }
            });

            container.appendChild(div);
        });
    }

    selectCamera(id) {
        this.selectedCamera = id;
        this.selectedObstacle = null;
        this.updateCameraList();
        this.updateObstacleList();
        this.showCameraSettings();
        this.draw();
    }

    selectObstacle(id) {
        this.selectedObstacle = id;
        this.selectedCamera = null;
        this.updateCameraList();
        this.updateObstacleList();
        this.showObstacleSettings();
        this.draw();
    }

    showCameraSettings() {
        const camera = this.cameras.find(c => c.id === this.selectedCamera);
        if (!camera) return;

        document.getElementById('cameraSettings').style.display = 'block';
        document.getElementById('obstacleSettings').style.display = 'none';

        document.getElementById('cameraName').value = camera.name;
        document.getElementById('angleSlider').value = camera.angle;
        document.getElementById('angleValue').textContent = camera.angle + '°';
        document.getElementById('fovSlider').value = camera.fov;
        document.getElementById('fovValue').textContent = camera.fov + '°';
        document.getElementById('rangeSlider').value = camera.range;
        document.getElementById('rangeValue').textContent = this.formatLength(camera.range);
        document.getElementById('xPosition').value = Math.round(camera.x);
        document.getElementById('yPosition').value = Math.round(camera.y);
    }

    showObstacleSettings() {
        const obstacle = this.obstacles.find(o => o.id === this.selectedObstacle);
        if (!obstacle) return;

        document.getElementById('obstacleSettings').style.display = 'block';
        document.getElementById('cameraSettings').style.display = 'none';

        document.getElementById('obstacleName').value = obstacle.name;
        document.getElementById('obstacleWidthSlider').value = obstacle.width;
        document.getElementById('obstacleWidthValue').textContent = this.formatLength(obstacle.width);
        document.getElementById('obstacleHeightSlider').value = obstacle.height;
        document.getElementById('obstacleHeightValue').textContent = this.formatLength(obstacle.height);
        document.getElementById('obstacleXPosition').value = Math.round(obstacle.x);
        document.getElementById('obstacleYPosition').value = Math.round(obstacle.y);
    }

    updateSelectedCamera(updates) {
        if (!this.selectedCamera) return;

        const camera = this.cameras.find(c => c.id === this.selectedCamera);
        if (camera) {
            Object.assign(camera, updates);
            this.updateCameraList();
            this.refresh();
        }
    }

    updateSelectedObstacle(updates) {
        if (!this.selectedObstacle) return;

        const obstacle = this.obstacles.find(o => o.id === this.selectedObstacle);
        if (obstacle) {
            Object.assign(obstacle, updates);
            this.updateObstacleList();
            this.refresh();
        }
    }

    deleteCamera(id) {
        this.cameras = this.cameras.filter(c => c.id !== id);
        if (this.selectedCamera === id) {
            this.selectedCamera = null;
            document.getElementById('cameraSettings').style.display = 'none';
        }
        this.updateCameraList();
        this.refresh();
    }

    deleteObstacle(id) {
        this.obstacles = this.obstacles.filter(o => o.id !== id);
        if (this.selectedObstacle === id) {
            this.selectedObstacle = null;
            document.getElementById('obstacleSettings').style.display = 'none';
        }
        this.updateObstacleList();
        this.refresh();
    }

    deleteSelectedCamera() {
        if (this.selectedCamera) {
            this.deleteCamera(this.selectedCamera);
        }
    }

    deleteSelectedObstacle() {
        if (this.selectedObstacle) {
            this.deleteObstacle(this.selectedObstacle);
        }
    }

    updateStats() {
        const { totalCells, coveredCells } = this.analysis;

        document.getElementById('totalCameras').textContent = this.cameras.length;
        document.getElementById('totalObstacles').textContent = this.obstacles.length;
        document.getElementById('analysisRegion').textContent = this.getAnalysisArea().label;
        document.getElementById('analyzedArea').textContent = this.formatArea(totalCells * CELL_SIZE ** 2);

        const coveragePercent = totalCells > 0 ? Math.round((coveredCells / totalCells) * 100) : 0;
        const blindSpotPercent = 100 - coveragePercent;

        document.getElementById('coveragePercent').textContent = coveragePercent + '%';
        document.getElementById('blindSpotPercent').textContent = blindSpotPercent + '%';

        // Security rating
        let rating = 'Poor';
        if (coveragePercent >= 90) rating = 'Excellent';
        else if (coveragePercent >= 75) rating = 'Good';
        else if (coveragePercent >= 50) rating = 'Fair';
        else if (coveragePercent >= 25) rating = 'Weak';

        document.getElementById('securityRating').textContent = rating;
    }

    // Render from the cached analysis; cheap enough to call on every mouse move
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image
        if (this.backgroundImage) {
            const { x, y, width, height } = this.imageRect;
            this.ctx.globalAlpha = 0.7;
            this.ctx.drawImage(this.backgroundImage, x, y, width, height);
            this.ctx.globalAlpha = 1.0;
        }

        // Shade everything outside a drawn analysis area
        if (this.areaPolygon) {
            this.drawAnalysisArea();
        }

        // Draw blind spots first (lowest layer)
        if (this.showBlindSpots) {
            this.drawBlindSpots();
        }

        // Draw camera coverage
        if (this.showCoverage) {
            this.drawCameraCoverage();
        }

        // Draw light rays
        if (this.showRays) {
            this.drawLightRays();
        }

        // Draw obstacles
        this.drawObstacles();

        // Draw cameras
        this.drawCameras();

        // Draw in-progress area or scale line (top layer)
        this.drawToolPreview();
    }

    tracePolygon(points) {
        this.ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => this.ctx.lineTo(x, y));
        this.ctx.closePath();
    }

    drawAnalysisArea() {
        const ctx = this.ctx;
        ctx.save();

        ctx.beginPath();
        ctx.rect(0, 0, this.canvas.width, this.canvas.height);
        this.tracePolygon(this.areaPolygon);
        ctx.fillStyle = 'rgba(30, 30, 60, 0.25)';
        ctx.fill('evenodd');

        ctx.beginPath();
        this.tracePolygon(this.areaPolygon);
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#4c51bf';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    drawBlindSpots() {
        this.ctx.fillStyle = 'rgba(255, 65, 108, 0.5)';
        for (const [x, y] of this.analysis.blindCells) {
            this.ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        }
    }

    drawCameraCoverage() {
        this.analysis.polygons.forEach((points, index) => {
            this.ctx.beginPath();
            this.tracePolygon(points);

            const hue = COVERAGE_HUES[index % COVERAGE_HUES.length];
            this.ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.25)`;
            this.ctx.fill();
            this.ctx.strokeStyle = `hsl(${hue}, 60%, 40%)`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
    }

    drawLightRays() {
        this.cameras.forEach(camera => {
            const { x, y, angle, fov, range } = camera;
            const startAngle = angle - fov / 2;

            // Draw multiple rays
            for (let i = 0; i <= 20; i++) {
                const hit = Geometry.castRay(x, y, startAngle + fov * (i / 20), range, this.obstacles);

                // Draw ray with gradient
                const gradient = this.ctx.createLinearGradient(x, y, hit.x, hit.y);
                gradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 165, 0, 0.2)');

                this.ctx.strokeStyle = gradient;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(hit.x, hit.y);
                this.ctx.stroke();
            }
        });
    }

    drawObstacles() {
        this.obstacles.forEach(obstacle => {
            const isSelected = this.selectedObstacle === obstacle.id;

            // Draw obstacle shadow
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            this.ctx.fillRect(obstacle.x + 3, obstacle.y + 3, obstacle.width, obstacle.height);

            // Draw obstacle
            this.ctx.fillStyle = isSelected ? '#CD853F' : '#8B4513';
            this.ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

            // Draw border
            this.ctx.strokeStyle = isSelected ? '#A0522D' : '#654321';
            this.ctx.lineWidth = isSelected ? 3 : 2;
            this.ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

            // Draw obstacle label
            this.ctx.fillStyle = '#333';
            this.ctx.font = 'bold 11px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                obstacle.name,
                obstacle.x + obstacle.width / 2,
                obstacle.y - 5
            );
        });
    }

    drawCameras() {
        this.cameras.forEach(camera => {
            const { x, y, angle } = camera;
            const isSelected = this.selectedCamera === camera.id;

            // Draw camera shadow
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(x + 2, y + 2, 12, 0, 2 * Math.PI);
            this.ctx.fill();

            // Camera body
            this.ctx.fillStyle = isSelected ? '#ff4757' : '#667eea';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 12, 0, 2 * Math.PI);
            this.ctx.fill();

            // Camera border
            this.ctx.strokeStyle = isSelected ? '#ff3742' : '#5a67d8';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();

            // Direction indicator
            this.ctx.strokeStyle = isSelected ? '#ff3742' : '#5a67d8';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            const dirX = x + Math.cos(Geometry.toRadians(angle)) * 30;
            const dirY = y + Math.sin(Geometry.toRadians(angle)) * 30;
            this.ctx.lineTo(dirX, dirY);
            this.ctx.stroke();

            // Camera inner circle
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 6, 0, 2 * Math.PI);
            this.ctx.fill();

            // Camera lens
            this.ctx.fillStyle = '#333';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
            this.ctx.fill();

            // Camera label
            this.ctx.fillStyle = '#333';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(camera.name, x, y - 25);
        });
    }

    drawToolPreview() {
        if (this.tool !== 'area' && this.tool !== 'scale') return;

        // Rubber-band line to the cursor until the shape is complete
        const complete = this.tool === 'scale' && this.draftPoints.length === 2;
        const points = this.pointer && !complete
            ? [...this.draftPoints, [this.pointer.x, this.pointer.y]]
            : this.draftPoints;
        if (points.length === 0) return;

        const ctx = this.ctx;
        const color = this.tool === 'area' ? '#4c51bf' : '#d97706';
        ctx.save();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.stroke();

        // Larger first point shows where to click to close the area
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        this.draftPoints.forEach(([x, y], i) => {
            ctx.beginPath();
            ctx.arc(x, y, i === 0 && this.tool === 'area' ? 7 : 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        if (this.tool === 'scale' && points.length === 2) {
            const [[x1, y1], [x2, y2]] = points;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(Geometry.distance(x1, y1, x2, y2))} px`, (x1 + x2) / 2, (y1 + y2) / 2 - 8);
        }

        ctx.restore();
    }
}

// Initialize the analyzer
const analyzer = new CameraAnalyzer();
