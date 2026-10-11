/**
 * Bear's riddles: Bear asks for an animal by what it has ("something with a shell"), and the child
 * looks at who is swimming about and casts near the one that fits. A cast lands next to a swimmer
 * and that swimmer comes to bite, so where you cast is the choice (see sendBiter in main.js).
 * An animal that fits goes in the book; one that doesn't is put back gently (main.js startShow).
 *
 * Tier 1 (little ones): one thing you can see: a colour, stripes, spots, a shell, spikes, claws,
 * eight arms, tentacles, a tusk.
 * Tier 2: an idea you can't see but can learn here: is it a fish or not, does it breathe air, does
 * it have bones. Several animals may fit; any of them answers it (sorting, not guessing).
 * Tier 3 (7-8): two clues at once, an idea and a thing you can see ("not a fish, but has spots";
 * "a fish with no spikes"). Each clue must rule someone out, so both have to be used.
 * main.js moves up after a run of first-catch answers and back down after one slow riddle.
 *
 * Every miss says why ("Those are arms, not tentacles"), so a wrong catch still teaches.
 *
 * Sources (checked 2026-10-11):
 *   jellyfish are not fish, no bones  https://oceanservice.noaa.gov/facts/jellyfish.html
 *   octopus has no bones, eight arms  https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives
 *   turtles are reptiles, breathe air https://www.nps.gov/piro/learn/nature/reptiles.htm
 *   narwhals are whales, breathe air  https://www.fisheries.noaa.gov/species/narwhal
 *   crabs: hard outer shell, no bones https://www.fisheries.noaa.gov/species/alaska-snow-crab
 *   fish breathe with gills           https://en.wikipedia.org/wiki/Fish_gill
 *   frogs: amphibians, tadpoles, lungs and skin breathing  https://en.wikipedia.org/wiki/Frog
 *   crayfish: fresh-water crustaceans, shell outside, claws  https://en.wikipedia.org/wiki/Crayfish
 *   ramshorn snails: fresh-water, air-breathing (lung) snails  https://en.wikipedia.org/wiki/Planorbidae
 *   snails and octopuses are both molluscs  https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives
 */

/** What each catch has, as the child sees the models. Toys, the boot and the treasure fit no idea clue. */
export const HAS = {
  goldfish: ['orange', 'fish'],
  bluefish: ['blue', 'fish'],
  clownfish: ['orange', 'stripes', 'fish'],
  trout: ['spots', 'fish'],
  pufferfish: ['yellow', 'spikes', 'spots', 'fish'],
  goldenfish: ['yellow', 'fish'],
  turtle: ['shell', 'notfish', 'air'],
  frog: ['spots', 'notfish', 'air'],
  // Olive brown (wild crayfish are; they only go red when cooked), so it is never asked for as orange
  crayfish: ['shell', 'claws', 'notfish', 'nobones'],
  // The crab is drawn coral red, so it answers "red", never "orange"
  crab: ['red', 'shell', 'claws', 'notfish', 'nobones'],
  // A ramshorn pond snail: a coiled shell and a soft foot; it comes up to breathe air
  snail: ['shell', 'notfish', 'air', 'nobones'],
  octopus: ['arms', 'spots', 'notfish', 'nobones'],
  jellyfish: ['tentacles', 'notfish', 'nobones'],
  narwhal: ['blue', 'spots', 'tusk', 'notfish', 'air'],
  whale: ['blue', 'notfish', 'air'],
  duck: ['yellow'],
  boot: [],
  chest: [],
}

/**
 * icon + word: the riddle chip (pictures for non-readers, a word for readers; the voice says it).
 * ask: the riddle. has / hasnt: the clue as part of a two-clue riddle. no: said when a catch lacks it.
 */
