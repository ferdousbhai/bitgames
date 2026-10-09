// One short, true thing about each catch, read aloud for children who can't read yet.
// The toys and made-up friends say plainly that they are pretend. Real-animal facts:
//   narwhal, clownfish, trout: examples/_studio/SOURCES.md (narwhal tusk: the same NOAA page)
//   goldfish   https://seagrant.psu.edu/wp-content/uploads/2023/09/PA-Sea-Grant-AIS-fact-sheet-Goldfish-2023.pdf
//   pufferfish https://utmsi.utexas.edu/science-and-the-sea/print-article/a-swell-adaptation/
//   crab       https://www.st.nmfs.noaa.gov/Assets/Nemo/documents/lessons/Lesson_21/Lesson_21-Blue_crab_information_sheet.pdf
//   turtle     https://www.nps.gov/piro/learn/nature/reptiles.htm
//   octopus    https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives
//   jellyfish  https://oceanexplorer.noaa.gov/edu/materials/bioluminescence-fact-sheet.pdf
//   whale      https://ocean.si.edu/ocean-life/marine-mammals/whales
const NOTES = {
  goldfish: 'Real goldfish live in fresh water. People keep them in ponds and fish tanks.',
  bluefish: 'Blue Fish is a made-up friend who lives in our pretend pond.',
  clownfish: 'Real clownfish live in warm seas, not lakes. They hide in wiggly sea anemones.',
  trout: 'Real rainbow trout like cool, clean rivers and lakes.',
  duck: 'A rubber duck is a toy. Real ducks have feathers and can fly.',
  boot: 'Oops, a boot! Rubbish in the water can hurt animals, so we take it out.',
  pufferfish: 'A real pufferfish gulps water to puff up big when it is scared.',
  crab: 'Many real crabs scuttle sideways on their walking legs.',
  turtle: 'Real pond turtles climb onto logs to warm up in the sun.',
  octopus: 'A real octopus has eight arms and lives in the sea.',
  jellyfish: 'Most real jellyfish live in the sea. Some can make their own light in the dark.',
  narwhal: 'Real narwhals are whales from the icy Arctic Ocean. The long tusk is a tooth!',
  goldenfish: 'Golden Fish is a magic pretend fish. It is very hard to find!',
  chest: 'Treasure! A pretend surprise, not an animal.',
  whale: 'Real whales live in the ocean. They breathe air through a blowhole on top.',
}

export function fieldNote(id, name) {
  return NOTES[id] || `${name} lives in our pretend pond.`
}
