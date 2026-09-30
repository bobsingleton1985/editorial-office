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
  window2: { x: -4.55, z: 1.6, th: -Math.PI / 2 + 0.35, label: 'у окна, второе место' },   // smoking together (owner 30.09): 0.9 m from the first, turned 20° towards it
  teletype: { x: 3.85, z: -0.9, th: Math.PI / 2, label: 'у телетайпа' },
  phoneA: { x: -3.0, z: -2.40, th: -Math.PI / 2, label: 'у телефона стола A' },
  bar: { x: 2.705, z: 4.650, th: 0, label: 'у тумбы' },                     // where the approved whisky recording begins (office «BAR | root» frame; set from the recording in main.js)  // in the aisle beside desk A, facing it: the phone (left front corner) at his left hand
};
// the zone in front of the TV where people stand listening to music (several at once, «Джаз у телевизора» v3, owner 30.09): a front row of
// three 1,9 from the screen and a back row of two 3,4 from it, staggered to see between the heads; 1,5 apart or more, all on free floor.
// Each faces the screen centre. The director sends a listener to the nearest free one (spots tv, tv2 … tv5).
const TV_C = { x: 2.74, z: 0.94 }, TV_N = { x: -0.42, z: 0.91 }, TV_L = { x: 0.91, z: 0.42 };   // screen centre on the floor, its normal, its right
export const TV_ZONE = [[1.9, 0], [1.9, -1.5], [1.9, 1.5], [3.4, -0.75], [3.4, 0.75]].map(([d, l], i) => {
  const x = TV_C.x + TV_N.x * d + TV_L.x * l, z = TV_C.z + TV_N.z * d + TV_L.z * l;
  return { x, z, th: Math.atan2(TV_C.x - x, TV_C.z - z), label: 'у телевизора' + (i ? ' ' + (i + 1) : '') };
});
TV_ZONE.forEach((p, i) => { SPOTS['tv' + (i ? i + 1 : '')] = p; });
// the TV's channel knob (the right one of the two under the screen), world metres; and where one crouches to turn it: 0,6 in front of it,
// facing the set («Включает музыку» v2, owner 30.09)
export const TV_KNOB = { x: TV_C.x + TV_L.x * -0.44 + TV_N.x * 0.03, y: 0.64, z: TV_C.z + TV_L.z * -0.44 + TV_N.z * 0.03, n: TV_N };
SPOTS.tvKnob = { x: TV_KNOB.x + TV_N.x * 0.6, z: TV_KNOB.z + TV_N.z * 0.6, th: Math.atan2(-TV_N.x, -TV_N.z), label: 'у ручки телевизора' };
export const RADIUS = 0.49;                          // body radius for walking around furniture: arm swing of the walk + 6 cm (was 0.2 m × S = 0.31: the hand went into the sofa)
