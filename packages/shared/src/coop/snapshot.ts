/**
 * Compact binary form of a co-op world state, sent about 30 times a second by the server.
 *
 * Numbers that drive the simulation (positions, speeds, timers) stay float64, so a client that
 * loads a snapshot gets exactly the server's world (prediction resimulates from it); small
 * integers and flags are packed. About 85 bytes per body, then 8 bytes per prop number.
 */
import type { CoopBodyState } from "./coopController";
import type { CoopWorldState } from "./world";

const VERSION = 2;
const HEADER = 1 + 4 + 4 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 2;
const BODY = 9 * 8 + 2 + 4 + 1 + 2 + 1 + 1 + 1;

export function encodeWorld(s: CoopWorldState): Uint8Array {
  const n = s.bodies.length;
  const buf = new ArrayBuffer(HEADER + n * BODY + s.props.length * 8);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, VERSION);
  o += 1;
  v.setUint32(o, s.tick);
  o += 4;
  v.setUint32(o, s.levelTick);
  o += 4;
  v.setUint16(o, s.attempt);
  o += 2;
  v.setUint16(o, s.dying);
  o += 2;
  v.setInt8(o, s.victim);
  o += 1;
  v.setUint8(o, n);
  o += 1;
  v.setUint8(o, bits(s.squashing));
  o += 1;
  v.setUint8(o, bits(s.inside));
  o += 1;
  v.setUint8(o, s.won ? 1 : 0);
  o += 1;
  v.setUint16(o, s.props.length);
  o += 2;
  for (const b of s.bodies) {
    for (const x of [b.x, b.y, b.vx, b.vy, b.coyoteTimer, b.jumpBufferTimer, b.impactVy, b.speedFactor, b.squashTimer]) {
      v.setFloat64(o, x);
      o += 8;
    }
    v.setUint16(o, b.bounceCount & 0xffff);
    o += 2;
    v.setInt32(o, b.lastBounceCell);
    o += 4;
    v.setUint8(o, b.supportKind);
    o += 1;
    v.setInt16(o, b.supportId);
    o += 2;
    v.setInt8(o, b.supportBody);
    o += 1;
    v.setInt8(o, b.facing);
    o += 1;
    const flags =
      (b.grounded ? 1 : 0) | (b.rising ? 2 : 0) | (b.hanging ? 4 : 0) | (b.hasRider ? 8 : 0) | (b.rooted ? 16 : 0);
    v.setUint8(o, flags);
    o += 1;
  }
  for (const x of s.props) {
    v.setFloat64(o, x);
    o += 8;
  }
  return new Uint8Array(buf);
}

function bits(flags: readonly boolean[]): number {
  let b = 0;
  flags.forEach((q, i) => {
    if (q) b |= 1 << i;
  });
  return b;
}

export function decodeWorld(bytes: Uint8Array): CoopWorldState {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const version = v.getUint8(o);
  o += 1;
  if (version !== VERSION) throw new Error(`co-op snapshot version ${version}, expected ${VERSION}`);
  const tick = v.getUint32(o);
  o += 4;
  const levelTick = v.getUint32(o);
  o += 4;
  const attempt = v.getUint16(o);
  o += 2;
  const dying = v.getUint16(o);
  o += 2;
  const victim = v.getInt8(o);
  o += 1;
  const n = v.getUint8(o);
  o += 1;
  const squash = v.getUint8(o);
  o += 1;
  const insideBits = v.getUint8(o);
  o += 1;
  const won = v.getUint8(o) === 1;
  o += 1;
  const propCount = v.getUint16(o);
  o += 2;
  const bodies: CoopBodyState[] = [];
  for (let i = 0; i < n; i++) {
    const f: number[] = [];
    for (let k = 0; k < 9; k++) {
      f.push(v.getFloat64(o));
      o += 8;
    }
    const bounceCount = v.getUint16(o);
    o += 2;
    const lastBounceCell = v.getInt32(o);
    o += 4;
    const supportKind = v.getUint8(o) as 0 | 1 | 2;
    o += 1;
    const supportId = v.getInt16(o);
    o += 2;
    const supportBody = v.getInt8(o);
    o += 1;
    const facing = (v.getInt8(o) < 0 ? -1 : 1) as -1 | 1;
    o += 1;
    const flags = v.getUint8(o);
    o += 1;
    bodies.push({
      x: f[0]!,
      y: f[1]!,
      vx: f[2]!,
      vy: f[3]!,
      coyoteTimer: f[4]!,
      jumpBufferTimer: f[5]!,
      impactVy: f[6]!,
      speedFactor: f[7]!,
      squashTimer: f[8]!,
      bounceCount,
      lastBounceCell,
      supportKind,
      supportId,
      supportBody,
      facing,
      grounded: (flags & 1) !== 0,
      rising: (flags & 2) !== 0,
      hanging: (flags & 4) !== 0,
      hasRider: (flags & 8) !== 0,
      rooted: (flags & 16) !== 0,
    });
  }
  const props: number[] = [];
  for (let k = 0; k < propCount; k++) {
    props.push(v.getFloat64(o));
    o += 8;
  }
  const squashing = bodies.map((_, i) => (squash & (1 << i)) !== 0);
  const inside = bodies.map((_, i) => (insideBits & (1 << i)) !== 0);
  return { tick, levelTick, attempt, dying, victim, won, bodies, squashing, inside, props };
}
