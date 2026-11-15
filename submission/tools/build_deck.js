// Builds the Calzone + HelloVitals submission deck (PowerPoint, 13.33 x 7.5 in, 7 slides for a 3-minute talk, timed speaker notes, 6th-grade wording, with evidence).
// Run from this folder: node build_deck.js   -> ../deck/Calzone_HelloVitals.pptx
// Pictures: our own app screenshots (assets/screens) and openly licensed plate photos (assets/plates/CREDITS.md).
// No NASA logos. No people. Every number is from the app's own tests on Nov 15, 2026 or from the cited sources.
const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");

const ROOT = path.join(__dirname, "..");
const A = (...p) => path.join(ROOT, "assets", ...p);
const OUT = path.join(ROOT, "deck", "Calzone_HelloVitals.pptx");
const SKILL_THEME = process.env.APPLY_THEME;

const THEME = {
  name: "Calzone",
  headFontFace: "Georgia",
  bodyFontFace: "Arial",
  colors: {
    dk1: "0B1020", lt1: "F2F5FB", dk2: "141B2E", lt2: "9AA6BD",
    accent1: "FF6B4A", accent2: "4DB8FF", accent3: "3DDC97", accent4: "FFB020", accent5: "C9D3E6", accent6: "7C5CFF",
    hlink: "4DB8FF", folHlink: "9AA6BD",
  },
};
const H = THEME.colors;
const PANEL = "1A2238";

