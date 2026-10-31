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
    wall: {
        buttonId: 'drawWallBtn',
        label: '<i class="fas fa-pen"></i> Draw Walls',
        hint: 'Click to start a wall and click again to end it; walls chain until you double-click or press Enter. Hold Shift for 45° angles.'
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

// Place button shown for each item type in the mode selector
const MODE_BUTTONS = { camera: 'placeCameraBtn', obstacle: 'placeObstacleBtn', wall: 'drawWallBtn' };

// Size of the sampling grid used for coverage analysis, in canvas pixels
const CELL_SIZE = 10;

// Coverage hues per camera; reds are left out so coverage never looks like a blind spot
const COVERAGE_HUES = [170, 210, 120, 260, 40, 190, 290, 90];

// How close (in canvas pixels) the pointer must be to grab a handle or snap to a wall end
const HANDLE_RADIUS = 8;
const SNAP_DISTANCE = 10;

const OBSTACLE_MIN_SIZE = 20;
const OBSTACLE_MAX_SIZE = 400;

const HISTORY_LIMIT = 100;

// Browser storage keys; the floor plan is stored separately because it can be large
const STORAGE_KEY = 'camera-blind-spot-analyzer:project';
const BACKGROUND_STORAGE_KEY = 'camera-blind-spot-analyzer:background';

// pdf.js is only loaded when someone opens a PDF floor plan
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class CameraAnalyzer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.cameras = [];
        this.obstacles = [];
        this.walls = [];
        this.selectedCamera = null;
        this.selectedObstacle = null;
        this.selectedWall = null;
        this.backgroundSrc = null;
        this.backgroundImage = null;
        this.imageRect = null;
        this.areaPolygon = null;
        this.pixelsPerMeter = null;
        this.showCoverage = true;
        this.showBlindSpots = true;
        this.showRays = false;
        this.tool = null;
        this.draftPoints = [];
        this.wallChainStart = null;
        this.pointer = null;
        this.drag = null;
        this.refreshPending = false;
        this.currentMode = 'camera';
        this.scale = 1;
        this.cameraIdCounter = 1;
        this.obstacleIdCounter = 1;
        this.wallIdCounter = 1;
        this.history = [];
        this.historyIndex = -1;
        this.savedBackground = null;
        this.analysis = { polygons: [], segments: [], blindCells: [], totalCells: 0, coveredCells: 0 };

        this.initEventListeners();
        const restored = this.restoreFromStorage();
        this.commit();
        this.refresh();
        if (restored) this.notify('Restored your last project.');
    }

    initEventListeners() {
        // Project and floor plan files
        document.getElementById('imageUpload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        document.getElementById('projectUpload').addEventListener('change', (e) => {
            this.handleProjectUpload(e);
        });

        document.getElementById('newProjectBtn').addEventListener('click', () => {
            this.newProject();
        });

        document.getElementById('saveProjectBtn').addEventListener('click', () => {
            this.exportProject();
        });

        document.getElementById('undoBtn').addEventListener('click', () => {
            this.undo();
        });

        document.getElementById('redoBtn').addEventListener('click', () => {
            this.redo();
        });

        // Canvas interaction
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });

        this.canvas.addEventListener('dblclick', () => {
            if (this.tool === 'area') this.finishArea();
            else if (this.tool === 'wall') this.setTool(null);
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.handleMouseDown(e);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            this.handleCanvasHover(e);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.pointer = null;
            if (this.tool) this.draw();
        });

        // Drags continue even if the pointer leaves the canvas
        window.addEventListener('mousemove', (e) => {
            if (this.drag) this.handleDragMove(e);
        });

        window.addEventListener('mouseup', () => {
            this.endDrag();
        });

        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });

        // Mode switching
        document.getElementById('cameraModeBtn').addEventListener('click', () => {
            this.switchMode('camera');
        });

        document.getElementById('obstacleModeBtn').addEventListener('click', () => {
            this.switchMode('obstacle');
        });

        document.getElementById('wallModeBtn').addEventListener('click', () => {
            this.switchMode('wall');
        });

        // Tool buttons
        for (const tool of Object.keys(TOOLS)) {
            document.getElementById(TOOLS[tool].buttonId).addEventListener('click', () => {
                this.toggleTool(tool);
            });
        }

        document.getElementById('clearAreaBtn').addEventListener('click', () => {
            this.clearArea();
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

        // Settings panels
        this.initCameraSettings();
        this.initObstacleSettings();

        document.getElementById('deleteWall').addEventListener('click', () => {
            this.deleteSelectedWall();
        });

        // Settings update live while editing; one undo step is recorded when an edit is done
        document.querySelectorAll('#cameraSettings input, #obstacleSettings input').forEach(input => {
            input.addEventListener('change', () => this.commit());
        });
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

    handleKeyDown(e) {
        if (e.key === 'Escape' && this.tool) {
            this.setTool(null);
            return;
        }
        if (e.key === 'Enter' && this.tool === 'area') {
            this.finishArea();
            return;
        }
        if (e.key === 'Enter' && this.tool === 'wall') {
            this.setTool(null);
            return;
        }

        // Leave typing shortcuts (including text undo) to the browser inside form fields
        if (e.target.closest && e.target.closest('input, textarea, select')) return;

        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        if (mod && key === 'z') {
            e.preventDefault();
            if (e.shiftKey) this.redo();
            else this.undo();
        } else if (mod && key === 'y') {
            e.preventDefault();
            this.redo();
        } else if (mod && key === 's') {
            e.preventDefault();
            this.exportProject();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            this.deleteSelected();
        }
    }

    switchMode(mode) {
        this.currentMode = mode;
        for (const [name, buttonId] of Object.entries(MODE_BUTTONS)) {
            document.getElementById(`${name}ModeBtn`).classList.toggle('active', name === mode);
            document.getElementById(buttonId).style.display = name === mode ? 'inline-flex' : 'none';
        }

        this.setTool(null);
    }

    // ---- Floor plan and project files ----

    async handleImageUpload(event) {
        const file = event.target.files[0];
        event.target.value = ''; // allow choosing the same file again
        if (!file) return;

        try {
            const src = file.type === 'application/pdf'
                ? await this.pdfToImage(file)
                : await this.readFile(file, 'dataURL');
            await this.setBackground(src);
            this.commit();
        } catch (err) {
            this.notify(err.message || 'Could not load that file.');
        }
    }

    readFile(file, as) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read that file.'));
            if (as === 'dataURL') reader.readAsDataURL(file);
            else reader.readAsText(file);
        });
    }

    loadPdfJs() {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);

        if (!this.pdfJsPromise) {
            this.pdfJsPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = PDFJS_URL;
                script.onload = () => {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
                    resolve(window.pdfjsLib);
                };
                script.onerror = () => {
                    this.pdfJsPromise = null;
                    reject(new Error('Could not load the PDF reader. Check your internet connection.'));
                };
                document.head.appendChild(script);
            });
        }
        return this.pdfJsPromise;
    }

    // Renders the first page of a PDF to a PNG data URL
    async pdfToImage(file) {
        this.notify('Reading PDF…');
        const pdfjsLib = await this.loadPdfJs();
        let pdf;
        try {
            pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        } catch {
            throw new Error('That PDF could not be opened.');
        }

        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });

        // Render at about twice the canvas size so lines stay crisp when zoomed in
        const scale = 2 * Math.max(this.canvas.width, this.canvas.height) / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (pdf.numPages > 1) this.notify(`Loaded page 1 of ${pdf.numPages}.`);
        return canvas.toDataURL('image/png');
    }

    // Sets (or clears) the floor plan; resolves once the image is ready to draw
    setBackground(src) {
        this.backgroundSrc = src;
        if (!src) {
            this.backgroundImage = null;
            this.imageRect = null;
            this.refresh();
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // A newer floor plan may have been chosen while this one loaded
                if (this.backgroundSrc !== src) return resolve();
                this.backgroundImage = img;
                this.imageRect = this.fitRect(img.width, img.height);
                this.refresh();
                resolve();
            };
            img.onerror = () => {
                if (this.backgroundSrc === src) this.backgroundSrc = null;
                reject(new Error("That file isn't an image that can be used as a floor plan."));
            };
            img.src = src;
        });
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

    serializeScene() {
        return {
            cameras: this.cameras,
            obstacles: this.obstacles,
            walls: this.walls,
            areaPolygon: this.areaPolygon,
            pixelsPerMeter: this.pixelsPerMeter,
            cameraIdCounter: this.cameraIdCounter,
            obstacleIdCounter: this.obstacleIdCounter,
            wallIdCounter: this.wallIdCounter
        };
    }

    // Accepts scene data from storage or an imported file and keeps only valid, typed fields
    normalizeScene(data) {
        const scene = data && typeof data === 'object' ? data : {};
        const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
        const items = value => (Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : []);

        const cameras = items(scene.cameras).map((c, i) => ({
            id: i + 1,
            name: String(c.name ?? `Camera ${i + 1}`),
            x: num(c.x, 0),
            y: num(c.y, 0),
            angle: num(c.angle, 0),
            fov: num(c.fov, 90),
            range: num(c.range, 150)
        }));
        const obstacles = items(scene.obstacles).map((o, i) => ({
            id: i + 1,
            name: String(o.name ?? `Obstacle ${i + 1}`),
            x: num(o.x, 0),
            y: num(o.y, 0),
            width: num(o.width, 40),
            height: num(o.height, 40)
        }));
        const walls = items(scene.walls).map((w, i) => ({
            id: i + 1,
            x1: num(w.x1, 0),
            y1: num(w.y1, 0),
            x2: num(w.x2, 0),
            y2: num(w.y2, 0)
        }));

        const areaPolygon = Array.isArray(scene.areaPolygon) && scene.areaPolygon.length >= 3
            ? scene.areaPolygon.map(point => [num(point?.[0], 0), num(point?.[1], 0)])
            : null;
        const pixelsPerMeter = num(scene.pixelsPerMeter, 0) > 0 ? Number(scene.pixelsPerMeter) : null;

        // Ids are renumbered (files may have missing or duplicate ids); counters stay
        // ahead of them so new items get unique names
        const nextId = (list, counter) => Math.max(num(counter, 1), list.length + 1);

        return {
            cameras,
            obstacles,
            walls,
            areaPolygon,
            pixelsPerMeter,
            cameraIdCounter: nextId(cameras, scene.cameraIdCounter),
            obstacleIdCounter: nextId(obstacles, scene.obstacleIdCounter),
            wallIdCounter: nextId(walls, scene.wallIdCounter)
        };
    }

    applyScene(scene) {
        this.cameras = scene.cameras;
        this.obstacles = scene.obstacles;
        this.walls = scene.walls;
        this.areaPolygon = scene.areaPolygon;
        this.pixelsPerMeter = scene.pixelsPerMeter;
        this.cameraIdCounter = scene.cameraIdCounter;
        this.obstacleIdCounter = scene.obstacleIdCounter;
        this.wallIdCounter = scene.wallIdCounter;

        // Keep the selection only if the item still exists
        if (!this.cameras.some(c => c.id === this.selectedCamera)) this.selectedCamera = null;
        if (!this.obstacles.some(o => o.id === this.selectedObstacle)) this.selectedObstacle = null;
        if (!this.walls.some(w => w.id === this.selectedWall)) this.selectedWall = null;

        this.updateCameraList();
        this.updateObstacleList();
        this.updateAreaControls();
        this.updateScaleLabel();
        this.refreshSelectionPanel();
        this.refresh();
    }

    newProject() {
        this.setTool(null);
        this.applyScene(this.normalizeScene({}));
        this.setBackground(null);
        this.commit();
        this.notify('Started a new project. Press Ctrl+Z to undo.');
    }

    exportProject() {
        const data = {
            app: 'camera-blind-spot-analyzer',
            version: 1,
            scene: this.serializeScene(),
            background: this.backgroundSrc
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'camera-plan.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async handleProjectUpload(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;

        try {
            let data;
            try {
                data = JSON.parse(await this.readFile(file, 'text'));
            } catch {
                throw new Error("That file isn't a saved project.");
            }
            if (!data || typeof data.scene !== 'object') throw new Error("That file isn't a saved project.");

            this.setTool(null);
            this.applyScene(this.normalizeScene(data.scene));
            const background = typeof data.background === 'string' && data.background.startsWith('data:image/')
                ? data.background
                : null;
            await this.setBackground(background);
            this.commit();
            this.notify(`Opened ${file.name}.`);
        } catch (err) {
            this.notify(err.message || 'Could not open that project.');
        }
    }

    restoreFromStorage() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || !saved.scene) return false;

            this.applyScene(this.normalizeScene(saved.scene));
            const background = localStorage.getItem(BACKGROUND_STORAGE_KEY);
            if (background) {
                this.savedBackground = background;
                this.setBackground(background).catch(() => {});
            }
            return true;
        } catch {
            return false;
        }
    }

    // Storage can be full, blocked or unavailable; the app keeps working without it
    autosave() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, scene: this.serializeScene() }));
        } catch {
            return;
        }

        if (this.savedBackground === this.backgroundSrc) return;
        this.savedBackground = this.backgroundSrc;
        try {
            if (this.backgroundSrc) localStorage.setItem(BACKGROUND_STORAGE_KEY, this.backgroundSrc);
            else localStorage.removeItem(BACKGROUND_STORAGE_KEY);
        } catch {
            try { localStorage.removeItem(BACKGROUND_STORAGE_KEY); } catch {}
            this.notify('This floor plan is too large to keep in the browser. Use Save to keep it with your project.');
        }
    }

    // ---- Undo / redo ----

    snapshot() {
        return { scene: JSON.stringify(this.serializeScene()), background: this.backgroundSrc };
    }

    // Records the current state as one undo step (no-op if nothing changed) and autosaves
    commit() {
        const entry = this.snapshot();
        const current = this.history[this.historyIndex];
        if (current && current.scene === entry.scene && current.background === entry.background) return;

        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(entry);
        if (this.history.length > HISTORY_LIMIT) this.history.shift();
        this.historyIndex = this.history.length - 1;

        this.updateHistoryButtons();
        this.autosave();
    }

    undo() {
        if (this.historyIndex <= 0) return;
        this.historyIndex--;
        this.restoreHistoryEntry(this.history[this.historyIndex]);
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.historyIndex++;
        this.restoreHistoryEntry(this.history[this.historyIndex]);
    }

    restoreHistoryEntry(entry) {
        this.setTool(null);
        this.applyScene(JSON.parse(entry.scene));
        if (entry.background !== this.backgroundSrc) {
            this.setBackground(entry.background).catch(() => {});
        }
        this.updateHistoryButtons();
        this.autosave();
    }

    updateHistoryButtons() {
        document.getElementById('undoBtn').disabled = this.historyIndex <= 0;
        document.getElementById('redoBtn').disabled = this.historyIndex >= this.history.length - 1;
    }

    // ---- Canvas interaction ----

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
            case 'wall':
                this.addWallPoint(x, y, event.shiftKey);
                break;
            case 'area':
                this.addAreaPoint(x, y);
                break;
            case 'scale':
                this.addScalePoint(x, y);
                break;
        }
    }

    handleCanvasHover(event) {
        if (this.drag) return;
        const point = this.getCanvasPoint(event);

        if (this.tool === 'wall') {
            const last = this.draftPoints[this.draftPoints.length - 1];
            this.pointer = this.snapPoint(point.x, point.y, {
                from: last ? { x: last[0], y: last[1] } : null,
                shift: event.shiftKey
            });
            this.draw();
        } else if (this.tool === 'area' || this.tool === 'scale') {
            this.pointer = point;
            this.draw();
        } else if (!this.tool) {
            const hit = this.hitTest(point.x, point.y);
            const cursors = { rotate: 'grab', resize: 'nwse-resize', start: 'crosshair', end: 'crosshair', move: 'move' };
            this.canvas.style.cursor = hit ? cursors[hit.part] : 'default';
        }
    }

    // Topmost item under the point, matching draw order (cameras > walls > obstacles)
    hitTest(x, y) {
        const camera = this.cameras.find(c => c.id === this.selectedCamera);
        if (camera) {
            const handle = this.rotationHandle(camera);
            if (Geometry.distance(x, y, handle.x, handle.y) <= HANDLE_RADIUS) {
                return { type: 'camera', id: camera.id, part: 'rotate' };
            }
        }

        const wall = this.walls.find(w => w.id === this.selectedWall);
        if (wall) {
            if (Geometry.distance(x, y, wall.x1, wall.y1) <= HANDLE_RADIUS) return { type: 'wall', id: wall.id, part: 'start' };
            if (Geometry.distance(x, y, wall.x2, wall.y2) <= HANDLE_RADIUS) return { type: 'wall', id: wall.id, part: 'end' };
        }

        const obstacle = this.obstacles.find(o => o.id === this.selectedObstacle);
        if (obstacle) {
            const corner = { x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height };
            if (Geometry.distance(x, y, corner.x, corner.y) <= HANDLE_RADIUS) {
                return { type: 'obstacle', id: obstacle.id, part: 'resize' };
            }
        }

        const hitCamera = [...this.cameras].reverse().find(c => Geometry.distance(x, y, c.x, c.y) <= 14);
        if (hitCamera) return { type: 'camera', id: hitCamera.id, part: 'move' };

        const hitWall = [...this.walls].reverse().find(w => Geometry.distanceToSegment(x, y, this.wallSegment(w)) <= 6);
        if (hitWall) return { type: 'wall', id: hitWall.id, part: 'move' };

        const hitObstacle = [...this.obstacles].reverse().find(o => Geometry.pointInRect(x, y, o));
        if (hitObstacle) return { type: 'obstacle', id: hitObstacle.id, part: 'move' };

        return null;
    }

    rotationHandle(camera) {
        const rad = Geometry.toRadians(camera.angle);
        return { x: camera.x + Math.cos(rad) * 30, y: camera.y + Math.sin(rad) * 30 };
    }

    findItem(type, id) {
        const lists = { camera: this.cameras, obstacle: this.obstacles, wall: this.walls };
        return lists[type].find(item => item.id === id);
    }

    handleMouseDown(event) {
        if (this.tool || event.button !== 0) return;

        const point = this.getCanvasPoint(event);
        const hit = this.hitTest(point.x, point.y);
        if (!hit) {
            this.deselectAll();
            return;
        }

        event.preventDefault(); // stop the browser selecting text while dragging
        if (hit.type === 'camera') this.selectCamera(hit.id);
        else if (hit.type === 'obstacle') this.selectObstacle(hit.id);
        else this.selectWall(hit.id);

        this.drag = { target: hit, start: point, origin: { ...this.findItem(hit.type, hit.id) }, moved: false };
    }

    handleDragMove(event) {
        const point = this.getCanvasPoint(event);
        const { target, start, origin } = this.drag;

        // Small jitters during a click shouldn't move anything
        if (!this.drag.moved && Geometry.distance(point.x, point.y, start.x, start.y) < 3) return;
        this.drag.moved = true;

        const item = this.findItem(target.type, target.id);
        if (!item) return;
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

        if (target.type === 'camera') {
            if (target.part === 'rotate') {
                let angle = Math.atan2(point.y - item.y, point.x - item.x) * 180 / Math.PI;
                if (event.shiftKey) angle = Math.round(angle / 15) * 15;
                item.angle = Math.round(angle + 360) % 360;
            } else {
                item.x = clamp(origin.x + dx, 0, this.canvas.width);
                item.y = clamp(origin.y + dy, 0, this.canvas.height);
            }
            this.updateCameraList();
            this.showCameraSettings();
        } else if (target.type === 'obstacle') {
            if (target.part === 'resize') {
                item.width = clamp(Math.round(point.x - item.x), OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
                item.height = clamp(Math.round(point.y - item.y), OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
            } else {
                item.x = origin.x + dx;
                item.y = origin.y + dy;
            }
            this.updateObstacleList();
            this.showObstacleSettings();
        } else {
            if (target.part === 'move') {
                item.x1 = origin.x1 + dx;
                item.y1 = origin.y1 + dy;
                item.x2 = origin.x2 + dx;
                item.y2 = origin.y2 + dy;
            } else {
                const isStart = target.part === 'start';
                const fixed = isStart ? { x: item.x2, y: item.y2 } : { x: item.x1, y: item.y1 };
                const p = this.snapPoint(point.x, point.y, { from: fixed, shift: event.shiftKey, ignoreWallId: item.id });
                if (isStart) {
                    item.x1 = p.x;
                    item.y1 = p.y;
                } else {
                    item.x2 = p.x;
                    item.y2 = p.y;
                }
            }
            this.showWallSettings();
        }

        this.scheduleRefresh();
    }

    endDrag() {
        if (!this.drag) return;
        const moved = this.drag.moved;
        this.drag = null;
        if (moved) {
            this.refresh();
            this.commit();
        }
    }

    // Snap to nearby wall ends so rooms close cleanly; Shift locks the angle to 45° steps
    snapPoint(x, y, { from = null, shift = false, ignoreWallId = null } = {}) {
        for (const wall of this.walls) {
            if (wall.id === ignoreWallId) continue;
            for (const [ex, ey] of [[wall.x1, wall.y1], [wall.x2, wall.y2]]) {
                if (Geometry.distance(x, y, ex, ey) <= SNAP_DISTANCE) return { x: ex, y: ey };
            }
        }

        if (shift && from) {
            const step = Math.PI / 4;
            const angle = Math.round(Math.atan2(y - from.y, x - from.x) / step) * step;
            const length = Geometry.distance(x, y, from.x, from.y);
            return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
        }

        return { x, y };
    }

    // Recompute at most once per frame while dragging
    scheduleRefresh() {
        if (this.refreshPending) return;
        this.refreshPending = true;
        requestAnimationFrame(() => {
            this.refreshPending = false;
            this.refresh();
        });
    }

    // ---- Adding items ----

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
        this.commit();
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
        this.commit();
    }

    addWall(x1, y1, x2, y2) {
        this.walls.push({ id: this.wallIdCounter++, x1, y1, x2, y2 });
        this.refresh();
        this.commit();
    }

    addWallPoint(x, y, shift) {
        const last = this.draftPoints[this.draftPoints.length - 1];
        const from = last ? { x: last[0], y: last[1] } : null;
        const point = this.snapPoint(x, y, { from, shift });

        if (!from) {
            this.draftPoints = [[point.x, point.y]];
            this.wallChainStart = point;
            this.draw();
            return;
        }

        // Ignore the repeated click that comes with a double-click
        if (Geometry.distance(point.x, point.y, from.x, from.y) < 3) return;

        this.addWall(from.x, from.y, point.x, point.y);
        this.draftPoints = [[point.x, point.y]];

        // Returning to the first corner closes the room and ends the chain
        if (Geometry.distance(point.x, point.y, this.wallChainStart.x, this.wallChainStart.y) < 0.5) {
            this.setTool(null);
        } else {
            this.draw();
        }
    }

    wallSegment(wall) {
        return [wall.x1, wall.y1, wall.x2, wall.y2];
    }

    toggleTool(tool) {
        this.setTool(this.tool === tool ? null : tool);
    }

    setTool(tool) {
        this.tool = tool;
        this.draftPoints = [];
        this.wallChainStart = null;

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

    // Brief message in the corner for results and errors
    notify(text) {
        const toast = document.getElementById('toast');
        toast.textContent = text;
        toast.classList.add('visible');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('visible'), 4000);
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
        this.commit();
    }

    clearArea() {
        this.areaPolygon = null;
        this.updateAreaControls();
        this.refresh();
        this.commit();
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
        this.commit();
    }

    updateScaleLabel() {
        document.getElementById('scaleValue').textContent = this.pixelsPerMeter
            ? `Scale: 1 m = ${this.pixelsPerMeter.toFixed(1)} px`
            : 'Scale: not set';
    }

    // Re-render everything that displays a length after the scale changes
    refreshUnits() {
        this.updateScaleLabel();
        this.updateCameraList();
        this.updateObstacleList();
        this.refreshSelectionPanel();
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

    // ---- Analysis ----

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
        const segments = [
            ...this.obstacles.flatMap(obstacle => Geometry.rectEdges(obstacle)),
            ...this.walls.map(wall => this.wallSegment(wall))
        ];
        const polygons = this.cameras.map(camera => Geometry.visibilityPolygon(camera, segments));
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

        this.analysis = { polygons, segments, blindCells, totalCells, coveredCells };
    }

    // Recompute coverage and redraw; use after anything that changes the scene
    refresh() {
        this.analyze();
        this.draw();
        this.updateStats();
    }

    // ---- Sidebar ----

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
        this.selectedWall = null;
        this.updateCameraList();
        this.updateObstacleList();
        this.showCameraSettings();
        this.draw();
    }

    selectObstacle(id) {
        this.selectedObstacle = id;
        this.selectedCamera = null;
        this.selectedWall = null;
        this.updateCameraList();
        this.updateObstacleList();
        this.showObstacleSettings();
        this.draw();
    }

    selectWall(id) {
        this.selectedWall = id;
        this.selectedCamera = null;
        this.selectedObstacle = null;
        this.updateCameraList();
        this.updateObstacleList();
        this.showWallSettings();
        this.draw();
    }

    deselectAll() {
        if (!this.selectedCamera && !this.selectedObstacle && !this.selectedWall) return;
        this.selectedCamera = null;
        this.selectedObstacle = null;
        this.selectedWall = null;
        this.updateCameraList();
        this.updateObstacleList();
        this.showPanel(null);
        this.draw();
    }

    showPanel(kind) {
        for (const name of ['camera', 'obstacle', 'wall']) {
            document.getElementById(`${name}Settings`).style.display = name === kind ? 'block' : 'none';
        }
    }

    refreshSelectionPanel() {
        if (this.selectedCamera) this.showCameraSettings();
        else if (this.selectedObstacle) this.showObstacleSettings();
        else if (this.selectedWall) this.showWallSettings();
        else this.showPanel(null);
    }

    showCameraSettings() {
        const camera = this.cameras.find(c => c.id === this.selectedCamera);
        if (!camera) return;

        this.showPanel('camera');

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

        this.showPanel('obstacle');

        document.getElementById('obstacleName').value = obstacle.name;
        document.getElementById('obstacleWidthSlider').value = obstacle.width;
        document.getElementById('obstacleWidthValue').textContent = this.formatLength(obstacle.width);
        document.getElementById('obstacleHeightSlider').value = obstacle.height;
        document.getElementById('obstacleHeightValue').textContent = this.formatLength(obstacle.height);
        document.getElementById('obstacleXPosition').value = Math.round(obstacle.x);
        document.getElementById('obstacleYPosition').value = Math.round(obstacle.y);
    }

    showWallSettings() {
        const wall = this.walls.find(w => w.id === this.selectedWall);
        if (!wall) return;

        this.showPanel('wall');
        document.getElementById('wallLength').textContent =
            this.formatLength(Geometry.distance(wall.x1, wall.y1, wall.x2, wall.y2));
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
            this.showPanel(null);
        }
        this.updateCameraList();
        this.refresh();
        this.commit();
    }

    deleteObstacle(id) {
        this.obstacles = this.obstacles.filter(o => o.id !== id);
        if (this.selectedObstacle === id) {
            this.selectedObstacle = null;
            this.showPanel(null);
        }
        this.updateObstacleList();
        this.refresh();
        this.commit();
    }

    deleteWall(id) {
        this.walls = this.walls.filter(w => w.id !== id);
        if (this.selectedWall === id) {
            this.selectedWall = null;
            this.showPanel(null);
        }
        this.refresh();
        this.commit();
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

    deleteSelectedWall() {
        if (this.selectedWall) {
            this.deleteWall(this.selectedWall);
        }
    }

    deleteSelected() {
        this.deleteSelectedCamera();
        this.deleteSelectedObstacle();
        this.deleteSelectedWall();
    }

    updateStats() {
        const { totalCells, coveredCells } = this.analysis;

        document.getElementById('totalCameras').textContent = this.cameras.length;
        document.getElementById('totalObstacles').textContent = this.obstacles.length;
        document.getElementById('totalWalls').textContent = this.walls.length;
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

    // ---- Drawing ----

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

        // Draw obstacles and walls
        this.drawObstacles();
        this.drawWalls();

        // Draw cameras
        this.drawCameras();

        // Draw in-progress wall, area or scale line (top layer)
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
                const hit = Geometry.castRay(x, y, startAngle + fov * (i / 20), range, this.analysis.segments);

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

    // White circle (or square) with a coloured outline, used for drag handles
    drawHandle(x, y, color, square = false) {
        const ctx = this.ctx;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (square) ctx.rect(x - 5, y - 5, 10, 10);
        else ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
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

            // Resize handle
            if (isSelected) {
                this.drawHandle(obstacle.x + obstacle.width, obstacle.y + obstacle.height, '#A0522D', true);
            }
        });
    }

    drawWalls() {
        const ctx = this.ctx;
        ctx.save();
        ctx.lineCap = 'round';

        this.walls.forEach(wall => {
            const isSelected = this.selectedWall === wall.id;
            ctx.strokeStyle = isSelected ? '#ff4757' : '#2d3748';
            ctx.lineWidth = isSelected ? 6 : 5;
            ctx.beginPath();
            ctx.moveTo(wall.x1, wall.y1);
            ctx.lineTo(wall.x2, wall.y2);
            ctx.stroke();

            // Endpoint handles
            if (isSelected) {
                this.drawHandle(wall.x1, wall.y1, '#ff4757');
                this.drawHandle(wall.x2, wall.y2, '#ff4757');
            }
        });

        ctx.restore();
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
            const handle = this.rotationHandle(camera);
            this.ctx.strokeStyle = isSelected ? '#ff3742' : '#5a67d8';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(handle.x, handle.y);
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

            // Rotation handle at the tip of the direction indicator
            if (isSelected) {
                this.drawHandle(handle.x, handle.y, '#ff3742');
            }
        });
    }

    drawToolPreview() {
        if (!['wall', 'area', 'scale'].includes(this.tool)) return;

        // Rubber-band line to the cursor until the shape is complete
        const complete = this.tool === 'scale' && this.draftPoints.length === 2;
        const points = this.pointer && !complete
            ? [...this.draftPoints, [this.pointer.x, this.pointer.y]]
            : this.draftPoints;
        if (points.length === 0) return;

        const ctx = this.ctx;
        const color = { wall: '#2d3748', area: '#4c51bf', scale: '#d97706' }[this.tool];
        ctx.save();

        ctx.strokeStyle = color;
        ctx.lineWidth = this.tool === 'wall' ? 5 : 2;
        ctx.lineCap = 'round';
        if (this.tool === 'wall') ctx.globalAlpha = 0.5;
        else ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.stroke();

        // Larger first point shows where to click to close the area
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        this.draftPoints.forEach(([x, y], i) => {
            ctx.beginPath();
            ctx.arc(x, y, i === 0 && this.tool === 'area' ? 7 : 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Length of the segment being drawn
        if (this.tool !== 'area' && points.length >= 2) {
            const [x1, y1] = points[points.length - 2];
            const [x2, y2] = points[points.length - 1];
            const length = Geometry.distance(x1, y1, x2, y2);
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(
                this.tool === 'scale' ? `${Math.round(length)} px` : this.formatLength(length),
                (x1 + x2) / 2,
                (y1 + y2) / 2 - 8
            );
        }

        ctx.restore();
    }
}

// Initialize the analyzer
const analyzer = new CameraAnalyzer();
