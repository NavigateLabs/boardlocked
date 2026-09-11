/* Small local annotations for rules the upstream task metadata cannot express. */
(function (root, factory) {
    const data = factory();
    if (typeof module === 'object' && module.exports) module.exports = data;
    else root.BoardlockedData = data;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';
    return Object.freeze({
        initialization: Object.freeze({
            // Boardlocked account setup includes receiving the first tutorial
            // assignment once. This unlocks the skill's other masters without
            // making Burthorpe permanently accessible.
            assumedCompletedTasks: Object.freeze([
                Object.freeze({
                    option: 'turael',
                    skill: 'Slayer',
                    name: 'Receive a Slayer assignment from ~|Turael|~ in Burthorpe'
                })
            ]),
            assumedPrimarySkills: Object.freeze([
                Object.freeze({ option: 'turael', skill: 'Slayer' })
            ]),
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
                    '10033', '10034', '10035', '10036', '10037', '10038', '10039', '10284',
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
                    '13361', '13362', '13363', '13364', '13365', '13366', '13617',
                    '13618', '13619', '13621', '13622'
                ]),
                // Enabled separately because Children of the Sun is treated as
                // account initialization.
                varlamore: Object.freeze([
                    '4656', '4910', '4911', '4912', '4913', '4915', '4916',
                    '4917', '5165', '5166', '5167', '5168', '5169', '5171',
                    '5172', '5173', '5420', '5421', '5422', '5423', '5424',
                    '5425', '5426', '5427', '5428', '5429', '5676', '5677',
                    '5678', '5679', '5680', '5681', '5682', '5683', '5684',
                    '5934', '5935', '5936', '5937', '5938', '5939',
                    '5940', '6189', '6190', '6191', '6192', '6193', '6194',
                    '6195', '6196', '6445', '6446', '6447', '6448', '6449', '6450',
                    '6451', '6701', '6702', '6703', '6704', '6705', '6706',
                    '6957', '6958', '6959', '6960', '6961', '7215',
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
                    '13367', '13368', '13369', '13370', '13371', '13372', '13373'
                ])
            }),
            startingAreaPolicies: Object.freeze({
                standard: Object.freeze({
                    // West Ardougne's outer land remains a valid ordinary start;
                    // its city section is separately tagged with Plague City.
                    sectionGroups: Object.freeze({
                        '10035': Object.freeze([Object.freeze(['2', '3', '4'])])
                    })
                }),
                varlamore: Object.freeze({
                    // 6704-1 is the ordinary Fortis surface. Only land sections
                    // in its connected map component may be selected. This
                    // removes isolated pond islands, Kourend-side mountain
                    // fragments, and other disconnected geometry without
                    // discarding the usable part of a mixed chunk.
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
                standard: Object.freeze({
                    '9017': 'Ocean tile; starting rolls are land-only.',
                    '9772': "The usable Myths' Guild section requires Dragon Slayer II.",
                    '11053': "Kharazi Jungle requires starting Legends' Quest.",
                    '11059': 'The Fishing Platform requires starting Sea Slug.',
                    '11309': "Kharazi Jungle requires starting Legends' Quest.",
                    '11315': 'Crandor requires Dragon Slayer I access.',
                    '11320': 'Death Plateau and its northern routes require quest access.',
                    '11321': 'Troll Stronghold requires the troll quest line.',
                    '11322': 'The Ice Gate area requires quest access.',
                    '11565': "Kharazi Jungle requires starting Legends' Quest.",
                    '11576': 'The Troll Arena route requires the troll quest line.',
                    '11577': 'Trollheim requires partial Troll Stronghold or another gated route.',
                    '11578': 'God Wars Dungeon requires quest access and level 60 Strength or Agility.',
                    '11821': "Kharazi Jungle's east coast requires Legends' Quest access."
                }),
                varlamore: Object.freeze({
                    '5933': 'Villa Lucens Theatre requires progress in Death on the Isle.',
                    '6707': 'The Twilight Temple approach requires Twilight Emissary robes from The Heart of Darkness.'
                })
            }),
            // The upstream section graph records most quest gates in
            // questSections. These entries supply access gates that are known
            // to be missing there. They are data, consumed uniformly by both
            // automatic and player-picked starts.
            startingAccessRequirements: Object.freeze({
                '5677-3': Object.freeze({ Tasks: Object.freeze({ '~|Death on the Isle|~ 3': 'Quest' }) }),
                '5678-3': Object.freeze({ Tasks: Object.freeze({ '~|Death on the Isle|~ 3': 'Quest' }) }),
                '5933-1': Object.freeze({ Tasks: Object.freeze({ '~|Death on the Isle|~ 3': 'Quest' }) }),
                '9772-1': Object.freeze({ Tasks: Object.freeze({ "~|Dragon Slayer II|~ Complete the quest": 'Quest' }) }),
                '10035-1': Object.freeze({ Tasks: Object.freeze({ '~|Plague City|~ Complete the quest': 'Quest' }) }),
                '11053-1': Object.freeze({ Tasks: Object.freeze({ "~|Legends' Quest|~ 1": 'Quest' }) }),
                '11059-1': Object.freeze({ Tasks: Object.freeze({ '~|Sea Slug|~ 1': 'Quest' }) }),
                '11059-2': Object.freeze({ Tasks: Object.freeze({ '~|Sea Slug|~ 1': 'Quest' }) }),
                '11309-1': Object.freeze({ Tasks: Object.freeze({ "~|Legends' Quest|~ 1": 'Quest' }) }),
                '11315-1': Object.freeze({ Tasks: Object.freeze({ '~|Dragon Slayer I|~ Complete the quest': 'Quest' }) }),
                '11315-2': Object.freeze({ Tasks: Object.freeze({ '~|Dragon Slayer I|~ Complete the quest': 'Quest' }) }),
                '11320-1': Object.freeze({ Tasks: Object.freeze({ '~|Death Plateau|~ Complete the quest': 'Quest' }) }),
                '11320-2': Object.freeze({ Tasks: Object.freeze({ "~|My Arm's Big Adventure|~ Complete the quest": 'Quest' }) }),
                '11320-3': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }) }),
                '11321-1': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }) }),
                '11321-2': Object.freeze({ Tasks: Object.freeze({ "~|My Arm's Big Adventure|~ Complete the quest": 'Quest' }) }),
                '11321-3': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }) }),
                '11322-1': Object.freeze({ Tasks: Object.freeze({ '~|Desert Treasure I|~ Complete the quest': 'Quest' }) }),
                '11322-2': Object.freeze({ Tasks: Object.freeze({ '~|Desert Treasure I|~ Complete the quest': 'Quest' }) }),
                '11565-1': Object.freeze({ Tasks: Object.freeze({ "~|Legends' Quest|~ 1": 'Quest' }) }),
                '11576-1': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }) }),
                '11576-2': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }) }),
                '11577': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }),
                    Skills: Object.freeze({ Agility: 15 }) }),
                '11578-1': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }),
                    SkillAlternatives: Object.freeze([Object.freeze([Object.freeze({ Strength: 60 }), Object.freeze({ Agility: 60 })])]) }),
                '11578-2': Object.freeze({ Tasks: Object.freeze({ '~|Troll Stronghold|~ Complete the quest': 'Quest' }),
                    SkillAlternatives: Object.freeze([Object.freeze([Object.freeze({ Strength: 60 }), Object.freeze({ Agility: 60 })])]) }),
                '11821-1': Object.freeze({ Tasks: Object.freeze({ "~|Legends' Quest|~ 1": 'Quest' }) })
            }),
            manualStartingSectionGroups: Object.freeze({
                // Sections 3 and 4 are map-plane overlap artefacts pointing at
                // Crandor, rather than places on the Fishing Platform.
                '11059': Object.freeze([Object.freeze(['1'])])
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
        trainingSupply: Object.freeze({
            // Some renewable producers yield one item and then enter a local
            // cooldown. They can satisfy a one-time objective, but only a
            // sufficiently large group at one location can support training.
            // Pools are deliberately location-local: identical producers in a
            // distant chunk do not shorten one another's recovery cycle.
            localCooldownProducers: Object.freeze([
                Object.freeze({
                    tasks: Object.freeze(['Shear alpaca*', 'Shear sheep*']),
                    sourceType: 'npcs',
                    sources: Object.freeze(['Alpaca', 'Sheep']),
                    minimumLocalCount: 5
                })
            ])
        }),
        recipeSupply: Object.freeze({
            // Cooking and Crafting objectives must follow a deliberate supply
            // route. Focused activities may provide ingredients at a lower rate
            // than ordinary monster drops because the player can repeat the
            // activity specifically for that resource.
            skills: Object.freeze(['Cooking', 'Crafting']),
            commonMonsterChance: 1 / 4,
            focusedActivityChance: 1 / 20,
            rareFallbackRatio: 1 / 2,
            itemAliases: Object.freeze({
                // The upstream recipe uses one b, while Hunter produces the
                // correctly named item.
                'Raw wild kebit': 'Raw wild kebbit',
                'Slimy eel': 'Cooked slimy eel',
                'Karambwanji': 'Raw karambwanji',
                'Karambwan': 'Cooked karambwan',
                'Curry leaves': 'Curry leaf',
                'BLessed wyrm bones': 'Blessed wyrm bones',
                'Ball of wall': 'Ball of wool'
            }),
            inputCorrections: Object.freeze({
                // This partial-product row otherwise consumes its own output.
                'Make a ~|part wild pie (raw chompy)|~': Object.freeze({
                    'Part wild pie (raw chompy)*': 'Part wild pie (raw bear meat)*'
                })
            }),
            additionalOutputs: Object.freeze({
                // The upstream row represents every recoloured cape but omits
                // Output because there are several possible results.
                'Dye a ~|cape|~': Object.freeze(['Cape[+]'])
            })
        }),
        unavailableItemSources: Object.freeze({
            // Although the wreck visually contains this item, accounts cannot
            // take it. Keep every other small-net source available.
            'Small fishing net': Object.freeze({
                '6195-1': 'The wrecked-boat pickup cannot be taken.'
            })
        }),
        // Actual-progress gates for map sections whose access condition is
        // absent from the upstream section graph. The same annotation governs
        // travel, task sources, and player-picked starting requirements.
        sectionAccessRequirements: Object.freeze({
            // Heart of Darkness step 3 sends the player into the Tower of
            // Ascension. Completing its trials grants the disguise used to
            // enter the Twilight Temple in step 4.
            '6450-1': Object.freeze({
                requirements: Object.freeze([Object.freeze({ '~|The Heart of Darkness|~ 2': 'Quest' })]),
                reason: 'Requires reaching the Tower of Ascension during The Heart of Darkness'
            }),
            '6706-1': Object.freeze({
                requirements: Object.freeze([Object.freeze({ '~|The Heart of Darkness|~ 3': 'Quest' })]),
                reason: 'Requires the Twilight Emissary robes obtained during The Heart of Darkness'
            }),
            '6707-1': Object.freeze({
                requirements: Object.freeze([Object.freeze({ '~|The Heart of Darkness|~ 3': 'Quest' })]),
                reason: 'Requires the Twilight Emissary robes obtained during The Heart of Darkness'
            }),
            '6707-2': Object.freeze({
                requirements: Object.freeze([Object.freeze({ '~|The Heart of Darkness|~ 3': 'Quest' })]),
                reason: 'Requires the Twilight Emissary robes obtained during The Heart of Darkness'
            })
        }),
        travelConnections: Object.freeze([
            Object.freeze({
                id: 'achilka-rowboat',
                label: "Achilka's rowboat",
                eligibility: 'free-round-trip',
                endpoints: Object.freeze(['4912', '5424-3', '5426-1'])
            }),
            Object.freeze({
                id: 'nemus-quetzacalli-mountain-guide',
                label: 'Mountain Guide',
                eligibility: 'free-round-trip',
                endpoints: Object.freeze(['5427-1', '5938-1'])
            }),
            Object.freeze({
                id: 'veos-port-sarim-piscarilius',
                label: "Veos's ship",
                eligibility: 'free-round-trip',
                endpoints: Object.freeze(['7225-1', '12082-1'])
            }),
            Object.freeze({
                id: 'port-sarim-void-knights',
                label: "Squire's boat",
                eligibility: 'free-round-trip',
                endpoints: Object.freeze(['10537-1', '12082-1'])
            }),
            Object.freeze({
                id: 'port-sarim-entrana',
                label: 'Monks of Entrana boat',
                eligibility: 'free-round-trip',
                endpoints: Object.freeze(['11316-1', '12082-1'])
            })
        ]),
        encounterReadiness: Object.freeze({
            // Bosses receive the default combat-readiness controls from the
            // upstream boss registry. These entries cover other encounters
            // whose rewards require gear-dependent personal contribution.
            sources: Object.freeze({
                'Gemstone Crab': Object.freeze({
                    sourceTypes: Object.freeze(['monsters']),
                    kind: 'competitive-reward',
                    deferLabel: "I can't earn Gemstone Crab rewards with my current gear",
                    restoreLabel: 'I can earn Gemstone Crab rewards now',
                    waitingText: 'Its reward-dependent goals are hidden.'
                })
            })
        }),
        clues: Object.freeze({
            tiers: Object.freeze(['beginner', 'easy', 'medium', 'hard', 'elite', 'master']),
            // A reward shared between tiers belongs to the highest listed tier.
            // Master clues from lower-tier caskets remain player-registered,
            // one-off opportunities and never become map task sources.
            // Equippable casket rewards are ordinary BiS candidates as well as
            // possible collection-log rewards. The equipment scorer still shows
            // only strict improvements over gear the player has actually recorded.
            equipmentRewardsByTier: Object.freeze({
                beginner: Object.freeze([
                    'Monk\'s robe top (t)', 'Monk\'s robe (t)', 'Amulet of defence (t)', 'Black 2h sword', 'Black axe',
                    'Black battleaxe', 'Black chainbody', 'Black dagger', 'Black full helm', 'Black kiteshield',
                    'Black longsword', 'Black mace', 'Black med helm', 'Black pickaxe', 'Black platebody',
                    'Black plateskirt', 'Black platelegs', 'Black sq shield', 'Black scimitar', 'Black sword',
                    'Black warhammer', 'Shortbow', 'Longbow', 'Oak shortbow', 'Oak longbow',
                    'Iron pickaxe', 'Staff of air', 'Staff of water', 'Staff of earth', 'Staff of fire',
                    'Steel full helm', 'Steel platebody', 'Steel platelegs', 'Steel plateskirt', 'Steel longsword',
                    'Steel dagger', 'Steel axe', 'Steel battleaxe', 'Leather cowl', 'Leather body',
                    'Leather chaps', 'Leather vambraces', 'Hardleather body', 'Blue wizard hat', 'Blue wizard robe',
                    'Wizard hat', 'Black robe', 'Bronze arrow', 'Iron arrow'
                ]),
                easy: Object.freeze([
                    'Willow comp bow', 'Amulet of magic (t)', 'Team cape zero', 'Team cape i', 'Team cape x',
                    'Cape of skulls', 'Wooden shield (g)', 'Black full helm (t)', 'Black platebody (t)', 'Black platelegs (t)',
                    'Black plateskirt (t)', 'Black kiteshield (t)', 'Black full helm (g)', 'Black platebody (g)', 'Black platelegs (g)',
                    'Black plateskirt (g)', 'Black kiteshield (g)', 'Black shield (h1)', 'Black shield (h2)', 'Black shield (h3)',
                    'Black shield (h4)', 'Black shield (h5)', 'Black helm (h1)', 'Black helm (h2)', 'Black helm (h3)',
                    'Black helm (h4)', 'Black helm (h5)', 'Black platebody (h1)', 'Black platebody (h2)', 'Black platebody (h3)',
                    'Black platebody (h4)', 'Black platebody (h5)', 'Steel full helm (t)', 'Steel platebody (t)', 'Steel platelegs (t)',
                    'Steel plateskirt (t)', 'Steel kiteshield (t)', 'Steel full helm (g)', 'Steel platebody (g)', 'Steel platelegs (g)',
                    'Steel plateskirt (g)', 'Steel kiteshield (g)', 'Iron full helm (t)', 'Iron platebody (t)', 'Iron platelegs (t)',
                    'Iron plateskirt (t)', 'Iron kiteshield (t)', 'Iron full helm (g)', 'Iron platebody (g)', 'Iron platelegs (g)',
                    'Iron plateskirt (g)', 'Iron kiteshield (g)', 'Bronze full helm (t)', 'Bronze platebody (t)', 'Bronze platelegs (t)',
                    'Bronze plateskirt (t)', 'Bronze kiteshield (t)', 'Bronze full helm (g)', 'Bronze platebody (g)', 'Bronze platelegs (g)',
                    'Bronze plateskirt (g)', 'Bronze kiteshield (g)', 'Studded body (g)', 'Studded chaps (g)', 'Studded body (t)',
                    'Studded chaps (t)', 'Leather body (g)', 'Leather chaps (g)', 'Blue wizard hat (g)', 'Blue wizard robe (g)',
                    'Blue wizard hat (t)', 'Blue wizard robe (t)', 'Black wizard hat (g)', 'Black wizard robe (g)', 'Black wizard hat (t)',
                    'Black wizard robe (t)', 'Monk\'s robe top (g)', 'Monk\'s robe (g)', 'Saradomin robe top', 'Saradomin robe legs',
                    'Guthix robe top', 'Guthix robe legs', 'Zamorak robe top', 'Zamorak robe legs', 'Ancient robe top',
                    'Ancient robe legs', 'Armadyl robe top', 'Armadyl robe legs', 'Bandos robe top', 'Bandos robe legs',
                    'Black cane', 'Staff of bob the cat', 'Amulet of power (t)', 'Ham joint', 'Rain bow',
                    'Black full helm', 'Black platebody', 'Black platelegs', 'Black longsword', 'Black battleaxe',
                    'Black axe', 'Black dagger', 'Steel pickaxe', 'Black pickaxe', 'Coif',
                    'Studded body', 'Studded chaps', 'Willow shortbow', 'Willow longbow', 'Staff of air',
                    'Amulet of magic', 'Holy blessing', 'Unholy blessing', 'Peaceful blessing', 'War blessing',
                    'Honourable blessing', 'Ancient blessing', 'Large spade'
                ]),
                medium: Object.freeze([
                    'Yew comp bow', 'Strength amulet (t)', 'Ranger boots', 'Wizard boots', 'Holy sandals',
                    'Spiked manacles', 'Climbing boots (g)', 'Adamant full helm (t)', 'Adamant platebody (t)', 'Adamant platelegs (t)',
                    'Adamant plateskirt (t)', 'Adamant kiteshield (t)', 'Adamant full helm (g)', 'Adamant platebody (g)', 'Adamant platelegs (g)',
                    'Adamant plateskirt (g)', 'Adamant kiteshield (g)', 'Adamant shield (h1)', 'Adamant shield (h2)', 'Adamant shield (h3)',
                    'Adamant shield (h4)', 'Adamant shield (h5)', 'Adamant helm (h1)', 'Adamant helm (h2)', 'Adamant helm (h3)',
                    'Adamant helm (h4)', 'Adamant helm (h5)', 'Adamant platebody (h1)', 'Adamant platebody (h2)', 'Adamant platebody (h3)',
                    'Adamant platebody (h4)', 'Adamant platebody (h5)', 'Mithril full helm (g)', 'Mithril platebody (g)', 'Mithril platelegs (g)',
                    'Mithril plateskirt (g)', 'Mithril kiteshield (g)', 'Mithril full helm (t)', 'Mithril platebody (t)', 'Mithril platelegs (t)',
                    'Mithril plateskirt (t)', 'Mithril kiteshield (t)', 'Green d\'hide body (g)', 'Green d\'hide body (t)', 'Green d\'hide chaps (g)',
                    'Green d\'hide chaps (t)', 'Saradomin mitre', 'Saradomin cloak', 'Guthix mitre', 'Guthix cloak',
                    'Zamorak mitre', 'Zamorak cloak', 'Ancient mitre', 'Ancient cloak', 'Ancient stole',
                    'Ancient crozier', 'Armadyl mitre', 'Armadyl cloak', 'Armadyl stole', 'Armadyl crozier',
                    'Bandos mitre', 'Bandos cloak', 'Bandos stole', 'Bandos crozier', 'Crier bell',
                    'Adamant cane', 'Arceuus banner', 'Piscarilius banner', 'Hosidius banner', 'Shayzien banner',
                    'Lovakengj banner', 'Cabbage round shield', 'Adamant full helm', 'Adamant platebody', 'Adamant platelegs',
                    'Adamant longsword', 'Adamant dagger', 'Adamant battleaxe', 'Adamant axe', 'Adamant pickaxe',
                    'Green d\'hide body', 'Green d\'hide chaps', 'Yew shortbow', 'Yew longbow', 'Fire battlestaff',
                    'Amulet of power', 'Holy blessing', 'Unholy blessing', 'Peaceful blessing', 'War blessing',
                    'Honourable blessing', 'Ancient blessing', 'Clueless scroll'
                ]),
                hard: Object.freeze([
                    'Magic comp bow', 'Robin hood hat', 'Enchanted hat', 'Enchanted top', 'Enchanted robe',
                    'Rune full helm (t)', 'Rune platebody (t)', 'Rune platelegs (t)', 'Rune plateskirt (t)', 'Rune kiteshield (t)',
                    'Rune full helm (g)', 'Rune platebody (g)', 'Rune platelegs (g)', 'Rune plateskirt (g)', 'Rune kiteshield (g)',
                    'Rune shield (h1)', 'Rune shield (h2)', 'Rune shield (h3)', 'Rune shield (h4)', 'Rune shield (h5)',
                    'Rune helm (h1)', 'Rune helm (h2)', 'Rune helm (h3)', 'Rune helm (h4)', 'Rune helm (h5)',
                    'Rune platebody (h1)', 'Rune platebody (h2)', 'Rune platebody (h3)', 'Rune platebody (h4)', 'Rune platebody (h5)',
                    'Zamorak full helm', 'Zamorak platebody', 'Zamorak platelegs', 'Zamorak plateskirt', 'Zamorak kiteshield',
                    'Guthix full helm', 'Guthix platebody', 'Guthix platelegs', 'Guthix plateskirt', 'Guthix kiteshield',
                    'Saradomin full helm', 'Saradomin platebody', 'Saradomin platelegs', 'Saradomin plateskirt', 'Saradomin kiteshield',
                    'Ancient full helm', 'Ancient platebody', 'Ancient platelegs', 'Ancient plateskirt', 'Ancient kiteshield',
                    'Armadyl full helm', 'Armadyl platebody', 'Armadyl platelegs', 'Armadyl plateskirt', 'Armadyl kiteshield',
                    'Bandos full helm', 'Bandos platebody', 'Bandos platelegs', 'Bandos plateskirt', 'Bandos kiteshield',
                    'Red d\'hide body (g)', 'Red d\'hide body (t)', 'Red d\'hide chaps (g)', 'Red d\'hide chaps (t)', 'Blue d\'hide body (g)',
                    'Blue d\'hide body (t)', 'Blue d\'hide chaps (g)', 'Blue d\'hide chaps (t)', 'Saradomin coif', 'Saradomin d\'hide body',
                    'Saradomin chaps', 'Saradomin bracers', 'Saradomin d\'hide boots', 'Saradomin d\'hide shield', 'Guthix coif',
                    'Guthix d\'hide body', 'Guthix chaps', 'Guthix bracers', 'Guthix d\'hide boots', 'Guthix d\'hide shield',
                    'Zamorak coif', 'Zamorak d\'hide body', 'Zamorak chaps', 'Zamorak bracers', 'Zamorak d\'hide boots',
                    'Zamorak d\'hide shield', 'Bandos coif', 'Bandos d\'hide body', 'Bandos chaps', 'Bandos bracers',
                    'Bandos d\'hide boots', 'Bandos d\'hide shield', 'Armadyl coif', 'Armadyl d\'hide body', 'Armadyl chaps',
                    'Armadyl bracers', 'Armadyl d\'hide boots', 'Armadyl d\'hide shield', 'Ancient coif', 'Ancient d\'hide body',
                    'Ancient chaps', 'Ancient bracers', 'Ancient d\'hide boots', 'Ancient d\'hide shield', 'Saradomin stole',
                    'Saradomin crozier', 'Guthix stole', 'Guthix crozier', 'Zamorak stole', 'Zamorak crozier',
                    'Zombie head (Treasure Trails)', 'Nunchaku', 'Rune cane', 'Dual sai', 'Gilded full helm',
                    'Gilded platebody', 'Gilded platelegs', 'Gilded plateskirt', 'Gilded kiteshield', 'Gilded med helm',
                    'Gilded chainbody', 'Gilded sq shield', 'Gilded 2h sword', 'Gilded spear', 'Gilded hasta',
                    '3rd age full helmet', '3rd age platebody', '3rd age platelegs', '3rd age plateskirt', '3rd age kiteshield',
                    '3rd age range coif', '3rd age range top', '3rd age range legs', '3rd age vambraces', '3rd age mage hat',
                    '3rd age robe top', '3rd age robe', '3rd age amulet', 'Rune full helm', 'Rune platebody',
                    'Rune platelegs', 'Rune plateskirt', 'Rune kiteshield', 'Rune longsword', 'Rune dagger',
                    'Rune battleaxe', 'Rune axe', 'Rune pickaxe', 'Black d\'hide body', 'Black d\'hide chaps',
                    'Magic shortbow', 'Magic longbow', 'Holy blessing', 'Unholy blessing', 'Peaceful blessing',
                    'War blessing', 'Honourable blessing', 'Ancient blessing'
                ]),
                elite: Object.freeze([
                    'Royal sceptre', 'Black d\'hide body (g)', 'Black d\'hide body (t)', 'Black d\'hide chaps (g)', 'Black d\'hide chaps (t)',
                    'Rangers\' tunic', 'Ranger gloves', 'Holy wraps', 'Katana', 'Dragon cane',
                    'Blacksmith\'s helm', 'Rangers\' tights', 'Fremennik kilt', 'Battlestaff', 'Gilded full helm',
                    'Gilded platebody', 'Gilded platelegs', 'Gilded plateskirt', 'Gilded kiteshield', 'Gilded med helm',
                    'Gilded chainbody', 'Gilded sq shield', 'Gilded 2h sword', 'Gilded spear', 'Gilded hasta',
                    'Gilded scimitar', 'Gilded boots', 'Gilded coif', 'Gilded d\'hide vambraces', 'Gilded d\'hide body',
                    'Gilded d\'hide chaps', 'Gilded pickaxe', 'Gilded axe', 'Gilded spade', '3rd age full helmet',
                    '3rd age platebody', '3rd age platelegs', '3rd age plateskirt', '3rd age kiteshield', '3rd age range coif',
                    '3rd age range top', '3rd age range legs', '3rd age vambraces', '3rd age mage hat', '3rd age robe top',
                    '3rd age robe', '3rd age amulet', '3rd age longsword', '3rd age wand', '3rd age cloak',
                    '3rd age bow', 'Rune platebody', 'Rune platelegs', 'Rune plateskirt', 'Rune kiteshield',
                    'Rune crossbow', 'Dragon dagger', 'Dragon mace', 'Dragon longsword', 'Holy blessing',
                    'Unholy blessing', 'Peaceful blessing', 'War blessing', 'Honourable blessing', 'Ancient blessing',
                    'Heavy casket'
                ]),
                master: Object.freeze([
                    'Hood of darkness', 'Robe top of darkness', 'Gloves of darkness', 'Robe bottom of darkness', 'Boots of darkness',
                    'Samurai kasa', 'Samurai shirt', 'Samurai gloves', 'Samurai greaves', 'Samurai boots',
                    'Ale of the gods', 'Obsidian cape (r)', 'Gilded full helm', 'Gilded platebody', 'Gilded platelegs',
                    'Gilded plateskirt', 'Gilded kiteshield', 'Gilded med helm', 'Gilded chainbody', 'Gilded sq shield',
                    'Gilded 2h sword', 'Gilded spear', 'Gilded hasta', 'Gilded scimitar', 'Gilded boots',
                    'Gilded coif', 'Gilded d\'hide vambraces', 'Gilded d\'hide body', 'Gilded d\'hide chaps', 'Gilded pickaxe',
                    'Gilded axe', 'Gilded spade', '3rd age full helmet', '3rd age platebody', '3rd age platelegs',
                    '3rd age plateskirt', '3rd age kiteshield', '3rd age range coif', '3rd age range top', '3rd age range legs',
                    '3rd age vambraces', '3rd age mage hat', '3rd age robe top', '3rd age robe', '3rd age amulet',
                    '3rd age druidic robe top', '3rd age druidic robe bottoms', '3rd age druidic cloak', '3rd age longsword', '3rd age bow',
                    '3rd age wand', '3rd age druidic staff', '3rd age cloak', '3rd age pickaxe', '3rd age axe',
                    'Dragon dagger', 'Dragon mace', 'Dragon longsword', 'Dragon scimitar', 'Dragon battleaxe',
                    'Dragon halberd', 'Onyx bolts (e)', 'Holy blessing', 'Unholy blessing', 'Peaceful blessing',
                    'War blessing', 'Honourable blessing', 'Ancient blessing'
                ])
            }),
            overlapOwner: 'highest-tier',
            masterPersistentSource: 'Watson',
            masterInputs: Object.freeze(['easy', 'medium', 'hard', 'elite']),
            cooldownAfterReward: 1
        }),
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
