// The crop photos: crop-images/ at the top of the project, 4 or 5 hand-checked photos per crop with a free
// licence (CC0, CC BY or CC BY-SA; who took each one is in crop-images/crops.json and CREDITS.md).
// server.js serves the files; this file lists them for the app.

const fs = require('fs');
const path = require('path');

const FOLDER = path.join(__dirname, '../../../crop-images');
const LIST = JSON.parse(fs.readFileSync(path.join(FOLDER, 'crops.json'), 'utf8'));

// Every crop of the app: the 93 crops of ml-service/artifacts/crop_requirements.csv, the same names
const KNOWN_CROPS = new Set(Object.keys(LIST));

// Each crop's photos that are really on disk (a slot with no good free photo has none), with the credit the
// licence asks for. path is the address of the file on this server.
const PHOTOS = Object.fromEntries(
  Object.entries(LIST).map(([crop, item]) => [
    crop,
    {
      scientific_name: item.scientific_name,
      photos: item.images
        .filter((image) => image.file && fs.existsSync(path.join(FOLDER, image.file)))
        .map((image) => ({
          slot: image.slot, // field, close_up, pods, seeds (the harvested crop) or mature
          path: 'crop-images/' + image.file,
          author: image.author,
          license: image.license,
          license_url: image.license_url,
          site: image.site,
          source: image.source,
        })),
    },
  ])
);

module.exports = { FOLDER, KNOWN_CROPS, PHOTOS };
