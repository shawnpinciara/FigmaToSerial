# FigProxyWEB example: two buttons + one NeoPixel

Drives the on-board NeoPixel of a Waveshare RP2040 Zero from Figma:
`a` → green, `b` → red. Sketch: [`figproxyweb-basic/figproxyweb-basic.ino`](figproxyweb-basic/figproxyweb-basic.ino).

## Figma → Arduino (buttons)

1. Draw two buttons, e.g. **ON** and **OFF**.
2. Select **ON** → *Prototype* panel → **+** → trigger **On click** → action **Open link** → `http://a`.
3. Select **OFF** → same, but **Open link** → `http://b`.
4. Present the prototype, connect the extension to the board (see main README), press the buttons.

The extension intercepts the `figma.com/exit?url=…` navigation, blocks it and sends the **last segment of the link** (`a` / `b`) over serial, newline-terminated.

## Arduino → Figma (keystroke)

The reverse direction works through keystrokes: anything the board prints on serial is re-dispatched into the Figma page as a keypress.

1. In the sketch, send a character, e.g. `Serial.println('c');` on some input (button, sensor threshold…).
2. In Figma, select the frame that should react → *Prototype* panel → **+** → trigger: the **keyboard key** `c` → action: e.g. *Navigate to* another frame (or *Change to* a variant).
3. Present, connect, trigger the input on the board: Figma follows the interaction.

> The Figma canvas must have focus for the keypress to land, and page-injected keypresses are synthetic ("untrusted") by browser design — they drive Figma key triggers fine, but can't do OS-level shortcuts.

## Upload checklist

- Board: Waveshare RP2040 Zero (arduino-pico core) + Adafruit NeoPixel library.
- Baud 9600 everywhere (sketch `Serial.begin(9600)` = popup baud).
- Close the Figma tab (or disconnect) before uploading — the port is exclusive.
