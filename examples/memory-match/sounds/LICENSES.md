# Memory Match: recorded animal calls

Eight calls in `public/sounds/` are short trims of CC0 or public-domain recordings. Five come from Wikimedia Commons; three added in Round 11 come from BigSoundBank and Freesound. They are credited here even though attribution is not required.

`sounds/build.sh` rebuilds all eight from checksummed downloads: trim, filter, fade, peak-normalize with the listed extra gain, then mono 44.1 kHz / 64 kbps MP3. `SOUND_IDS=dog,cow,pig` rebuilds only the new calls. Optional `SOUND_SOURCE_DIR` supplies already-downloaded `<name>.src` files; checksums are still enforced. The script records all exact URLs, filters and parameters. ffmpeg/libmp3lame version changes can alter encoded bytes.

Fox, fish, penguin, bunny and panda retain their synthesized voices. No unclear-licence recording is shipped.

| File | Source | Licence | Author | Original SHA-256 | Trim (start, length) | Shipped SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `elephant.mp3` | [Elephant voice - trumpeting.ogg](https://commons.wikimedia.org/wiki/File:Elephant_voice_-_trumpeting.ogg) | CC0 | தகவலுழவன் | `e5f3120e5eaca87cc080bbf57bd185c96d52fd0f63cc1dfe33228c8bfa29f3bc` | 0.12 s, 1.15 s; high-pass 250 Hz | `21d78bab7da5c48c30e40bc69638bdb1efb08c9ee6e69abfd3f3aeb0d453f6d5` |
| `lion.mp3` | [Lion raring-sound1TamilNadu178.ogg](https://commons.wikimedia.org/wiki/File:Lion_raring-sound1TamilNadu178.ogg) | Public domain | த*உழவன் | `ab237d0f960e83412251d0c11f69959f3c2e8d3b14595f7181c3056f7fa18bf7` | 4.85 s, 1.75 s (the second roar); 70 Hz to 5 kHz | `3217f456ff48c0187c9d0dcf8c1b35c8dc1ebb3c4fead07575ec0f246bd9cd2e` |
| `cat.mp3` | [Meow of a Siamese cat - freemaster2.wav](https://commons.wikimedia.org/wiki/File:Meow_of_a_Siamese_cat_-_freemaster2.wav) | CC0 | freemaster2 | `c5ae80383913b599b697bdb03481807dce908b44497f68583183530c6490f9d4` | 0.22 s, 0.92 s; high-pass 300 Hz | `dbcc8113562d8a1c0b14f526f0e6bf879d677df63a00e6c41805239590ab86fd` |
| `chick.mp3` | [মুরগির বাচ্চার ডাক.oga](https://commons.wikimedia.org/wiki/File:%E0%A6%AE%E0%A7%81%E0%A6%B0%E0%A6%97%E0%A6%BF%E0%A6%B0_%E0%A6%AC%E0%A6%BE%E0%A6%9A%E0%A7%8D%E0%A6%9A%E0%A6%BE%E0%A6%B0_%E0%A6%A1%E0%A6%BE%E0%A6%95.oga) (a chick's call) | CC0 | Md. Tahmid Hossain | `7ff4f4247253328c6e29c5694ba5d8028f6aa2ab1b18043807981496cf47f188` | 2.0 s, 1.5 s; high-pass 1.8 kHz | `d81296a7ebf21a14f454534f95dc2a95993baaade3830a38c6568e6a0a3fb1c0` |
| `frog.mp3` | [Laubfrosch Balzruf.OGG](https://commons.wikimedia.org/wiki/File:Laubfrosch_Balzruf.OGG) (tree frog mating call) | Public domain | Rabe19 | `88a7541190f33708f430a4f4a22d386214dd4caf3ea3ba65dbcb76c69aab79fd` | 0.35 s, 1.2 s; high-pass 600 Hz | `4b775f170dda61bf86b751d07553d7053fac0aa97adf00dcef5d0eabfff37063` |

Licences were read from each file's Commons metadata (`LicenseShortName`) on 2026-10-16.

## Round 11 additions (licences checked 2026-10-16)

The dog and cow download pages explicitly mark their recordings CC0 and permit processing and redistribution in games. The pig's Freesound page explicitly marks JarredGibb's Animal Farm field recording Creative Commons 0. Its public HQ MP3 preview is the reproducible input, rather than the login-only WAV. Sources were downloaded and checksummed before adaptation. The three shipped files total 27,922 bytes.

| File | Source / author | Licence | Download SHA-256 | Trim and adaptation | Shipped SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `dog.mp3` | [Barking of a Spitz #0682](https://bigsoundbank.com/barking-of-a-spitz-s0682.html), Joseph SARDIN | CC0 | `b47562610e197af884e59463fe9279dd6942c0aafd193ae8c66bf2267834c57a` | OGG; start 0.27 s, length 0.9 s; HP 150 Hz, LP 6500 Hz; extra −2 dB | `4464796b1067d89ef063c7f5bf2267d3d757f821fb9c8720db4e8377dd832c25` |
| `cow.mp3` | [Cow Moos #6, #2386](https://bigsoundbank.com/cow-moos-6-s2386.html), Joseph SARDIN | CC0 | `e48806d1ddc3858e5856bda3df62dcff9caf1190bb3ad192af3c3ea42ae7c450` | OGG; start 0.4 s, length 1.75 s; HP 90 Hz, LP 5000 Hz; extra −3 dB | `fe8294efb5b98715a753c51a46d000fbe9441607172aa7d491e626afc27c0505` |
| `pig.mp3` | [Pig – Grunt 1 – 96kHz.wav #233169](https://freesound.org/people/JarredGibb/sounds/233169/), JarredGibb | CC0 | `6b2f81fa56b2c977a6c4038389371a3cf62ed6e0b7b8c6e20786c487a48e3426` | HQ MP3 preview; start 0 s, length 0.65 s (remove silent tail); HP 100 Hz, LP 6000 Hz; extra −3 dB | `86632286fdfa8fda261f0d49cb4cce80bc3a3eff7d920a662ac294b83ea0417a` |

All three use a 15 ms fade-in / 180 ms fade-out, normalize peak to −1.5 dB before the extra gain, and encode mono 64 kbps MP3, matching the existing calls. Direct download URLs and reproducible steps are in `build.sh`.
