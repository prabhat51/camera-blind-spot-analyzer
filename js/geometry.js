// Pure geometry helpers shared by the analyzer (browser) and its tests (Node).
// Angles are in degrees, measured clockwise from +x because canvas y points down.
const Geometry = {
    // Offset for the extra rays cast either side of obstacle corners
    EPSILON_DEG: 0.01,

    toRadians(degrees) {
        return degrees * Math.PI / 180;
    },

    distance(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
    },

    // Smallest absolute difference between two angles, in [0, 180]
    angleDifference(a, b) {
        return Math.abs(((a - b) % 360 + 540) % 360 - 180);
    },

    // Intersection of segments P1P2 and P3P4; t is the position along P1P2 (0..1)
    segmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        if (t < 0 || t > 1 || u < 0 || u > 1) return null;

        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t };
    },

    rectCorners({ x, y, width, height }) {
        return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
    },

    rectEdges(rect) {
        const corners = this.rectCorners(rect);
        return corners.map((corner, i) => [...corner, ...corners[(i + 1) % corners.length]]);
    },

    pointInRect(px, py, { x, y, width, height }) {
        return px >= x && px <= x + width && py >= y && py <= y + height;
    },

    pointInPolygon(px, py, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];
            if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    },

    // Point where a ray from (x, y) stops: the nearest obstacle edge, or its full range
    castRay(x, y, angleDeg, range, obstacles) {
        const rad = this.toRadians(angleDeg);
        const endX = x + Math.cos(rad) * range;
        const endY = y + Math.sin(rad) * range;

        let nearest = { x: endX, y: endY, t: 1 };
        for (const obstacle of obstacles) {
            for (const [ax, ay, bx, by] of this.rectEdges(obstacle)) {
                const hit = this.segmentIntersection(x, y, endX, endY, ax, ay, bx, by);
                if (hit && hit.t < nearest.t) nearest = hit;
            }
        }
        return nearest;
    },

    // Area a camera can see, as a polygon fanning out from the camera position.
    // Besides evenly spaced rays, rays are cast just either side of every obstacle
    // corner so shadow edges are exact instead of approximated.
    visibilityPolygon(camera, obstacles, stepDeg = 1) {
        const { x, y, angle, fov, range } = camera;
        const start = angle - fov / 2;

        const offsets = [];
        const steps = Math.max(2, Math.ceil(fov / stepDeg));
        for (let i = 0; i <= steps; i++) {
            offsets.push(fov * i / steps);
        }

        for (const obstacle of obstacles) {
            for (const [cx, cy] of this.rectCorners(obstacle)) {
                const cornerAngle = Math.atan2(cy - y, cx - x) * 180 / Math.PI;
                const offset = ((cornerAngle - start) % 360 + 360) % 360;
                if (offset > fov) continue;

                for (const delta of [-this.EPSILON_DEG, 0, this.EPSILON_DEG]) {
                    offsets.push(Math.min(fov, Math.max(0, offset + delta)));
                }
            }
        }

        offsets.sort((a, b) => a - b);

        const polygon = [[x, y]];
        for (const offset of offsets) {
            const hit = this.castRay(x, y, start + offset, range, obstacles);
            polygon.push([hit.x, hit.y]);
        }
        return polygon;
    },

    // Whether a camera, given its visibility polygon, sees point (px, py)
    cameraSees(camera, polygon, px, py) {
        if (this.distance(camera.x, camera.y, px, py) > camera.range) return false;

        const angleToPoint = Math.atan2(py - camera.y, px - camera.x) * 180 / Math.PI;
        if (this.angleDifference(angleToPoint, camera.angle) > camera.fov / 2) return false;

        return this.pointInPolygon(px, py, polygon);
    }
};

if (typeof module !== 'undefined') {
    module.exports = Geometry;
}