export const TRAITS = {
  orange: { tier: 1, icon: '🟠', word: 'orange', ask: 'something orange', has: 'is orange', hasnt: 'is not orange', no: "It isn't orange." },
  red: { tier: 1, icon: '🔴', word: 'red', ask: 'something red', has: 'is red', hasnt: 'is not red', no: "It isn't red." },
  blue: { tier: 1, icon: '🔵', word: 'blue', ask: 'something blue', has: 'is blue', hasnt: 'is not blue', no: "It isn't blue." },
  yellow: { tier: 1, icon: '🟡', word: 'yellow', ask: 'something yellow', has: 'is yellow', hasnt: 'is not yellow', no: "It isn't yellow." },
  stripes: { tier: 1, icon: '🦓', word: 'stripes', ask: 'a fish with white stripes', has: 'has white stripes', hasnt: 'has no white stripes', no: 'No white stripes.' },
  spots: { tier: 1, icon: '⚫', word: 'spots', ask: 'something with spots', has: 'has spots', hasnt: 'has no spots', no: 'No spots.' },
  shell: { tier: 1, icon: '🐚', word: 'shell', ask: 'something with a hard shell', has: 'has a hard shell', hasnt: 'has no shell', no: 'No hard shell.' },
  spikes: { tier: 1, icon: '🌵', word: 'spikes', ask: 'something with spikes', has: 'has spikes', hasnt: 'has no spikes', no: 'No spikes.' },
  claws: { tier: 1, icon: '✂️', word: 'claws', ask: 'something with big pinching claws', has: 'has pinching claws', hasnt: 'has no pinching claws', no: 'No pinching claws.' },
  arms: { tier: 1, icon: '8️⃣', word: '8 arms', ask: 'something with eight arms', has: 'has eight arms', hasnt: 'does not have eight arms', no: 'Not eight arms.' },
  tentacles: { tier: 1, icon: '〰️', word: 'tentacles', ask: 'something with long tentacles', has: 'has tentacles', hasnt: 'has no tentacles', no: 'No tentacles.' },
  tusk: { tier: 1, icon: '🦷', word: 'tusk', ask: 'something with a long tusk', has: 'has a tusk', hasnt: 'has no tusk', no: 'No tusk.' },
  // ask2 / more: tier 2 often asks for two different animals that share the idea (see twoOf)
  fish: { tier: 2, icon: '🐟', word: 'a fish', ask: 'a fish', ask2: 'two different kinds of fish', is: "It's a fish", more: 'Can you find a different fish?', lead: 'a fish that', short: 'fish' },
  notfish: {
    tier: 2, icon: '🐟', not: true, word: 'not a fish', ask: 'an animal that is not a fish', ask2: 'two different animals that are not fish', is: "It's not a fish", more: 'Who else is not a fish?',
    lead: 'an animal that is not a fish,', but: true, short: 'not fish',
  },
  air: { tier: 2, icon: '🫧', word: 'breathes air', ask: 'an animal that breathes air', ask2: 'two different animals that breathe air', is: 'It breathes air', more: 'Who else breathes air?', lead: 'an animal that breathes air and', short: 'air' },
  nobones: { tier: 2, icon: '🦴', not: true, word: 'no bones', ask: 'an animal with no bones', ask2: 'two different animals with no bones', is: 'It has no bones', more: 'Who else has no bones?', lead: 'an animal with no bones that', short: 'no bones' },
}

/** Why the answer fits an idea clue: the learning. Two or three ways to say it, so a trip doesn't repeat. */
const WHY = {
  fish: {
    any: ['Fish have fins, and gills to breathe under water.', 'Fish swim with fins and breathe with gills.', 'A fish has a backbone, fins and gills.'],
  },
  notfish: {
    turtle: ['Turtles are reptiles, not fish.', 'A turtle walks on legs. It is a reptile.'],
    frog: ['Frogs are amphibians. They start as tadpoles!', 'A frog has legs, not fins.'],
    narwhal: ['Narwhals are whales, not fish.', 'A narwhal comes up to breathe air.'],
    whale: ['Whales are not fish. They breathe air.'],
    jellyfish: ["Jellyfish aren't fish at all!", 'No fins, no gills, no bones.'],
    octopus: ['An octopus is not a fish. It has no bones.', 'An octopus crawls on its arms.'],
    crab: ['Crabs are not fish. They walk on legs.', 'A crab has a shell and legs.'],
    crayfish: ['A crayfish is a cousin of crabs, not a fish.', 'A crayfish walks on legs.'],
    snail: ['A snail creeps along on one soft foot. No fins!', 'Snails are cousins of the octopus, not fish.'],
  },
  air: {
    turtle: ['Turtles come up to breathe air.', 'A turtle has lungs, like you.', 'A turtle pokes its nose up for air.'],
    frog: ['Frogs have lungs and breathe air.', 'A frog breathes a little through its skin, too.'],
    snail: ['A pond snail creeps up to the top to breathe air.', 'A pond snail takes a breath of air at the top.'],
    narwhal: ['Narwhals breathe air through a blowhole.'],
    whale: ['Whales breathe air through a blowhole.'],
  },
  nobones: {
    octopus: ['No bones, so it can squeeze through tiny gaps.', 'An octopus is soft all over.'],
    jellyfish: ['A jellyfish is soft all through. No bones!', 'A jellyfish is mostly water.'],
    crab: ['A crab has a hard shell outside instead of bones.'],
    crayfish: ['A crayfish wears its hard shell outside. No bones inside.'],
    snail: ['A snail is soft inside its shell. No bones!', 'Its shell keeps it safe. Inside, it is soft.'],
  },
}

