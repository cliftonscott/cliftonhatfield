#!/usr/bin/env node
/**
 * Generates the AGNTS feed avatars used in the hero phone, self-hosted as SVG.
 *
 * These are the *same* avatars AGNTS renders: a faithful JS port of the app's
 * deterministic Avataaars derivation
 *   (drift/app/lib/src/core/utils/avataaars_options.dart),
 * which the admin/web mirror in drift/admin/src/utils/avatar.ts. Each agent's
 * handle is used as the avatar seed; the seed deterministically picks every
 * trait via SHA-256 -> Mulberry32, exactly as the app does, then we fetch the
 * SVG from avataaars.io once and commit it so the live site has no third-party
 * dependency at runtime.
 *
 * Run: node scripts/generate-avatars.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/img/avatars");

/* ── Canonical Avataaars enums (order-sensitive; mirror avataaars_options.dart) ── */
const TOP_TYPES = ["NoHair","Eyepatch","Hat","Hijab","Turban","WinterHat1","WinterHat2","WinterHat3","WinterHat4","LongHairBigHair","LongHairBob","LongHairBun","LongHairCurly","LongHairCurvy","LongHairDreads","LongHairFrida","LongHairFro","LongHairFroBand","LongHairNotTooLong","LongHairShavedSides","LongHairMiaWallace","LongHairStraight","LongHairStraight2","LongHairStraightStrand","ShortHairDreads01","ShortHairDreads02","ShortHairFrizzle","ShortHairShaggyMullet","ShortHairShortCurly","ShortHairShortFlat","ShortHairShortRound","ShortHairShortWaved","ShortHairSides","ShortHairTheCaesar","ShortHairTheCaesarSidePart"];
const ACCESSORIES_TYPES = ["Blank","Kurt","Prescription01","Prescription02","Round","Sunglasses","Wayfarers"];
const HAIR_COLORS = ["Auburn","Black","Blonde","BlondeGolden","Brown","BrownDark","PastelPink","Blue","Platinum","Red","SilverGray"];
const FACIAL_HAIR_TYPES = ["Blank","BeardMedium","BeardLight","BeardMajestic","MoustacheFancy","MoustacheMagnum"];
const FACIAL_HAIR_COLORS = ["Auburn","Black","Blonde","BlondeGolden","Brown","BrownDark","Platinum","Red"];
const CLOTHE_TYPES = ["BlazerShirt","BlazerSweater","CollarSweater","GraphicShirt","Hoodie","Overall","ShirtCrewNeck","ShirtScoopNeck","ShirtVNeck"];
const CLOTHE_COLORS = ["Black","Blue01","Blue02","Blue03","Gray01","Gray02","Heather","PastelBlue","PastelGreen","PastelOrange","PastelRed","PastelYellow","Pink","Red","White"];
const EYE_TYPES = ["Close","Cry","Default","EyeRoll","Happy","Hearts","Side","Squint","Surprised"];
const EYEBROW_TYPES = ["Angry","AngryNatural","Default","DefaultNatural","FlatNatural","RaisedExcited","RaisedExcitedNatural","SadConcerned","SadConcernedNatural","UnibrowNatural","UpDown","UpDownNatural"];
const MOUTH_TYPES = ["Concerned","Default","Disbelief","Eating","Grimace","Sad","ScreamOpen","Serious","Smile","Tongue","Twinkle","Vomit"];
const SKIN_COLORS = ["Tanned","Yellow","Pale","Light","Brown","DarkBrown","Black"];

const MAPPING_VERSION = 1;

/* ── Seed -> Mulberry32 state: SHA-256(material), first 4 bytes LE ── */
function seedState(seed) {
  const material = `avataaarsMappingVersion=${MAPPING_VERSION}|seed=${seed ?? ""}`;
  return createHash("sha256").update(material, "utf8").digest().readUInt32LE(0);
}

function makePrng(state) {
  let s = state >>> 0;
  return function nextDouble() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s ^ (s >>> 15);
    t = Math.imul(t, t | 1) >>> 0;
    return t / 4294967296;
  };
}

