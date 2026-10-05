// Breadth-first search for a route through a path challenge's obstacle grid.
// Returns the shortest list of [dx, dy] steps, or undefined when no route exists.
export function findRoute(c) {
  const queue = [[...c.start, []]]
  const seen = new Set([c.start.join(',')])
  while (queue.length) {
    const [x, y, plan] = queue.shift()
    if (x === c.goal[0] && y === c.goal[1]) return plan
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx
      const ny = y + dy
      const key = `${nx},${ny}`
      const outside = nx < 0 || ny < 0 || nx >= c.size || ny >= c.size
      if (outside || seen.has(key) || c.obstacles.some((p) => p[0] === nx && p[1] === ny)) continue
      seen.add(key)
      queue.push([nx, ny, [...plan, [dx, dy]]])
    }
  }
}
