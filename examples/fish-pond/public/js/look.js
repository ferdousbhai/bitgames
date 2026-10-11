/**
 * "Look closer": after a catch, one feature of the creature glows softly and Bear asks about it
 * ("See its stripes?"). Tapping the glow reads one short, true fact about that feature. It is
 * optional: tapping anywhere else carries on as before. A creature caught again shows its next
 * feature, so return visits find something new.
 *
 * `at` is a point on the model in blender/models.py coordinates [x, y, z] (nose +X, -Y is the side
 * the camera sees); Creatures.featurePoint turns it into a point on the game model.
 *
 * Sources (checked 2026-10-09):
 *   clownfish  https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/orange-clownfish/
 *              (three white bands; mucus coat against anemone stings; the male fans the eggs)
 *   fins       https://en.wikipedia.org/wiki/Fish_fin (tail pushes; back fin stops rolling; side fins turn and stop)
 *   trout      https://en.wikipedia.org/wiki/Rainbow_trout (reddish side stripe; black spots)
 *   pufferfish https://utmsi.utexas.edu/science-and-the-sea/print-article/a-swell-adaptation/
 *   crab       https://www.fisheries.noaa.gov/species/alaska-snow-crab (grows only by moulting its shell)
 *   turtle     https://www.nps.gov/piro/learn/nature/reptiles.htm (carapace; sunning on logs)
 *   octopus    https://www.montereybayaquarium.org/animals/animals-a-to-z/giant-pacific-octopus (eight arms; suckers grip and taste)
 *   jellyfish  https://en.wikipedia.org/wiki/Jellyfish (stinging tentacles catch prey; no bones; no true brain)
 *   narwhal    https://www.fisheries.noaa.gov/species/narwhal (the tusk is a tooth through the front of the jaw)
 *   whale      https://ocean.si.edu/ocean-life/marine-mammals/whales (blowhole); whales beat their tails up and down
 *   frog       https://en.wikipedia.org/wiki/Frog (webbed hind feet for swimming; lungs and breathing through the skin)
 *   crayfish   https://en.wikipedia.org/wiki/Crayfish (claws; the tail flip that shoots it backwards to escape)
 *   snail      https://en.wikipedia.org/wiki/Planorbidae (ramshorn: flat coiled shell, tentacles)
 *              https://en.wikipedia.org/wiki/Gastropod_shell (the shell grows with the snail, coiling as it grows)
 *   octopus    https://www.montereybayaquarium.org/animals/animals-a-to-z/giant-pacific-octopus (can regrow a lost arm)
 *   turtle     https://en.wikipedia.org/wiki/Turtle_shell (the shell is joined to the backbone and ribs)
 *   narwhal    https://www.fisheries.noaa.gov/species/narwhal (tusk mostly in males, up to about 3 m)
 *   fins       pectoral fins sit where our arms are: https://en.wikipedia.org/wiki/Pectoral_fin
 *   seal       https://www.fisheries.noaa.gov/species/ringed-seal (light rings round dark spots; claws on the front
 *              flippers keep breathing holes open in the ice); whiskers feel for fish: https://en.wikipedia.org/wiki/Whiskers
 *   cod        https://en.wikipedia.org/wiki/Gadidae (cods have three dorsal fins and a chin barbel)
 *              https://en.wikipedia.org/wiki/Barbel_(anatomy) (barbels carry taste buds, for finding food)
 *
 * `facts`: two ways to tell it, so a second catch in a trip hears something new (main.js lookFact).
 * A look whose facts have all been heard this trip doesn't glow again.
 */
/**
 * Points to tap one by one, for features worth counting (builder coordinates, like `at`).
 * Octopus: near the tip of each of its eight arms. This repeats creature_octopus / octo_arm_ends in
 * blender/models.py: the arms fan round the lower half of the head like a star, so all eight tips show
 * from the front, clear of the face. Clownfish: its three white bands (creature_clownfish band centres).
 */
