'use strict';
const R = require('../boardlocked');
const data = require('../chunkpicker-chunkinfo-export.json');
const annotations = require('../boardlocked-data');

const catalog = R.clueSourceCatalog(data, annotations);
const report = {};
let failures = 0;
for (const tier of R.CLUE_TIERS) {
    const sources = catalog.tiers[tier] || [];
    const approved = sources.filter(source => source.allowed);
    const rejected = sources.filter(source => !source.allowed);
    if (!approved.length) failures++;
    report[tier] = {
        directMinimumChance: catalog.policy.directMinimumChanceByTier[tier] ?? null,
        focusedMinimumChance: catalog.policy.focusedMinimumChanceByTier[tier] ?? null,
        approvedCount: approved.length,
        rejectedCount: rejected.length,
        approved: approved.map(source => ({ kind: source.kind, source: source.sourceName,
            skill: source.sourceSkill || null, chance: source.chance, reason: source.reason })),
        rejected: rejected.map(source => ({ kind: source.kind, source: source.sourceName,
            skill: source.sourceSkill || null, chance: source.chance, reason: source.reason }))
    };
}

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
    for (const [tier, result] of Object.entries(report)) {
        console.log(`${tier}: ${result.approvedCount} primary sources, ${result.rejectedCount} incidental sources`);
    }
    console.log('Run with --json to inspect every approved and rejected clue source.');
}
if (failures) process.exitCode = 1;
