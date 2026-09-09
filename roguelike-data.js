/* Small local annotations for rules the upstream task metadata cannot express. */
(function (root, factory) {
    const data = factory();
    if (typeof module === 'object' && module.exports) module.exports = data;
    else root.RoguelikeData = data;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';
    return Object.freeze({
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
