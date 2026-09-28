// Where people can be in the office v29 (three.js plan coords: x = Blender x, z = -Blender y; th = turn about +Y, 0 faces +Z).
// Pack furniture is metres; the office is in Blender units of 0.644 m, so pack lengths are multiplied by S.
export const S = 1 / 0.644;

// Desks: frame of the motion pack's table (seated person faces +Z, the pack table's near edge is 0.14 m ahead of the frame).
// Office desk fronts (Blender y): A 2.606, B 3.51, C 3.506; chairs are centred on the desks.
export const DESKS = {
  A: { x: -4.2, z: -2.606 - 0.14 * S, th: 0, label: 'стол A' },
  B: { x: 0.4, z: -3.51 - 0.14 * S, th: 0, label: 'стол B' },
  C: { x: 3.9, z: -3.506 - 0.14 * S, th: 0, label: 'стол C' },
};
// Office chairs stand 0.1174 m further out than the pack's seated position; after someone stands up they are pushed in (-0.25).
export const CHAIR_REST = 0.1174, CHAIR_TUCKED = -0.25;
export const CHAIR_NODE = { A: 'CHAIR_v02_|_ANCHOR', B: 'STATION_B_|_CHAIR_v02_|_ANCHOR', C: 'STATION_C_|_CHAIR_v02_|_ANCHOR' };
// chair footprint (office units) relative to the seated chair: front edge 0.231 m ahead of the desk frame... measured from the office model
export function chairBox(k, dy) {                   // [x0, z0, x1, z1] of the chair at pack offset dy (m, + = away from the desk)
  const D = DESKS[k], front = D.z + 0.231 * S - dy * S;       // front edge of the seat (towards the desk)
  return [D.x - 0.36, front - 0.707, D.x + 0.36, front];
}

// The lounge: a pack bench (seat 0.714 units) with its matching table; people face +x (towards the table).
// Seated pelvis 0.61 m from the table centre line (as in the pack booth); along the bench: near the south end,
// the middle, near the north end. Entries: from the south end = the person's right (R), north end = left (L).
const BENCH_X = -0.5886 - 0.61 * S;
export const BENCH = {
  S: { x: BENCH_X, z: 3.126, label: 'скамья у круглого стола, южный край' },
  M: { x: BENCH_X, z: 2.10, label: 'скамья у круглого стола, середина' },
  N: { x: BENCH_X, z: 1.074, label: 'скамья у круглого стола, северный край' },
};
// places to stand
export const SPOTS = {
  window: { x: -4.55, z: 2.5, th: -Math.PI / 2, label: 'у окна' },
  teletype: { x: 3.85, z: -0.9, th: Math.PI / 2, label: 'у телетайпа' },
};
export const RADIUS = 0.2 * S;                        // body radius for walking around furniture
