chrome.webRequest.onBeforeRequest.addListener(function(details) {
    var scheme = /^https/.test(details.url) ? 'https' : 'http';
	console.log("Blocked request");
	console.log(details);
	console.log(details.url);
	run(details.url);
    return { redirectUrl: scheme + '://robwu.nl/204' };
}, {
    urls: ['*://www.figma.com/exit?url=http%3A%2F%2F*'] // Example: Block all requests from figma
}, ['blocking']);


function run(param) {

    // Creating Our XMLHttpRequest object 
    let xhr = new XMLHttpRequest();

    // Making our connection  
    let url = 'http://localhost:8080/'+param;
    xhr.open("GET", url, true);

    // function execute after request is successful 
    // xhr.onreadystatechange = function () {
        // if (this.readyState == 4 && this.status == 200) {
            // console.log(this.responseText);
        // }
    // }
    // Sending our request 
    xhr.send();

    //send message to the content-script.js
    msg = param.split("%2F").pop();
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        msg = msg+","+tabs[0].id;
        chrome.tabs.sendMessage(tabs[0].id, {data: msg});
    });


}

// document.addEventListener("DOMContentLoaded", function(){
// 	console.log("loaded Page");
//     // Prompt user to select any serial port.
// 	const port = await navigator.serial.requestPort();

// 	// Wait for the serial port to open.
// 	await port.open({ baudRate: 9600 });
// });
