# Coral Cleanup and Rainbow Post Office polish

Date: 2026-10-07. Parallel source ownership: this review owns `runtime/discovery.js`'s matching activity; collecting-game agent owns `runtime/experiences.js`; art agent owns Blender assets; coordinator owns packaging and release.

## Pass 1: curriculum and interaction review

Reviewed both catalogue entries, challenge generation, collecting and matching source, shipment metadata, and studio instructions. Coral correctly requests one singular bottle or multiple bottles and includes a shell distractor. Rainbow samples five distinct named colours, offers three/four/five choices, and requires the matching colour.

Child-noticeable findings and changes:

- Coral's bottles went into coral and the coral grew. That is a confusing visual explanation of recycling. Coordinated a dedicated open recycling-bin toy, generated using Blender CLI, with the collecting agent's receiver change. The bin does not grow.
- Coral's shell feedback claimed an animal's home; changed to shells belonging in the sea, with a specific recycling hint.
- Rainbow's wrong answer previously described colour, outline, and shape together. It now names the chosen colour and the mailbox's requested colour. Its hint names the mailbox and explains both tap and drag; success repeats the correctly delivered colour.
- Proposed game-specific catalogue instructions to the coordinator for menu and shipment how-to-play.

Initial phone and short-landscape screenshots show readable bottles versus shells. The early screenshots show the old coral receiver and must not be used as evidence for final recycling-bin appearance.

Initial browser matrix passed **120 rounds with zero page errors and zero puzzle-layout failures**: native Chromium with touch emulation, 320×568, 667×283, 834×1194 and 1194×834; all three difficulties and five steps each. Every Coral round tries a shell, premature Done, collect, undo, recover and Done; every Rainbow round tries a wrong colour then recovers. Browser script/report and screenshots are local under `/tmp/cleanup-postoffice/`.

## Pass 2: fresh visual review after rebuilt assets

The dedicated green bin reads clearly on phone portrait: open top, recycling arrows and a visible Recycle label. A fresh short-landscape screenshot exposed its top being clipped by the stage despite passing button layout checks. Coordinated a smaller Coral-specific receiver scale with the collecting and art agents; coordinator owns the final edit and rebuild. This is a visual defect found by inspection, not by answer automation.

A second 120-round matrix adds target-size, touchability and bounds checks after wrong answers and success as well as at puzzle start. **Passed 120 rounds with zero page errors and zero layout failures**; Rainbow’s fresh visual scan found **NOTHING LEFT TO IMPROVE** within the reviewed scope. The final trusted-touch drag check passed **eight game/viewport flows (24 gestures)**: wrong drops were rejected, touch cancellation restored the toy and left progress unchanged, and correct delivery was accepted. Zero page errors. Wrong-feedback phone and short-landscape screenshots were also visually reviewed and remained readable.

## Pass 3: Coral receiver framing

Coordinator rebuilt Coral with a receiver scale of 1.8 instead of 2.35, preserving the bottle-grid spacing. The focused final **60-round Coral matrix passed with zero page errors and zero layout failures** at all four viewport sizes, including wrong answer, undo/recovery and success layout checks. The final visual scan found **NOTHING LEFT TO IMPROVE** within this scope: opening interior, recycling arrows and label remain readable in short landscape, and bottle/shell cards remain separated at all sizes. The upper bin rim sits at the stage edge in short landscape; no essential cue is hidden. Both iPad orientations show the bin and card grid clearly.

Across the three passes: Coral completed 180 automated rounds; Rainbow completed 120. These counts include earlier receiver builds; the final freeze has a separate Coral report (`pass3-report.json`). Final Rainbow copy was tested in `pass2-report.json`.

## Release status

Both games are **ready for the coordinator’s release gate**: source and art are synchronized, local matrix/visual/drag checks passed, and the fresh scans found no further change within the reviewed scope. Coordinator shared-runtime regression, deployment, and live/store smoke remain outside this agent’s ownership. Browser emulation does not establish real iPad performance, child comprehension or educator approval.