const OCTO_TIPS = [[-0.98, -0.1], [-0.62, -0.46], [-0.8, 0.3], [-0.2, -0.5], [0.2, -0.5], [0.8, 0.3], [0.62, -0.46], [0.98, -0.1]]
const octoArms = (() => {
  const base = Array.from({ length: 8 }, (_, k) => {
    const a = (Math.PI * 2 * (k + 0.5)) / 8
    return { k, x: Math.cos(a) * 0.2, y: Math.sin(a) * 0.2, front: Math.cos(a) > 0 }
  })
  const r3 = (v) => Math.round(v * 1000) / 1000
  const key = (b) => [r3(b.y), b.y < 0 ? +b.front : +!b.front]
  const order = [...base].sort((p, q) => key(p)[0] - key(q)[0] || key(p)[1] - key(q)[1])
  const u = 0.86
  const e = 1 - (1 - u) ** 2
  return order.map((b, rank) => {
    const [ty, tz] = OCTO_TIPS[rank]
    const tx = b.front ? 0.2 : -0.1
    return [b.x + (tx - b.x) * u, b.y + (ty - b.y) * e, 0.1 + (tz - 0.1) * u + 0.16 * u ** 3 - 0.06 * Math.sin(Math.PI * u)]
  })
})()

export const LOOK = {
  clownfish: [
    {
      part: 'stripes',
      at: [0.02, -0.24, 0.04],
      count: [[0.24, -0.2, 0.02], [0.01, -0.24, 0.02], [-0.24, -0.16, 0.01]],
      facts: ['Clownfish hide in sea anemones. A slimy coat keeps the stings from hurting them.', 'A clownfish never swims far from its anemone home.'],
    },
    { part: 'fins', at: [-0.02, 0, 0.42], fact: 'Clownfish dads guard their eggs and fan them with their fins.' },
  ],
  goldfish: [
    { part: 'tail', at: [-0.64, -0.02, 0.02], fact: 'A fish swishes its tail from side to side to push itself along.' },
    { part: 'back fin', at: [-0.02, 0, 0.44], fact: 'The fin on its back keeps a fish steady, so it does not roll over.' },
  ],
  bluefish: [{ part: 'side fins', at: [0.0, -0.22, -0.12], facts: ['Blue Fish is pretend, but real fish have side fins like these. They turn and stop with them.', 'Its side fins are where your arms are. They help it steer.'] }],
  trout: [
    { part: 'stripe', at: [0.0, -0.2, -0.02], fact: 'That pinky-red stripe is why it is called a rainbow trout.' },
    { part: 'spots', at: [-0.08, -0.18, 0.1], fact: 'Rainbow trout have lots of little black spots all along the body.' },
  ],
  pufferfish: [
    {
      part: 'spikes',
      at: [-0.12, -0.18, 0.46],
      facts: ['When it puffs up, its spikes stand up. No one wants a prickly snack!', 'A pufferfish puffs up by gulping lots of water.'],
    },
  ],
  crab: [
    {
      part: 'shell',
      at: [0.04, -0.06, 0.22],
      facts: ['Its hard shell is on the outside. To grow bigger, a crab wriggles out of its old shell.', 'A crab walks sideways on its legs, with its claws held up in front.'],
    },
  ],
  turtle: [
    {
      part: 'shell',
      at: [-0.02, -0.12, 0.3],
      facts: ['Its top shell is called a carapace. Pond turtles warm their shells in the sun.', 'A turtle can never take its shell off. It is joined to its backbone.'],
    },
  ],
  octopus: [{ part: 'arms', at: [0.24, -0.42, -0.06], count: octoArms, facts: ['The suckers on its arms can grab, and even taste.', 'If an octopus loses an arm, a new one grows back.'] }],
  jellyfish: [
    {
      part: 'tentacles',
      at: [0.1, -0.14, -0.34],
      facts: ['Jellyfish catch tiny food with their stingy tentacles. A jellyfish has no bones at all.', 'A jellyfish drifts with the water, its tentacles trailing behind.'],
    },
  ],
  narwhal: [
    {
      part: 'tusk',
      at: [0.8, 0, 0.14],
      facts: ['That long tusk is really a tooth! It grows out through the front of its jaw.', 'Mostly the boy narwhals grow a tusk. It can be longer than a grown-up is tall.'],
    },
  ],
  whale: [
    { part: 'blowhole', at: [0.25, 0, 0.56], fact: 'Whales breathe air through the blowhole on top of their head.' },
    { part: 'tail', at: [-0.98, 0, 0.05], fact: 'A whale swims by moving its tail up and down. Fish swish theirs side to side.' },
  ],
  frog: [
    { part: 'back legs', at: [-0.3, -0.42, -0.1], fact: 'Long back legs and webbed feet push a frog through the water.' },
    { part: 'skin', at: [0.0, -0.28, 0.02], fact: 'A frog breathes with its lungs, and a little through its wet skin too.' },
  ],
  crayfish: [
    { part: 'claws', at: [0.64, -0.3, 0.02], fact: 'A crayfish grabs its food with its big claws.' },
    { part: 'tail', at: [-0.42, -0.08, -0.02], fact: 'Scared? A crayfish flips its tail and zooms away backwards!' },
  ],
  snail: [
    { part: 'shell', at: [-0.06, -0.14, 0.14], facts: ['Its shell grows with it, round and round in a spiral.', 'Scared? A snail pulls its soft body right inside its shell.'] },
    { part: 'feelers', at: [0.46, -0.14, 0.2], fact: 'A snail feels and smells its way with its feelers.' },
  ],
  // Arctic cod (blender/models.py creature_cod): three back fins at x 0.16, -0.04, -0.24; the barbel under the chin
  cod: [
    {
      part: 'back fins',
      at: [-0.04, 0, 0.3],
      count: [[0.16, 0, 0.3], [-0.04, 0, 0.31], [-0.24, 0, 0.29]],
      facts: ['A cod has three fins on its back. Lots of fish have just one.', 'Three back fins help a cod turn and stay steady.'],
    },
    { part: 'chin whisker', at: [0.45, -0.02, -0.2], fact: 'A cod feels and tastes for food on the sea floor with its chin whisker.' },
  ],
  // Ringed seal (blender/models.py creature_seal): ringed spots on the side, whiskers on the muzzle, a front flipper
  seal: [
    { part: 'spots', at: [-0.12, -0.25, 0.09], facts: ['Each dark spot has a pale ring round it. That is why it is called a ringed seal.'] },
    { part: 'whiskers', at: [0.68, -0.12, -0.01], fact: 'A seal feels for fish in dark water with its whiskers.' },
    { part: 'flippers', at: [0.06, -0.3, -0.14], fact: 'A ringed seal scratches a breathing hole in the ice with the claws on its flippers.' },
  ],
  duck: [{ part: 'beak', at: [0.47, -0.06, 0.32], fact: 'This duck is a toy. Real ducks scoop up food with their flat beaks.' }],
  boot: [{ part: 'laces', at: [0.05, -0.06, 0.36], fact: 'Laces and rubbish can tangle sea animals. Taking it out helps them.' }],
  goldenfish: [{ part: 'crown', at: [0.02, 0, 0.5], fact: 'A crown? Golden Fish is pretend! Real fish have a fin there instead.' }],
  chest: [{ part: 'gold coins', at: [0, 0, 0.42], fact: 'Shiny gold coins! This treasure is pretend, just for fun.' }],
}

/** Its facts, as a list (most looks have one, the one-feature animals two). */
export const factsOf = (look) => look.facts ?? [look.fact]

/** Which feature to show: the next one each time the same creature is caught. */
export function lookFor(id, timesCaught) {
  const list = LOOK[id]
  if (!list?.length) return null
  return list[(Math.max(1, timesCaught) - 1) % list.length]
}
