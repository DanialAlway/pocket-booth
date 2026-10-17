# 📸 Pocket Booth

A photobooth on your phone. Pick a frame, prop up your phone and pose through the countdown. You get a finished photobooth strip without going to a booth.

**Open on your iPhone:** https://danialalway.github.io/pocket-booth/
In Safari, tap **Share → Add to Home Screen** to install it like an app.

## Features

- **13 frames:** Film Strip, Double Film, Four Cuts (Korean style), Classic Strip, Twin Strips, Eight Frames, Velvet Booth, Polaroid, Polaroid Stack, Love Notes, Trio Strip, Film Roll and Contact Sheet.
- **Real booth flow:** front camera, 3/5/10 s countdown, flash and shutter sound, with **pose ideas** for couples between shots.
- **7 filters:** Vintage (sepia), B&W, Noir, Film, Seoul, Rosé and Color, plus film grain, dust scratches and vignette.
- **Customize:** frame colour, caption, and a date stamp (including the orange date stamp of an old point-and-shoot).
- **Retake any single shot,** or switch frames without reshooting.
- **Save or share:** opens the iOS share sheet, where you can tap Save Image to put it in Photos.
- **Upload from the gallery** as an alternative to the camera.
- **Private:** everything runs on the phone and photos are never uploaded. Works offline after the first visit.

## Run locally

The camera needs `https` or `localhost`:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

- `index.html`: the three screens (frames, booth, result)
- `style.css`: UI styling
- `app.js`: camera, countdown sequence, editing and saving
- `templates.js`: filters and all frame templates, drawn on canvas
- `sw.js`, `manifest.webmanifest`, `icons/`: home-screen install and offline support
