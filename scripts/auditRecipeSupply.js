'use strict';
const R = require('../boardlocked');
const data = require('../chunkpicker-chunkinfo-export.json');
const annotations = require('../boardlocked-data');

const catalog = R.recipeSupplyCatalog(data, annotations);
const report = {};
let missingCount = 0;
for (const skill of catalog.skills) {
    const recipes = catalog.recipes.filter(recipe => recipe.skill === skill);
    const itemKeys = new Set(recipes.flatMap(recipe => recipe.inputs.flatMap(input => input.alternatives)));
    const missing = recipes.flatMap(recipe => recipe.inputs.filter(input =>
        !input.alternatives.some(item => catalog.globallySupplied(item))).map(input => ({
        recipe: recipe.name, input: input.raw, alternatives: input.alternatives
    })));
    missingCount += missing.length;
    report[skill] = {
        recipeCount: recipes.length,
        ingredientCount: itemKeys.size,
        ingredients: Object.fromEntries([...itemKeys].sort((left, right) => left.localeCompare(right)).map(item => [item,
            (catalog.ingredients[item]?.sources || []).map(source => ({ kind: source.kind, source: source.sourceName,
                chance: source.chance, approved: source.approved, reason: source.reason }))])),
        missing
    };
}

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
    for (const [skill, result] of Object.entries(report)) {
        console.log(`${skill}: ${result.recipeCount} recipes, ${result.ingredientCount} expanded ingredient choices, ${result.missing.length} uncovered inputs`);
    }
    console.log('Run with --json to inspect every approved and rejected source.');
}
if (missingCount) process.exitCode = 1;
