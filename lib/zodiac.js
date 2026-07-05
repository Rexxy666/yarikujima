const fs = require('fs');
const path = require('path');

const BASE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'base_zodiac_pet.json'), 'utf8')
);

const ZODIAC_TYPES = BASE.skins
  .map((s) => s.name)
  .filter((n) => n.startsWith('zodiac/'))
  .map((n) => n.replace('zodiac/', ''));

function pickRandomZodiac() {
  return ZODIAC_TYPES[Math.floor(Math.random() * ZODIAC_TYPES.length)];
}

function zodiacSkinId(type) {
  return `zodiac/${type}`;
}

module.exports = { ZODIAC_TYPES, pickRandomZodiac, zodiacSkinId };
