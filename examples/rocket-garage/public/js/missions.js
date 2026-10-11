import { DESTS, PARTS, isSteady, isUnlocked, part, reach } from './parts.js'
import { BOOSTER_WORDS, el, isBuild, keyGuard, placeName } from './workshop.js'

/**
 * Robot's missions: the harder tier for children who have the rules. A mission names a planet to
 * land on (tier 1), then also whether the rocket must fly steady or wobbly (tier 2). Tier 3 is a
 * diagnosis puzzle: Robot's own rocket misses, and the child may change just ONE part to fix it
 * (or, when it falls one planet short, keep every part and earn the ⚡ turbo by steering).
 * Tier 4 has two faults and still one change per flight, so it is fixed one fair test at a time.
 *
 * Tier 4 is either two faults of different kinds (boosters and wobble) or two wobbly parts on a
 * rocket that must fly steady, so fixing one still leaves a wobble: two causes, found one at a time.
 *
 * The prediction is where the thinking is, and it always comes BEFORE any part changes: when the
 * card is picked up, the rocket on the pad (the child's own on tiers 1-2, Robot's on 3-4) is asked
 * "as it is: where will it land?" The answer is shown at once as a trail along the planets, so it
 * is a real inference from the boosters, separate from the build that follows. On tiers 3-4 it is
 * the diagnosis: it tells the child whether the boosters or the wobble is the fault.
 * A mission moves the tier up only when it was done AND predicted, so careful play counts and
 * lucky taps do not. On tier 1 a second miss points to the notebook and a third offers a nearer
 * planet (or, when there is none, keeps the card and points at the booster to try); above tier 1,
 * three misses move down a tier. Never a gate.
 */

export const TIERS = 4
const pick = (list) => list[(Math.random() * list.length) | 0]

/** Robot's rocket wears his own colours, so it reads as his and not the child's. */
const ROBOT_COLORS = { nose: '#2ec4b6', cabin: '#ffd23f', tank: '#ffffff', fins: '#2ec4b6', booster: '#9b5de5' }

const partsOnly = (b) => Object.fromEntries(Object.keys(PARTS).map((slot) => [slot, b[slot]]))
/** How many parts differ from Robot's rocket (paint never counts). */
export const changesFrom = (robot, rocket) => Object.keys(PARTS).filter((slot) => robot[slot] !== rocket[slot]).length

/** Saved mission progress, with anything unknown dropped. */
export function sanitizeMission(value) {
  const v = value && typeof value === 'object' ? value : {}
  const n = (x, lo, hi, d) => (Number.isInteger(x) && x >= lo && x <= hi ? x : d)
  const c = v.card
  const card = c && typeof c === 'object' && n(c.dest, 0, DESTS.length - 1, -1) >= 0
    ? {
        tier: n(c.tier, 1, TIERS, 1),
        dest: c.dest,
        steady: typeof c.steady === 'boolean' ? c.steady : null,
        robot: isBuild(c.robot) ? partsOnly(c.robot) : null,
        // Two faults (tier 4): `base` is Robot's rocket as it last flew, one change at a time.
        // `kind` 'wobbly2' is two wobbly parts on a rocket that must fly steady.
        two: !!c.two,
        kind: c.two && c.kind === 'wobbly2' ? 'wobbly2' : null,
        // Whether a flight has been made with this card (the reach bar then shows its landing)
        flew: !!c.flew,
        base: isBuild(c.base) ? partsOnly(c.base) : null,
        // The "as it is" guess: the planet picked, and whether it was right
        diag: n(c.diag, 0, DESTS.length - 1, null),
        diagOk: typeof c.diagOk === 'boolean' ? c.diagOk : null,
        got: n(c.got, 0, 2, 0),
      }
    : null
  // Tiers 3-4 are Robot's rocket to fix: a card without one is from an older save, so make a new card
  const keep = card && (card.tier < 3 || card.robot) ? card : null
  return {
    tier: n(v.tier, 1, TIERS, 1),
    wins: n(v.wins, 0, 9, 0),
    misses: n(v.misses, 0, 9, 0),
    card: keep,
    on: !!(keep && v.on),
    // The next tier-1 card is a nearer planet (after three misses)
    near: keep ? null : n(v.near, 0, DESTS.length - 1, null),
    // The child's own rocket, kept safe while they work on Robot's
    own: isBuild(v.own) ? v.own : null,
  }
}