/** Near misses that need their own reason, so a wrong catch still teaches something. Two ways to say each. */
const NEAR = {
  'tentacles:octopus': ['Those are arms, not tentacles. Jellyfish have tentacles.', 'An octopus has arms. Tentacles are long and thin, like a jellyfish.'],
  'arms:jellyfish': ['Those are tentacles, not arms. An octopus has eight arms.', 'Long thin tentacles! Eight arms is an octopus.'],
  'claws:turtle': ['Its claws are tiny, for walking. Look for big pinching claws.', 'Little walking claws. Bear wants big pinchers.'],
  'stripes:trout': ['Its stripe is pink. Look for white stripes.', 'One pink stripe. Bear wants white ones.'],
  'shell:frog': ['Its skin is soft and wet. No shell.', 'A frog is soft and smooth all over.'],
  'spikes:crab': ['A crab has a smooth shell. No spikes.', 'Smooth shell, no spikes.'],
  'claws:snail': ['A snail has soft feelers, not claws.', 'Those are feelers. Snails cannot pinch.'],
  'orange:crab': ['A crab is red. Look for orange.', 'Red, not orange. Look again!'],
  'orange:crayfish': ['A crayfish is brown. Look for orange.', 'Brown, not orange. Look again!'],
  'red:clownfish': ['A clownfish is orange. Look for red.', 'Orange, not red. Look again!'],
  'red:goldfish': ['A goldfish is orange. Look for red.', 'Orange, not red. Look again!'],
}

/** Why an animal misses an idea clue, a few ways each; the first is also the short form for a repeat. */
const NOT_IDEA = {
  air: ['It breathes under water.', 'It breathes with gills, under water.', 'It stays under water to breathe.'],
  nobones: ['It has bones inside.', 'It has a backbone inside.', 'Inside, it has bones.'],
  notfish: ['It is a fish!', 'That one is a fish! It has fins and gills.', "It's a fish: fins, gills and a backbone."],
}

const NOT_ANIMAL = new Set(['duck', 'boot', 'chest'])
const has = (id, c) => (HAS[id] ?? []).includes(c.t) !== !!c.neg

/** Fits every clue, and isn't a kind already found for this riddle (a "find two" wants two different ones). */
export const fits = (riddle, id) => !!riddle && riddle.clues.every((c) => has(id, c)) && !riddle.found.includes(id)

/**
 * Tier 2: "find two different animals that breathe air". Sorting is about the whole group, so after
 * the turtle Bear asks "Who else breathes air?", and the child has to think of the frog or the snail.
 */
export function twoOf(r) {
  const t = TRAITS[r.clues[0].t]
  if (r.clues.length > 1 || !t.ask2) return r
  return { ...r, need: 2, ask: t.ask2 }
}

/** What Bear asks after one of two is found, or when the same kind is caught again. */
export const more = (r) => TRAITS[r.clues[0].t].more ?? ''

/** A riddle from its clues: what Bear says, and the picture and word on the chip. */
function riddle(clues, tier) {
  const [a, b] = clues.map((c) => TRAITS[c.t])
  if (!b) return { clues, tier, tries: 0, misses: 0, need: 1, found: [], key: clues[0].t, ask: a.ask, word: a.word, icons: [{ icon: a.icon, not: !!a.not }] }
  const neg = clues[1].neg
  // "an animal that is not a fish, but has spots" / "a fish that has no spikes" / "an animal that breathes air and has a shell"
  const lead = a.but ? `${a.lead} ${neg ? 'and' : 'but'}` : a.lead
  return {
    clues,
    tier,
    tries: 0,
    misses: 0,
    need: 1,
    found: [],
    key: `${clues[0].t}+${neg ? '!' : ''}${clues[1].t}`,
    ask: `${lead} ${neg ? b.hasnt : b.has}`,
    word: `${a.short} + ${neg ? 'no ' : ''}${b.word}`,
    icons: [
      { icon: a.icon, not: !!a.not },
      { icon: b.icon, not: neg },
    ],
  }
}

/**
 * A riddle that makes the child choose: at least one swimmer here fits and at least one doesn't.
 * `kinds` are the animals the child can see now; `last` is the riddle just asked and `recent`
 * the keys of the last few, which are left out while there are others to ask. `answered` are the
 * animals that solved the last few riddles: a riddle with another answer is preferred.
 */
