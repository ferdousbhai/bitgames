/**
 * Bear's riddles: Bear asks for an animal by what it has ("something with a shell"), and the child
 * looks at who is swimming about and casts near the one that fits. A cast lands next to a swimmer
 * and that swimmer comes to bite, so where you cast is the choice (see sendBiter in main.js).
 * An animal that fits goes in the book; one that doesn't is put back gently (main.js startShow).
 *
 * Tier 1 (little ones): one thing you can see: a colour, stripes, spots, a shell, spikes, claws,
 * eight arms, tentacles, a tusk.
 * Tier 2: an idea you can't see but can learn here: is it a fish or not, does it breathe air or
 * breathe under water, does it have bones. Several animals may fit; any of them answers it (sorting, not guessing).
 * Tier 3 (7-8): two clues at once, an idea and a thing you can see ("not a fish, but has spots";
 * "a fish with no spikes"; "an animal with no bones and no shell"). Each clue must rule someone out, so
 * both have to be used.
 * Past tier 3 (after three two-clue riddles answered with the first catch): two different animals
 * that fit both clues ("two different animals that breathe air and have a hard shell").
 * Blue Fish and Golden Fish are pretend friends: they answer colours, never an idea clue.
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
 *   crayfish: fresh-water crustaceans, shell outside, claws, gills under the shell  https://en.wikipedia.org/wiki/Crayfish
 *   octopuses breathe with gills; jellyfish take oxygen in through their skin  https://en.wikipedia.org/wiki/Jellyfish
 *   ramshorn snails: fresh-water, air-breathing (lung) snails  https://en.wikipedia.org/wiki/Planorbidae
 *   Arctic cod: a fish of the icy sea, dark-spotted back  https://en.wikipedia.org/wiki/Polar_cod
 *   snails and octopuses are both molluscs  https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives
 *   ringed seals: Arctic mammals, ringed spots, breathe air at holes in the ice  https://www.fisheries.noaa.gov/species/ringed-seal
 */

/** What each catch has, as the child sees the models. Toys, the boot and the treasure fit no idea clue. */
export const HAS = {
  goldfish: ['orange', 'fish', 'water'],
  // Blue Fish and Golden Fish are pretend friends (the book sorts them into "Not real"), so they answer
  // what you can see (blue, yellow) but no idea clue: "a fish" means a real fish, with real gills
  bluefish: ['blue'],
  clownfish: ['orange', 'stripes', 'fish', 'water'],
  trout: ['spots', 'fish', 'water'],
  pufferfish: ['yellow', 'spikes', 'spots', 'fish', 'water'],
  goldenfish: ['yellow'],
  turtle: ['shell', 'notfish', 'air'],
  frog: ['spots', 'notfish', 'air'],
  // Olive brown (wild crayfish are; they only go red when cooked), so it is never asked for as orange
  // It breathes with gills tucked under its shell, so it answers "breathes under water" with the fish
  crayfish: ['shell', 'claws', 'notfish', 'nobones', 'water'],
  // The crab is drawn coral red, so it answers "red", never "orange"
  crab: ['red', 'shell', 'claws', 'notfish', 'nobones', 'water'],
  // A ramshorn pond snail: a coiled shell and a soft foot; it comes up to breathe air
  snail: ['shell', 'notfish', 'air', 'nobones'],
  // No spots: the model is plain lilac all over (its spots were too faint to see, so they are gone)
  octopus: ['arms', 'notfish', 'nobones', 'water'],
  // Arctic (polar) cod: a real fish of the icy sea, speckled with dark spots on a brown back
  cod: ['spots', 'fish', 'water'],
  // Ringed seal: grey (never blue), dark spots in pale rings; a mammal that breathes air
  seal: ['spots', 'notfish', 'air'],
  jellyfish: ['tentacles', 'notfish', 'nobones', 'water'],
  // Mottled grey, as real narwhals are (blender/models.py creature_narwhal), so it is never asked for as blue
  narwhal: ['spots', 'tusk', 'notfish', 'air'],
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
  fish: { tier: 2, icon: '🐟', word: 'a fish', ask: 'a fish', ask2: 'two different kinds of fish', is: "It's a fish", more: 'Can you find a different fish?', lead: 'a fish that', lead2: 'fish that', short: 'fish' },
  notfish: {
    tier: 2, icon: '🐟', not: true, word: 'not a fish', ask: 'an animal that is not a fish', ask2: 'two different animals that are not fish', is: "It's not a fish", more: 'Who else is not a fish?',
    lead: 'an animal that is not a fish,', lead2: 'animals that are not fish,', but: true, short: 'not fish',
  },
  air: { tier: 2, icon: '🫧', word: 'breathes air', ask: 'an animal that breathes air', ask2: 'two different animals that breathe air', is: 'It breathes air', more: 'Who else breathes air?', lead: 'an animal that breathes air and', lead2: 'animals that breathe air and', short: 'air' },
  // The other side of "breathes air": gills (fish, crabs, crayfish, octopus) or, for a jellyfish, its skin.
  // It tells the crayfish from the turtle and the snail ("breathes under water and has a hard shell") and the
  // cod from the narwhal and the seal ("breathes under water and has spots").
  water: {
    tier: 2, icon: '💧', word: 'breathes in water', ask: 'an animal that breathes under water', ask2: 'two different animals that breathe under water', is: 'It breathes under water',
    more: 'Who else breathes under water?', lead: 'an animal that breathes under water and', lead2: 'animals that breathe under water and', short: 'under water',
  },
  // nor: the looks "no bones" may take as a "no" too, because each reads as one easy phrase and holds the idea:
  // "an animal with no bones and no shell" (a crab has no bones, but wears a hard shell outside), and on the reef
  // "an animal with no bones and no tentacles" (the crab or the octopus: the only two-clue riddle the crab answers
  // there, since its red, shell and claws are each its own and one look alone would do)
  nobones: { tier: 2, icon: '🦴', not: true, word: 'no bones', ask: 'an animal with no bones', ask2: 'two different animals with no bones', is: 'It has no bones', more: 'Who else has no bones?', lead: 'an animal with no bones that', lead2: 'animals with no bones that', short: 'no bones', nor: ['shell', 'tentacles'] },
}

