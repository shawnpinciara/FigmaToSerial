# FigmaToSerial
Let Figma send impulses to the rest of the world and build tangible user experiences!

## What is it?

A _Google Chrome extension_ that allows _Figma_ to talk to the rest of the world (like _Arduino_) by using the _serial protocol_

It runs on *any device that supports Google Chrome* (PCs, Phones, tablets...) and it is kinda bidirectional (you should emulake keyboard strokes to send impulses to Figma)

## Why?

I had to come up with a solution to control some external ligths using Figma at my job!
I was inspired by [Figproxy](https://edges.ideo.com/posts/figproxy) by [Dave Vondle](https://edges.ideo.com/author/dave-vondle) but his version _works only on Mac_.... and i'm poor and don't have one, what a bummer!

## Technically:
Only inpulses can be sent == a button press.
I think no continous control can be sent as of now == no sliders?
But you can still make a lot!

### Figma -> rest of the world:
You can make a button open a link on Figma.

That link won't open any page but let the plugin receive the content of that link and send it on the serial bus.

//TODO: add example gif

From there, you can read programmatically the serial bus and use the text however you want like:
- Read it from an Arduino and turn on lights, motors, stuff
- Read it from a script and do other stuff, you programmer!

//TODO: add arduino example gif


### Rest of the world -> Figma:
Figma can receive a keyboard press to toggle buttons or perform actions,

so you can _simulate_ a keystroke from the Arduino and send impulses to Figma.

I actually want to do this from serial as well, because not all microcontrollers can emulate a keystroke... but there are some problems as f now [The javascript Keyboard Event should be _trusted_ to be able to be sent but i can't make it happen](https://stackoverflow.com/questions/49518959/javascript-trigger-an-inputevent-istrusted-true) let me know if you can solve that!


## Setup:
1. Install the Chrome's extension on your browser
2. Open a _prototype_ page on Figma
3. Click anywhere to choose the Serial port and you are ready to go

Remember that:
- Buttons on Figma should open a link, and put the text you want instead of that link
    - Handle the text accordingly reading from the Serial bus
- Buttons on Figma can be clicked by external input if you set up them on a _keyboard stroke_ and emulate the keyboard stroke with some script or a microcontroller

## Try it out:
Some Figma examples:

(Figma->Arduino)[]