export function makeRiddle(kinds, tier, last, recent = [], answered = []) {
  const ids = [...new Set(kinds)]
  const who = (clues) => ids.filter((id) => clues.every((c) => has(id, c)))
  const ok = (clues) => {
    const n = who(clues).length
    return n > 0 && n < ids.length
  }
  const single = (k) => Object.keys(TRAITS).filter((t) => TRAITS[t].tier === k).map((t) => [{ t }]).filter(ok)
  let pool = []
  if (tier >= 3) {
    // Two clues, an idea and a thing you can see, where each clue rules someone out
    for (const t of Object.keys(TRAITS).filter((k) => TRAITS[k].tier === 2)) {
      for (const f of Object.keys(TRAITS).filter((k) => TRAITS[k].tier === 1)) {
        for (const neg of [false, true]) {
          const clues = [{ t }, { t: f, neg }]
          const both = who(clues).length
          if (both && ok(clues) && both < who([clues[0]]).length && both < who([clues[1]]).length) pool.push(clues)
        }
      }
    }
  }
  if (!pool.length && tier >= 2) pool = single(2)
  if (!pool.length) pool = single(1)
  // Prefer clues that fit the few, not the many, so the choice is a real look, not a safe bet
  // ("a fish" where three of four swimmers are fish is no riddle at all)
  const few = pool.filter((c) => who(c).length <= ids.length * 0.6)
  if (few.length) pool = few
  // Never the same answer twice running (in the lake "not a fish" and "breathes air" can both be the turtle)
  if (last) {
    const before = who(last.clues).join()
    const fresh = pool.filter((c) => who(c).join() !== before && c.map((x) => x.t).join() !== last.clues.map((x) => x.t).join())
    if (fresh.length) pool = fresh
    // and lead with a different idea where there is one ("not a fish" five times running is samey)
    const turn = pool.filter((c) => c[0].t !== last.clues[0].t)
    if (turn.length) pool = turn
  }
  // Lean away from the animals that answered the last few riddles, so the same frog isn't the answer every time
  const freshAnswer = pool.filter((c) => who(c).some((id) => !answered.includes(id)))
  if (freshAnswer.length) pool = freshAnswer
  const keyOf = (c) => riddle(c, tier).key
  const unasked = pool.filter((c) => !recent.includes(keyOf(c)))
  if (unasked.length) pool = unasked
  // "A fish" is the easiest idea: tier 2 mostly asks the others (breathes air, no bones, not a fish)
  if (tier === 2) {
    const harder = pool.filter((c) => c[0].t !== 'fish')
    if (harder.length && Math.random() < 0.75) pool = harder
  }
  const clues = pool[(Math.random() * pool.length) | 0]
  return clues ? riddle(clues, tier >= 3 && clues.length > 1 ? 3 : TRAITS[clues[0].t].tier) : null
}

/**
 * Bear's list, for children who have reached two-clue riddles: three animals to find, each living in
 * only one kind of water. The list doesn't say where, so the child plans which place to fish in from
 * what they know about habitats (a tusk is the Icy Sea, white stripes the Coral Reef, air and a shell
 * the fresh water). One is always in fresh water and one in the sea, so finishing it means a trip to
 * each. `places` are the kinds swimming in each place; `water` says which places are fresh or sea.
 */
export function makeList(places, water) {
  const names = Object.keys(places)
  const ideas = Object.keys(TRAITS).filter((k) => TRAITS[k].tier === 2)
  const looks = Object.keys(TRAITS).filter((k) => TRAITS[k].tier === 1)
  const sets = [...looks.map((t) => [{ t }]), ...ideas.map((t) => [{ t }])]
  for (const t of ideas) for (const f of looks) for (const neg of [false, true]) sets.push([{ t }, { t: f, neg }])
  const cands = []
  for (const clues of sets) {
    const who = (p) => places[p].filter((id) => clues.every((c) => has(id, c)))
    const where = names.filter((p) => who(p).length)
    if (!where.length || new Set(where.map((p) => water[p])).size !== 1) continue
    // Two clues must each rule someone out wherever it is found, as in a tier-3 riddle
    const loose = clues.length > 1 && where.some((p) => clues.some((c) => who(p).length === places[p].filter((id) => has(id, c)).length))
    if (loose) continue
    cands.push({ clues, water: water[where[0]], answers: new Set(where.flatMap(who)) })
  }
  for (let i = cands.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[cands[i], cands[j]] = [cands[j], cands[i]]
  }
  // One for each water first, then a third: never two items the same animal could answer
  const list = []
  const clash = (c) => list.some((l) => [...c.answers].some((id) => l.answers.has(id)))
  for (const w of ['fresh', 'sea', null]) {
    const c = cands.find((x) => (!w || x.water === w) && !list.includes(x) && !clash(x))
    if (c) list.push(c)
  }
  return list.map((c) => ({ clues: c.clues, done: false }))
}