const unlocked = (slot, visited) => PARTS[slot].filter((p) => isUnlocked(p, visited))

/**
 * Robot's rocket for a tier 3 card: exactly one thing is wrong, so exactly one part fixes it.
 * Either the boosters miss the planet, or the wobble is the wrong kind (one wobbly part too many,
 * or none at all).
 */
const WOBBLE_SLOTS = ['nose', 'tank', 'fins']
/** Nose, tank and fins slots that have a wobbly part to put on. */
const wobblySlots = (visited) => WOBBLE_SLOTS.filter((slot) => unlocked(slot, visited).some((p) => p.wobble))

function robotRocket(dest, steady, visited, two = false) {
  const boosters = unlocked('booster', visited)
  const places = (b) => Math.min(DESTS.length - 1, b.power)
  const others = boosters.filter((b) => places(b) !== dest)
  // Two faults: the boosters miss AND the wobble is the wrong kind (or, 'wobbly2', two parts wobble)
  const fault = two === 'wobbly2' ? 'wobbly2' : two ? 'both' : others.length && Math.random() < 0.55 ? 'place' : 'wobble'
  const robot = {}
  for (const slot of Object.keys(PARTS)) robot[slot] = pick(unlocked(slot, visited)).id
  // One planet short is the favourite miss: the turbo can fix it too, if the child steers for it
  const short = others.filter((b) => places(b) === dest - 1 && visited[dest - 1])
  robot.booster = fault === 'place' || fault === 'both' ? pick(short.length && Math.random() < 0.5 ? short : others).id : pick(boosters.filter((b) => places(b) === dest)).id
  // Steady parts everywhere, then one wobbly part where the card (or the fault) needs it
  const steadyPick = (slot) => pick(unlocked(slot, visited).filter((p) => !p.wobble)).id
  for (const slot of WOBBLE_SLOTS) robot[slot] = steadyPick(slot)
  const wantWobblyPart = fault !== 'place' ? steady : !steady
  const slots = wobblySlots(visited)
  // Two wobbly parts in two different places: the second one is the hidden cause
  for (const slot of fault === 'wobbly2' ? slots.sort(() => Math.random() - 0.5).slice(0, 2) : wantWobblyPart ? [pick(slots)] : []) {
    robot[slot] = pick(unlocked(slot, visited).filter((p) => p.wobble)).id
  }
  return robot
}

/**
 * A new mission at this tier that the child can build from parts already unlocked. `near` asks
 * for a planet just one booster size from the rocket on the pad, other than the planet `near`
 * that was just missed three times (the easier tier-1 card). When no such planet exists, the card
 * is the same planet again, and the caller keeps it and helps instead of calling it new.
 */
export function makeMission(tier, rocket, visited, { near = null } = {}) {
  const boosters = unlocked('booster', visited)
  const places = [...new Set(boosters.map((p) => Math.min(DESTS.length - 1, p.power)))]
  const blank = { two: false, kind: null, base: null, diag: null, diagOk: null, got: 0, flew: false }
  if (tier >= 3 && places.length > 1) {
    const dest = pick(places)
    // Tier 4 takes turns between its two puzzles: boosters + wobble, or two wobbly parts
    if (tier >= 4 && wobblySlots(visited).length >= 2 && Math.random() < 0.4) {
      return { ...blank, tier: 4, dest, steady: true, robot: robotRocket(dest, true, visited, 'wobbly2'), two: true, kind: 'wobbly2' }
    }
    const steady = Math.random() < 0.5
    const two = tier >= 4
    return { ...blank, tier: two ? 4 : 3, dest, steady, robot: robotRocket(dest, steady, visited, two), two }
  }
  // Ask for the other kind of flight than the rocket on the pad, so a part really has to change
  const steady = tier >= 2 ? !isSteady(rocket) : null
  const now = reach(rocket)
  const others = places.filter((d) => d !== now)
  const close = others.filter((d) => Math.abs(d - now) === 1)
  const fresh = close.filter((d) => d !== near)
  const from = near !== null ? (fresh.length ? fresh : [near]) : others.length ? others : places
  return { ...blank, tier: Math.min(tier, 2), dest: pick(from), steady, robot: null }
}

