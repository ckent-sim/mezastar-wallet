import test from 'node:test';
import assert from 'node:assert/strict';
import { frameLayout, FRAME_STYLES, QUIET_ZONE } from '../js/frame.js';

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
