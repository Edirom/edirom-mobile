const serverConnectionStatusP = document.querySelector("#server-connection-status");
const sessionConnectionStatusP = document.querySelector("#session-connection-status");
const alertsContainer = document.querySelector("#alerts-container");
const alertP = document.querySelector("#alert");
const startSessionScanBtn = document.querySelector("#start-session-scan-btn");
const startPageScanBtn = document.querySelector("#start-page-scan-btn");
const readerContainer = document.querySelector("#reader-container");
const scanTargetInfoP = document.querySelector("#scan-target-info");



const webSocket = new WebSocket("http://localhost:3000");
let sessionId = null;
const html5QrCode = new Html5Qrcode(/* element id */ "reader");
let cameraId = null;


webSocket.onopen = (event) => {
    console.log("Server connection opened!");
    serverConnectionStatusP.textContent = "SERVER: Connected";
    serverConnectionStatusP.classList.remove("disconnected");
    serverConnectionStatusP.classList.add("connected");
};

webSocket.onclose = (event) => {
    console.log("Server connection closed!");
    serverConnectionStatusP.textContent = "SERVER: Not Connected";
    serverConnectionStatusP.classList.remove("connected");
    serverConnectionStatusP.classList.add("disconnected");
};

webSocket.onmessage = (event) => {
    console.log("Received data!");
    console.log(event.data);
    const data = JSON.parse(event.data);
    if (data.response === "sessionConnected") {
        handleSessionConnected();
    }
};

startSessionScanBtn.addEventListener("click", (e) => {
    const videoConstraints = setVideoConstraints();
    startScanning(videoConstraints, "session");
});

startPageScanBtn.addEventListener("click", (e) => {
    const videoConstraints = setVideoConstraints();
    startScanning(videoConstraints, "page");
});



// sendMessageBtn.addEventListener("click", () => {
//     const links = document.querySelector('input[name="edirom-links"]:checked').value;
//     const messageString = JSON.stringify({ message: "open-links", links: links });
//     console.log("Sending:");
//     console.log(messageString);
//     webSocket.send(messageString);
// });


function getOs() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes("Windows")) {
        return "Windows";
    }
    else if (userAgent.includes("Android")) {
        return "Android";
    }
    else if (userAgent.includes("Linux")) {
        return "Linux";
    }
    else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
        return "iOS";
    }
    else if (userAgent.includes("Mac")) {
        return "MacOS";
    } else {
        return "Unknown";
    }
}

function getDeviceType() {
    const deviceType = getOs();
    if (deviceType === "Windows" || deviceType === "Linux" || deviceType === "MacOS") {
        return "Desktop";
    }
    else if (deviceType === "Android" || deviceType === "iOS") {
        return "Mobilgerät";
    }
    else {
        return "Unknown";
    }
}

function getBrowser() { // that can be improved
    const userAgent = navigator.userAgent;
    if (userAgent.includes("Firefox")) {
        return "Firefox";
    }
    else if (userAgent.includes("Chrome")) {
        return "Chrome";
    }
    else if (userAgent.includes("Safari")) {
        return "Safari";
    }
    else if (userAgent.includes("Edge")) {
        return "Edge";
    }
    else {
        return "Unknown";
    }
}

function getCameraId() {
    Html5Qrcode.getCameras().then(devices => {
        console.log(devices);
        if (devices && devices.length) {
            for (let device of devices) {
                if (device.label.includes("back")) { // sometimes this works better for Firefox?
                    cameraId = device.id;
                    break;
                }
            }
            cameraId = { facingMode: "environment" }; // normaly this should work
        }
        return true; // Indicates success
    }).catch(err => {
        console.log(err);
        return false; // Indicates an error occurred
    }).then(success => {
        if (success) {
            startSessionScanBtn.classList.remove("hidden");
            readerContainer.classList.add("hidden");
        }
        else {
            alert("Please allow camera access to scan the session code!");
            // I could add a button here to ask for camera access again
        }
    });
}

function startScanning(videoConstraints, type) {
    alertsContainer.classList.add("hidden");
    startSessionScanBtn.classList.add("hidden");
    startPageScanBtn.classList.add("hidden");
    readerContainer.classList.remove("hidden");
    html5QrCode.start(
        cameraId,
        {
            fps: 20,    // Optional, frame per seconds for qr code scanning
            videoConstraints: videoConstraints,
        },
        (decodedText, decodedResult) => {
            // do something when code is ready
            if (type === "session") {
                requestSessionMerge(decodedText);
            }
            else if (type === "page") {
                handlePageCodeScan(decodedText);
            }

        },
        (errorMessage) => {
            // parse error, ignore it.
        })
        .catch((err) => {
            // Start failed, handle it.
        });
}