async function icon(Comp, color, size = 256) {
  const svg = renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size }));
  return "image/png;base64," + (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
}
async function crop(file, box, out) {
  await sharp(file).extract(box).toFile(out);
  return out;
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = path.join(ROOT, "deck", "_build");
  fs.mkdirSync(tmp, { recursive: true });
  // Crops of the Mac nutrient table: the column header strip, and the vitamins + minerals rows.
  const tableHead = await crop(A("screens", "mac_calzone_table.png"), { left: 0, top: 228, width: 2400, height: 62 }, path.join(tmp, "table_head.png"));
  const tableBody = await crop(A("screens", "mac_calzone_table.png"), { left: 0, top: 1140, width: 2400, height: 1040 }, path.join(tmp, "table_body.png"));
  // Phone screenshots, trimmed below the status bar so they read as app screens.
  const phone = async (name, top = 150, height = 2160) =>
    crop(A("screens", name), { left: 0, top, width: 1206, height }, path.join(tmp, "crop_" + name));
  const pScan = await phone("phone_scan_result.png", 200, 1560);
  const pNutr = await phone("phone_nutrients.png", 340, 1680);
  const pMin = await phone("phone_vitamins_minerals.png", 340, 1680);
  const pVit = await phone("phone_vitals.png", 150, 1700);

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "Calzone: look at your plate, know what's in it";
  pres.author = "HelloVitals team (built with Claude, an AI assistant)";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ---------- layouts ----------
  pres.defineSlideMaster({
    title: "COVER", background: { color: H.dk1 },
    objects: [{ placeholder: { options: { name: "title", type: "title", x: 0.6, y: 2.0, w: 6.4, h: 1.4, fontSize: 60, bold: true, color: C.background1, fontFace: THEME.headFontFace, margin: 0, valign: "bottom", align: "left" }, text: "" } }],
  });
  pres.defineSlideMaster({
    title: "CONTENT", background: { color: H.dk1 },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 32, bold: true, color: C.background1, fontFace: THEME.headFontFace, margin: 0, valign: "middle", align: "left" }, text: "" } },
      { text: { text: "Calzone · HelloVitals · RiverHacks × NASA Space Apps 2026", options: { x: 0.6, y: 7.05, w: 8, h: 0.3, fontSize: 10, color: H.lt2, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: H.lt2, align: "right" },
  });

  const notes = {};
  const T = (slide, text, o) => slide.addText(text, { isTextBox: true, margin: 0, fontFace: THEME.bodyFontFace, color: H.lt1, fontSize: 16, ...o });
  const card = (slide, x, y, w, h, name) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: PANEL }, line: { color: "273152", width: 0.75 }, objectName: name });
  const circleIcon = async (slide, Comp, x, y, color, d = 0.7, name = "icon") => {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color, transparency: 78 }, line: { color, width: 1 }, objectName: name + " circle" });
    slide.addImage({ data: await icon(Comp, color), x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: name });
  };


  // =====================================================================
  // 7 slides for a 3-minute talk (about 25 seconds each), written for a 6th-grade reader,
  // with evidence: NASA research (PubMed) and our own test of the AI on 3 plates.
  // Speaker notes are timed and about 60 words each.
  // =====================================================================
  const SRC = (slide, text) => T(slide, text, { x: 0.6, y: 6.55, w: 12.1, h: 0.4, fontSize: 10, color: H.lt2 });

  // ---------- 1. cover + hook ----------
  pres.addSection({ title: "Calzone" });
  let s = pres.addSlide({ masterName: "COVER", sectionTitle: "Calzone" });
  s.addText("Calzone", { placeholder: "title" });
  T(s, "Look at your plate. Know what's in it.", { x: 0.6, y: 3.5, w: 6.4, h: 0.7, fontSize: 26, color: H.accent1, italic: true, fontFace: THEME.headFontFace });
  T(s, "Take a picture of your food. Calzone shows its calories, vitamins and minerals, and how much your body needs, on Earth and in space.", { x: 0.6, y: 4.3, w: 6.2, h: 1.0, fontSize: 17, color: H.lt2 });
  card(s, 0.6, 5.45, 6.3, 0.95, "Hook card");
  T(s, [{ text: "80%  ", options: { bold: true, color: H.accent4, fontSize: 26 } }, { text: "Astronauts on the space station ate only 80% of the food energy they needed. (NASA study, 2005)", options: { fontSize: 14 } }], { x: 0.8, y: 5.5, w: 6.0, h: 0.85, valign: "middle" });
  s.addImage({ path: A("plates", "dal_plate.jpg"), x: 7.4, y: 0.9, w: 5.4, h: 4.05, sizing: { type: "cover", w: 5.4, h: 4.05 }, objectName: "Plate photo" });
  T(s, "Photo: AjayDas, CC BY-SA 4.0 (Wikimedia Commons)", { x: 7.4, y: 5.05, w: 5.4, h: 0.3, fontSize: 10, color: H.lt2 });
  T(s, "HelloVitals app · glasses, iPhone and Mac · RiverHacks × NASA Space Apps 2026", { x: 7.4, y: 5.55, w: 5.4, h: 0.8, fontSize: 13, color: H.lt2 });
  s.addNotes("[0:00–0:20] Did you know? Astronauts on the International Space Station ate only 80 percent of the food energy they needed. That comes from a NASA study of 11 astronauts. Eating right in space is hard, and nobody counts for you. So we built Calzone. You take a picture of your plate, and it tells you what is inside.");

  // ---------- 2. the problem, with evidence ----------
  pres.addSection({ title: "Evidence" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Evidence" });
  s.addText("The problem: in space, food is harder to get right", { placeholder: "title" });
  const ev = [
    [fa.FaWeightScale, H.accent4, "Too little food", "11 astronauts, 4 to 6 months in space: they ate only 80% of the energy they needed. 25 crew members lost weight, 3 to 4% on average.", "Smith 2005; Zwart 2014"],
    [fa.FaSun, H.accent2, "Low vitamin D", "Our skin makes vitamin D from sunlight. In space, vitamin D dropped even though astronauts took vitamin pills.", "Smith 2005"],
    [fa.FaShieldHalved, H.accent1, "Extra stored iron", "After flight, the body stored more iron (ferritin went up). Too much iron can harm the body.", "Smith 2005"],
    [fa.FaAppleWhole, H.accent3, "Veggies help bones", "In 17 astronauts, eating more fruit and vegetables may help protect bones in space.", "Zwart 2018"],
  ];
  for (let i = 0; i < ev.length; i++) {
    const [Comp, col, head, body, src] = ev[i];
    const x = 0.6 + i * 3.08;
    card(s, x, 1.5, 2.85, 3.35, head);
    await circleIcon(s, Comp, x + 0.25, 1.72, col, 0.65, head + " icon");
    T(s, head, { x: x + 0.25, y: 2.5, w: 2.4, h: 0.45, fontSize: 17, bold: true, color: col });
    T(s, body, { x: x + 0.25, y: 3.0, w: 2.4, h: 1.5, fontSize: 13, color: H.lt1, valign: "top" });
    T(s, src, { x: x + 0.25, y: 4.45, w: 2.4, h: 0.3, fontSize: 10, color: H.lt2, italic: true });
  }
  card(s, 0.6, 5.05, 12.1, 1.35, "NASA rules card");
  T(s, [
    { text: "So NASA has its own food rules for space. ", options: { bold: true } },
    { text: "Vitamin D: 25 µg a day (the Earth food label says 20). Iron: no more than 8 mg a day (the Earth label says 18).* Calzone checks every plate against both.", options: { color: H.lt1 } },
  ], { x: 0.85, y: 5.12, w: 11.6, h: 0.85, fontSize: 15, valign: "middle" });
  T(s, "* NASA: women under 50 who have periods still need at least 18 mg of iron. Calzone shows this when you pick \"woman\".", { x: 0.85, y: 5.95, w: 11.6, h: 0.35, fontSize: 11, color: H.lt2 });
  SRC(s, "Smith SM et al., J Nutr 2005, doi:10.1093/jn/135.3.437 · Zwart SR et al., Aviat Space Environ Med 2014, doi:10.3357/ASEM.3979.2014 · Zwart SR et al., Am J Clin Nutr 2018, doi:10.1093/ajcn/nqy029 · NASA JSC-67378 (2020) · FDA Daily Values");
  s.addNotes("[0:20–0:50] NASA scientists found four problems. Astronauts ate too little and lost weight. Their vitamin D went down, even with vitamin pills, because there is no sunlight. Their bodies stored extra iron, which can be harmful. And eating more fruit and vegetables may help protect their bones. That is why NASA has special food rules for space, and Calzone checks every plate against them.");

  // ---------- 3. how it works ----------
  pres.addSection({ title: "Solution" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Solution" });
  s.addText("Our solution: Calzone, in 5 steps", { placeholder: "title" });
  const steps = [
    [fa.FaCamera, H.accent2, "1. Take a picture", "Smart glasses, the phone camera, or photos you already have."],
    [fa.FaWandMagicSparkles, H.accent6, "2. The AI looks", "An AI program on our computer names each food and guesses its weight."],
    [fa.FaListCheck, H.accent3, "3. You check", "Fix wrong foods and weights. Add anything it missed."],
    [fa.FaDatabase, H.accent4, "4. Real numbers", "Each food is looked up in the USDA food list: 7,793 foods."],
    [fa.FaEarthAmericas, H.accent1, "5. Earth and space", "22 nutrients, each as % of a day's need on Earth and in space."],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [Comp, col, head, body] = steps[i];
    const x = 0.6 + i * 2.46;
    card(s, x, 1.5, 2.2, 3.4, `Step ${i + 1}`);
    await circleIcon(s, Comp, x + 0.75, 1.72, col, 0.7, `Step ${i + 1} icon`);
    T(s, head, { x: x + 0.15, y: 2.6, w: 1.9, h: 0.75, fontSize: 17, bold: true, align: "center", valign: "top" });
    T(s, body, { x: x + 0.15, y: 3.35, w: 1.9, h: 1.5, fontSize: 14, color: H.lt2, align: "center", valign: "top" });
    if (i < steps.length - 1) s.addImage({ data: await icon(fa.FaChevronRight, H.lt2), x: x + 2.24, y: 3.05, w: 0.18, h: 0.3, objectName: "Arrow" });
  }
  const facts = [
    [fa.FaCircleCheck, H.accent3, "The AI never makes up a number.", "Every number comes from the USDA list, and each food links to its USDA page."],
    [fa.FaWifi, H.accent2, "Works with no internet.", "The AI (MedGemma, by Google) and the food list run on our own computer, like on a spaceship."],
    [fa.FaLock, H.accent4, "Private.", "Pictures are not saved. The phone needs a secret code to connect."],
  ];
  for (let i = 0; i < facts.length; i++) {
    const [Comp, col, head, body] = facts[i];
    const y = 5.1 + i * 0.47;
    s.addImage({ data: await icon(Comp, col), x: 0.65, y: y + 0.05, w: 0.3, h: 0.3, objectName: head });
    T(s, [{ text: head + " ", options: { bold: true, color: col } }, { text: body }], { x: 1.1, y, w: 11.6, h: 0.42, fontSize: 14, valign: "middle" });
  }
  s.addNotes("[0:50–1:15] Calzone works in five steps. Take a picture with smart glasses or the phone. An AI program names the foods and guesses their weight. You check its work. Then we look up every food in the USDA food list, with 7,793 foods, and show 22 nutrients for Earth and for space. The AI never makes up a number, and everything works without the internet.");

  // ---------- 4. demo ----------
  pres.addSection({ title: "Demo" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Demo" });
  s.addText("It works on a real iPhone app", { placeholder: "title" });
  const shots = [[pScan, "Upload a photo: 7 foods in 6 seconds"], [pNutr, "Two bars: Earth need and space need"], [pMin, "Orange: iron is close to the space limit"]];
  for (let i = 0; i < shots.length; i++) {
    const [file, cap] = shots[i];
    const meta = await sharp(file).metadata();
    const h = 4.75, w = h * meta.width / meta.height, x = 0.9 + i * 4.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.08, y: 1.42, w: w + 0.16, h: h + 0.16, rectRadius: 0.15, fill: { color: "273152" }, line: { color: "3A4670", width: 1 }, objectName: `Phone frame ${i + 1}` });
    s.addImage({ path: file, x, y: 1.5, w, h, objectName: `Phone screen ${i + 1}` });
    T(s, cap, { x: x - 0.4, y: 6.35, w: w + 0.8, h: 0.4, fontSize: 14, align: "center", color: H.lt1 });
  }
  s.addNotes("[1:15–1:40] Here is our real iPhone app. On the left, we uploaded a photo of a lunch plate, and the AI found 7 foods in 6 seconds. In the middle, every nutrient has two bars: one for Earth and one for space. On the right, the orange bar is iron. This one plate is already about half of NASA's daily iron limit in space.");

  // ---------- 5. our test: does the AI get it right? ----------
  pres.addSection({ title: "Test" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Test" });
  s.addText("Our test: the AI named 10 of 13 foods right", { placeholder: "title" });
  const hdr = (t) => ({ text: t, options: { bold: true, color: H.lt2, fill: { color: "1F2942" } } });
  const cell = (t, col = H.lt1) => ({ text: t, options: { color: col } });
  s.addTable([
    [hdr("Plate photo"), hdr("Named right"), hdr("Wrong"), hdr("Missed"), hdr("Score")],
    [cell("Rice, dal, curry and salad"), cell("rice, dal, paneer, cucumber + tomato salad"), cell("vegetable fry called \"broccoli\"", H.accent1), cell("a sweet (gulab jamun)", H.accent4), cell("4 of 6")],
    [cell("Rice, beans and fish"), cell("rice, fish, beans, greens, tomato sauce"), cell("–", H.lt2), cell("–", H.lt2), cell("5 of 5", H.accent3)],
    [cell("Spaghetti"), cell("spaghetti"), cell("–", H.lt2), cell("the big tomato sauce", H.accent4), cell("1 of 2")],
  ], { x: 0.6, y: 1.5, w: 8.3, colW: [2.0, 2.6, 1.5, 1.4, 0.8], fontSize: 13, fontFace: THEME.bodyFontFace, color: H.lt1, fill: { color: PANEL }, border: { type: "solid", color: "273152", pt: 0.75 }, valign: "middle", rowH: [0.45, 0.85, 0.75, 0.75], margin: 0.08 });
  const tstats = [["10 / 13", "foods named right (77%)", H.accent3], ["1–8 s", "per scan, on our Mac", H.accent2]];
  for (let i = 0; i < tstats.length; i++) {
    const [big, small, col] = tstats[i];
    card(s, 9.3, 1.5 + i * 1.5, 3.4, 1.3, small);
    T(s, [{ text: big, options: { fontSize: 32, bold: true, color: col, breakLine: true } }, { text: small, options: { fontSize: 13, color: H.lt2 } }], { x: 9.5, y: 1.58 + i * 1.5, w: 3.0, h: 1.15, valign: "top" });
  }
  card(s, 0.6, 4.55, 12.1, 1.75, "Lessons card");
  T(s, [
    { text: "What we learned", options: { bold: true, color: H.accent3, breakLine: true } },
    { text: "Missing the sauce left out many calories, so the \"you check\" step really matters.", options: { bullet: true, breakLine: true } },
    { text: "The same plate sent as a smaller picture from the phone was named differently (\"chicken curry\"). Better pictures give better answers.", options: { bullet: true, breakLine: true } },
    { text: "We could not test the weights: we don't know the real grams. This is a tiny test (3 photos), not proof.", options: { bullet: true } },
  ], { x: 0.85, y: 4.62, w: 11.6, h: 1.62, fontSize: 14, paraSpaceAfter: 4, valign: "top" });
  SRC(s, "Our test, Nov 15, 2026: MedGemma 1.5 4B on a Mac, 2 runs per photo (same answers both times). Correct foods come from each photo's title on Wikimedia Commons.");
  s.addNotes("[1:40–2:10] We tested the AI on three plate photos. It named 10 of 13 foods right. It missed a sweet and the tomato sauce on the spaghetti, and it called a vegetable fry broccoli. Missing the sauce means missing calories, so checking matters. Each scan took 1 to 8 seconds. We could not test the weights, and three photos is a small test, so we need more.");

  // ---------- 6. one plate, Earth vs space ----------
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Test" });
  s.addText("One plate, two answers: Earth and space", { placeholder: "title" });
  s.addImage({ path: A("plates", "salmon_plate.jpg"), x: 0.6, y: 1.5, w: 3.6, h: 2.7, sizing: { type: "cover", w: 3.6, h: 2.7 }, objectName: "Fish plate photo" });
  T(s, "Rice, fish, beans, greens and sauce: 378 calories. Photo: BlessNathan, CC BY-SA 4.0.", { x: 0.6, y: 4.3, w: 3.6, h: 0.6, fontSize: 11, color: H.lt2 });
  const row = (n, amt, e, sp, why, col = H.lt1) => [cell(n), cell(amt), cell(e), cell(sp, col), cell(why, H.lt2)];
  s.addTable([
    [hdr("Nutrient"), hdr("This plate"), hdr("Earth need"), hdr("Space need"), hdr("Why it matters")],
    row("Calories", "378", "19%", "–", "Astronauts ate too little"),
    row("Protein", "29.8 g", "60%", "–", "Builds muscle"),
    row("Vitamin D", "0 µg", "0%", "0%", "Dropped in space; take a supplement", H.accent1),
    row("Iron", "3.96 mg", "22%", "50% of limit", "Space limit: 8 mg a day", H.accent4),
    row("Potassium", "807 mg", "17%", "24%", "Fruit and veggies help bones"),
    row("Calcium", "71 mg", "5%", "7%", "Bones; NASA wants 1,000 mg"),
  ], { x: 4.55, y: 1.5, w: 8.15, colW: [1.35, 1.15, 1.15, 1.45, 3.05], fontSize: 13, fontFace: THEME.bodyFontFace, color: H.lt1, fill: { color: PANEL }, border: { type: "solid", color: "273152", pt: 0.75 }, valign: "middle", rowH: 0.5, margin: 0.08 });
  card(s, 0.6, 5.2, 12.1, 1.15, "Takeaway card");
  T(s, [
    { text: "Same food, different answer. ", options: { bold: true, color: H.accent4 } },
    { text: "On Earth this plate gives 22% of a day's iron. In space it already uses half of NASA's limit. And it has no vitamin D at all, the vitamin astronauts lose most." },
  ], { x: 0.85, y: 5.25, w: 11.6, h: 1.05, fontSize: 15, valign: "middle" });
  SRC(s, "Numbers: Calzone on the Mac, Nov 15, 2026 (USDA FoodData Central). Targets: FDA Daily Values; NASA JSC-67378 (for a man). Some USDA foods have no vitamin value; those count as 0.");
  s.addNotes("[2:10–2:35] Here is one plate with two answers. Rice, fish, beans and greens: 378 calories. On Earth, it gives 22 percent of a day's iron. In space, that same iron is already half of NASA's limit. And the plate has zero vitamin D, which is exactly the vitamin astronauts lose. Calzone makes these differences easy to see.");

  // ---------- 7. next steps, words, credits ----------
  pres.addSection({ title: "Close" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Close" });
  s.addText("What's next, words to know, and who helped", { placeholder: "title" });
  card(s, 0.6, 1.45, 3.9, 4.75, "Next card");
  T(s, [
    { text: "What we will do next", options: { bold: true, fontSize: 17, color: H.accent3, breakLine: true } },
    { text: "Test 100+ plates with known weights.", options: { bullet: true, breakLine: true } },
    { text: "Guess weights better, using the size of the plate.", options: { bullet: true, breakLine: true } },
    { text: "Warn when a day is low in calories or vitamin D.", options: { bullet: true, breakLine: true } },
    { text: "Show meals next to Apple Watch heart rate.", options: { bullet: true, breakLine: true } },
    { text: "Weights from a photo are guesses. Not medical advice.", options: { bullet: true } },
  ], { x: 0.85, y: 1.65, w: 3.45, h: 4.45, fontSize: 15, paraSpaceAfter: 8, valign: "top" });
  card(s, 4.75, 1.45, 3.9, 4.75, "Words card");
  T(s, [
    { text: "Words to know", options: { bold: true, fontSize: 17, color: H.accent4, breakLine: true } },
    { text: "Calorie: ", options: { bold: true } }, { text: "the energy in food.", options: { breakLine: true } },
    { text: "Nutrient: ", options: { bold: true } }, { text: "something in food your body needs.", options: { breakLine: true } },
    { text: "Ferritin: ", options: { bold: true } }, { text: "how the body stores iron.", options: { breakLine: true } },
    { text: "AI: ", options: { bold: true } }, { text: "a computer program that learned from many examples.", options: { breakLine: true } },
    { text: "mg, µg: ", options: { bold: true } }, { text: "a thousandth and a millionth of a gram.", options: { breakLine: true } },
    { text: "USDA, FDA: ", options: { bold: true } }, { text: "U.S. government food groups.", options: { breakLine: true } },
    { text: "doi: ", options: { bold: true } }, { text: "a code to find a science paper.", options: {} },
  ], { x: 5.0, y: 1.65, w: 3.45, h: 4.45, fontSize: 13, paraSpaceAfter: 5, valign: "top" });
  card(s, 8.9, 1.45, 3.8, 4.75, "Credits card");
  T(s, [
    { text: "Who helped (AI use)", options: { bold: true, fontSize: 17, color: H.accent2, breakLine: true } },
    { text: "Calzone's code was written with Claude, an AI helper from Anthropic, with our mentor.", options: { breakLine: true } },
    { text: "Food AI: MedGemma (Google). Video voice: made by AI (ElevenLabs).", options: { breakLine: true } },
    { text: "Science: NASA studies found on PubMed. Food numbers: USDA. Rules: FDA and NASA.", options: { breakLine: true } },
    { text: "Plate photos: AjayDas, BlessNathan (CC BY-SA 4.0), Renee Comet (public domain), Wikimedia Commons.", options: {} },
  ], { x: 9.1, y: 1.65, w: 3.4, h: 4.45, fontSize: 13, paraSpaceAfter: 7, valign: "top" });
  T(s, "Calzone: look at your plate, know what's in it.", { x: 0.6, y: 6.4, w: 12.1, h: 0.5, fontSize: 20, italic: true, color: H.accent1, fontFace: THEME.headFontFace });
  s.addNotes("[2:35–3:00] Next, we want to test more than 100 plates with known weights, guess weights better, and warn when a day is low in calories or vitamin D. We used AI to help: Claude helped write the code, MedGemma looks at the food, and the video voice is made by AI. Calzone: look at your plate, and know what's in it. Thank you!");

  await pres.writeFile({ fileName: OUT });
  if (SKILL_THEME) {
    const { applyTheme } = require(SKILL_THEME);
    await applyTheme(OUT, THEME);
  }
  console.log("wrote", OUT);
})();
