// The scripted player. One function, no imports, so the same source runs in Node and inside the page.
// It is greedy: step towards the spore if there is one, else the dew, and never step into a wall or
// the body if another move exists. It is not clever and it does trap itself; that is how its games end.
export function chooseDir(s) {
  const delta = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
  const opposite = { U: 'D', D: 'U', L: 'R', R: 'L' };
  const head = s.grub[0];
  const target = s.spore || s.dew || head;
  const body = new Set(s.grub.slice(0, -1).map((c) => c.x + ',' + c.y));
  const free = (x, y) => x >= 0 && x < s.cols && y >= 0 && y < s.rows && !body.has(x + ',' + y);
  let best = s.dir;
  let bestCost = Infinity;
  for (const d of ['U', 'R', 'D', 'L']) {
    if (d === opposite[s.dir]) continue;
    const x = head.x + delta[d][0];
    const y = head.y + delta[d][1];
    if (!free(x, y)) continue;
    let exits = 0;
    for (const e of ['U', 'R', 'D', 'L']) {
      if (free(x + delta[e][0], y + delta[e][1])) exits++;
    }
    // Distance to the target first; a dead end costs more than any distance on the grid.
    const cost = Math.abs(target.x - x) + Math.abs(target.y - y) + (exits === 0 ? 1000 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = d;
    }
  }
  return best;
}