function requestSessionMerge(decodedText) {
    if (decodedText.length === 36) { // UUIDs have a length of 36
        sessionId = decodedText;
        console.log(`Sending sessionId ${sessionId} to server`);
        let deviceInfo = `${getDeviceType()} (${getOs()}; ${getBrowser()})`;
        const messageString = JSON.stringify({ request: "mergeSessions", sessionId: sessionId, deviceInfo: deviceInfo });
        webSocket.send(messageString);
        html5QrCode.pause();
        //TODO: What to do when merge with sessionId not successful
    }
}

function handleSessionConnected() {
    console.log("Session connected!");
    sessionConnectionStatusP.classList.add("connected");
    sessionConnectionStatusP.classList.remove("disconnected");
    sessionConnectionStatusP.textContent = `SESSION: ${sessionId}`;
    html5QrCode.stop();
    alertsContainer.classList.remove("hidden");
    alertP.classList.add("green");
    alertP.textContent = "Sitzung erfolgreich beigetreten!";
    scanTargetInfoP.textContent = "Scanne Seitencode";
    startPageScanBtn.classList.remove("hidden");
    readerContainer.classList.add("hidden");
}

function handlePageCodeScan(decodedText) {
    if (decodedText.startsWith("https://localhost:5500")) {
        const pageCode = decodedText.substring(decodedText.length - 3);
        const plist = lookUpPageCode(pageCode);
        if (plist) {
            const messageString = JSON.stringify({ message: "open-links", links: plist });
            console.log("Sending:");
            console.log(messageString);
            webSocket.send(messageString);
            html5QrCode.stop();
            alertsContainer.classList.remove("hidden");
            alertP.classList.add("green");
            alertP.textContent = "Erfolgreich umgeblättert!";
            startPageScanBtn.classList.remove("hidden");
            readerContainer.classList.add("hidden");
        }
    }
}

function lookUpPageCode(pageCode) {
    const pageCodes = { // this is ofcourse just a placeholder
        "001": "xmldb:exist:///db/apps/edirom-content/content/documents/sources/D-Msch_AU-294.xml#surface_14fe956d-75ae-466c-aa92-8f0f2fd431ab", //Sterbelied S. 1
        "002": "xmldb:exist:///db/apps/edirom-content/content/documents/sources/D-Msch_AU-294.xml#surface_b6229440-1839-486d-a96f-7eaad0648d52", //Sterbelied S. 2
        "003": "xmldb:exist:///db/apps/edirom-content/content/documents/sources/D-Msch_AU-294.xml#surface_b738c597-f5dc-4078-8065-502ea740e772", //Sterbelied S. 3
        "004": "xmldb:exist:///db/apps/edirom-content/content/documents/sources/D-Msch_AU-294.xml#surface_26785d3d-217b-42dd-8d87-d7487e67b1de" //Sterbelied S. 4
    }
    if (pageCodes[pageCode]) {
        return pageCodes[pageCode];
    }
    return false;
}

function setVideoConstraints() {
    let videoConstraints = {
        "width": 2000,
        "height": 2000,
        "frameRate": 30
    }
    if (typeof cameraId === "object") {
        videoConstraints.facingMode = "environment";
    }
    else {
        videoConstraints.deviceId = cameraId;
    }
}

// function calculateBoxSize() { // I worte this function to calculate the box size for the QR code scanner. I do not use the qrbox at the moment
//     const space = 0.33;
//     let clientWidth = screen.width;
//     let clientHeight = screen.height;
//     console.log(clientWidth, clientHeight);
//     let bodyMargin = parseInt(window.getComputedStyle(document.body).getPropertyValue("margin"));

//     let predictedVideoWidth = clientWidth - 2 * bodyMargin;
//     console.log("predictedVideoWidth: " + predictedVideoWidth);
//     if (clientWidth > clientHeight) {
//         let predictedVideoHeight = predictedVideoWidth * (9 / 16);
//         console.log("predictedVideoHeight: " + predictedVideoHeight);
//         return predictedVideoHeight - predictedVideoHeight * space;
//     }
//     return predictedVideoWidth - predictedVideoWidth * space;
// }

getCameraId();

