const newQrCodeScanBtn = document.querySelector("#new-qr-code-scan-btn");
const loginPageSubmit = document.querySelector("#loginPageSubmit");
const headerConnectionStatus = document.querySelector("#header-connection-status");
const alertsContainer = document.querySelector("#alerts-container");
const alertP = document.querySelector("#alert");
const startScanBtnContainer = document.querySelector("#start-scan-btn-container");
const startSessionScanBtn = document.querySelector("#start-session-scan-btn");




const explanationPageTurning = `
    <h1>Scannen Sie nun einen Seiten-Code, um in einen neuen Kontext zu gelangen</h1>
`;

const webSocket = new WebSocket("ws://localhost:3000");
const html5QrCode = new Html5Qrcode(/* element id */ "reader");


// initialState = { page: "loginPage" }
history.replaceState({ page: "functionalitiesMenuPage" }, "", "functionalitiesMenuPage");

state = {
    page: null,
    queuedPage: null,
    camera: {
        id: null
    },
    wsConnection: {
        connected: false,
        session: {
            id: null,
            connected: false
        }
    }
}

function getCameraId() {
    if (state.camera.id) {
        // Already have the camera ID
        return Promise.resolve();
    }
    console.log("getting new Camera Id...");
    return Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
            state.camera.id = { facingMode: "environment" }; // normaly this should work
            for (let device of devices) {
                if (device.label.includes("back")) { // sometimes this works better for Firefox?
                    state.camera.id = device.id;
                    break;
                }
            }
        }
        else {
            throw new Error("No camera devices found.");
        }
    }).catch(err => {
        console.error("getCameraId error:", err);
        // You might want to show an alert or handle permissions issues here
        alert("Please allow camera access to scan the session code!");
        throw err; // Re-throw to let the caller know there's an error
    });
}


// Handle forward/back buttons
window.addEventListener("popstate", (event) => {
    // If a state has been provided, we have a "simulated" page
    // and we update the current page.
    if (event.state) {
        // Simulate the loading of the previous page
        if (state.page === "functionalitiesMenuPage") {
            confirm("Edirom-Mobile wirklich verlassen?");
        }
        if (event.state.page === "functionalitiesMenuPage")
            switchPage(event.state.page);
    }
});


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

webSocket.onmessage = (e) => {
    console.log("Received data!");
    const data = JSON.parse(e.data);
    if (data.response === "sessionMerged") {
        handleSessionConnected();
    }
};


newQrCodeScanBtn.addEventListener("click", (e) => {
    switchPage("controlEdiromPage", true);
});

loginPageSubmit.addEventListener("click", (e) => {
    handleLoginAttempt();
});

document.querySelector("#loginSuccessContinue").addEventListener("click", (e) => {
    switchPage("functionalitiesMenuPage", true);
});

document.querySelector("#lesartenBtn").addEventListener("click", (e) => {
    switchPage("textualRemarksMobilePage", true);
});

document.querySelector("#controlEdiromBtn").addEventListener("click", (e) => {
    switchPage("controlEdiromPage", true);
});

startSessionScanBtn.addEventListener("click", (e) => {
    startSessionCodeScanning();
});


function handleLoginAttempt() {
    const username = document.getElementById('loginName').value;
    const password = document.getElementById('loginPassword').value;
    switchPage("loginSuccessPage");
}

function switchPage(newPage, pushHistory = false) {
    const oldPage = state.page;
    const functionalitiesThatRequireSession = ["controlEdiromPage"];

    // Clean ups
    if (oldPage === "connectToSessionPage") {
        html5QrCode.stop();
    }

    // Connect to session if required
    if (functionalitiesThatRequireSession.includes(newPage) && state.wsConnection.session.connected === false) {
        console.log("I am here");
        state.queuedPage = newPage
        switchPage("connectToSessionPage")
        return
    }

    // Hide all page sections
    document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));

    // Show the current page section
    const newPageEl = document.querySelector(`#${newPage}`);
    if (newPageEl) {
        newPageEl.classList.remove('hidden');
    }

    state.page = newPage;

    if (pushHistory) {
        history.pushState(state, "", state.page);
    }
}

function startSessionCodeScanning() {
    alertsContainer.classList.add("hidden");
    startSessionScanBtn.classList.add("hidden");
    startScanBtnContainer.classList.add("hidden");
    document.querySelector("#connectToSessionPage .reader-container").classList.remove("hidden");
    getCameraId().then(() => {
        // Now state.camera.id is guaranteed to be set (or an error would've been thrown)
        // ... start scanning logic here ...
        const videoConstraints = setVideoConstraints();
        html5QrCode.start(
            state.camera.id,
            {
                fps: 20,    // Optional, frame per seconds for qr code scanning
                videoConstraints: videoConstraints,
            },
            (decodedText, decodedResult) => {
                // do something when code is ready
                requestSessionMerge(decodedText);
            },
            (errorMessage) => {
                // parse error, ignore it.
            })
            .catch((err) => {
                // Start failed, handle it.
            });
    }).catch((err) => {
        // Handle the case where we don't have a camera ID
        console.error("startScanning error:", err);
    });
}

function startPageCodeScanning(videoConstraints) {
    readerContainer.classList.remove("hidden");
    html5QrCode.start(
        state.camera.id,
        {
            fps: 20,    // Optional, frame per seconds for qr code scanning
            videoConstraints: videoConstraints,
        },
        (decodedText, decodedResult) => {
            // do something when code is ready
            handlePageCodeScan(decodedText);
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
        const sessionId = decodedText;
        state.wsConnection.session.id = sessionId;
        console.log(`Sending sessionId ${sessionId} to server`);
        const messageString = JSON.stringify({ request: "mergeSessions", sessionId: sessionId });
        webSocket.send(messageString);
        html5QrCode.pause();
        //TODO: What to do when merge with sessionId not successful
    }
}

function handleSessionConnected() {
    console.log("Session connected!");
    state.wsConnection.session.connected = true;
    alertP.classList.add("green");
    alertP.textContent = "Sitzung erfolgreich beigetreten!";
    switchPage(state.queuedPage, true);
    state.queuedPage = null;
}

function handlePageCodeScan(decodedText) {
    if (decodedText.startsWith("https://localhost:5500")) {
        const pageCode = decodedText.substring(decodedText.length - 3);
        const messageString = JSON.stringify({ message: "scanned-qr-code", code: pageCode });
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
    if (typeof state.camera.id === "object") {
        videoConstraints.facingMode = "environment";
    }
    else {
        videoConstraints.deviceId = state.camera.id;
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

// getCameraId(); //TODO: das erst abfragen, wenn es gebraucht wird und auch nur, wenn es nicht gesetzt wurde.

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


switchPage("functionalitiesMenuPage");


