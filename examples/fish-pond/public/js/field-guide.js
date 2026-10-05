// Habitat cues distinguish the toy world from real animals. Sources are in SOURCES.md.
const NOTES = {
  clownfish: 'Real orange clownfish live in warm saltwater reefs with sea anemones. Our toy can visit the pretend pond.',
  trout: 'Real rainbow trout can live in freshwater rivers and lakes. Some rainbow trout travel to the sea.',
  narwhal: 'Real narwhals are whales that live in the Arctic Ocean. They need saltwater, not a garden pond.',
  duck: 'Our rubber duck is a toy. It is not a real duck.',
  boot: 'An old boot is an object, not an animal. Our pond story includes silly surprises.',
  chest: 'This treasure chest is an imaginary surprise, not an animal.',
  bluefish: 'Our Blue Fish is a made-up character. Its name does not identify a real species.',
  goldenfish: 'Our Golden Fish is a magical character in this pretend pond.',
}

export function fieldNote(id, name) {
  return NOTES[id] || `${name} is a toy in our pretend pond. Real animals of different species need different habitats.`
}
