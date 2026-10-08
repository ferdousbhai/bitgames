# Catalogue quality and engagement audit — 8 October 2026

**Execution update:** the owner approved the exact 89-game wipe. All 89 local projects and their generator/runtime are removed; the 12 originals are preserved. Remote Cloudflare/store retirement and Git commit/push remain pending. See [execution evidence](wipe-execution-2026-10-08.json). The judgments below describe the pre-wipe catalogue.

Three parallel source judges reviewed all **101 projects**. Majority triage: **73 removal candidates, 16 substantial-rework concepts, 12 retain candidates**. All twelve originals were unanimous retain candidates; the owner also explicitly identified the original games and Splash Tank as favourites. Protect the original twelve and leave Splash Tank’s separate repository untouched.

**Recommendation: retire the current 89-game generated batch.** Seventy-three are clear removal recommendations by majority; sixteen have ideas worth considering in a future redesign, but none of the generated titles has a majority retain recommendation. Salvage means recording an idea, not keeping the current game released. Fifty-eight generated removal recommendations and fourteen rework recommendations were unanimous; seventeen generated titles had disagreement. This is a proposal, not an executed wipe.

The exact 89 game IDs, local paths and configured Workers are in [the proposed wipe manifest](proposed-wipe-2026-10-08.json). Fourteen have recorded deployment URLs; seventy-five have none recorded. Remote account existence and current listings are unverified, so this is not a claim of exactly fourteen remote resources. All individual votes, rationales and duplicates are in [the combined report](combined-2026-10-08.json).

## Why the direction failed

- Much of the generated catalogue repeats “read/hear target → choose or count → submit → praise → Next” five times. `examples/_studio/runtime/engine.js:success` disables action buttons and adds Next; `startRound` clears the stage for the next isolated challenge. This is functional practice, with limited ownership of a changing world.
- Theme changes frequently create extra listings without changing play. Bee/Turtle/Rover/Penguin share route grids/arrows/Go; Bear/Parcel/Pebble share balance interactions; Butterfly/Bead/Train/Reef share repeating-gap puzzles; Cauldron/Smoothies/Jellyfish/Planet share the same three paint recipes and two-pour/stir structure.
- Some titles promise activities the child does not get: Cloud Number Race has no race, Deep Sea Divers has no controlled diving, and Weather Wardrobe offers answer choices rather than free dressing. Models and celebrations cannot supply these missing activities.
- Several distinctions are real: six-arm snowflake propagation differs from a mirror grid, tangram has actual movable pieces, and composition/free-building offer agency. The judges credited these. Educationally different material and useful affordances still do not establish a satisfying standalone game or justify every reskin.

## Evidence and limits

The parent’s report is direct evidence about their children’s experience. These three AI judgments are source-grounded hypotheses about individual games, not observed fun scores. They share a model and source base, so agreement is not a statistical proof. No fresh browser play, child session, educator session or physical-iPad test was completed. Pending local changes can differ from deployed bytes; the audit does not claim exact live-version verification. Prior green tests and cover reviews establish technical or art properties only. High confidence in a duplicate fingerprint is not high confidence that no child can enjoy it.

Independent reports: [play](judge-play-2026-10-08.md), [distinctness](judge-distinctness-2026-10-08.md), [child experience](judge-child-2026-10-08.md). Each contains per-game source evidence. Coordinator verified exact 101-ID coverage, verdict enums and referenced evidence paths.

## Cleanup and the next quality bar

The old 100+ release objective is superseded; its queue must not resume. [The cleanup plan](CLEANUP_PLAN_2026-10-08.md) covers catalogue/generator removal, preventing seed resurrection, full store retirement and exact-account Worker cleanup. No deletion has run. Because account deletion is irreversible and the owner requested a scan before the wipe, review/confirm the concrete 89-ID selection before executing. Git/network restrictions currently prevent completing and verifying the account cleanup.

Build one strong playable prototype at a time around what the children already enjoy: direct action, expressive choices, discovery, skill and consequential feedback. Put education inside those actions. Check whether the child can start without repeated adult explanation, makes meaningful choices, encounters variation, and voluntarily returns. Use real family play before expanding. The aim is worthwhile active play, not screen-time maximisation.

## Full catalogue triage