/** Robot's rocket ready to put on the pad, in his colours. */
export const robotBuild = (m) => ({ ...(m.base ?? m.robot), colors: { ...ROBOT_COLORS } })
/** Robot's rocket as the card first showed it (the picture never changes). */
const robotFirst = (m) => ({ ...m.robot, colors: { ...ROBOT_COLORS } })

const steadyWords = (steady) => (steady ? 'a steady rocket' : 'a wobbly rocket')
const capital = (s) => s[0].toUpperCase() + s.slice(1)

/** What the robot says when the mission is picked up. */
export function missionWords(m) {
  if (m.two) return `Robot’s rocket has two things to fix! Change one part each flight, so it lands on ${placeName(m.dest)}, ${m.steady ? 'nice and steady' : 'all wobbly'}.`
  if (m.robot) return `Robot’s rocket needs fixing! Change just one part, so it lands on ${placeName(m.dest)}, ${m.steady ? 'nice and steady' : 'all wobbly'}.`
  if (m.steady !== null) return `Mission: land on ${placeName(m.dest)} with ${steadyWords(m.steady)}!`
  return `Mission: land on ${placeName(m.dest)}!`
}

/** How many wobbly parts too many (or a missing wobble) this rocket has for the card. */
const wobbleFaults = (m, r) => (m.steady === null ? 0 : m.steady ? WOBBLE_SLOTS.filter((slot) => part(slot, r[slot]).wobble).length : +isSteady(r))
/** The things still wrong with a rocket for a two-fault card (the landing from its boosters). */
export const faultsLeft = (m, r, place = reach(r) === m.dest) => +!place + wobbleFaults(m, r)

/** Did this flight do it? One check per thing the card asks for. */
export function checkMission(m, { rocket, dest }) {
  const place = dest === m.dest
  const wobble = m.steady === null || isSteady(rocket) === m.steady
  const changes = m.robot ? changesFrom(m.base ?? m.robot, rocket) : 0
  const fix = !m.robot || changes <= 1
  return { done: place && wobble && fix, place, wobble, fix, changes }
}

/**
 * One spoken sentence after the landing: done, or the single most useful next thing to change.
 * `turboReady` says whether the turbo was there to take, so the advice fits what happened; `next`
 * is what afterFlight decided, so a tier-1 child who keeps missing is sent to the notebook instead
 * of hearing the same advice again; `known` is how many parts the child has tested for wobble.
 */
