const test = require('node:test');
const assert = require('node:assert/strict');
const Geometry = require('../js/geometry.js');

const near = (actual, expected, tolerance = 1e-6) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

// Obstacles are rectangles; the geometry works on their edges
const edgesOf = obstacles => obstacles.flatMap(o => Geometry.rectEdges(o));

const seen = (camera, segments, px, py) =>
    Geometry.cameraSees(camera, Geometry.visibilityPolygon(camera, segments), px, py);

test('angleDifference handles wrap-around and mixed ranges', () => {
    assert.equal(Geometry.angleDifference(350, -175), 165);
    assert.equal(Geometry.angleDifference(0, 359), 1);
    assert.equal(Geometry.angleDifference(90, 90), 0);
    assert.equal(Geometry.angleDifference(10, 190), 180);
    assert.equal(Geometry.angleDifference(-135, 270), 45);
});

test('segmentIntersection finds crossings and rejects parallel or disjoint segments', () => {
    const hit = Geometry.segmentIntersection(0, 0, 10, 0, 5, -5, 5, 5);
    near(hit.x, 5);
    near(hit.y, 0);
    near(hit.t, 0.5);

    assert.equal(Geometry.segmentIntersection(0, 0, 10, 0, 0, 1, 10, 1), null);
    assert.equal(Geometry.segmentIntersection(0, 0, 4, 0, 5, -5, 5, 5), null);
});

test('castRay stops at the nearest obstacle edge', () => {
    const obstacles = edgesOf([
        { x: 80, y: -10, width: 10, height: 20 },
        { x: 50, y: -10, width: 10, height: 20 }
    ]);
    const hit = Geometry.castRay(0, 0, 0, 200, obstacles);
    near(hit.x, 50);
    near(hit.y, 0);

    const miss = Geometry.castRay(0, 0, 90, 100, obstacles);
    near(miss.x, 0);
    near(miss.y, 100);
});

test('pointInPolygon on a square', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    assert.ok(Geometry.pointInPolygon(5, 5, square));
    assert.ok(!Geometry.pointInPolygon(15, 5, square));
});

test('cameras do not see behind themselves (regression)', () => {
    // Previously a camera rotated past 180° reported phantom coverage behind it
    const camera = { x: 0, y: 0, angle: 350, fov: 90, range: 100 };
    const dir = Geometry.toRadians(-175);
    assert.ok(!seen(camera, [], Math.cos(dir) * 50, Math.sin(dir) * 50));
    assert.ok(seen(camera, [], 50, -5));

    const narrow = { x: 0, y: 0, angle: 270, fov: 30, range: 100 };
    const diag = Geometry.toRadians(-135);
    assert.ok(!seen(narrow, [], Math.cos(diag) * 50, Math.sin(diag) * 50));
    assert.ok(seen(narrow, [], 0, -50));
});

test('obstacles cast shadows that match the visibility polygon', () => {
    const camera = { x: 0, y: 0, angle: 0, fov: 90, range: 200 };
    const obstacles = edgesOf([{ x: 50, y: -10, width: 10, height: 20 }]);

    assert.ok(!seen(camera, obstacles, 100, 0), 'point directly behind the box is hidden');
    assert.ok(!seen(camera, obstacles, 150, 25), 'point just inside the shadow edge is hidden');
    assert.ok(seen(camera, obstacles, 100, 30), 'point beside the shadow is visible');
    assert.ok(seen(camera, obstacles, 40, 0), 'point in front of the box is visible');
    assert.ok(!seen(camera, obstacles, 250, 0), 'point beyond range is hidden');
});

test('walls block sight like obstacle edges', () => {
    const camera = { x: 0, y: 0, angle: 0, fov: 90, range: 200 };
    const walls = [[100, -50, 100, 50]];

    assert.ok(seen(camera, walls, 90, 0), 'point in front of the wall is visible');
    assert.ok(!seen(camera, walls, 150, 0), 'point behind the wall is hidden');
    assert.ok(seen(camera, walls, 150, 100), 'point past the end of the wall is visible');
});

test('a camera mounted exactly on a wall still sees into the room', () => {
    const camera = { x: 100, y: 0, angle: 90, fov: 90, range: 100 };
    const walls = [[0, 0, 200, 0]];

    assert.ok(seen(camera, walls, 100, 50));
    assert.ok(seen(camera, walls, 130, 40));
});

test('distanceToSegment measures to the nearest point, including endpoints', () => {
    near(Geometry.distanceToSegment(5, 3, [0, 0, 10, 0]), 3);
    near(Geometry.distanceToSegment(13, 4, [0, 0, 10, 0]), 5);
    near(Geometry.distanceToSegment(2, 2, [1, 1, 1, 1]), Math.SQRT2);
});
