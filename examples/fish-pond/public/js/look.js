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
 */
export const LOOK = {
  clownfish: [
    { part: 'stripes', at: [0.02, -0.24, 0.04], fact: 'Clownfish hide in sea anemones. A slimy coat keeps the stings from hurting them.' },
    { part: 'fins', at: [-0.02, 0, 0.42], fact: 'Clownfish dads guard their eggs and fan them with their fins.' },
  ],
  goldfish: [
    { part: 'tail', at: [-0.64, -0.02, 0.02], fact: 'A fish swishes its tail from side to side to push itself along.' },
    { part: 'back fin', at: [-0.02, 0, 0.44], fact: 'The fin on its back keeps a fish steady, so it does not roll over.' },
  ],
  bluefish: [{ part: 'side fins', at: [0.0, -0.22, -0.12], fact: 'Fish use their side fins to turn and to stop.' }],
  trout: [
    { part: 'stripe', at: [0.0, -0.2, -0.02], fact: 'That pinky-red stripe is why it is called a rainbow trout.' },
    { part: 'spots', at: [-0.08, -0.18, 0.1], fact: 'Rainbow trout have lots of little black spots all along the body.' },
  ],
  pufferfish: [{ part: 'spikes', at: [-0.12, -0.18, 0.46], fact: 'When it puffs up, its spikes stand up. No one wants a prickly snack!' }],
  crab: [{ part: 'shell', at: [0.04, -0.06, 0.22], fact: 'Its hard shell is on the outside. To grow bigger, a crab wriggles out of its old shell.' }],
  turtle: [{ part: 'shell', at: [-0.02, -0.12, 0.3], fact: 'Its top shell is called a carapace. Pond turtles warm their shells in the sun.' }],
  octopus: [{ part: 'arms', at: [0.24, -0.42, -0.06], fact: 'Count its arms: eight! The suckers on its arms can grab, and even taste.' }],
  jellyfish: [{ part: 'tentacles', at: [0.1, -0.14, -0.34], fact: 'Jellyfish catch tiny food with their stingy tentacles. A jellyfish has no bones at all.' }],
  narwhal: [{ part: 'tusk', at: [0.8, 0, 0.14], fact: 'That long tusk is really a tooth! It grows out through the front of its jaw.' }],
  whale: [
    { part: 'blowhole', at: [0.25, 0, 0.56], fact: 'Whales breathe air through the blowhole on top of their head.' },
    { part: 'tail', at: [-0.98, 0, 0.05], fact: 'A whale swims by moving its tail up and down. Fish swish theirs side to side.' },
  ],
  duck: [{ part: 'beak', at: [0.47, -0.06, 0.32], fact: 'This duck is a toy. Real ducks scoop up food with their flat beaks.' }],
  boot: [{ part: 'laces', at: [0.05, -0.06, 0.36], fact: 'Laces and rubbish can tangle sea animals. Taking it out helps them.' }],
  goldenfish: [{ part: 'crown', at: [0.02, 0, 0.5], fact: 'A crown? Golden Fish is pretend! Real fish have a fin there instead.' }],
  chest: [{ part: 'gold coins', at: [0, 0, 0.42], fact: 'Shiny gold coins! This treasure is pretend, just for fun.' }],
}

/** Which feature to show: the next one each time the same creature is caught. */
export function lookFor(id, timesCaught) {
  const list = LOOK[id]
  if (!list?.length) return null
  return list[(Math.max(1, timesCaught) - 1) % list.length]
}
