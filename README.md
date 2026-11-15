# Calzone: look at your plate, know what's in it

Calzone is part of the HelloVitals app (RiverHacks × NASA Space Apps Challenge 2026, Austin).
Take or upload a picture of food (Meta glasses, iPhone camera or a photo). An AI on our own computer
(MedGemma 1.5 4B) names the foods and guesses grams; you check them; every number then comes from the
USDA FoodData Central table (offline, 7,793 foods). Each plate shows 22 nutrients as % of Earth daily
needs (FDA Daily Values) and NASA's needs in space (JSC-67378).

| Folder | What it is |
|---|---|
| `submission/` | **Submission:** 7-slide deck (PPTX + PDF), 1:39 demo video + captions, evidence, build tools |
| `mac/` | Server side: `calzone.py` (scan, USDA lookup, targets, daily log), web page script/style, USDA table builder |
| `ios/` | `Calzone.swift`: the iPhone app's Calzone tab (scan glasses view, take photo, upload photos) |

The Mac code plugs into the HelloVitals practice server (routes `/calzone/...`); MedGemma runs in
llama-server on port 8081. Details, evidence (NASA studies, our AI test: 10 of 13 foods named right) and
credits: `submission/README.md`.

**AI use:** Calzone's code was written with Claude (Anthropic), an AI coding assistant, with our mentor.
Food AI: MedGemma (Google). Video voice: ElevenLabs (AI). Not medical advice.
