import { TREASURES, countOf, decoyFor, moreWords, ruleKept, treasureSVG } from './goals.js'

/**
 * At the nest the child finishes the world's lesson with the family, using what Ember brought home:
 * - rings: the numbers flown, with one missing (two at the challenge tier). Which tile fills the gap?
 * - one kind: anything picked up by mistake is found and given back to the sky; then the treasures are
 *   tapped into a ten-frame (counting each), and the tiles ask how many.
 * - two kinds: the basket is unpacked one treasure at a time onto shelves with one place per treasure asked
 *   for; a wrong kind, or one more than a shelf holds, goes back with the cloud. Then: how many in all?
 *   A "more blue than pink" basket that broke its rule in the air is put right here: the child swaps
 *   treasures between the shelves until the rule holds, then says how many more (or completes the bond).
 * Three tiles at the easier tier, four above it. A wrong tile is never crossed off (random tapping can't win by
 * elimination): the tiles rest while the row is counted along (aloud the first time), then come back as a
 * fresh set. Nothing is lost, but it is noticed (main.js counts it toward the next world's level).
 */
export function nestPuzzle(entry, { tray, sound, say, sayOnce, onSlip, onGiveBack, onChange = () => {}, onSolved: solved }) {
  const { goal } = entry
  // solved: the tray keeps the child's work in view and makes room for ▶ underneath
  const onSolved = (extra) => {
    tray.classList.add('solved')
    solved(extra)
  }
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const size = goal.level >= 1 ? 4 : 3
  tray.classList.add('puzzle')

  const el = (tag, cls, html = '') => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    e.innerHTML = html
    return e
  }

  /**
   * Number tiles: tap the right one. `others()` draws fresh near misses (as many as the tier shows).
   * A wrong tile is never simply crossed off (that let random tapping win by elimination): the tiles rest
   * while `retell(first)` walks the row (aloud only the first time), then come back as a fresh set.
   */
  let wrongs = 0
  function tiles(right, others, onRight, retell) {
    const row = el('div', 'tiles')
    const deal = () => {
      const opts = [right, ...new Set(others().filter((n) => n !== right && n >= 0))].slice(0, size).sort((a, b) => a - b)
      row.replaceChildren(...opts.map((n) => {
        const b = el('button', 'tile', String(n))
        b.type = 'button'
        b.setAttribute('aria-label', String(n))
        b.onclick = () => {
          if (row.dataset.done || row.classList.contains('resting')) return
          if (n === right) {
            row.dataset.done = '1'
            b.classList.add('yes')
            for (const o of row.children) if (o !== b) o.disabled = true
            sound.treasure(3)
            onRight(b, row)
            return
          }
          b.classList.add('no')
          sound.nope()
          onSlip()
          row.classList.add('resting')
          for (const o of row.children) o.disabled = true
          // the concrete step: count along with the highlight, then choose again from a fresh set
          const ms = retell(wrongs++ === 0)
          setTimeout(() => {
            row.classList.remove('resting')
            deal()
          }, Math.max(1200, ms))
        }
        return b
      }))
    }
    deal()
    return row
  }

  /** Lights `cells` one after another (a gentle read-along), with `words` said once. Returns how long it takes. */
  function readAlong(cells, words) {
    if (words) say(words)
    cells.forEach((c, i) => setTimeout(() => {
      c.classList.add('read')
      setTimeout(() => c.classList.remove('read'), 700)
    }, 400 + i * 650))
    return 400 + cells.length * 650 + 300
  }

  /** " 1, 2, 3." to say along with a read-along, only up to five (past that the steady highlight does the counting). */
  const upTo = (n) => (n <= 5 ? ` ${Array.from({ length: n }, (_, i) => i + 1).join(', ')}.` : '')

  /** `n` near misses around `right` (a fresh mix each time), never 0 and never one of `avoid`. */
  function nearBy(right, n, avoid = []) {
    const ok = (d) => d >= 1 && d !== right && !avoid.includes(d)
    const close = [right - 1, right + 1, right - 2, right + 2].filter(ok).sort(() => Math.random() - 0.5)
    const out = close.slice(0, n)
    for (let r = 3; out.length < n && r < 40; r++) for (const d of [right + r, right - r]) if (ok(d) && !out.includes(d) && out.length < n) out.push(d)
    return out
  }

  /**
   * `n` near misses for a missing number in a row, drawn from outside the row on both sides and close by, so a
   * tile has to be counted on to (for 4 ? 6 7 ? 9: 3, 10, 2 rather than 1, 2, 3; by fives: 14, 16, 13).
   * Never a number of the row (the other gap's answer would be right, just not yet) and never 0.
   */
  function aroundRow(right, n, seq, avoid = []) {
    const lo = Math.min(...seq)
    const hi = Math.max(...seq)
    const ok = (d) => d >= 1 && d !== right && !seq.includes(d) && !avoid.includes(d)
    const span = hi - lo + 12
    const near = (side) => Array.from({ length: span }, (_, i) => right + side * (i + 1)).filter(ok)
    // a little shuffle among equally close numbers, then one from each side in turn, nearest first
    const below = near(-1)
    const above = near(1)
    const out = []
    for (let i = 0; out.length < n && i < span; i++) {
      const pair = Math.random() < 0.5 ? [below[i], above[i]] : [above[i], below[i]]
      for (const d of pair) if (d !== undefined && out.length < n) out.push(d)
    }
    return out
  }

  /** A treasure given back: it floats up out of the tray and is gone. */
  function giveAway(item, kind) {
    sound.pop()
    onGiveBack(kind)
    item.disabled = true
    const fly = item.animate?.([{ transform: 'none', opacity: 1 }, { transform: still ? 'none' : 'translateY(-60px) scale(0.6)', opacity: 0 }], { duration: still ? 250 : 600, easing: 'ease-in' })
    if (fly) fly.onfinish = () => item.remove()
    else item.remove()
  }
  const shake = (item) => item?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: still ? 1 : 300 })
  /** What came home that wasn't asked for (picked up in the air): it goes back to the sky here. */
  const extras = Object.entries(entry.extra || {}).flatMap(([k, m]) => Array(m).fill(k))

  /** Something lands in its place: it slides over from where it was tapped (a fade under reduced motion). */
  function land(from, to) {
    const a = from.getBoundingClientRect()
    const b = to.getBoundingClientRect()
    const move = still ? 'none' : `translate(${a.left - b.left}px, ${a.top - b.top}px)`
    to.animate?.([{ transform: move, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: still ? 250 : 450, easing: 'cubic-bezier(.3,.7,.4,1)' })
  }

  // --- rings: which number is missing? (Two numbers at the challenge tier, filled one after the other.) ---
  if (goal.type === 'rings') {
    const wrong = (entry.flown || []).filter((f) => f.wrong)
    if (wrong.length) return takeOut(() => gapPuzzle())
    return gapPuzzle()
  }

  /**
   * Numbers flown through by mistake came home in the row, in the order they were flown (1 2 5 3 4 ...).
   * The child finds each number that doesn't belong and takes it out, then the row is complete.
   * A number that belongs shakes and stays (a slip): only counting along the row shows which one is wrong.
   */
  function takeOut(then) {
    const flown = entry.flown.slice()
    const row = el('div', `sort-row nums takeout${flown.length > 6 ? ' wide' : ''}`)
    let left = flown.filter((f) => f.wrong).length
    // (the chip's oops corner still shows which numbers they were, for a child who wants to check)
    const ask = left > 1 ? 'Some numbers flew in by mistake. Tap the ones that don\'t belong!' : 'One number flew in by mistake. Tap the one that doesn\'t belong!'
    tray.append(row)
    tray.setAttribute('aria-label', ask)
    say(ask)
    const cells = flown.map((f) => {
      const b = el('button', 'num', String(f.n))
      b.type = 'button'
      b.setAttribute('aria-label', String(f.n))
      b.onclick = () => {
        if (b.disabled || !left) return
        const i = cells.indexOf(b)
        // the same number side by side (2 [2] 3): either one is the extra
        const twin = [i - 1, i + 1].find((j) => cells[j] && !cells[j].disabled && flown[j].wrong && flown[j].n === f.n)
        if (!f.wrong && twin === undefined) {
          sound.nope()
          onSlip()
          const upto = cells.slice(0, i + 1).filter((c) => !c.disabled)
          sayOnce('That one belongs. Count along the row!')
          readAlong(upto)
          return shake(b)
        }
        if (!f.wrong) [flown[i].wrong, flown[twin].wrong] = [true, false]
        b.disabled = true
        sound.pop()
        onGiveBack(f.n)
        const fly = b.animate?.([{ transform: 'none', opacity: 1 }, { transform: still ? 'none' : 'translateY(-50px) scale(0.6)', opacity: 0 }], { duration: still ? 250 : 550, easing: 'ease-in' })
        const gone = () => (b.style.display = 'none')
        if (fly) fly.onfinish = gone
        else gone()
        if (--left) return
        setTimeout(() => {
          row.remove()
          then()
        }, still ? 300 : 800)
      }
      return b
    })
    row.append(...cells)
  }

  function gapPuzzle() {
    const seq = goal.seq.slice(0, entry.reached)
    const row = el('div', `sort-row nums${seq.length > 5 ? ' wide' : ''}`)
    // the gaps are never at the ends, and never side by side, so there is a number on each side to count from
    const inner = seq.map((_, i) => i).slice(1, -1)
    const pairs = goal.level >= 2 ? inner.flatMap((i) => inner.filter((j) => j > i + 1).map((j) => [i, j])) : []
    const gaps = pairs.length ? pairs[Math.floor(Math.random() * pairs.length)] : inner.length ? [inner[Math.floor(Math.random() * inner.length)]] : []
    const cells = seq.map((n, i) => el('i', gaps.includes(i) ? 'gap' : 'got', gaps.includes(i) ? '?' : String(n)))
    row.append(...cells)
    tray.append(row)
    if (!gaps.length) return onSolved('')
    const ask = gaps.length > 1 ? 'Which numbers are missing?' : 'Which number is missing?'
    tray.setAttribute('aria-label', ask)
    say(ask)
    const next = (j) => {
      const gap = gaps[j]
      const right = seq[gap]
      cells[gap].classList.add('now')
      // a fresh set of near misses each time the tiles are dealt; never a number of the row itself, so the
      // other gap's answer is never offered here (it would be right, just not yet)
      const others = () => {
        const out = []
        for (let k = 0; k < 24 && out.length < size - 1; k++) {
          const d = decoyFor({ ...goal, seq }, gap)
          if (!seq.includes(d) && !out.includes(d) && Math.random() < 0.7) out.push(d)
        }
        return [...out, ...aroundRow(right, size - 1 - out.length, seq, out)]
      }
      // after a wrong tile: count along the row up to the gap (aloud the first time, from at most three
      // numbers back, so the voice counts on rather than reciting the whole row), and choose again
      const retell = (first) => readAlong(cells.slice(0, gap + 1), first && `Let's count. ${seq.slice(Math.max(0, gap - 3), gap).join(', ')}, and then?`)
      const t = tiles(right, others, (b, tileRow) => {
        const cell = cells[gap]
        cell.className = 'got'
        cell.textContent = String(right)
        land(b, cell)
        if (j + 1 < gaps.length) {
          tileRow.remove()
          next(j + 1)
        } else if (goal.level === 0 && !goal.down) {
          tileRow.remove()
          after()
        } else onSolved('')
      }, retell)
      tray.append(t)
    }
    /**
     * At the easier tier the gap alone is the row just flown, so one more step counts on past it: a new place
     * at the end of the row, "which number comes next?" (6 after 1 2 3 4 5). The tiles are its neighbours (5 and 7 for
     * 6), so the last number again or one too far is a real slip; a wrong tile counts along the row's end.
     */
    const after = () => {
      const step = goal.step ?? 1
      const right = seq.at(-1) + step
      const cell = el('i', 'gap now', '?')
      row.append(cell)
      row.classList.toggle('wide', seq.length + 1 > 5)
      const ask = 'And which number comes after that?'
      tray.setAttribute('aria-label', ask)
      say(ask)
      const all = [...cells, cell]
      const retell = (first) => readAlong(all.slice(-4), first && `Let's count. ${seq.slice(-3).join(', ')}, and then?`)
      tray.append(tiles(right, () => nearBy(right, size - 1), (b) => {
        cell.className = 'got'
        cell.textContent = String(right)
        land(b, cell)
        onSolved('')
      }, retell))
    }
    next(0)
  }

  const rows = goal.wants.map(([k]) => [k, entry.got[k] || 0])
  const kinds = rows.filter(([, n]) => n > 0)

  // --- one kind: anything not asked for goes back to the sky first; then how many came home? ---
  // Each one is tapped into a ten-frame, counting it on the way; the number tiles come once all are in.
  if (!goal.total && goal.wants.length === 1) {
    const [kind, n] = rows[0]
    const pile = el('div', 'sort-row count')
    const frame = el('div', 'frame')
    const cells = Array.from({ length: n <= 5 ? 5 : 10 }, () => frame.appendChild(el('i', 'cell')))
    let counted = 0
    let giving = extras.length
    let askedAt = -Infinity
    const ask = `How many ${TREASURES[kind].many} came home?`
    const startCount = () => {
      tray.append(frame)
      tray.setAttribute('aria-label', ask)
      say(ask)
    }
    const retell = (first) => readAlong(cells.slice(0, n), first && `Let's count them again.${upTo(n)}`)
    for (const k of [...Array(n).fill(kind), ...extras].sort(() => Math.random() - 0.5)) {
      const b = el('button', 'item', treasureSVG(k))
      b.type = 'button'
      b.setAttribute('aria-label', TREASURES[k].one)
      b.dataset.kind = k
      b.onclick = () => {
        if (b.dataset.n || b.disabled) return
        if (giving) {
          // first, the ones that weren't asked for: the child finds each one and gives it back
          if (k === kind) {
            sound.nope()
            onSlip()
            // (just after the ask, the shake and the soft note are enough: the same words aren't said twice)
            if (performance.now() - askedAt > 4000) sayOnce(`Keep the ${TREASURES[kind].many}! Give back the others.`)
            return shake(b)
          }
          giveAway(b, k)
          if (!--giving) startCount()
          return
        }
        // one tap, one treasure into the next square, with a soft rising note. The voice doesn't count here:
        // the frame is what the child counts (or sees at a glance) to answer, and a wrong tile counts it aloud
        b.dataset.n = String(++counted)
        b.classList.add('counted')
        b.disabled = true
        const cell = cells[counted - 1]
        cell.innerHTML = treasureSVG(kind)
        cell.classList.add('full')
        land(b, cell.firstElementChild)
        sound.treasure(counted)
        if (counted === n) tray.append(tiles(n, () => nearBy(n, size - 1), () => onSolved(''), retell))
      }
      pile.append(b)
    }
    tray.append(pile)
    if (giving) {
      const words = `We asked for ${TREASURES[kind].many}. Give the others back to the sky!`
      tray.setAttribute('aria-label', words)
      say(words)
      askedAt = performance.now()
    } else startCount()
    return
  }

  // --- two kinds: unpack the basket onto the right shelves ---
  // A shelf has one dashed place per treasure asked for. Anything else (another kind, or one more than the
  // shelf holds) was picked up in the air by mistake: the child gives it back to the sky with the cloud.
  const pile = [...kinds.flatMap(([k, n]) => Array(n).fill(k)), ...extras].sort(() => Math.random() - 0.5)
  const hand = el('div', 'sort-row hand')
  const shelves = new Map()
  const holds = new Map(goal.total ? [] : goal.wants)
  const placed = {}
  for (const [k] of rows) {
    const places = holds.has(k) ? `<span class="item place">${treasureSVG(k, true)}</span>`.repeat(holds.get(k)) : ''
    // the label is a small solid treasure in a round badge, so it never reads as one more dashed place to fill
    const shelf = el('button', 'shelf', `<span class="label badge">${treasureSVG(k)}</span><span class="slots">${places}</span>`)
    shelf.type = 'button'
    shelf.dataset.kind = k
    shelf.setAttribute('aria-label', `${TREASURES[k].many} shelf`)
    shelf.onclick = () => put(k, shelf)
    shelves.set(k, shelf)
  }
  tray.append(hand, ...shelves.values())
  // the cloud is always there at this tier, so it never gives away whether something needs to go back
  const cloud = goal.total ? null : el('button', 'shelf cloud', '<span class="label">☁️</span><span class="up" aria-hidden="true">⤴</span>')
  if (cloud) {
    cloud.type = 'button'
    cloud.setAttribute('aria-label', 'Give it back to the sky')
    cloud.onclick = () => put('sky', cloud)
    tray.append(cloud)
  }
  const same = TREASURES[rows[0][0]].shape === TREASURES[rows[1][0]].shape
  const hint = same ? 'Look at the colour.' : 'Look at the shape.'
  const room = (k) => shelves.has(k) && (!holds.has(k) || (placed[k] || 0) < holds.get(k))

  function showHand() {
    hand.replaceChildren()
    pile.forEach((k, i) => {
      const item = hand.appendChild(el('span', i === 0 ? 'item lifted' : 'item', treasureSVG(k)))
      item.dataset.kind = k
    })
  }
  function put(target, shelf) {
    if (!pile.length) return
    const item = hand.firstElementChild
    const k = pile[0]
    const fits = target === 'sky' ? !room(k) : target === k && room(k)
    if (!fits) {
      sound.nope()
      onSlip()
      sayOnce(target === 'sky' ? 'We need that one! Find its shelf.' : target === k ? 'That shelf is full. Give it back to the sky!' : hint)
      return shake(item)
    }
    pile.shift()
    if (target === 'sky') {
      // it floats up out of Ember's basket and home to the sky
      const gone = el('span', 'item', treasureSVG(k))
      shelf.append(gone)
      land(item, gone)
      setTimeout(() => giveAway(gone, k), still ? 0 : 450)
    } else {
      placed[k] = (placed[k] || 0) + 1
      const slots = shelf.querySelector('.slots')
      let slot = slots.querySelector('.place')
      if (slot) {
        slot.className = 'item'
        slot.innerHTML = treasureSVG(k)
      } else slot = slots.appendChild(el('span', 'item', treasureSVG(k)))
      land(item, slot)
      sound.treasure(placed[k])
    }
    showHand()
    if (!pile.length) unpacked()
  }
  function unpacked() {
    hand.remove()
    for (const s of shelves.values()) s.disabled = true
    if (cloud) {
      cloud.remove()
      return inAll()
    }
    // a "more than" basket: is the rule kept? If not, the child puts it right before the question
    if (ruleKept(goal, entry.got)) ask()
    else fix()
  }
  /** Two shelves of a basket asked for by kind: how many came home in all? (Adding two small groups.) */
  function inAll() {
    const [[ka, na], [kb, nb]] = rows
    const total = na + nb
    const q = `${countOf(ka, na)} and ${countOf(kb, nb)}. How many in all?`
    tray.setAttribute('aria-label', q)
    say(q)
    const all = [...shelves.values()].flatMap((s) => [...s.querySelectorAll('.slots .item')])
    const retell = (first) => readAlong(all, first && `Let's count them all.${upTo(total)}`)
    tray.append(tiles(total, () => nearBy(total, size - 1), () => onSolved(`${na} and ${nb} make ${total}!`), retell))
  }
  const [a, b] = goal.more ?? []
  const rule = goal.more ? moreWords(goal.more, goal.rule) : ''
  /** How far the basket is from keeping its rule (0 when it holds). */
  const off = (got) => {
    const d = (got[a] || 0) - (got[b] || 0)
    return goal.rule === 'one' ? Math.abs(d - 1) : Math.max(0, 1 - d)
  }
  /**
   * Swaps treasures between the shelves (the family has plenty of both) until the rule holds. The child
   * decides which shelf gives one away: a swap that would take the basket further from the rule doesn't
   * happen, and counts as a gentle slip, so reasoning differs from tapping either shelf.
   */
  function fix() {
    onSlip()
    tray.classList.add('fixing')
    const words = `Hmm, that's not ${rule}. Which shelf needs one fewer? Tap it to swap one!`
    tray.setAttribute('aria-label', words)
    say(words)
    for (const [k, shelf] of shelves) {
      shelf.disabled = false
      shelf.setAttribute('aria-label', `Swap a ${TREASURES[k].one}`)
      shelf.onclick = () => {
        const from = shelf.querySelector('.slots')
        if (!from.lastElementChild || tray.classList.contains('fixed')) return
        const other = k === a ? b : a
        if (off({ ...entry.got, [k]: entry.got[k] - 1, [other]: (entry.got[other] || 0) + 1 }) > off(entry.got)) {
          sound.nope()
          onSlip()
          sayOnce(`That shelf needs to keep its ${TREASURES[k].many}. Count them again!`)
          return shake(shelf)
        }
        const item = from.lastElementChild
        const slot = el('span', 'item', treasureSVG(other))
        shelves.get(other).querySelector('.slots').append(slot)
        land(item, slot)
        item.remove()
        entry.got[k]--
        entry.got[other] = (entry.got[other] || 0) + 1
        sound.treasure(entry.got[other])
        onChange()
        if (!ruleKept(goal, entry.got)) return
        tray.classList.add('fixed')
        for (const s of shelves.values()) s.disabled = true
        setTimeout(ask, 700)
      }
    }
  }
  /** The rule holds: how many more? (Or, for "one more", the number bond: 3 pink and how many blue make 7?) */
  function ask() {
    tray.classList.remove('fixing')
    const na = entry.got[a] || 0
    const nb = entry.got[b] || 0
    const extra = [...shelves.get(a).querySelectorAll('.slots .item')].slice(nb)
    if (goal.rule === 'one') {
      const q = `${goal.total} in all: ${countOf(b, nb)} and how many ${same ? TREASURES[a].word : TREASURES[a].many}?`
      tray.setAttribute('aria-label', q)
      say(q)
      const retell = (first) => readAlong([...shelves.get(a).querySelectorAll('.slots .item')], first && `Count the ${TREASURES[a].many}.`)
      tray.append(tiles(na, () => nearBy(na, size - 1), () => onSolved(`${na} and ${nb} make ${goal.total}!`), retell))
      return
    }
    // more blue than pink: the shelves line up one to one, and the extra ones at the end are the answer
    const d = na - nb
    const q = same ? `How many more ${TREASURES[a].word} than ${TREASURES[b].word}?` : `How many more ${TREASURES[a].many} than ${TREASURES[b].many}?`
    tray.setAttribute('aria-label', q)
    say(q)
    const retell = (first) => readAlong(extra, first && 'Count the extra ones at the end.')
    tray.append(tiles(d, () => nearBy(d, size - 1), () => onSolved(`${d} more ${same ? TREASURES[a].word : d === 1 ? TREASURES[a].one : TREASURES[a].many}!`), retell))
  }
  tray.setAttribute('aria-label', 'Put each treasure on its shelf')
  sayOnce(cloud ? 'Put each one on its shelf, or give it back to the sky!' : 'Put each one on its shelf!')
  showHand()
}