/** Why the answer fits an idea clue: the learning. Two or three ways to say it, so a trip doesn't repeat. */
const WHY = {
  fish: {
    // {a}: "A rainbow trout", so the line names the catch and gives the reason in one sentence
    any: ['{a} has fins, and gills to breathe under water.', '{a} swims with fins and breathes with gills.', '{a} has a backbone, fins and gills.'],
  },
  water: {
    any: ['{a} breathes with gills.', '{a} takes its breath from the water, with gills.'],
    crayfish: ['A crayfish breathes with gills, tucked under its shell.'],
    crab: ['A crab breathes with gills, under its shell.'],
    octopus: ['An octopus breathes with gills, like a fish.'],
    jellyfish: ['A jellyfish takes what it needs from the water, through its skin.'],
  },
  notfish: {
    turtle: ['Turtles are reptiles, not fish.', 'A turtle is a reptile that walks on legs.'],
    frog: ['Frogs are amphibians that start as tadpoles.', 'A frog has legs, not fins.'],
    narwhal: ['Narwhals are whales, not fish.', 'A narwhal comes up to breathe air.'],
    whale: ['Whales are not fish: they breathe air.'],
    seal: ['A seal is a mammal, like you, not a fish.', 'A seal swims with flippers, not fins.'],
    jellyfish: ["Jellyfish aren't fish at all!", 'A jellyfish has no fins, no gills and no bones.'],
    octopus: ['An octopus is not a fish, and has no bones.', 'An octopus crawls on its arms.'],
    crab: ['A crab has a hard shell and legs, not fins.', 'A crab walks on legs, under its hard shell.'],
    crayfish: ['A crayfish is a cousin of crabs, not a fish.', 'A crayfish walks on legs.'],
    snail: ['A snail creeps along on one soft foot, with no fins.', 'Snails are cousins of the octopus, not fish.'],
  },
  air: {
    turtle: ['Turtles come up to breathe air.', 'A turtle has lungs, like you.', 'A turtle pokes its nose up for air.'],
    frog: ['Frogs have lungs and breathe air.', 'A frog breathes a little through its skin, too.'],
    snail: ['A pond snail creeps up to the top to breathe air.', 'A pond snail takes a breath of air at the top.'],
    narwhal: ['Narwhals breathe air through a blowhole.'],
    whale: ['Whales breathe air through a blowhole.'],
    seal: ['A seal holds its breath under water, then comes up for air.', 'Seals breathe at holes in the ice.'],
  },
  nobones: {
    octopus: ['No bones, so it can squeeze through tiny gaps.', 'An octopus is soft all over.'],
    jellyfish: ['A jellyfish is soft all through, with no bones.', 'A jellyfish is mostly water.'],
    crab: ['A crab has a hard shell outside instead of bones.'],
    crayfish: ['A crayfish wears its hard shell outside, with no bones inside.'],
    snail: ['A snail is soft inside its shell, with no bones.', 'A snail keeps its soft body safe in its shell.'],
  },
}

