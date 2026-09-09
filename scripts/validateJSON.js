'use strict';
// Cross-platform equivalent of validateJSON.sh, also checking the stable ID map.
const fs = require('node:fs');
const path = require('node:path');
for (const file of ['chunkpicker-chunkinfo-export.json', 'tasksMap.json']) {
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    console.log(file + ': valid JSON');
}
