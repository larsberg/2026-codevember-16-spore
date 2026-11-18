# 16 / Spore

Press any of the three puffballs to dent its rind and expel a cloud along its own nozzle. Hold several with separate fingers to play their notes together. A deeper press releases more dust. The rind rebounds on release and the expelled cloud continues drifting. Drag the background to orbit, right-drag to pan, or scroll to zoom.

## Run

Install with `pnpm install --frozen-lockfile`, then run `npm run dev` in the VS Code terminal. Open `http://127.0.0.1:1234/`. The sketch starts with just the canvas. Add `?ui=1` to open the drawer on a touch screen. Press **H** for the studio drawer, **P** to pause, **M** for sound, or **F** to preview the selected chord. The Audio tab selects the shared instrument and left-to-right note combination. Breathing Kazoo starts on D3, F3 and A3. Rubber Bassoon, Blown Bottle and Moth Harmonium use the same layer and effects controls. Adjust the breath, buzz, mouth opening, flutter, breathing rate and pitch bend while holding a note. Drag downward or press harder with a pen to lean into it. Each finger gates its own note. The starter setup arms sound for the first gesture.

**Save** writes the studio setup and camera to `public/settings.json` through this sketch’s development API. **Reload** restores that file and clears the simulation. **Reset** restores the built-in defaults. A static production build starts from the bundled settings and supports device-local saves.

## Rendering

- Box3D simulates an independent 14-by-14 cage for each puffball. Hoop, diagonal and longitudinal springs transfer pressure across the rind. Springs to a fixed interior and a rooted base return the puffball to shape. Emission follows measured inward travel of the patch under the pointer.
- The GPU evaluates a periodic bicubic B-spline over the cage, including both surface tangents. The beauty, shadow and occlusion passes use the same deformation. Procedural wart relief, ring scars and pigmentation stay attached to the surface.
- Each nozzle has a 12,544-slot GPU particle pool that stores position, velocity and age in floating-point ping-pong textures. An emerging jet entrains surrounding air, rolls outward and breaks up in a time-varying curl field. Fine grains and larger translucent billows share the simulation. A separate GPU draw carries 1,850 backlit dust motes across the clearing even between presses.
- A backlight grazes the rind and scatters through the spores. The particles accumulate optical depth in four layers along the light direction, allowing a dense puff to shade itself. A depth-of-field pass keeps the rind in focus against the canopy and forest floor. The floor uses a generated woodland texture with modeled moss stalks and fallen twigs.

## Studio inheritance

The shell, camera, Box3D world, Strudel transport, palette workshop and Save/Reload API come from **14-tension**. Its materials, lighting, shadows, environment reflections and occlusion controls carry over the **02-shatter-drafting** studio. Bloom, tilt blur, PNG export and keyboard controls follow the shared **04-tangle-drafting** conventions. The existing material editor controls the puffball rind. The optional FPS meter stays in the drawer workflow.

Run `npm run check` for the Box3D press/rebound tests, settings round-trip tests and production build.

## Deployment

The public sketch runs at [Spore on GitHub Pages](https://larsberg.github.io/2026-codevember-16-spore/). Pushes to `main` run the tests, build the saved setup, check the static assets and publish `dist/` through GitHub Actions. Run `npm run check && npm run check:release` to verify the same release locally.