/** Near misses that need their own reason, so a wrong catch still teaches something. Two ways to say each. */
const NEAR = {
  'tentacles:octopus': ['Those are arms, not tentacles. Jellyfish have tentacles.', 'An octopus has arms. Tentacles are long and thin, like a jellyfish.'],
  'arms:jellyfish': ['Those are tentacles, not arms. An octopus has eight arms.', 'Long thin tentacles! Eight arms is an octopus.'],
  'claws:turtle': ['Its claws are tiny, for walking. Look for big pinching claws.', 'Little walking claws. Bear wants big pinchers.'],
  'stripes:trout': ['Its stripe is pink. Look for white stripes.', 'One pink stripe. Bear wants white ones.'],
  // From a distance a turtle's raised shell plates can look like spots
  'spots:turtle': ['Those are shell plates, not spots.', 'Bumpy shell plates! Bear wants spots.'],
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
  water: ['It comes up to breathe air.', 'It has lungs, and breathes air.'],
  notfish: ['It is a fish!', 'That one is a fish! It has fins and gills.', "It's a fish: fins, gills and a backbone."],
}

const NOT_ANIMAL = new Set(['duck', 'boot', 'chest'])
/** Pretend friends miss every idea clue for the same reason the sorting page gives: they are not real. */
const PRETEND = {
  bluefish: ['Blue Fish is a pretend friend. Bear wants a real animal.', 'Blue Fish is only pretend. Bear wants a real one.'],
  goldenfish: ['Golden Fish is pretend magic. Bear wants a real animal.'],
}
const has = (id, c) => (HAS[id] ?? []).includes(c.t) !== !!c.neg

/** Fits every clue, and isn't a kind already found for this riddle (a "find two" wants two different ones). */
export const fits = (riddle, id) => !!riddle && riddle.clues.every((c) => has(id, c)) && !riddle.found.includes(id)

/**
 * Tier 2: "find two different animals that breathe air". Sorting is about the whole group, so after
 * the turtle Bear asks "Who else breathes air?", and the child has to think of the frog or the snail.
 */
export function twoOf(r) {
  const t = TRAITS[r.clues[0].t]
  if (r.clues.length > 1) {
    // Tier 3, once two-clue riddles come easily: two different animals that fit both clues
    // ("two animals that breathe air and have a shell"): every catch is checked against both
    const [a, b] = r.clues
    if (t.not && b.neg) return { ...r, need: 2, key: `${r.key}*2`, ask: `${t.ask2} and ${nor(b)}`, more: 'Can you find a different one that fits both clues?' }
    const second = (b.neg ? TRAITS[b.t].hasnt : TRAITS[b.t].has).replace(/^is /, 'are ').replace(/^has /, 'have ').replace(/^does /, 'do ')
    return { ...r, need: 2, key: `${r.key}*2`, ask: `two different ${t.lead2} ${t.but ? 'but ' : ''}${second}`, more: 'Can you find a different one that fits both clues?' }
  }
  if (!t.ask2) return r
  return { ...r, need: 2, ask: t.ask2 }
}

/** What Bear asks after one of two is found, or when the same kind is caught again. */
export const more = (r) => r.more ?? TRAITS[r.clues[0].t].more ?? ''

