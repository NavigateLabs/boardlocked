/* Small local annotations for rules the upstream task metadata cannot express. */
(function (root, factory) {
    const data = factory();
    if (typeof module === 'object' && module.exports) module.exports = data;
    else root.BoardlockedData = data;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';
    return Object.freeze({
        initialization: Object.freeze({
            questTasks: Object.freeze({
                druidicRitual: '~|Druidic Ritual|~ Complete the quest',
                varlamore: '~|Children of the Sun|~ Complete the quest',
                ocean: '~|Pandemonium|~ Complete the quest'
            }),
            questBaseNames: Object.freeze({
                druidicRitual: 'Druidic Ritual',
                varlamore: 'Children of the Sun',
                ocean: 'Pandemonium'
            }),
            levelFloors: Object.freeze({
                druidicRitual: Object.freeze({ Herblore: 3 }),
                ocean: Object.freeze({ Sailing: 5 })
            }),
            // Random Start was originally a broad region filter. Boardlocked
            // needs a much stricter first tile: reachable surface areas which do
            // not assume a long quest chain, dangerous environmental protection,
            // a guild requirement, or access to a high-level activity. Optional
            // groups are deliberately small so enabling one does not drown out
            // the normal mainland roll.
            startingTiles: Object.freeze({
                standard: Object.freeze([
                    // Misthalin and the ordinary Asgarnian surface.
                    '12081', '12082', '12083', '12084', '12085', '12086', '12087',
                    '12337', '12338', '12339', '12340', '12341', '12342', '12343',
                    '12593', '12594', '12595', '12596', '12597', '12598', '12599',
                    '12849', '12850', '12851', '12852', '12853', '12854', '12855',
                    '13106', '13107', '13108', '13109', '13110', '13111',
                    '13364', '13365', '13366', '13367',
                    '11062', '11063', '11317', '11569', '11572', '11573', '11574',
                    '11575', '11824', '11825', '11826', '11827', '11828', '11829',
                    '11830', '11831',

                    // Kandarin surface towns, farms, woodland, and coasts.
                    '9014', '9015', '9016', '9263', '9264', '9268', '9269', '9270',
                    '9271', '9272', '9520', '9521', '9524', '9525', '9526', '9527',
                    '9774', '9777', '9779', '9780', '9781', '9782',
                    '10029', '10032', '10033', '10034', '10038', '10039',
                    '10285', '10288', '10289', '10290', '10291',
                    '10292', '10294', '10543', '10545', '10546', '10547', '10548',
                    '10549', '10550', '10551', '10552', '10803', '10805', '10806',
                    '10807', '10808', '11061', '11064',

                    // Karamja surface reachable without Legends', Shilo Village,
                    // Dragon Slayer, or another access quest.
                    '10801', '10802', '11055', '11056', '11057', '11311',
                    '11312', '11313', '11567', '11568', '11822',

                    // Fremennik mainland. Waterbirth and the mountain/troll route
                    // are omitted from a level-3 start.
                    '10297', '10553', '10554', '10809', '10810', '10811',

                    // Great Kourend surface, excluding sulphur damage, Mount
                    // Karuulm boots, Wintertodt, guild interiors, and altar gates.
                    '4665', '4666', '4667', '5174', '5177', '5178', '5430',
                    '5432', '5435', '5686', '5687', '5688', '5689', '5690',
                    '5691', '5941', '5942', '5943', '5944', '5945', '5946', '5947',
                    // 6454's only land section is inside the level-60 Woodcutting Guild.
                    '5949', '6197', '6199', '6200', '6201', '6203', '6204', '6205',
                    '6455', '6456', '6457', '6458', '6459', '6460', '6461',
                    '6710', '6711', '6714', '6716', '6717', '6966', '6967', '6968',
                    '6969', '6970', '6971', '7221', '7223', '7224', '7225', '7226',
                    '7227', '7478', '7479'
                ]),
                // Children of the Sun is treated as account initialization when
                // this group is enabled. This covers every released overworld
                // tile in the source data. Per-area rules below keep starts on
                // the connected surface and out of unreleased or quest-only
                // interiors.
                varlamore: Object.freeze([
                    // Tlati Rainforest and the released Custodia Pass.
                    '4656', '4910', '4911', '4912', '4913', '4916', '4917',
                    '5167', '5168', '5169', '5172', '5173', '5423', '5679',

                    // Aldarin.
                    '5165', '5166', '5420', '5421', '5422', '5676', '5677',
                    '5678',

                    // River Varla, Ralos' Rise, the Hailstorm Mountains, and
                    // Auburn Valley.
                    '5424', '5425', '5426', '5427', '5428', '5429', '5680',
                    '5681', '5682', '5683', '5684', '5936', '5937', '5938',
                    '5939', '5940', '6194', '6196',

                    // Avium Savannah, Civitas illa Fortis, and the released
                    // Colosseum exterior.
                    '5934', '5935', '6189', '6190', '6191', '6192', '6193',
                    '6195', '6445', '6446', '6447', '6448', '6449', '6450',
                    '6451', '6701', '6702', '6703', '6704', '6705', '6706',
                    '6707', '6957', '6958', '6959', '6960', '6961', '7215',
                    '7216', '7217', '7472'
                ]),
                // The safe side of Ferox and nearby low-risk woodland.
                // Dragon, boss, lava, crater, altar, and deep-Wilderness tiles are
                // excluded even though the source dataset calls them quest-free.
                wilderness: Object.freeze([
                    '12600', '12857'
                ]),
                // Experimental level-1 Sailing waters around Port Sarim and The
                // Pandemonium. This avoids adding all 600+ generic ocean squares.
                ocean: Object.freeze([
                    '11820', '12077', '12080', '12333', '12334', '12335',
                    '12592'
                ])
            }),
            startingAreaPolicies: Object.freeze({
                varlamore: Object.freeze({
                    // 6704-1 is the ordinary Fortis surface. Only land sections
                    // in its connected map component may be selected. This
                    // removes isolated pond islands, the Death on the Isle
                    // theatre interior, Kourend-side mountain fragments, and
                    // other disconnected geometry without discarding the usable
                    // part of a mixed chunk.
                    connectedTo: '6704-1',
                    sectionGroups: Object.freeze({
                        // Section 1 contains the level-46 Hunter Guild. Section 2
                        // is the outside path between the backyard and Ortus Farm.
                        '6191': Object.freeze([Object.freeze(['2'])])
                    })
                })
            }),
            // Together with startingTiles.varlamore, this accounts for every
            // chunk in rollingChunks.varlamore from the upstream map export.
            startingTileExclusions: Object.freeze({
                varlamore: Object.freeze({
                    '4915': 'Tempestus is not released or accessible.',
                    '5171': 'Tempestus is not released or accessible.',
                    '5933': 'Villa Lucens Theatre is a quest-only interior with no connection to the Aldarin surface.'
                })
            })
        }),
        persistentEnablers: Object.freeze({
            // codeItems.tools is mostly reusable implements, but these entries are
            // consumed inputs. The upstream data has no persistence flag for them.
            nonPersistentItems: Object.freeze(['Bones', 'Big bones', 'Fishing bait', 'Dark fishing bait']),
            nonPersistentGroups: Object.freeze(['Bones[+]', 'Big bones[+]', 'Barbarian bait[+]', 'Plant cure[+]'])
        }),
        forestry: Object.freeze({
            taskCategories: Object.freeze(['Forestry', 'ForestryXp']),
            kitItem: 'Forestry kit',
            kitNpc: 'Friendly Forester',
            excludedOriginGroups: Object.freeze(['Woodcutting guild[+]'])
        })
    });
});