| Game | Majority | Votes | Action |
|---|---|---|---|
| Acorn Addition (`acorn-addition`) | remove_candidate | 2/3 | Retire current game |
| Animal Alphabet (`animal-alphabet`) | remove_candidate | 3/3 | Retire current game |
| Bakery Alarm (`bakery-alarm`) | remove_candidate | 2/3 | Retire current game |
| Bakery Bundles (`bakery-bundles`) | remove_candidate | 3/3 | Retire current game |
| Balloon Pop (`balloon-pop`) | retain_candidate | 3/3 | Protect — owner favourite |
| Bead Bridge (`bead-bridge`) | remove_candidate | 2/3 | Retire current game |
| Bear Balance (`bear-balance`) | remove_candidate | 2/3 | Retire current game |
| Bee Pollen Trail (`bee-pollen-trail`) | remove_candidate | 2/3 | Retire current game |
| Birdsong Tuner (`birdsong-tuner`) | remove_candidate | 3/3 | Retire current game |
| Breakfast Story (`breakfast-story`) | remove_candidate | 3/3 | Retire current game |
| Bridge Builder (`bridge-builder`) | remove_candidate | 2/3 | Retire current game |
| Bumper Ducks (`bumper-ducks`) | retain_candidate | 3/3 | Protect — owner favourite |
| Bunny Bedtime (`bunny-bedtime`) | remove_candidate | 3/3 | Retire current game |
| Bunny Hop (`bunny-hop`) | retain_candidate | 3/3 | Protect — owner favourite |
| Butterfly Life Lab (`butterfly-life-lab`) | remove_candidate | 2/3 | Retire current game |
| Butterfly Mirrors (`butterfly-mirrors`) | remove_candidate | 2/3 | Retire current game |
| Butterfly Patterns (`butterfly-patterns`) | remove_candidate | 3/3 | Retire current game |
| Cake Stack (`cake-stack`) | retain_candidate | 3/3 | Protect — owner favourite |
| Castle Block Blueprints (`castle-block-blueprints`) | remove_candidate | 3/3 | Retire current game |
| Castle Window Symmetry (`castle-window-symmetry`) | remove_candidate | 3/3 | Retire current game |
| Cloud Number Race (`cloud-number-race`) | remove_candidate | 3/3 | Retire current game |
| Colour Cauldron (`colour-cauldron`) | rework | 2/3 | Retire current game; record concept only |
| Comet Tail Measure (`comet-tail-measure`) | remove_candidate | 3/3 | Retire current game |
| Constellation Code (`constellation-code`) | remove_candidate | 3/3 | Retire current game |
| Coral Cleanup (`coral-cleanup`) | remove_candidate | 2/3 | Retire current game |
| Crash Racers (`crash-racers`) | retain_candidate | 3/3 | Protect — owner favourite |
| Crystal Cave Echo (`crystal-cave-echo`) | remove_candidate | 3/3 | Retire current game |
| Cuckoo Clock Garden (`cuckoo-clock-garden`) | remove_candidate | 3/3 | Retire current game |
| Deep Sea Divers (`deep-sea-divers`) | remove_candidate | 3/3 | Retire current game |
| Dino Egg Nest (`dino-egg-nest`) | rework | 2/3 | Retire current game; record concept only |
| Dinosaur Size Parade (`dinosaur-size-parade`) | remove_candidate | 3/3 | Retire current game |
| Dragon Glide (`dragon-glide`) | retain_candidate | 3/3 | Protect — owner favourite |
| Drum Beat Builder (`drum-beat-builder`) | rework | 3/3 | Retire current game; record concept only |
| Firefly Lanterns (`firefly-lanterns`) | rework | 3/3 | Retire current game; record concept only |
| Fish Pond (`fish-pond`) | retain_candidate | 3/3 | Protect — owner favourite |
| Float Boat Lab (`float-boat-lab`) | rework | 3/3 | Retire current game; record concept only |
| Footprint Detective (`footprint-detective`) | rework | 3/3 | Retire current game; record concept only |
| Frog Choir (`frog-choir`) | rework | 3/3 | Retire current game; record concept only |
| Frog Life Lab (`frog-life-lab`) | rework | 3/3 | Retire current game; record concept only |
| Fruit & Veggie Ferry (`fruit-veggie-ferry`) | remove_candidate | 3/3 | Retire current game |
| Garden Fence (`garden-fence`) | remove_candidate | 3/3 | Retire current game |
| Gem Turner (`gem-turner`) | remove_candidate | 3/3 | Retire current game |
| Giraffe Ruler (`giraffe-ruler`) | remove_candidate | 3/3 | Retire current game |
| Habitat Hotel (`habitat-hotel`) | remove_candidate | 2/3 | Retire current game |
| Healthy Plate Party (`healthy-plate-party`) | remove_candidate | 3/3 | Retire current game |
| Jellyfish Glow Lab (`jellyfish-glow-lab`) | remove_candidate | 3/3 | Retire current game |
| Kindness Café (`kindness-cafe`) | remove_candidate | 3/3 | Retire current game |
| Kite Flight School (`kite-flight-school`) | remove_candidate | 3/3 | Retire current game |
| Ladybird Dot Party (`ladybird-dot-party`) | remove_candidate | 3/3 | Retire current game |
| Letter Buddies (`letter-buddies`) | remove_candidate | 3/3 | Retire current game |
| Letter Trails (`letter-trails`) | rework | 3/3 | Retire current game; record concept only |
| Magnet Discovery (`magnet-discovery`) | rework | 3/3 | Retire current game; record concept only |
| Memory Match (`memory-match`) | retain_candidate | 3/3 | Protect — owner favourite |
| Moon Pebbles (`moon-pebbles`) | remove_candidate | 3/3 | Retire current game |
| Number Spark Trails (`number-spark-trails`) | remove_candidate | 3/3 | Retire current game |
| Orchard Baskets (`orchard-baskets`) | remove_candidate | 3/3 | Retire current game |
| Paint a Planet (`paint-a-planet`) | remove_candidate | 3/3 | Retire current game |
| Paint Splash (`paint-splash`) | retain_candidate | 3/3 | Protect — owner favourite |
| Parcel Weights (`parcel-weights`) | remove_candidate | 3/3 | Retire current game |
| Pebble Equations (`pebble-equations`) | remove_candidate | 3/3 | Retire current game |
| Penguin Bowling (`penguin-bowling`) | retain_candidate | 3/3 | Protect — owner favourite |
| Penguin Ice Path (`penguin-ice-path`) | remove_candidate | 3/3 | Retire current game |
| Picnic Pairs (`picnic-pairs`) | remove_candidate | 3/3 | Retire current game |
| Picnic Word Basket (`picnic-word-basket`) | remove_candidate | 3/3 | Retire current game |
| Pizza Moon (`pizza-moon`) | remove_candidate | 3/3 | Retire current game |
| Planet Pairs (`planet-pairs`) | remove_candidate | 3/3 | Retire current game |
| Rain Drop Rhythm (`rain-drop-rhythm`) | remove_candidate | 3/3 | Retire current game |
| Rainbow Post Office (`rainbow-postoffice`) | remove_candidate | 3/3 | Retire current game |
| Rainbow Quilt (`rainbow-quilt`) | remove_candidate | 3/3 | Retire current game |
| Rainbow Smoothies (`rainbow-smoothies`) | remove_candidate | 3/3 | Retire current game |
| Recycling Robots (`recycling-robots`) | remove_candidate | 2/3 | Retire current game |
| Reef Patterns (`reef-patterns`) | remove_candidate | 3/3 | Retire current game |
| Rhyming River (`rhyming-river`) | rework | 3/3 | Retire current game; record concept only |
| Ribbon Tailor (`ribbon-tailor`) | remove_candidate | 3/3 | Retire current game |
| Robot Dance Code (`robot-dance-code`) | remove_candidate | 2/3 | Retire current game |
| Robot Reflections (`robot-reflections`) | remove_candidate | 3/3 | Retire current game |
| Rocket Docking (`rocket-docking`) | remove_candidate | 3/3 | Retire current game |
| Rocket Garage (`rocket-garage`) | retain_candidate | 3/3 | Protect — owner favourite |
| Rover Rescue (`rover-rescue`) | remove_candidate | 2/3 | Retire current game |
| Season Suitcase (`season-suitcase`) | remove_candidate | 3/3 | Retire current game |
| Senses Safari (`senses-safari`) | remove_candidate | 3/3 | Retire current game |
| Shadow Theatre (`shadow-theatre`) | remove_candidate | 3/3 | Retire current game |
| Shape Locksmith (`shape-locksmith`) | remove_candidate | 2/3 | Retire current game |
| Sleepy Owl Lullaby (`sleepy-owl-lullaby`) | remove_candidate | 3/3 | Retire current game |
| Snail Spiral (`snail-spiral`) | remove_candidate | 3/3 | Retire current game |
| Snowflake Studio (`snowflake-studio`) | rework | 3/3 | Retire current game; record concept only |
| Sound Wave Lab (`sound-wave-lab`) | remove_candidate | 3/3 | Retire current game |
| Space Station Schedule (`space-station-schedule`) | remove_candidate | 3/3 | Retire current game |
| Sprout to Sunflower (`sprout-sunflower`) | remove_candidate | 3/3 | Retire current game |
| Star Catcher (`star-catcher`) | retain_candidate | 3/3 | Protect — owner favourite |
| Star Share (`star-share`) | rework | 3/3 | Retire current game; record concept only |
| Submarine Subtraction (`submarine-subtraction`) | remove_candidate | 3/3 | Retire current game |
| Sunlight Sprouts (`sunlight-sprouts`) | remove_candidate | 3/3 | Retire current game |
| Tangram Turntable (`tangram-turntable`) | rework | 3/3 | Retire current game; record concept only |
| Tool Twins (`tool-twins`) | remove_candidate | 3/3 | Retire current game |
| Toy Town Builder (`toy-town-builder`) | rework | 3/3 | Retire current game; record concept only |
| Train Carriage Rhythm (`train-carriage-rhythm`) | remove_candidate | 3/3 | Retire current game |
| Turtle Treasure Map (`turtle-treasure-map`) | remove_candidate | 2/3 | Retire current game |
| Watermelon Picnic (`watermelon-picnic`) | remove_candidate | 3/3 | Retire current game |
| Weather Wardrobe (`weather-wardrobe`) | remove_candidate | 3/3 | Retire current game |
| Word Rocket (`word-rocket`) | rework | 3/3 | Retire current game; record concept only |
