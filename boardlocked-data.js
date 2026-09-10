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
            // Human-reviewed land tiles for the first roll. Varlamore and the
            // Wilderness remain separate account choices.
            startingTiles: Object.freeze({
                // Reviewed land starts outside the optional regions.
                standard: Object.freeze([
                    '4662', '4663', '4664', '4665', '4666', '4667', '4918',
                    '4919', '4920', '4921', '4922', '4923', '5174', '5175',
                    '5176', '5177', '5178', '5179', '5180', '5430', '5431',
                    '5432', '5433', '5434', '5435', '5686', '5687', '5688',
                    '5689', '5690', '5691', '5692', '5941', '5942', '5943',
                    '5944', '5945', '5946', '5947', '5948', '5949', '6197',
                    '6198', '6199', '6200', '6201', '6202', '6203', '6204',
                    '6205', '6453', '6454', '6455', '6456', '6457', '6458',
                    '6459', '6460', '6461', '6710', '6711', '6712', '6713',
                    '6714', '6715', '6716', '6717', '6966', '6967', '6968',
                    '6969', '6970', '6971', '6972', '7221', '7222', '7223',
                    '7224', '7225', '7226', '7227', '7478', '7479', '8236',
                    '8237', '8238', '8491', '8492', '8494', '8747', '8748',
                    '8750', '9003', '9004', '9006', '9014', '9015', '9016',
                    '9260', '9261', '9262', '9263', '9264', '9268', '9269',
                    '9270', '9271', '9272', '9273', '9519', '9520', '9521',
                    '9524', '9525', '9526', '9527', '9528', '9773', '9774',
                    '9775', '9776', '9777', '9778', '9779', '9780', '9781',
                    '9782', '9783', '10028', '10029', '10030', '10031', '10032',
                    '10033', '10034', '10036', '10037', '10038', '10039', '10284',
                    '10285', '10286', '10287', '10288', '10289', '10290', '10291',
                    '10292', '10293', '10294', '10296', '10297', '10542', '10543',
                    '10544', '10545', '10546', '10547', '10548', '10549', '10550',
                    '10551', '10552', '10553', '10554', '10801', '10802', '10803',
                    '10804', '10805', '10806', '10807', '10808', '10809', '10810',
                    '10811', '11054', '11055', '11056', '11057', '11058', '11060',
                    '11061', '11062', '11063', '11064', '11065', '11310', '11311',
                    '11312', '11313', '11314', '11316', '11317', '11318', '11319',
                    '11566', '11567', '11568', '11569', '11570', '11571', '11572',
                    '11573', '11574', '11575', '11822', '11823', '11824', '11825',
                    '11826', '11827', '11828', '11829', '11830', '12081', '12082',
                    '12083', '12084', '12085', '12086', '12337', '12338', '12339',
                    '12340', '12341', '12342', '12593', '12594', '12595', '12596',
                    '12597', '12598', '12849', '12850', '12851', '12852', '12853',
                    '12854', '13105', '13106', '13107', '13108', '13109', '13110',
                    '13361', '13362', '13363', '13364', '13365', '13366', '13622'
                ]),
                // Enabled separately because Children of the Sun is treated as
                // account initialization.
                varlamore: Object.freeze([
                    '4656', '4910', '4911', '4912', '4913', '4915', '4916',
                    '4917', '5165', '5166', '5167', '5168', '5169', '5171',
                    '5172', '5173', '5420', '5421', '5422', '5423', '5424',
                    '5425', '5426', '5427', '5428', '5429', '5676', '5677',
                    '5678', '5679', '5680', '5681', '5682', '5683', '5684',
                    '5933', '5934', '5935', '5936', '5937', '5938', '5939',
                    '5940', '6189', '6190', '6191', '6192', '6193', '6194',
                    '6195', '6445', '6446', '6447', '6448', '6449', '6450',
                    '6451', '6701', '6702', '6703', '6704', '6705', '6706',
                    '6707', '6957', '6958', '6959', '6960', '6961', '7215',
                    '7216', '7217', '7472'
                ]),
                // Enabled separately because Wilderness risk is an account choice.
                wilderness: Object.freeze([
                    '11831', '11832', '11833', '11834', '11835', '11836', '11837',
                    '12087', '12088', '12089', '12090', '12091', '12092', '12093',
                    '12343', '12344', '12345', '12346', '12347', '12348', '12349',
                    '12599', '12600', '12601', '12602', '12603', '12604', '12605',
                    '12855', '12856', '12857', '12858', '12859', '12860', '12861',
                    '13111', '13112', '13113', '13114', '13115', '13116', '13117',
                    '13367', '13368', '13369', '13370', '13371', '13372'
                ])
            }),
            startingAreaPolicies: Object.freeze({
                varlamore: Object.freeze({
                    // 6704-1 is the ordinary Fortis surface. Only land sections
                    // in its connected map component may be selected. This
                    // removes isolated pond islands, Kourend-side mountain
                    // fragments, and other disconnected geometry without
                    // discarding the usable part of a mixed chunk.
                    connectedTo: '6704-1',
                    // The reviewed pool intentionally includes the theatre's
                    // land section even though it is separate from the main
                    // overworld component.
                    includeLocations: Object.freeze(['5933-1']),
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
                    '6196': 'Removed in the reviewed starting-tile audit.'
                })
            })
        }),
        resourceRepresentatives: Object.freeze({
            // These are consumed helpers rather than the material transformed
            // by the task. Do not use them to merge progression milestones.
            ignoredPrimaryResources: Object.freeze({
                Fishing: Object.freeze(['Fishing bait', 'Feather']),
                Crafting: Object.freeze(['Thread[+]'])
            }),
            // These outputs use a shared material but belong to a separate
            // result or gameplay system from the ordinary recipe family.
            distinctOutputFamilies: Object.freeze([
                Object.freeze({ skill: 'Cooking', outputIncludes: 'poison karambwan', family: 'poison-karambwan' }),
                Object.freeze({ skill: 'Smithing', outputIncludes: 'cannonball', family: 'cannonballs' }),
                Object.freeze({ skill: 'Smithing', outputIncludes: 'keel parts', family: 'ship-parts' })
            ])
        }),
        travelConnections: Object.freeze([
            Object.freeze({
                id: 'achilka-rowboat',
                label: "Achilka's rowboat",
                endpoints: Object.freeze(['4912', '5424-3', '5426-1'])
            })
        ]),
        persistentEnablers: Object.freeze({
            // codeItems.tools is mostly reusable implements, but these entries are
            // consumed inputs. The upstream data has no persistence flag for them.
            nonPersistentItems: Object.freeze(['Bones', 'Big bones', 'Fishing bait', 'Dark fishing bait']),
            nonPersistentGroups: Object.freeze(['Bones[+]', 'Big bones[+]', 'Barbarian bait[+]', 'Plant cure[+]']),
            customCapabilities: Object.freeze([
                Object.freeze({
                    capabilityId: 'ship-cannon',
                    requirementKey: 'Ship cannon[+]',
                    label: 'Ship cannon',
                    familyType: 'levelled_ship_facility',
                    skill: 'Sailing',
                    enforceUseLevel: true,
                    classificationReason: 'Ship combat needs an installed cannon that the account has the Sailing level to use',
                    satisfyingItems: Object.freeze([
                        Object.freeze({ itemKey: 'Bronze cannon', minimumUseLevel: 28, requiredLevels: Object.freeze({ Ranged: 1 }) }),
                        Object.freeze({ itemKey: 'Iron cannon', minimumUseLevel: 35, requiredLevels: Object.freeze({ Ranged: 1 }) }),
                        Object.freeze({ itemKey: 'Steel cannon', minimumUseLevel: 47, requiredLevels: Object.freeze({ Ranged: 5 }) }),
                        Object.freeze({ itemKey: 'Mithril cannon', minimumUseLevel: 57, requiredLevels: Object.freeze({ Ranged: 20 }) }),
                        Object.freeze({ itemKey: 'Adamant cannon', minimumUseLevel: 69, requiredLevels: Object.freeze({ Ranged: 30 }) }),
                        Object.freeze({ itemKey: 'Rune cannon', minimumUseLevel: 80, requiredLevels: Object.freeze({ Ranged: 40 }) }),
                        Object.freeze({ itemKey: 'Dragon cannon', minimumUseLevel: 92, requiredLevels: Object.freeze({ Ranged: 60 }) })
                    ])
                })
            ])
        }),
        shipCombat: Object.freeze({
            monsterGroup: 'BountyMonster[+]',
            deriveMonstersFromWaterSections: true,
            capabilityRequirement: 'Ship cannon[+]'
        }),
        forestry: Object.freeze({
            taskCategories: Object.freeze(['Forestry', 'ForestryXp']),
            kitItem: 'Forestry kit',
            kitNpc: 'Friendly Forester',
            eventUniqueItems: Object.freeze([
                'Fox whistle', 'Golden pheasant egg', 'Petal garland', 'Sturdy beehive parts'
            ]),
            excludedOriginGroups: Object.freeze(['Woodcutting guild[+]'])
        })
    });
});