function pick(values, next) {
  const idx = Math.min(Math.max(Math.floor(next() * values.length), 0), values.length - 1);
  return values[idx];
}

/* Mirrors deriveAvataaarsOptions + the display path (allowSurprisedEyes:false). */
function deriveOptions(seed) {
  const next = makePrng(seedState(seed));
  const o = {
    topType: pick(TOP_TYPES, next),
    skinColor: pick(SKIN_COLORS, next),
    hairColor: pick(HAIR_COLORS, next),
    clotheType: pick(CLOTHE_TYPES, next),
    clotheColor: pick(CLOTHE_COLORS, next),
    eyeType: pick(EYE_TYPES, next),
    eyebrowType: pick(EYEBROW_TYPES, next),
    mouthType: pick(MOUTH_TYPES, next),
    renderStyle: "Transparent",
  };
  o.accessoriesType = next() < 0.30 ? pick(ACCESSORIES_TYPES.slice(1), next) : "Blank";
  const fh = next() < 0.20 ? pick(FACIAL_HAIR_TYPES.slice(1), next) : "Blank";
  o.facialHairType = fh;
  if (fh !== "Blank") o.facialHairColor = pick(FACIAL_HAIR_COLORS, next);
  // Display sanitization coerces Surprised/Dizzy eyes to Default.
  if (o.eyeType === "Surprised" || o.eyeType === "Dizzy") o.eyeType = "Default";
  return o;
}

function rfc3986(value) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%7E/g, "~");
}

/* renderStyle -> avatarStyle, sorted keys, RFC 3986 — matches buildAvataaarsSvgUrl. */
function buildUrl(options) {
  const params = {};
  for (const [k, v] of Object.entries(options)) {
    if (k === "renderStyle") params.avatarStyle = v;
    else params[k] = v;
  }
  const query = Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join("&");
  return `https://avataaars.io/?${query}`;
}

/* Seed = handle (the deterministic mapping the app would use for these agents). */
const AGENTS = [
  "tangent_field_listens",
  "rune_verse_signals",
  "willow_lane_opts",
  "zephyr_hollow_wonders",
  "cedar_reef_objects",
  "vesper_grove_counters",
  "onyx_meridian_probes",
];

// Expression frames per agent. Identity (hair/skin/clothes/accessories) stays
// fixed; only mouth & eyes change between frames — the same approach AGNTS uses
// in avatar_frames.dart. The hero animates by swapping between these:
//   idle  — resting face (the derived avatar; also the no-JS / reduced-motion frame)
//   talk  — mouth open (ScreamOpen) so idle<->talk reads as "speaking"
//   blink — eyes closed
function framesFor(seed) {
  const base = deriveOptions(seed);
  const talkMouth = base.mouthType === "ScreamOpen" ? "Eating" : "ScreamOpen";
  return {
    "": base,                                          // idle -> <handle>.svg
    "-talk": { ...base, mouthType: talkMouth },
    "-blink": { ...base, eyeType: "Close" },
  };
}

async function fetchSvg(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed for ${label}: ${res.status}`);
  const svg = await res.text();
  if (!svg.trimStart().startsWith("<svg")) throw new Error(`Non-SVG response for ${label}`);
  return svg;
}

await mkdir(OUT_DIR, { recursive: true });

for (const handle of AGENTS) {
  const frames = framesFor(handle);
  const sizes = [];
  for (const [suffix, options] of Object.entries(frames)) {
    const svg = await fetchSvg(buildUrl(options), `${handle}${suffix}`);
    await writeFile(resolve(OUT_DIR, `${handle}${suffix}.svg`), svg, "utf8");
    sizes.push(`${suffix || "idle"} ${(svg.length / 1024).toFixed(1)}KB`);
  }
  const o = frames[""];
  console.log(`@${handle}  ${o.topType}/${o.skinColor}/${o.clotheType}  [${sizes.join(", ")}]`);
}

console.log(`\nDone. ${AGENTS.length} agents x 3 frames in assets/img/avatars/`);
