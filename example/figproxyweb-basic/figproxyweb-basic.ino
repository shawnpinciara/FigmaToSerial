// FigProxyWEB basic example — Waveshare RP2040 Zero on-board NeoPixel.
//
// Figma side (see ../README.md for details):
//   Button "ON"  -> On click -> Open link http://a   (NeoPixel green)
//   Button "OFF" -> On click -> Open link http://b   (NeoPixel red)
//
// Board setup (Arduino IDE):
//   - Install the "Adafruit NeoPixel" library (Library Manager).
//   - Use the Earle Philhower arduino-pico core, board "Waveshare RP2040 Zero".
//   - Baud in the extension popup must match Serial.begin() below.
//   - Close the Serial Monitor / Figma page before uploading
//     (the serial port is exclusive).

#include <Adafruit_NeoPixel.h>

#define NEOPIXEL_PIN 16 // on-board WS2812 on the Waveshare RP2040 Zero
#define NUMPIXELS 1

Adafruit_NeoPixel pixel(NUMPIXELS, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  Serial.begin(9600);
  pixel.begin();
  pixel.setBrightness(80);
  pixel.clear();
  pixel.show(); // start off
}

void loop() {
  if (Serial.available() > 0) {
    // get incoming byte:
    char incomingByte = Serial.read();
    // in Figma the "ON" button sends "a", the "OFF" button sends "b"
    if (incomingByte == 'a') {
      // ON button pressed -> green
      pixel.setPixelColor(0, pixel.Color(0, 150, 0));
      pixel.show();
    } else if (incomingByte == 'b') {
      // OFF button pressed -> red
      pixel.setPixelColor(0, pixel.Color(150, 0, 0));
      pixel.show();
    }
  }
}