export function missionVerdict(m, check, { dest, turbo, turboReady, rocket, next = 'again', flown = new Set(), known = 0 }) {
  if (check.done) {
    if (m.two) return 'Both fixed, one change at a time! That is how real engineers do it.'
    if (m.robot) return check.changes === 0 ? 'Fixed with no changes at all! The turbo carried it the last stop.' : 'You fixed Robot’s rocket with just one change!'
    const how = turbo ? ' The turbo carried it the last stop!' : m.steady === null ? '' : m.steady ? ' Nice and steady!' : ' Wobbling all the way!'
    return `Mission done! You landed on ${placeName(m.dest)}.${how}`
  }
  if (!check.fix) return `You changed ${check.changes} parts. Robot’s puzzle is one change ${m.two ? 'each flight' : 'only'}. Tap his card to get his rocket back.`
  // Two wobbly parts: the first one fixed still leaves a wobble, which is the discovery
  if (m.kind === 'wobbly2' && next === 'step') return 'One wobbly part fixed! It still wobbles a little, so another part wobbles too. Find it!'
  // Two faults: say which one is fixed now, then the advice for the other
  const half = m.two && m.kind !== 'wobbly2' && check.place !== check.wobble ? (check.place ? `It lands on ${placeName(m.dest)} now! ` : 'The wobble is right now! ') : ''
  if (!check.place) {
    const wobbleToo = check.wobble ? '' : ' And look at the wobble too!'
    if (next === 'hint') {
      // The second miss: not the same advice again, but where to look it up
      const needed = PARTS.booster.find((p) => Math.min(DESTS.length - 1, p.power) === m.dest)
      const look = needed && flown.has(needed.id) ? `Your notebook shows which boosters reach ${placeName(m.dest)}!` : 'Your notebook shows where each booster went. Try ones you have not flown yet!'
      return `It landed on ${placeName(dest)}. ${look}`
    }
    if (dest < m.dest) {
      // It stopped one short with fifteen stars in hand: the lightning was the missing step
      if (turboReady && !turbo && dest + 1 === m.dest) return `${half}You had fifteen stars! Tap the lightning next time to go on to ${placeName(m.dest)}.`
      if (m.robot && dest + 1 === m.dest) return `${half}It stopped at ${placeName(dest)}. Change the boosters, or steer for fifteen stars and take the turbo!`
      return `${half}It stopped at ${placeName(dest)}. ${capital(placeName(m.dest))} is farther. Bigger boosters push farther!${half ? '' : wobbleToo}`
    }
    if (turbo && dest - 1 === m.dest) return `${half}The turbo carried it past ${placeName(m.dest)}! Next time, keep the lightning for later.`
    return `${half}${capital(BOOSTER_WORDS[rocket.booster])} flew past ${placeName(m.dest)}! ${m.dest === 0 ? 'With no boosters, it stops soonest.' : 'Smaller boosters stop sooner.'}${half ? '' : wobbleToo}`
  }
  // The place is right and the wobble is not: point to what the child can see and look up
  const look = known ? ' Your tray marks the parts you tested.' : ' Change one part and watch the rocket on the pad.'
  if (half) return `${half}Next, the wobble: which part ${m.steady ? 'wobbles' : 'makes a wobble'}?${look}`
  if (m.steady) return `It got there, but it wobbled! Which part wobbles?${look}`
  return `It got there, but it flew too steady! Which part makes a wobble?${look}`
}

/**
 * The same advice, already heard once this visit, as one short picture-led line: where it landed,
 * and how many booster sizes the card's planet is from there.
 */
export function missionShort(m, check, dest) {
  if (check.place) return check.wobble ? '' : m.steady ? 'Still a wobble. Which part?' : 'Still steady. Which part makes a wobble?'
  const n = Math.abs(m.dest - dest)
  return `${capital(placeName(dest))}. ${capital(placeName(m.dest))} is ${n === 1 ? 'one booster size' : `${n} booster sizes`} ${dest < m.dest ? 'farther' : 'nearer'}.`
}

/**
 * The "as it is" answer, said when the guess is shown: where the rocket really lands (the
 * boosters' reach), whether the guess matched, and so what to change (on Robot's rocket, which
 * fault to look for).
 */
export function diagnosisWords(m, guess, build = m.robot) {
  const lands = reach(build)
  const ok = guess === lands
  if (!m.robot) {
    // The child's own rocket on a tier 1-2 card: where it goes now, and where Robot wants it
    const said = `${ok ? 'Yes! ' : ''}Your rocket lands on ${placeName(lands)}.`
    const kind = m.steady === null ? '' : `, ${m.steady ? 'nice and steady' : 'all wobbly'}`
    if (lands === m.dest) return `${said} That is Robot’s planet!${m.steady === null ? ' Fly it there!' : ` Now make it fly${kind}.`}`
    return `${said} Robot wants ${placeName(m.dest)}${kind}. What will you change?`
  }
  const said = `${ok ? 'Yes! ' : ''}Robot’s rocket lands on ${placeName(lands)}.`
  if (lands !== m.dest) return `${said} He wants ${placeName(m.dest)}${m.two ? `, and ${m.steady ? 'steady' : 'wobbly'} too. Two things to fix, one change each flight.` : '. One change!'}`
  return `${said} That is the right planet! So what is wrong? Watch it on the pad.`
}