/** A riddle from its clues: what Bear says, and the picture and word on the chip. */
function riddle(clues, tier) {
  const [a, b] = clues.map((c) => TRAITS[c.t])
  if (!b) return { clues, tier, tries: 0, misses: 0, need: 1, found: [], key: clues[0].t, ask: a.ask, word: a.word, icons: [{ icon: a.icon, not: !!a.not }] }
  const neg = clues[1].neg
  // "an animal that is not a fish, but has spots" / "a fish that has no spikes" / "an animal that breathes air and has a shell"
  // (a "not" idea never takes a "not" look: see plainClues)
  const lead = a.but ? `${a.lead} but` : a.lead
  // "an animal with no bones and no shell" (the "no" looks a "no" idea takes: see TRAITS.nobones.nor)
  const ask = a.not && neg ? `${a.ask} and ${nor(clues[1])}` : `${lead} ${neg ? b.hasnt : b.has}`
  return {
    clues,
    tier,
    tries: 0,
    misses: 0,
    need: 1,
    found: [],
    key: `${clues[0].t}+${neg ? '!' : ''}${clues[1].t}`,
    ask,
    word: `${a.short} + ${neg ? 'no ' : ''}${b.word}`,
    icons: [
      { icon: a.icon, not: !!a.not },
      { icon: b.icon, not: neg },
    ],
  }
}

/**
 * Two clues are heard, not read, so a "not" idea (not a fish, no bones) only pairs with something the
 * animal has: "not a fish, but has spots", never "not a fish, and has no spots".
 */
const plainNegs = (t, f) => (!TRAITS[t].not || TRAITS[t].nor?.includes(f) ? [false, true] : [false])
/** A "no" look said after a "no" idea: "no shell". */
const nor = (c) => TRAITS[c.t].hasnt.replace(/^has /, '')

/**
 * A riddle that makes the child choose: at least one swimmer here fits and at least one doesn't.
 * `kinds` are the animals the child can see now; `last` is the riddle just asked and `recent`
 * the keys of the last few, which are left out while there are others to ask. `answered` are the
 * animals that solved the last few riddles: a riddle with another answer is preferred. `trip` is every
 * riddle key asked this trip.
 */
