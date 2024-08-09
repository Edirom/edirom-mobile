const serverConnectionStatusP = document.querySelector("#server-connection-status");
const sessionConnectionStatusP = document.querySelector("#session-connection-status");
const alertsContainer = document.querySelector("#alerts-container");
const alertP = document.querySelector("#alert");
const startScanBtnContainer = document.querySelector("#start-scan-btn-container");
const startScanBtn = document.querySelector("#start-scan-btn");
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

startScanBtn.addEventListener("click", (e) => {
    let type = e.target.dataset.type;
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
    startScanning(videoConstraints, type);
});



// sendMessageBtn.addEventListener("click", () => {
//     const links = document.querySelector('input[name="edirom-links"]:checked').value;
//     const messageString = JSON.stringify({ message: "open-links", links: links });
//     console.log("Sending:");
//     console.log(messageString);
//     webSocket.send(messageString);
// });

const detectDeviceType = () => {
    console.log(navigator.userAgentData);
    return /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)
        ? 'Mobile'
        : 'Desktop';
};

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
        return "Mobile";
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


console.log(`${getDeviceType()} (${getOs()}) using ${getBrowser()}`);

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
            startScanBtnContainer.classList.remove("hidden");
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
    startScanBtnContainer.classList.add("hidden");
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
    startScanBtn.textContent = "Scanne Seitencode";
    startScanBtn.dataset.type = "page";
    scanTargetInfoP.textContent = "Scanne Seitencode";
    startScanBtnContainer.classList.remove("hidden");
    readerContainer.classList.add("hidden");
}

function handlePageCodeScan(decodedText) {
    if (decodedText.startsWith("pagecode://")) {
        let pageCode = decodedText.substring(decodedText.length - 3);
        alert(`Seitencode: ${pageCode}`);
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

