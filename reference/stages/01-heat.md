# Stage 1 reference — wood / furnace

Primary references:
- CreativeScope WS-S04
- CreativeScope WS-S05
- https://www.youtube.com/watch?v=6kFBZaUBrBA
- https://www.youtube.com/watch?v=MQ5lG34FQWo

## Target interaction

1. Player runs directly to a tree/log pile.
2. Auto-chop begins inside a short radius.
3. Every hit visibly removes/chips the object.
4. Each harvested log becomes a visible carried object.
5. Logs stack vertically/diagonally behind the player.
6. Player runs back to the furnace.
7. Logs fly rapidly from the stack into the furnace one at a time.
8. Flame becomes larger/brighter while surrounding survivors visibly warm up.
9. New build/expansion pads become available immediately.

## Visual target

- Portrait 9:16.
- Character must be readable at phone size; do not make the player a tiny icon.
- Tree height roughly 1.6–2.1× player height.
- Furnace should occupy a strong central position and be at least comparable to 1.5× player footprint.
- Keep active trees/resources inside one short run from the furnace.
- Do not leave large empty snow fields.
- Carried logs must dominate the player's silhouette when capacity is near full.
- Joystick should be large, low on screen and usable without precise thumb placement.

## Current implementation gap

The original prototype used a 960×540 horizontal simulation scaled into portrait, resulting in huge dead space, tiny objects and poor touch control. Do not reuse that camera/layout.
