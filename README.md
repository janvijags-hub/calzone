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

## NASA data and resources

| Resource | Link |
|---|---|
| NASA JSC-67378 Rev 1: Nutritional Requirements for Exploration Missions up to 365 Days (2020). Source of every "space need" target | https://ntrs.nasa.gov/api/citations/20205008306/downloads/JSC67378%20Expl%20Nutr%20Reqs%20042020.pdf |
| NASA Johnson Space Center study: The nutritional status of astronauts is altered after long-term space flight aboard the International Space Station (Smith et al., 2005) | https://doi.org/10.1093/jn/135.3.437 |
| NASA Johnson Space Center study: Body mass changes during long-duration spaceflight (Zwart et al., 2014) | https://doi.org/10.3357/ASEM.3979.2014 |
| NASA Johnson Space Center study: Dietary acid load and bone turnover during long-duration spaceflight and bed rest (Zwart et al., 2018) | https://doi.org/10.1093/ajcn/nqy029 |

## Other data, resources and tools

No data from Space Agency Partners was used.

**Data and reference text**

| Resource | Link |
|---|---|
| USDA FoodData Central (food nutrient database) | https://fdc.nal.usda.gov/ |
| USDA FoodData Central SR Legacy dataset, April 2018 (the CSV download used) | https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip |
| FDA Daily Values on the Nutrition and Supplement Facts Labels | https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels |
| PubMed (used to find the NASA nutrition studies) | https://pubmed.ncbi.nlm.nih.gov/ |

**Images (openly licensed, credited on slide 7 and in `submission/assets/plates/CREDITS.md`)**

| Resource | Link |
|---|---|
| Plate photo by AjayDas (CC BY-SA 4.0) | https://commons.wikimedia.org/wiki/File:Lunch_plate_-_plain_rice,_veg_dal,_mixed_vegetable_fry,_paneer_butter_masala,_salad,_green_chili_and_a_gulap_jamun.jpg |
| Plate photo "Rice, beans and Salmon Fish" by BlessNathan (CC BY-SA 4.0) | https://commons.wikimedia.org/wiki/File:Rice,_beans_and_Salmon_Fish.jpg |
| Plate photo "Pasta (1)" by Renee Comet (public domain) | https://commons.wikimedia.org/wiki/File:Pasta_(1).jpg |
| Icons: Font Awesome Free 6, via React Icons (CC BY 4.0) | https://fontawesome.com/license/free |

**AI models and services**

| Resource | Link |
|---|---|
| MedGemma by Google (food recognition AI, run locally) | https://developers.google.com/health-ai-developer-foundations/medgemma |
| MedGemma model card on Hugging Face | https://huggingface.co/google/medgemma-4b-it |
| llama.cpp (runs MedGemma on the Mac) | https://github.com/ggml-org/llama.cpp |
| SerpApi Google Scholar API (research-paper search) | https://serpapi.com/google-scholar-api |
| ElevenLabs (AI narration voice in the demo video) | https://elevenlabs.io |
| Claude Code by Anthropic (AI coding assistant used to write the code) | https://www.anthropic.com/claude-code |

**Code libraries, platforms and tools**

| Resource | Link |
|---|---|
| Meta Wearables Device Access Toolkit for iOS (Ray-Ban Meta glasses camera) | https://github.com/facebook/meta-wearables-dat-ios |
| Apple HealthKit (Apple Watch vitals in HelloVitals) | https://developer.apple.com/documentation/healthkit |
| SwiftUI and Xcode (iPhone app) | https://developer.apple.com/xcode/swiftui/ |
| Python (server) | https://www.python.org |
| Tailscale (secure phone-to-Mac connection) | https://tailscale.com |
| PptxGenJS (built the slide deck) | https://github.com/gitbrent/PptxGenJS |
| FFmpeg (built the demo video) | https://ffmpeg.org |
| Pillow (video captions and images) | https://python-pillow.org |
| sharp (image processing for the deck) | https://sharp.pixelplumbing.com |

All links were checked and loaded on Nov 15, 2026.