/**
 * Moves the tier. A mission done with the landing predicted counts toward the next tier (two of
 * them move up); done without the prediction just clears the card. A miss on tier 1 first
 * repeats the card, then points to the notebook ('hint'), then swaps in a nearer planet
 * ('nearer'). Above tier 1, three tries that did not land it move down a tier ('easier').
 * Tier 4 that fixed one fault with one change keeps that step ('step') and is not a miss.
 */
export function afterFlight(state, done, matched, check = null, rocket = null) {
  if (done) {
    if (matched) state.wins = Math.min(9, state.wins + 1)
    state.misses = 0
    if (state.wins >= 2 && state.tier < TIERS) {
      state.tier++
      state.wins = 0
    }
    state.card = null
    state.on = false
    return 'done'
  }
  const card = state.card
  if (card?.two && check?.fix && rocket) {
    // Each flight's rocket is the new starting point; one thing fewer wrong is a step, not a miss
    card.base = partsOnly(rocket)
    const got = Math.max(0, faultsLeft(card, card.robot) - faultsLeft(card, rocket, check.place))
    if (got > card.got) {
      card.got = got
      return 'step'
    }
  }
  state.misses++
  if (card && card.tier === 1) {
    if (state.misses === 2) return 'hint'
    if (state.misses >= 3) {
      state.misses = 0
      // The next card is a planet one booster size from the rocket on the pad (not the one missed)
      state.near = card.dest
      state.card = null
      state.on = false
      return 'nearer'
    }
    return 'again'
  }
  if (state.misses >= 3 && card && card.tier > 1) {
    state.tier = Math.max(1, card.tier - 1)
    state.wins = 0
    state.misses = 0
    state.card = null
    state.on = false
    return 'easier'
  }
  return 'again'
}

/** The mission as a picture: Robot's rocket to fix, then the planet, then a steady ━ or wobbly 〰️ line. */
export function missionPicture(m, { rocketThumb = null, marks = null } = {}) {
  const pic = el('span', 'mission-pic')
  const bit = (cls, ok) => {
    const b = el('span', `mission-bit ${cls}`)
    if (marks) b.append(el('b', 'mission-mark', ok ? '✔' : '💡'))
    pic.append(b)
    return b
  }
  if (m.robot && rocketThumb) {
    const b = bit('mission-robot', marks?.fix)
    const i = el('img')
    i.src = rocketThumb(robotFirst(m)) || ''
    i.alt = ''
    b.prepend(i, el('span', 'mission-one', m.two ? '🔧1 ➜ 🔧1' : '🔧1'))
  }
  bit('mission-place', marks?.place).prepend(el('span', 'mission-planet', DESTS[m.dest].emoji))
  if (m.steady !== null) bit(`mission-wobble ${m.steady ? 'steady' : 'wobbly'}`, marks?.wobble).prepend(el('span', 'mission-line', m.steady ? '━' : '〰️'))
  return pic
}

/**
 * "As it is: where will it land?" asked when a card is picked up, before any part changes: about
 * the child's own rocket (tiers 1-2) or Robot's (tiers 3-4). The answer comes at once as a soft
 * trail along the planets, so the child finds out what to change before touching a part. The
 * rocket is shown big, with its boosters beside it, because the boosters are the answer.
 */
