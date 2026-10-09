// One short, true thing about each catch, read aloud for children who can't read yet.
// The toys and made-up friends say plainly that they are pretend. Real-animal facts:
//   narwhal, clownfish, trout: examples/_studio/SOURCES.md (narwhal tusk: the same NOAA page)
//   goldfish   https://seagrant.psu.edu/wp-content/uploads/2023/09/PA-Sea-Grant-AIS-fact-sheet-Goldfish-2023.pdf
//   pufferfish https://utmsi.utexas.edu/science-and-the-sea/print-article/a-swell-adaptation/
//   crab       https://www.st.nmfs.noaa.gov/Assets/Nemo/documents/lessons/Lesson_21/Lesson_21-Blue_crab_information_sheet.pdf
//   turtle     https://www.nps.gov/piro/learn/nature/reptiles.htm
//   octopus    https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives
//   jellyfish  https://oceanexplorer.noaa.gov/edu/materials/bioluminescence-fact-sheet.pdf
//              https://www.montereybayaquarium.org/animals/animals-a-to-z/lions-mane-jelly (Arctic)
//              https://www.montereybayaquarium.org/animals/animals-a-to-z/upside-down-jelly (tropical)
//   octopus den https://www.montereybayaquarium.org/animals/animals-a-to-z/giant-pacific-octopus
//   reefs      https://oceanservice.noaa.gov/education/tutorial_corals/coral05_distribution.html (warm, shallow)
//   snow crab  https://www.fisheries.noaa.gov/species/alaska-snow-crab (Bering, Beaufort and Chukchi Seas)
//   whale      https://ocean.si.edu/ocean-life/marine-mammals/whales
const NOTES = {
  goldfish: 'Real goldfish live in fresh water. People keep them in ponds and fish tanks.',
  bluefish: 'Blue Fish is a made-up friend who visits all our pretend waters.',
  clownfish: 'Real clownfish live on warm coral reefs. They hide in wiggly sea anemones.',
  trout: 'Real rainbow trout like cool, clean rivers and lakes.',
  duck: 'A rubber duck is a toy. Real ducks have feathers and can fly.',
  boot: 'Oops, a boot! Rubbish in the water can hurt animals, so we take it out.',
  pufferfish: 'A real pufferfish gulps water to puff up big when it is scared. Most live in warm seas.',
  crab: 'Many real crabs scuttle sideways on their walking legs. Some live on reefs, some in icy seas.',
  turtle: 'Real pond turtles climb onto logs to warm up in the sun.',
  octopus: 'A real octopus has eight arms. It hides in a cozy den between the rocks.',
  jellyfish: 'Real jellyfish drift in every sea, warm or icy. Many can make their own light.',
  narwhal: 'Real narwhals are whales from the icy Arctic Ocean. The long tusk is a tooth!',
  goldenfish: 'Golden Fish is a magic pretend fish. It is very hard to find!',
  chest: 'Treasure! A pretend surprise, not an animal.',
  whale: 'Real whales live in the ocean. They breathe air through a blowhole on top.',
}

export function fieldNote(id, name) {
  return NOTES[id] || `${name} lives in our pretend pond.`
}
