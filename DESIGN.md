# Design

<!-- impeccable:design-schema 1 -->

## Scope

This system governs the Squeek Runner in-game world. The Squeekchain HUD, overlays, terminology, and data-source treatment remain the incumbent information layer.

## Visual world

Squeek Runner is a night-city arcade crossing. The player is a hamster seen from behind, moving through five illuminated lanes toward a goal backed by a skyline, elevated train, and encouraging billboards. The scene is polished and playful, not photorealistic.

## Palette and material

- Deep night blue owns the sky, city, and score pill.
- Saturated amber owns lane boundaries, goal light, street lamps, and coins.
- Bright grass green owns safe zones.
- Vehicles are red, yellow, blue, gray, and green with dark glass, visible wheels, headlights, and taillights.
- The hamster is orange and cream with a dark cartoon outline.
- Materials are glossy toy-like plastic, lit asphalt, and additive light. No wind-tunnel diorama or industrial teal haze.

## Camera and composition

A fixed low chase camera keeps the hamster in the lower safe zone, the hazard lanes in the middle, and the skyline, train, and billboards in the upper third. The full crossing remains readable at every supported viewport.

## Arcade information layer

- Lives sit at the upper left.
- Score and raw score sit in a centered pill.
- Pause sits at the upper right.
- A compact Squeekchain status line sits below the score: Pace, Charges, and verification state.
- Desktop adds a side panel with full Pace, Charges, Settled, Lag, source, and warnings.
- Phone and tablet portrait keep the full data panel available through the info dialog so the arena remains dominant.

## Motion grammar

- The hamster hops with squash and stretch and idles with a pace-driven pulse.
- Vehicles roll continuously with wheel rotation and a slight suspension bounce.
- Coins bob and catch the light; they are decorative rhythm, not collectible logic.
- Dash produces an amber aura and ring.
- Settlement Surge raises goal light and headlight emission; it never changes lane physics.
- A hit shakes the camera and produces a warm particle burst.

## State language

- Safe zones: bright grass, fences, flowers, and arrow sign.
- Hazard lanes: illuminated boundaries, white dashes, and moving vehicles.
- Water hazard: recessed cyan canal with floating pads.
- Goal: horizontal amber band backed by the city and train.
- Dash: warm ring and aura.
- Surge: environmental lighting response, never a gameplay-speed cue.

## Responsive behavior

- Desktop landscape: arena on the left, full Squeekchain panel on the right.
- Tablet portrait: full-height arena, arcade overlay, controls below.
- Phone portrait: full-height arena, arcade overlay, large D-pad and Dash below.
- Phone landscape: centered 3:4 arena, D-pad in the left gutter, Dash in the right gutter.
- The renderer uses no shadow maps, pooled car groups, instanced static scenery, and a capped device-pixel ratio.

## Accessibility

Lane, hazard, player, and goal are differentiated by shape, elevation, and luminance as well as color. The HUD continues to name every data state in text; no information is carried only by 3D lighting or motion.
