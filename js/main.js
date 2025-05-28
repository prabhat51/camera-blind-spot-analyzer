class CameraAnalyzer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.cameras = [];
        this.obstacles = [];
        this.selectedCamera = null;
        this.selectedObstacle = null;
        this.backgroundImage = null;
        this.showCoverage = true;
        this.showBlindSpots = true;
        this.showRays = false;
        this.isPlacingCamera = false;
        this.isPlacingObstacle = false;
        this.currentMode = 'camera';
        this.scale = 1;
        this.cameraIdCounter = 1;
        this.obstacleIdCounter = 1;

        this.initEventListeners();
        this.draw();
    }

    initEventListeners() {
        // File upload
        document.getElementById('imageUpload').addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });

        // Canvas click
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });

        // Mode switching
        document.getElementById('cameraModeBtn').addEventListener('click', () => {
            this.switchMode('camera');
        });

        document.getElementById('obstacleModeBtn').addEventListener('click', () => {
            this.switchMode('obstacle');
        });

        // Place buttons
        document.getElementById('placeCameraBtn').addEventListener('click', () => {
            this.togglePlaceCamera();
        });

        document.getElementById('placeObstacleBtn').addEventListener('click', () => {
            this.togglePlaceObstacle();
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
            document.getElementById('rangeValue').textContent = e.target.value + 'px';
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
            document.getElementById('obstacleWidthValue').textContent = e.target.value + 'px';
        });

        document.getElementById('obstacleHeightSlider').addEventListener('input', (e) => {
            this.updateSelectedObstacle({ height: parseInt(e.target.value) });
            document.getElementById('obstacleHeightValue').textContent = e.target.value + 'px';
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

        // Reset placement modes
        this.isPlacingCamera = false;
        this.isPlacingObstacle = false;
        this.canvas.style.cursor = 'default';
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.backgroundImage = img;
                    this.draw();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / this.scale;
        const y = (event.clientY - rect.top) / this.scale;

        if (this.isPlacingCamera) {
            this.addCamera(x, y);
            this.togglePlaceCamera();
        } else if (this.isPlacingObstacle) {
            this.addObstacle(x, y);
            this.togglePlaceObstacle();
        }
    }

    addCamera(x, y) {
        const camera = {
            id: this.cameraIdCounter++,
            name: `Camera ${this.cameras.length + 1}`,
            x: x,
            y: y,
            angle: 0,
            fov: 90,
            range: 150
        };

        this.cameras.push(camera);
        this.updateCameraList();
        this.draw();
        this.updateStats();
    }

    addObstacle(x, y) {
        const obstacle = {
            id: this.obstacleIdCounter++,
            name: `Obstacle ${this.obstacles.length + 1}`,
            x: x - 20,
            y: y - 20,
            width: 40,
            height: 40
        };

        this.obstacles.push(obstacle);
        this.updateObstacleList();
        this.draw();
        this.updateStats();
    }

    togglePlaceCamera() {
        this.isPlacingCamera = !this.isPlacingCamera;
        const btn = document.getElementById('placeCameraBtn');
        if (this.isPlacingCamera) {
            btn.classList.add('btn-active');
            btn.innerHTML = '<i class="fas fa-times"></i> Cancel';
            this.canvas.style.cursor = 'crosshair';
        } else {
            btn.classList.remove('btn-active');
            btn.innerHTML = '<i class="fas fa-plus"></i> Place Camera';
            this.canvas.style.cursor = 'default';
        }
    }

    togglePlaceObstacle() {
        this.isPlacingObstacle = !this.isPlacingObstacle;
        const btn = document.getElementById('placeObstacleBtn');
        if (this.isPlacingObstacle) {
            btn.classList.add('btn-active');
            btn.innerHTML = '<i class="fas fa-times"></i> Cancel';
            this.canvas.style.cursor = 'crosshair';
        } else {
            btn.classList.remove('btn-active');
            btn.innerHTML = '<i class="fas fa-plus"></i> Place Obstacle';
            this.canvas.style.cursor = 'default';
        }
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
        this.scale = value;
        this.canvas.style.transform = `scale(${this.scale})`;
        this.canvas.style.transformOrigin = 'top left';
        document.getElementById('zoomValue').textContent = Math.round(value * 100) + '%';
    }

    // Line intersection with obstacles
    lineIntersectsObstacle(x1, y1, x2, y2) {
        for (let obstacle of this.obstacles) {
            if (this.lineIntersectsRect(x1, y1, x2, y2, obstacle.x, obstacle.y, obstacle.width, obstacle.height)) {
                // Return intersection point
                const intersection = this.getLineRectIntersection(x1, y1, x2, y2, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
                if (intersection) {
                    return intersection;
                }
            }
        }
        return null;
    }

    lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
        // Check if line intersects with rectangle
        return this.lineIntersectsLine(x1, y1, x2, y2, rx, ry, rx + rw, ry) ||
            this.lineIntersectsLine(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) ||
            this.lineIntersectsLine(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh) ||
            this.lineIntersectsLine(x1, y1, x2, y2, rx, ry + rh, rx, ry);
    }

    lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) return false;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    getLineRectIntersection(x1, y1, x2, y2, rx, ry, rw, rh) {
        const intersections = [];

        // Check each edge of rectangle
        const edges = [
            [rx, ry, rx + rw, ry],           // top
            [rx + rw, ry, rx + rw, ry + rh], // right
            [rx + rw, ry + rh, rx, ry + rh], // bottom
            [rx, ry + rh, rx, ry]            // left
        ];

        for (let edge of edges) {
            const intersection = this.getLineIntersection(x1, y1, x2, y2, edge[0], edge[1], edge[2], edge[3]);
            if (intersection) {
                intersections.push(intersection);
            }
        }

        if (intersections.length > 0) {
            // Return closest intersection to starting point
            intersections.sort((a, b) => {
                const distA = Math.sqrt((a.x - x1) ** 2 + (a.y - y1) ** 2);
                const distB = Math.sqrt((b.x - x1) ** 2 + (b.y - y1) ** 2);
                return distA - distB;
            });
            return intersections[0];
        }
        return null;
    }

    getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }
        return null;
    }

    getCoveragePoints(camera) {
        const { x, y, angle, fov, range } = camera;
        const points = [];
        const startAngle = (angle - fov / 2) * Math.PI / 180;
        const endAngle = (angle + fov / 2) * Math.PI / 180;

        points.push([x, y]);

        // Cast rays with obstacle detection
        for (let i = 0; i <= 40; i++) {
            const currentAngle = startAngle + (endAngle - startAngle) * (i / 40);
            const endX = x + Math.cos(currentAngle) * range;
            const endY = y + Math.sin(currentAngle) * range;

            // Check for obstacle intersection
            const intersection = this.lineIntersectsObstacle(x, y, endX, endY);
            if (intersection) {
                points.push([intersection.x, intersection.y]);
            } else {
                points.push([endX, endY]);
            }
        }

        return points;
    }

    isPointCovered(px, py) {
        return this.cameras.some(camera => {
            const { x, y, angle, fov, range } = camera;
            const distance = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
            if (distance > range) return false;

            // Check if point is within field of view
            const angleToPoint = Math.atan2(py - y, px - x) * 180 / Math.PI;
            let angleDiff = Math.abs(angleToPoint - angle);
            if (angleDiff > 180) angleDiff = 360 - angleDiff;
            if (angleDiff > fov / 2) return false;

            // Check if line of sight is blocked by obstacles
            const intersection = this.lineIntersectsObstacle(x, y, px, py);
            return !intersection; // Point is covered if no intersection found
        });
    }

    updateCameraList() {
        const container = document.getElementById('cameras');
        container.innerHTML = '';

        this.cameras.forEach(camera => {
            const div = document.createElement('div');
            div.className = 'camera-item';
            if (this.selectedCamera === camera.id) {
                div.classList.add('selected');
            }

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: bold; color: #333;">${camera.name}</div>
                        <div style="font-size: 12px; color: #666;">
                            Position: (${Math.round(camera.x)}, ${Math.round(camera.y)})
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            Range: ${camera.range}px | FOV: ${camera.fov}°
                        </div>
                    </div>
                    <button onclick="analyzer.deleteCamera(${camera.id})" class="btn btn-danger" style="padding: 8px 10px; margin: 0; font-size: 12px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.selectCamera(camera.id);
                }
            });

            container.appendChild(div);
        });
    }

    updateObstacleList() {
        const container = document.getElementById('obstacles');
        container.innerHTML = '';

        this.obstacles.forEach(obstacle => {
            const div = document.createElement('div');
            div.className = 'obstacle-item';
            if (this.selectedObstacle === obstacle.id) {
                div.classList.add('selected');
            }

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: bold; color: #333;">${obstacle.name}</div>
                        <div style="font-size: 12px; color: #666;">
                            Position: (${Math.round(obstacle.x)}, ${Math.round(obstacle.y)})
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            Size: ${obstacle.width}×${obstacle.height}px
                        </div>
                    </div>
                    <button onclick="analyzer.deleteObstacle(${obstacle.id})" class="btn btn-danger" style="padding: 8px 10px; margin: 0; font-size: 12px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.selectObstacle(obstacle.id);
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
        document.getElementById('rangeValue').textContent = camera.range + 'px';
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
        document.getElementById('obstacleWidthValue').textContent = obstacle.width + 'px';
        document.getElementById('obstacleHeightSlider').value = obstacle.height;
        document.getElementById('obstacleHeightValue').textContent = obstacle.height + 'px';
        document.getElementById('obstacleXPosition').value = Math.round(obstacle.x);
        document.getElementById('obstacleYPosition').value = Math.round(obstacle.y);
    }

    updateSelectedCamera(updates) {
        if (!this.selectedCamera) return;

        const camera = this.cameras.find(c => c.id === this.selectedCamera);
        if (camera) {
            Object.assign(camera, updates);
            this.updateCameraList();
            this.draw();
            this.updateStats();
        }
    }

    updateSelectedObstacle(updates) {
        if (!this.selectedObstacle) return;

        const obstacle = this.obstacles.find(o => o.id === this.selectedObstacle);
        if (obstacle) {
            Object.assign(obstacle, updates);
            this.updateObstacleList();
            this.draw();
            this.updateStats();
        }
    }

    deleteCamera(id) {
        this.cameras = this.cameras.filter(c => c.id !== id);
        if (this.selectedCamera === id) {
            this.selectedCamera = null;
            document.getElementById('cameraSettings').style.display = 'none';
        }
        this.updateCameraList();
        this.draw();
        this.updateStats();
    }

    deleteObstacle(id) {
        this.obstacles = this.obstacles.filter(o => o.id !== id);
        if (this.selectedObstacle === id) {
            this.selectedObstacle = null;
            document.getElementById('obstacleSettings').style.display = 'none';
        }
        this.updateObstacleList();
        this.draw();
        this.updateStats();
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
        document.getElementById('totalCameras').textContent = this.cameras.length;
        document.getElementById('totalObstacles').textContent = this.obstacles.length;

        // Calculate coverage percentage
        const gridSize = 15;
        let totalPoints = 0;
        let coveredPoints = 0;

        for (let x = 0; x < this.canvas.width; x += gridSize) {
            for (let y = 0; y < this.canvas.height; y += gridSize) {
                totalPoints++;
                if (this.isPointCovered(x, y)) {
                    coveredPoints++;
                }
            }
        }

        const coveragePercent = totalPoints > 0 ? Math.round((coveredPoints / totalPoints) * 100) : 0;
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

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image
        if (this.backgroundImage) {
            this.ctx.globalAlpha = 0.7;
            this.ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1.0;
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

        // Draw cameras (top layer)
        this.drawCameras();
    }

    drawBlindSpots() {
        this.ctx.fillStyle = 'rgba(255, 65, 108, 0.5)';
        const gridSize = 10;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            for (let y = 0; y < this.canvas.height; y += gridSize) {
                if (!this.isPointCovered(x, y)) {
                    this.ctx.fillRect(x, y, gridSize, gridSize);
                }
            }
        }
    }

    drawCameraCoverage() {
        this.cameras.forEach((camera, index) => {
            const points = this.getCoveragePoints(camera);

            this.ctx.beginPath();
            this.ctx.moveTo(points[0][0], points[0][1]);
            points.forEach(([x, y]) => this.ctx.lineTo(x, y));
            this.ctx.closePath();

            const hue = (index * 60) % 360;
            this.ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.25)`;
            this.ctx.fill();
            this.ctx.strokeStyle = `hsl(${hue}, 60%, 40%)`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
    }

    drawLightRays() {
        this.cameras.forEach((camera, index) => {
            const { x, y, angle, fov, range } = camera;
            const startAngle = (angle - fov / 2) * Math.PI / 180;
            const endAngle = (angle + fov / 2) * Math.PI / 180;

            // Draw multiple rays
            for (let i = 0; i <= 20; i++) {
                const currentAngle = startAngle + (endAngle - startAngle) * (i / 20);
                const endX = x + Math.cos(currentAngle) * range;
                const endY = y + Math.sin(currentAngle) * range;

                // Check for obstacle intersection
                const intersection = this.lineIntersectsObstacle(x, y, endX, endY);
                const finalX = intersection ? intersection.x : endX;
                const finalY = intersection ? intersection.y : endY;

                // Draw ray with gradient
                const gradient = this.ctx.createLinearGradient(x, y, finalX, finalY);
                gradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 165, 0, 0.2)');

                this.ctx.strokeStyle = gradient;
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(finalX, finalY);
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
            const dirX = x + Math.cos(angle * Math.PI / 180) * 30;
            const dirY = y + Math.sin(angle * Math.PI / 180) * 30;
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
}

// Initialize the analyzer
const analyzer = new CameraAnalyzer();