export function createWhere({ rocketThumb, thumbOf, voice, sound = () => {}, onBack, onDiagnose = () => {} }) {
  const dialog = el('dialog', 'ft-dialog where-dialog diagnose')
  dialog.id = 'where'
  dialog.setAttribute('aria-labelledby', 'where-q')
  dialog.innerHTML = `<div class="ft-head"><div class="where-rocket"></div><div class="where-booster" aria-hidden="true"></div><span class="where-fill"></span>
    <button id="where-say" class="ft-round" aria-label="Say it again">🔊</button><button id="where-back" class="ft-round" aria-label="Back to the garage">🔧</button></div>
    <p id="where-q">Where will it land?</p>
    <div class="where-planets" role="group" aria-labelledby="where-q"></div>
    <p id="where-said" class="where-said" role="status" aria-live="polite"></p>
    <button id="where-fix" class="where-fix hidden" aria-label="Back to the garage to fix it">🔧 ➜ 🚀</button>`
  document.body.append(dialog)
  keyGuard(dialog)
  const planets = dialog.querySelector('.where-planets')
  const q = dialog.querySelector('#where-q')
  const told = dialog.querySelector('#where-said')
  const fix = dialog.querySelector('#where-fix')
  fix.onclick = () => dialog.close()
  let open = false
  let chosen = null
  let timer = 0
  const asked = { own: 0, robot: 0 }
  let card = null
  let build = null
  let question = ''

  /** The answer: the trail lights planet by planet up to where the rocket lands. */
  function reveal(i) {
    const lands = reach(build)
    const words = diagnosisWords(card, i, build)
    ;[...planets.children].forEach((b, k) => {
      if (k > lands) return
      b.style.transitionDelay = `${k * 0.25}s`
      b.classList.add(k === lands ? 'lands' : 'passed')
    })
    const mark = el('b', 'where-mark', i === lands ? '✔' : '💡')
    timer = setTimeout(() => {
      planets.children[lands].append(mark)
      told.textContent = words
      voice.sayNow(words)
      onDiagnose(i, i === lands)
      fix.classList.remove('hidden')
      fix.focus()
    }, 300 + lands * 250)
  }

  function choose(i) {
    if (!open || chosen !== null) return
    chosen = i
    sound('pick')
    for (const b of planets.children) b.setAttribute('aria-pressed', String(+b.dataset.dest === i))
    reveal(i)
  }

  dialog.querySelector('#where-say').onclick = () => voice.sayNow(told.textContent || question)
  dialog.querySelector('#where-back').onclick = () => dialog.close()
  dialog.addEventListener('close', () => {
    clearTimeout(timer)
    open = false
    // The answer keeps talking as the child goes back to fix it; a question left unanswered goes quiet
    if (chosen === null) voice.hush()
    onBack(chosen !== null)
  })
  dialog.addEventListener('keydown', (e) => {
    const i = Number(e.key) - 1
    if (Number.isInteger(i) && i >= 0 && i < DESTS.length) choose(i)
  })

  return {
    get open() { return dialog.open },
    ask(rocket, m) {
      chosen = null
      card = m
      build = rocket
      told.textContent = ''
      fix.classList.add('hidden')
      const r = el('img')
      r.src = rocketThumb(rocket) || ''
      r.alt = ''
      dialog.querySelector('.where-rocket').replaceChildren(r)
      // The boosters, close up: the part that decides the answer
      const src = rocket.booster === 'none' ? '' : thumbOf('booster', rocket.booster)
      const b = src ? el('img') : el('span', 'where-none', '🚫')
      if (src) {
        b.src = src
        b.alt = ''
      }
      dialog.querySelector('.where-booster').replaceChildren(b)
      dialog.classList.toggle('robot', !!m.robot)
      planets.replaceChildren(...DESTS.map((d, i) => {
        const p = el('button', 'where-planet')
        p.dataset.dest = String(i)
        p.setAttribute('aria-label', `It will land on ${placeName(i)}`)
        p.setAttribute('aria-pressed', 'false')
        p.append(el('span', '', d.emoji))
        p.onclick = () => choose(i)
        return p
      }))
      q.textContent = m.robot ? 'Robot’s rocket, as it is: where will it land?' : 'Your rocket, as it is: where will it land?'
      open = true
      dialog.showModal()
      dialog.focus()
      // The whole question the first two times; after that the pictures ask it themselves
      const first = asked[m.robot ? 'robot' : 'own']++ < 2
      question = m.robot
        ? (first ? 'Robot’s rocket needs fixing. First: as it is now, where will it land? Tap a planet.' : 'Robot’s rocket, as it is: where will it land?')
        : (first ? 'Robot has a mission! First, your rocket as it is now: where will it land? Tap a planet.' : 'Your rocket, as it is: where will it land?')
      voice.sayNow(question)
    },
    close() { if (dialog.open) dialog.close() },
  }
}
