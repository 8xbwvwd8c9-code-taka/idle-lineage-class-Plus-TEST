# Castle Buildings System --- Design v2.0

> Version: 2.0 Status: Ready for Implementation Working Directory:
> `C:\idle-lineage-class-Plus-TEST`

------------------------------------------------------------------------

# AI Implementation Rules

Before implementing **ANY** code:

1.  Read `CLAUDE.md` completely.
2.  Follow every instruction in `CLAUDE.md`.
3.  Inspect the existing implementation before making changes.
4.  Reuse existing systems whenever possible.
5.  Do **NOT** duplicate logic that already exists.
6.  Make the **smallest possible changes** required.
7.  Preserve the current coding style and architecture.
8.  Do **NOT** rename existing APIs unless absolutely required.
9.  Do **NOT** perform unrelated refactoring.
10. If an existing helper/function already solves the problem, reuse it.
11. Keep backward compatibility with existing save files.
12. After implementation, provide:

-   Modified files
-   Summary of changes
-   Reason for each modification

------------------------------------------------------------------------

# Non Goals

The following are **OUT OF SCOPE**:

-   Rewriting the clan system
-   Rewriting the NPC framework
-   Rewriting the save system
-   UI redesign
-   Performance optimization
-   Large-scale refactoring
-   Renaming unrelated variables or APIs
-   Formatting-only commits

------------------------------------------------------------------------

# Allowed Files

Primary implementation:

-   js/32-castle-buildings.js (NEW)
-   js/25-clan-system.js
-   js/11-world-map.js
-   js/18-misc-book.js
-   js/05-kill-progression.js
-   index.html

Do **NOT** modify any other file unless absolutely necessary.

------------------------------------------------------------------------

# Existing Design

Use the original specification provided by the project owner as the
functional requirements.

Do **NOT** change gameplay values unless explicitly requested.

This includes:

-   Five buildings
-   Costs
-   Upgrade times
-   Effects
-   Treasure production
-   Butler NPC
-   Collection Album
-   Permission rules
-   Offline production
-   Diamond acceleration
-   Data persistence

Implement exactly according to the original design document.

------------------------------------------------------------------------

# Additional Technical Requirements

## Construction Queue

-   Only one building may be under construction at a time.
-   Starting another construction while one is active must fail
    gracefully.

## Save Rules

Call `saveGame()` after:

-   Build started
-   Acceleration
-   Construction completed
-   Treasure harvested

## Timer Rules

Construction: - Update every second.

Treasure: - Produce every 60 minutes. - Offline production uses
timestamps. - Maximum storage = 24 hours.

## Error Messages

Handle:

-   Not clan leader
-   Not Royal class
-   Castle not owned
-   Already constructing
-   Already max level
-   Insufficient materials
-   Insufficient Dragon Diamonds
-   Treasure storage full
-   Nothing to harvest

## Data Structure

``` ts
castleBuildings = {

    weaponShop:{
        level:0,
        constructionEnd:0
    },

    armorShop:{
        level:0,
        constructionEnd:0
    },

    prison:{
        level:0,
        constructionEnd:0
    },

    goldVault:{
        level:0,
        constructionEnd:0
    },

    treasure:{
        level:0,
        constructionEnd:0,
        accumulated:0,
        lastTick:0,
        lastHarvest:0
    }

}
```

Reuse the existing clan save architecture.

------------------------------------------------------------------------

# Acceptance Criteria

Implementation is complete only if all are true:

-   Buildings persist after changing castles
-   Losing castle disables all bonuses
-   Reclaiming a castle restores bonuses
-   Treasure production continues offline
-   Treasure storage caps at 24 hours
-   Collection auto-registers
-   Royal leader only can upgrade
-   Members are view-only
-   Butler only appears while owning a castle
-   Old saves remain compatible
-   No console errors

------------------------------------------------------------------------

# Testing Checklist

-   Create clan
-   Capture castle
-   Butler appears
-   Open building panel
-   Upgrade Weapon Shop
-   Upgrade Armor Shop
-   Upgrade Prison
-   Upgrade Gold Vault
-   Upgrade Treasure Vault
-   Accelerate construction
-   Harvest treasure
-   Reload save
-   Verify persistence
-   Lose castle
-   Verify bonuses disabled
-   Capture another castle
-   Verify buildings remain
-   Load an old save
-   Verify migration works

------------------------------------------------------------------------

# Final Notes

-   Follow CLAUDE.md before any implementation.
-   Reuse existing project systems.
-   Keep modifications minimal.
-   Avoid unnecessary abstractions.
-   Preserve project coding conventions.