/** A riddle from an item on Bear's list (the chip shows a list instead of Bear). */
export function listRiddle(item) {
  if (!item?.clues?.every((c) => TRAITS[c.t])) return null
  const r = riddle(item.clues, item.clues.length > 1 ? 3 : TRAITS[item.clues[0].t].tier)
  r.list = true
  return r
}

/** Can someone swimming here answer this list item? */
export const answersHere = (item, kinds) => kinds.some((id) => item.clues.every((c) => has(id, c)))

/**
 * One line from a list, a fresh one each time in a trip (`said` remembers what was said). When all have
 * been said they come round again, but never the same one twice in a row.
 */
let lastPick = ''
function pick(list, said) {
  if (!list?.length) return ''
  let fresh = list.filter((s) => !said?.has(s))
  if (!fresh.length) {
    for (const s of list) said?.delete(s)
    fresh = list.length > 1 ? list.filter((s) => s !== lastPick) : list
  }
  const line = fresh[0]
  said?.add(line)
  lastPick = line
  return line
}

const article = (name) => `${/^[aeiou]/i.test(name) ? 'An' : 'A'} ${name.toLowerCase()}`

/** What Bear says when a catch reaches the stage: its name, whether it fits, and why. */
export function verdict(r, id, name, said) {
  if (!r) return null
  const a = article(name)
  if (r.found.includes(id)) {
    // The same kind again: the first time says why it goes back, a repeat only asks "Who else?"
    const again = r.lastMiss === `${id}:again`
    r.lastMiss = `${id}:again`
    return again ? more(r) : `Another ${name.toLowerCase()}! Back you go. ${more(r)}`
  }
  if (fits(r, id)) {
    r.lastMiss = null
    const idea = r.clues.find((c) => TRAITS[c.t].tier === 2)
    // One of two found: the reason, then "Who else breathes air?"
    if (r.found.length + 1 < r.need) return `Yes! ${a}! ${pick(WHY[idea.t]?.[id] ?? WHY[idea.t]?.any, said)} ${more(r)}`
    // "Yes! A goldfish is orange!" (but not "a blue fish is blue")
    if (!idea) return name.toLowerCase().includes(TRAITS[r.clues[0].t].word) ? `Yes! ${a}!` : `Yes! ${a} ${TRAITS[r.clues[0].t].has}!`
    // Two clues: say how it fits both, which is the thinking ("It's a fish, and it has spots.")
    if (r.clues.length > 1) {
      const c = r.clues.find((x) => x !== idea)
      return `Yes! ${a}! ${TRAITS[idea.t].is}, and it ${c.neg ? TRAITS[c.t].hasnt : TRAITS[c.t].has}.`
    }
    const why = WHY[idea.t]
    return `Yes! ${a}! ${pick(why?.[id] ?? why?.any, said)}`.trim()
  }
  // Explain the first clue it misses. The same animal missing the same clue again, in a row, or any
  // miss after two on this riddle, hears only the short reason: the card shows the name, and the voice
  // doesn't nag (the soft ring on the water is helping by then).
  const c = r.clues.find((x) => !has(id, x))
  const t = TRAITS[c.t]
  const key = `${id}:${c.neg ? '!' : ''}${c.t}`
  const again = r.lastMiss === key
  r.lastMiss = key
  let why
  if (NOT_ANIMAL.has(id) && t.tier === 2) why = ["That's not an animal!"]
  else if (c.t === 'fish') why = WHY.notfish[id] ? ["That's not a fish!", ...WHY.notfish[id].map((w) => `That's not a fish! ${w}`)] : ["That's not a fish!"]
  else if (NOT_IDEA[c.t]) why = NOT_IDEA[c.t]
  else if (c.neg) why = [`It ${t.has}.`, `Bear wants one that ${t.hasnt}.`]
  else why = NEAR[`${c.t}:${id}`] ?? [t.no, `${t.no} Bear wants ${t.ask}.`, `Look for ${t.ask}.`]
  if (again || r.misses >= 2) return NEAR[`${c.t}:${id}`] ? t.no : why[0]
  return `${a}. ${pick(why, said)} Back you go!`
}

/** The reason part of a miss line, for the card under the catch ("No pinching claws."). */
export const missReason = (line) => line.replace(/^(An?|Another) [^.!]*[.!] /, '').replace(/ Back you go!$/, '')
