# Calzone (HelloVitals): submission deck and demo video

Made Nov 15, 2026. **Calzone** is the plate scanner in the HelloVitals app: take or upload a picture of
food, and see its calories, vitamins and minerals compared with Earth daily needs (FDA) and NASA's needs in
space (JSC-67378).

## Files to submit

| File | What it is |
|---|---|
| `deck/Calzone_HelloVitals.pptx` | 7 slides for a 3-minute talk, 6th-grade wording, with evidence and timed speaker notes (431 words) |
| `deck/Calzone_HelloVitals.pdf` | The same 7 slides as a PDF (pictures of the slides; for a text PDF, open the PPTX in PowerPoint → File → Export) |
| `video/Calzone_Product_Demo.mp4` | 1:39 product demo, 1920×1080, AI voice in simple 6th-grade words, captions burned in |
| `video/Calzone_Product_Demo.srt` | The captions as a separate file |

## Rules check

- **No people:** no names, faces or voices of anyone. Plate photos have no people in them.
- **No NASA logo.** NASA is named only as the source of the nutrition rules.
- **AI use is disclosed** on slide 7, in the speaker notes and at the end of the video:
  Calzone's code was written with Claude (Anthropic) with the mentor; the food AI is MedGemma 1.5 4B
  (Google); the narration is an ElevenLabs AI voice, labelled "AI voice" on every scene.
- **Every number is real:** from the app's own tests (`assets/screens`) or from the cited sources.
- Plate photo credits: `assets/plates/CREDITS.md` (CC BY-SA 4.0 and public domain, from Wikimedia Commons).

## Evidence used in the deck

Science (found on PubMed):
- Smith SM et al., J Nutr 2005, [doi:10.1093/jn/135.3.437](https://doi.org/10.1093/jn/135.3.437): 11 ISS astronauts
  (128–195 days) ate 80% of recommended energy; vitamin D status fell despite supplements; serum ferritin rose.
- Zwart SR et al., Aviat Space Environ Med 2014, [doi:10.3357/ASEM.3979.2014](https://doi.org/10.3357/ASEM.3979.2014):
  25 crew lost body mass (−2.8% to −4.4% on average); intake about 80% of the WHO estimate.
- Zwart SR et al., Am J Clin Nutr 2018, [doi:10.1093/ajcn/nqy029](https://doi.org/10.1093/ajcn/nqy029): in 17 astronauts,
  more vegetables and fruit may protect bone mineral in flight.
- NASA JSC-67378 Rev 1 (2020) and FDA Daily Values for the targets.

Our own test (Nov 15, 2026), MedGemma on the Mac, the 3 plate photos, 2 runs each (same answers):
- Rice/dal plate: rice, dal, paneer, salad right; vegetable fry called "broccoli"; missed a sweet (4 of 6).
- Rice/beans/fish plate: all 5 right. Spaghetti: pasta right, missed the sauce (1 of 2).
- Total 10 of 13 foods named right; 1–8 s per scan. The phone's smaller copy of the dal plate gave different
  names ("chicken curry"). Weights could not be scored (true grams unknown). 3 photos is not proof.

## Where the footage comes from

- iPhone: the real HelloVitals app in the iPhone 18 Pro simulator, connected to the Mac's Calzone server
  (`assets/screens/phone_*.png`, `phone_calzone_raw.mp4`, `phone_today_raw.mp4`).
- Mac: the Calzone section of the practice page (localhost:8140), captured with headless Chrome
  (`tools/capture_mac.mjs`).

## Rebuild

```bash
cd tools && npm install pptxgenjs react react-dom react-icons sharp
NODE_PATH=$PWD/node_modules node build_deck.js            # deck/Calzone_HelloVitals.pptx
python3 build_video.py                                     # needs ffmpeg + Pillow, and slide PNGs in video/slides
```

`video/script.md` holds the narration; `video/vo/` holds the voice clips.

## Two fixes made while building this

- **Iron for women:** NASA's 8 mg/day iron limit does not apply to women under 50 who menstruate (they need
  at least 18 mg). The app now shows that when "woman" is picked (`practice_lab/xray_mirror/calzone.py`).
- **Phone app:** the pairing code field now hides its digits, and calorie totals round the same way everywhere.
