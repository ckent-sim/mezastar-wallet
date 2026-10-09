import test from 'node:test';
import assert from 'node:assert/strict';
import { frameLayout, FRAME_STYLES, QUIET_ZONE, supportLayout } from '../js/frame.js';

for (const modules of [21, 25, 33, 57]) {
  test(`support card layout ${modules} modules`, () => {
    const W = 1080;
    const H = 1350;
    const { header, panel, qr } = supportLayout(W, H, modules);
    assert.ok(Number.isInteger(qr.module) && qr.module >= 1);
    assert.equal(qr.size, qr.module * modules);
    assert.ok(qr.x - panel.x >= QUIET_ZONE * qr.module && qr.y - panel.y >= QUIET_ZONE * qr.module, 'quiet zone');
    assert.ok(panel.y >= header.h, 'QR panel below the header');
    assert.ok(panel.x >= 0 && panel.x + panel.size <= W && panel.y + panel.size <= H, 'inside card');
    assert.ok(panel.size >= W * 0.75, 'QR stays big');
  });
}

test('frame styles list', () => {
  assert.deepEqual(FRAME_STYLES, ['clean', 'pokeball', 'star', 'neon', 'holo']);
});

for (const [width, modules] of [[1000, 25], [1080, 57], [600, 21], [1200, 177]]) {
  test(`layout ${width}px / ${modules} modules`, () => {
    const { panel, qr } = frameLayout(width, modules);
    assert.ok(Number.isInteger(qr.module) && qr.module >= 1, 'integer module size');
    assert.equal(qr.size, qr.module * modules);
    assert.ok(qr.x - panel.x >= QUIET_ZONE * qr.module, 'left quiet zone');
    assert.ok(qr.y - panel.y >= QUIET_ZONE * qr.module, 'top quiet zone');
    assert.ok(panel.x + panel.size - (qr.x + qr.size) >= QUIET_ZONE * qr.module, 'right quiet zone');
    assert.ok(panel.x >= 0 && panel.x + panel.size <= width, 'panel inside canvas');
    assert.ok(Math.abs(panel.x + panel.size / 2 - width / 2) <= 1, 'panel centered');
    assert.ok(panel.size <= width * 0.8, 'leaves room for the border');
  });
}