export function makeRiddle(kinds, tier, last, recent = [], answered = [], { two = false, want = null, avoid = [], trip = [] } = {}) {
  const ids = [...new Set(kinds)]
  const who = (clues) => ids.filter((id) => clues.every((c) => has(id, c)))
  // Who answers, as the child sees it. Every riddle led by "a fish" is one answer, "the fish": on the reef
  // "a fish that is not orange / has no spikes / has no spots..." is always clownfish or pufferfish, so five
  // of them must not crowd out the octopus, jellyfish and crab
  const groupOf = (c) => (c[0].t === 'fish' ? 'fish' : who(c).join())
  // Someone fits, and some animal doesn't (a duck or a boot not breathing under water is no choice)
  const ok = (clues) => who(clues).length > 0 && ids.some((id) => !NOT_ANIMAL.has(id) && !who(clues).includes(id))
  const single = (k) => Object.keys(TRAITS).filter((t) => TRAITS[t].tier === k).map((t) => [{ t }]).filter(ok)
  let pool = []
  if (tier >= 3) {
    // Two clues, an idea and a thing you can see, where each clue rules someone out
    for (const t of Object.keys(TRAITS).filter((k) => TRAITS[k].tier === 2)) {
      for (const f of Object.keys(TRAITS).filter((k) => TRAITS[k].tier === 1)) {
        for (const neg of plainNegs(t, f)) {
          const clues = [{ t }, { t: f, neg }]
          const both = who(clues).length
          if (both && ok(clues) && both < who([clues[0]]).length && both < who([clues[1]]).length) pool.push(clues)
        }
      }
    }
  }
  // Where only one or two two-clue riddles fit (the Icy Sea has one real fish), the idea riddles join
  // them, so the same narwhal isn't the answer every time
  if (tier >= 3 && pool.length < 3) pool = [...pool, ...single(2)]
  if (!pool.length && tier >= 2) pool = single(2)
  if (!pool.length) pool = single(1)
  // A riddle this animal answers (main.js: a little one stuck on one riddle gets one the ringed swimmer fits)
  if (want) {
    const mine = [...pool, ...single(1)].filter((c) => who(c).includes(want))
    if (mine.length) pool = mine
  }
  // Prefer clues that fit the few, not the many, so the choice is a real look, not a safe bet
  // ("a fish" where three of four swimmers are fish is no riddle at all)
  const few = pool.filter((c) => who(c).length <= ids.length * 0.6)
  if (few.length) pool = few
  // Riddles not asked lately come first, before the turn-taking below (else the one riddle with another idea
  // came up every other time: "no bones and no shell" was 40% of the reef's two-clue riddles)
  const keyOf = (c) => riddle(c, tier).key
  // `avoid`: what an item still on Bear's list asks (that riddle is the list's), left out while others fit
  const open = pool.filter((c) => !avoid.includes(keyOf(c)))
  if (open.length) pool = open
  // One way to ask for each answer in a trip: once "a fish that has no spikes" has asked for the clownfish,
  // the clownfish is asked for that way again (`trip`: every riddle asked this trip), so the reef's fish
  // riddles are two phrasings to read, not five ways round one coin flip
  const said = (c) => trip.includes(keyOf(c))
  const sameAsk = (c, d) => c.length > 1 && d.length > 1 && groupOf(d) === groupOf(c) && who(d).join() === who(c).join()
  pool = pool.filter((c) => said(c) || !pool.some((d) => said(d) && sameAsk(c, d)))
  // (only as many as leaves a choice of two, so a small pool doesn't fall into one fixed order)
  const asked = recent.map((k) => k.replace(/\*2$/, '')).slice(0, Math.max(1, new Set(pool.map(keyOf)).size - 2)) // a "find two" counts as its riddle
  // (within each answer, so the reef's five fish riddles can't push out its two for the octopus, jellyfish
  // and crab: which answer comes round is the weighting's job, below)
  pool = pool.filter((c) => !asked.includes(keyOf(c)) || pool.every((d) => groupOf(d) !== groupOf(c) || asked.includes(keyOf(d))))
  // Two clues have to be read every time, so at tier 3 the same answer (or idea) may come twice running now
  // and then: always turning away from the last one made a pattern a careful child could learn instead of
  // the clues (on the reef the answer used to swing clownfish, pufferfish, clownfish...).
  const vary = () => tier < 3 || Math.random() < 0.6
  // Never the same answer twice running (in the lake "not a fish" and "breathes air" can both be the turtle),
  // where there are three answers or more to go round: with two (the reef's tier 2 is fish, or the octopus,
  // jellyfish and crab) that rule made a strict swing, fish, not fish, fish, a child could follow without reading
  if (last) {
    const before = groupOf(last.clues)
    const same = last.clues.map((x) => x.t).join()
    const other = vary() && new Set(pool.map(groupOf)).size >= 3
    const fresh = pool.filter((c) => (!other || groupOf(c) !== before) && c.map((x) => x.t).join() !== same)
    if (fresh.length) pool = fresh
    // and lead with a different idea where there is one ("not a fish" five times running is samey)
    const turn = pool.filter((c) => c[0].t !== last.clues[0].t)
    // (tier 3 is left to the answer weighting below: two clues are read anyway, and turning away from the
    // fish-led riddles left the reef crab as the answer a third of the time)
    if (turn.length && tier < 3) pool = turn
  }
  // "A fish" is the easiest idea: tier 2 mostly asks the others (breathes air, no bones, not a fish)
  if (tier === 2) {
    const harder = pool.filter((c) => c[0].t !== 'fish')
    if (harder.length && Math.random() < 0.65) pool = harder
  }
  // The step past two clues: two different animals that fit both, where two such kinds are in view
  // (about half the time, and never forced straight after another "find two": the reef has two of those, and
  // forcing one each time made them swing, no shell, no tentacles, no shell, with the one-answer riddles rare)
  if (two && !(last?.need > 1) && Math.random() < 0.6) {
    const pair = pool.filter((c) => c.length > 1 && who(c).length >= 2)
    if (pair.length) pool = pair
  }
  // Choose who answers first, then a riddle for them: on the reef the fish, the octopus or jellyfish ("no bones
  // and no shell") and the crab or octopus ("no bones and no tentacles") each come round about as often. An answer
  // that came lately is less likely (never the one just found below tier 3), so neither one octopus
  // three times running nor a narwhal, seal, narwhal, seal swing is something to learn instead of the clues.
  const groups = new Map()
  for (const c of pool) groups.set(groupOf(c), [...(groups.get(groupOf(c)) ?? []), c])
  const byWho = [...groups.values()]
  const LATELY = [tier < 3 ? 0 : 0.1, 0.35, 0.7]
  const weight = (g) => {
    const d = Math.min(...g.flatMap(who).map((id) => answered.indexOf(id)).filter((i) => i >= 0))
    // (at tier 3 the fish riddles, the easiest idea, come round less than the others: tier 2 has its own rule)
    return (LATELY[d] ?? 1) * (tier >= 3 && groupOf(g[0]) === 'fish' ? 0.5 : 1)
  }
  const ws = byWho.map(weight)
  let roll = Math.random() * ws.reduce((x, y) => x + y, 0)
  const group = (ws.some((w) => w > 0) ? byWho.find((g, i) => (roll -= ws[i]) < 0) : null) ?? byWho[(Math.random() * byWho.length) | 0] ?? []
  const clues = group[(Math.random() * group.length) | 0]
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
  for (const t of ideas) for (const f of looks) for (const neg of plainNegs(t, f)) sets.push([{ t }, { t: f, neg }])
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
  // One for each water first, then a third: never two items the same animal could answer. The list is
  // for children who reached two-clue riddles, so an idea or two clues come first; a single thing to see
  // ("tentacles") only when nothing else fits.
  const list = []
  const clash = (c) => list.some((l) => [...c.answers].some((id) => l.answers.has(id)))
  const look = (c) => c.clues.length === 1 && TRAITS[c.clues[0].t].tier === 1
  for (const w of ['fresh', 'sea', null]) {
    const open = cands.filter((x) => (!w || x.water === w) && !list.includes(x) && !clash(x))
    const c = open.find((x) => !look(x)) ?? open[0]
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
 * One line from a list, a fresh one each time in a trip (`said` remembers what was said). Once all have
 * been said this trip it returns '' and the caller says less: a sentence is never said twice in a trip.
 */
function pick(list, said) {
  const line = list?.find((s) => !said?.has(s)) ?? ''
  if (line) said?.add(line)
  return line
}

/** A whole sentence once a trip; a repeat falls back to its short form ("Yes! A blue fish!"). */
function once(line, short, said) {
  if (!said) return line
  if (said.has(line)) return short
  said.add(line)
  return line
}

/** A name inside a sentence: lower case, but a place name keeps its capital ("an Arctic cod"). */
export const lower = (name) => name.toLowerCase().replace(/\barctic\b/, 'Arctic')
const article = (name) => `${/^[aeiou]/i.test(name) ? 'An' : 'A'} ${lower(name)}`

/**
 * What Bear says when a catch reaches the stage: its name, whether it fits, and why. `said` is the
 * trip's set of sentences: no whole sentence is said twice in a trip (a repeat says the short form).
 * A miss also leaves its reason on `r.reason`, for the card under the catch.
 */
export function verdict(r, id, name, said) {
  if (!r) return null
  // `mute`: this short reason was already said this trip, so the card shows it and the voice rests
  r.mute = false
  r.reason = ''
  const a = article(name)
  const yes = `Yes! ${a}!`
  if (r.found.includes(id)) {
    // The same kind again: the first time says why it goes back, a repeat only asks "Who else?"
    const again = r.lastMiss === `${id}:again`
    r.lastMiss = `${id}:again`
    r.reason = more(r)
    // ("Can you find a different fish?" already said this trip is left to the card and the empty slot)
    if (again) {
      r.mute = !!said?.has(more(r))
      return more(r)
    }
    return `Another ${lower(name)}! Back you go. ${once(more(r), '', said)}`.trim()
  }
  if (fits(r, id)) {
    r.lastMiss = null
    const idea = r.clues.find((c) => TRAITS[c.t].tier === 2)
    // One of two found: the reason (or, for two clues, how it fits both), then "Who else breathes air?"
    if (r.found.length + 1 < r.need) {
      // Each part once a trip: "Who else breathes air?" said before is left to the chip's empty slot
      const why = r.clues.length > 1 ? once(both(r, idea), '', said) : whyLine(idea.t, id, a, said)
      const ask = once(more(r), '', said)
      return `${named(yes, why, id)} ${ask}`.replace(/ +/g, ' ').trim()
    }
    // "Yes! A goldfish is orange!" (but not "a blue fish is blue")
    if (!idea) return lower(name).includes(TRAITS[r.clues[0].t].word) ? yes : once(`Yes! ${a} ${TRAITS[r.clues[0].t].has}!`, yes, said)
    // Two clues: say how it fits both, which is the thinking ("It's a fish, and it has spots.")
    if (r.clues.length > 1) return `${yes} ${once(both(r, idea), '', said)}`.trim()
    return named(yes, whyLine(idea.t, id, a, said), id)
  }
  // Explain the first clue it misses. The same animal missing the same clue again, in a row, or any
  // miss after two on this riddle, hears only the short reason, once a trip: the card shows it after
  // that, and the voice doesn't nag (the soft ring on the water is helping by then).
  const c = r.clues.find((x) => !has(id, x))
  const t = TRAITS[c.t]
  const key = `${id}:${c.neg ? '!' : ''}${c.t}`
  const again = r.lastMiss === key
  r.lastMiss = key
  let why
  if (NOT_ANIMAL.has(id) && t.tier === 2) why = ["That's not an animal!"]
  // A pretend friend: the same reason the sorting page gives ("Blue Fish is a pretend friend.")
  else if (PRETEND[id] && t.tier === 2) why = PRETEND[id]
  // (without the reasons that only say "not a fish" again: "That's not a fish! An octopus is not a fish.")
  else if (c.t === 'fish') why = ["That's not a fish!", ...(WHY.notfish[id] ?? []).filter((w) => !/not (a )?fish|n't fish/i.test(w)).map((w) => `That's not a fish! ${w}`)]
  else if (NOT_IDEA[c.t]) why = NOT_IDEA[c.t]
  else if (c.neg) why = [`It ${t.has}.`, `Bear wants one that ${t.hasnt}.`]
  else why = NEAR[`${c.t}:${id}`] ?? [t.no, `${t.no} Bear wants ${t.ask}.`, `Look for ${t.ask}.`]
  const short = NEAR[`${c.t}:${id}`] && !PRETEND[id] ? t.no : why[0]
  r.reason = short
  if (again || r.misses >= 2) {
    const k = `short:${short}`
    r.mute = !!said?.has(k)
    said?.add(k)
    return short
  }
  const reason = pick(why, said)
  if (reason) r.reason = reason
  // ("No tentacles." said inside the first miss line counts: a second miss for it is the card and a plip)
  if (reason === short) said?.add(`short:${short}`)
  // Every reason for this miss was said earlier in the trip: just the name (the card shows why)
  return reason ? `${a}. ${reason} Back you go!` : `${a}. Back you go!`
}

/** Why this catch fits an idea, a fresh line each time in a trip ("{a}" names it: "A rainbow trout has fins..."). */
const whyLine = (t, id, a, said) => pick((WHY[t]?.[id] ?? WHY[t]?.any)?.map((w) => w.replace('{a}', a)), said)
/**
 * "Yes!" and the reason, which names the catch itself where it can ("Yes! A crayfish wears its hard shell
 * outside..."), so a right answer is two short sentences at most, not "Yes! A crayfish! A crayfish...".
 */
const named = (yes, why, id) => (why && new RegExp(`\\b${id}`, 'i').test(why) ? `Yes! ${why}` : `${yes} ${why}`).trim()

/** How a catch fits both of two clues: "It's a fish, and it has no spots." */
function both(r, idea) {
  const c = r.clues.find((x) => x !== idea)
  return `${TRAITS[idea.t].is}, and it ${c.neg ? TRAITS[c.t].hasnt : TRAITS[c.t].has}.`
}

/** The reason part of a miss line, for the card under the catch ("No pinching claws."). */
export const missReason = (line) => line.replace(/^(An?|Another) [^.!]*[.!] /, '').replace(/ Back you go!$/, '')
