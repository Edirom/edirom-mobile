const headerConnectionStatus = document.querySelector("#header-connection-status");
const alertsContainer = document.querySelector("#alerts-container");
const alertP = document.querySelector("#alert");
const startScanBtnContainer = document.querySelector("#start-scan-btn-container");
const startSessionScanBtn = document.querySelector("#start-session-scan-btn");
const startPageScanBtn = document.querySelector("#start-page-scan-btn");
const readerContainer = document.querySelector("#reader-container");
const explanationContainer = document.querySelector("#explanation-container");

const explanationSessionConnection = `
    <h1>Verbindung zu einer Edirom-Sitzung herstellen</h1>
    <ol>
        <li>Öffnen Sie auf Ihrem Computer die EWK-Edirom unter <a href="www.e-w-k.de/edirom.">e-w-k.de/edirom.</a></li>
        <li>Öffen Sie in der Edirom das Verbindungsfenster mit einem Klick auf das grüne Feld oben rechts.</li>
        <li>Tippen Sie auf diesem Gerät auf den unteren Button und scannen Sie den in der Edirom angezeigten QR-Code.</li>
    </ol>
`;

const explanationPageTurning = `
    <h1>Scannen Sie nun einen Seiten-Code, um in einen neuen Kontext zu gelangen</h1>
`;

const webSocket = new WebSocket("ws://localhost:3000");
let sessionId = null;
const html5QrCode = new Html5Qrcode(/* element id */ "reader");
let cameraId = null;


webSocket.onopen = (event) => {
    console.log("Server connection opened!");
    sendUserAgent();
    headerConnectionStatus.classList.remove("disconnected");
    headerConnectionStatus.classList.add("connected");
};

webSocket.onclose = (event) => {
    console.log("Server connection closed!");
    headerConnectionStatus.classList.remove("connected");
    headerConnectionStatus.classList.add("disconnected");
};

webSocket.onmessage = (event) => {
    console.log("Received data!");
    console.log(event.data);
    const data = JSON.parse(event.data);
    if (data.response === "sessionMerged") {
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
    startSessionScanBtn.classList.add("hidden");
    startPageScanBtn.classList.add("hidden");
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

function sendUserAgent() { // For the device metadata
    const userAgent = navigator.userAgent;
    const messageString = JSON.stringify({ message: "userAgent", userAgent: userAgent });
    webSocket.send(messageString);
}

function requestSessionMerge(decodedText) {
    if (decodedText.length === 36) { // UUIDs have a length of 36
        sessionId = decodedText;
        console.log(`Sending sessionId ${sessionId} to server`);
        const messageString = JSON.stringify({ request: "mergeSessions", sessionId: sessionId });
        webSocket.send(messageString);
        html5QrCode.pause();
        //TODO: What to do when merge with sessionId not successful
    }
}

function handleSessionConnected() {
    console.log("Session connected!");
    html5QrCode.stop();
    alertsContainer.classList.remove("hidden");
    alertP.classList.add("green");
    alertP.textContent = "Sitzung erfolgreich beigetreten!";
    startPageScanBtn.classList.remove("hidden");
    startScanBtnContainer.classList.remove("hidden");
    readerContainer.classList.add("hidden");
    explanationContainer.innerHTML = explanationPageTurning;
}

function handlePageCodeScan(decodedText) {
    if (decodedText.startsWith("https://localhost:5500")) {
        const pageCode = decodedText.substring(decodedText.length - 3);
        const messageString = JSON.stringify({ message: "scanned-qr-code", code: pageCode });
        console.log("Sending:");
        console.log(messageString);
        webSocket.send(messageString);
        html5QrCode.stop();
        alertsContainer.classList.remove("hidden");
        alertP.classList.add("green");
        alertP.textContent = "Erfolgreich umgeblättert!"; // TODO: This should only happen if the server sends a confirmation
        startPageScanBtn.classList.remove("hidden");
        startScanBtnContainer.classList.remove("hidden");
        readerContainer.classList.add("hidden");
    }
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
    return videoConstraints;
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

function insertSvgs() {
    const allSvgContainer = document.querySelectorAll(".svg-container");
    for (let svgContainer of allSvgContainer) {
        let path = "img/" + svgContainer.textContent + ".svg";
        fetch(path)
            .then(response => response.text())
            .then(svgData => {
                svgContainer.innerHTML = svgData;
            })
            .catch(error => {
                console.error("Error fetching SVG:", error);
            });
    }
}

document.addEventListener("DOMContentLoaded", function () {
    insertSvgs();
});

