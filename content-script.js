console.log("Content script running");
if ("serial" in navigator) {
    // The Web Serial API is supported.
    console.log("Serial is supported on this website");
    
  } else {
    console.log("Serial is NOT supported on this website!!!");
}

window.addEventListener("DOMContentLoaded", (event) => {
    console.log("page fully loaded");
    const button = document.querySelector('.button-reset-module--buttonReset--Njg3k');
    document.body.addEventListener('click', async function() {
        connectSerial();
    });
});
canSerialConnect = true;
serialIsConnected = false;
currentTabId = 0;

chrome.extension.onMessage.addListener(handleMessage);
//receive message from the background.js
async function handleMessage(request) {
    console.log(request.data);

    let requestData =  request.data.split(",")[0];
    currentTabId = request.data.split(",")[1];
    if (serialIsConnected) {
        console.log("Trying to write to serial port");
        //e = e || window.event;
        //var target = e.target || e.srcElement,
        //text = target.textContent || target.innerText;  
        //console.log(e.target);
        encoder = new TextEncoder();
        uint8Array = encoder.encode(requestData);
        try {
            await writer.write(uint8Array);
            console.log("Writed to the serial port: ");
            console.log(uint8Array);
        } catch (error) {
            console.log(error);
        }
        
    }
    
}


document.body.addEventListener('click', async function(e) {
    if (canSerialConnect==true) {
        canSerialConnect = false;
        console.log("CanSerialCOnnect is");
        console.log(canSerialConnect);
        connectSerial();
    }
});

async function connectSerial() { //SOURCE: https://whatwebcando.today/serial.html  
    try {
        //SOURCE: https://developer.chrome.com/docs/capabilities/serial?hl=it
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      serialIsConnected = true;
      writer = port.writable.getWriter();
      alert("Connected to serial port!");
      
      serialReadLoop();
    } catch (error) {
        console.log(error);
        serialIsConnected = false;
        alert(error);
    }
}

async function serialReadLoop() {
    const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const inputStream = decoder.readable;
      const reader = inputStream.getReader();
      console.log("Reading from serial port: ");
      while (true) {
        //const { value, done } = await reader.read();
        value = await reader.read();
        if (value) {
          //log.textContent += value + '\n';
            console.log(value);

            try {
                simulateTrustedClickOnPosition(value.value);
            } catch (error) {
                console.log(error);
            }
            
        }
        // if (done) {
        //   console.log('[readLoop] DONE', done);
        //   reader.releaseLock();
        //   break;
        // }

      }
}
function simulateKey (keyCode, type, modifiers) {
	var evtName = (typeof(type) === "string") ? "key" + type : "keydown";	
	var modifier = (typeof(modifiers) === "object") ? modifier : {};

	var event = document.createEvent("HTMLEvents");
	event.initEvent(evtName, true, false);
	event.keyCode = keyCode;
	
	for (var i in modifiers) {
		event[i] = modifiers[i];
	}

	document.dispatchEvent(event);
}

function sendKeyPress(keyToPress) {
    //SOURCE: https://www.basedash.com/blog/how-to-simulate-a-keypress-in-javascript
    let event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: false,
        charCode: keyToPress.toString().charCodeAt(0),
        keyCode: keyToPress.toString().charCodeAt(0),
        key: keyToPress.toString(),
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        repeat: false,
        location: KeyboardEvent.DOM_KEY_LOCATION_STANDARD,
        isTrusted: true
      });
      console.log(event)
      //let bodyElement = document.getElementsByTagName('body')[0];
      document.body.dispatchEvent(event);

}

function sendTrustedKeyPress(keyToPress) {
    chrome.debugger.sendCommand(document.body, "Input.dispatchKeyEvent", {type: "keyDown", charCode: keyToPress.toString().charCodeAt(0),
        keyCode: keyToPress.toString().charCodeAt(0), key: keyToPress.toString(), text: keyToPress.toString()});

}

async function simulateTrustedClickOnPosition(keyToPress) {
    target = { tabId: currentTabId };
    chrome.debugger.attach(target, "1.2", function () {
        chrome.debugger.sendCommand(document.body, "Input.dispatchKeyEvent", {type: "keyDown", charCode: keyToPress.toString().charCodeAt(0),
            keyCode: keyToPress.toString().charCodeAt(0), key: keyToPress.toString(), text: keyToPress.toString()});
    
    });
}


