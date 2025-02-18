const newQrCodeScanBtn = document.querySelector("#new-qr-code-scan-btn");
const loginPageSubmit = document.querySelector("#loginPageSubmit");
const headerConnectionStatus = document.querySelector("#header-connection-status");
const alertsContainer = document.querySelector("#alerts-container");
const alertP = document.querySelector("#alert");


const webSocket = new WebSocket("ws://localhost:3000");
var html5QrCode = null;


state = {
    page: "functionalitiesMenuPage",
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
    },
    context: null
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
    if (event.state) {
        if (event.state.page === "functionalitiesMenuPage") {
            switchPage(event.state.page);
        }
    }
});


webSocket.onopen = (event) => {
    console.log("Server connection opened!");
    state.wsConnection.connected = true;
    sendUserAgent();
    changeConnectionColor();
};

webSocket.onclose = (event) => {
    console.log("Server connection closed!");
    state.wsConnection.connected = false;
    changeConnectionColor();
};

webSocket.onmessage = (e) => {
    console.log("Received data!");
    const data = JSON.parse(e.data);
    if (data.response === "sessionMerged") {
        handleSessionConnected();
    }
};


document.querySelector("#footer-arrow-left").addEventListener("click", (e) => {
    if (state.context.pages === "3-4") {
        newPages = "1-2";
    }
    else if (state.context.pages === "5-6") {
        newPages = "3-4";
    }
    else if (state.context.pages === "7-8") {
        newPages = "5-6";
    }
    newContext = {
        "volume": "a3-1_lieder-1", "pages": newPages
    };
    switchContext(newContext);
});

document.querySelector("#footer-arrow-right").addEventListener("click", (e) => {
    if (state.context.pages === "1-2") {
        newPages = "3-4";
    }
    else if (state.context.pages === "3-4") {
        newPages = "5-6";
    }
    else if (state.context.pages === "5-6") {
        newPages = "7-8";
    }
    newContext = {
        "volume": "a3-1_lieder-1", "pages": newPages
    };
    switchContext(newContext);
});

newQrCodeScanBtn.addEventListener("click", (e) => {
    document.querySelector("#scanNewQrCodePopover").togglePopover();
});

loginPageSubmit.addEventListener("click", (e) => {
    handleLoginAttempt();
});

document.querySelector("#loginSuccessContinue").addEventListener("click", (e) => {
    switchPage("functionalitiesMenuPage", true);
});

document.querySelector("#scanNewQrCodePopover").addEventListener("toggle", (event) => {
    if (event.newState === "open") {
        document.querySelector("#content-container").classList.add("blur");
        startPageCodeScanning();
    } else {
        document.querySelector("#content-container").classList.remove("blur");
        destroyPageCodeScanning();
    }
});


function changeConnectionColor() {
    let connectionStatus = "disconnected"
    if (state.wsConnection.connected == true) {
        connectionStatus = "connected";
        if (state.wsConnection.session.connected == true) {
            connectionStatus = "session";
        }
    }
    headerConnectionStatus.setAttribute("data-connection-status", connectionStatus);
}

function getContextFromQrCode(pageCode) {
    if (pageCode == "001") {
        return { "volume": "a3-1_lieder-1", "pages": "1-2" };
    }
    if (pageCode == "002") {
        return { "volume": "a3-1_lieder-1", "pages": "3-4" };
    }
    if (pageCode == "003") {
        return { "volume": "a3-1_lieder-1", "pages": "5-6" };
    }
    if (pageCode == "004") {
        return { "volume": "a3-1_lieder-1", "pages": "7-8" };
    }
}



function switchContext(newContext) {
    state.context = newContext;
    document.querySelector("#current-context-pages").textContent = state.context.pages;

    if (state.context.pages === "1-2") {
        document.querySelector("#footer-arrow-left").classList.add("hidden")
    }
    else {
        document.querySelector("#footer-arrow-left").classList.remove("hidden")
    }
    if (state.context.pages === "7-8") {
        document.querySelector("#footer-arrow-right").classList.add("hidden")
    }
    else {
        document.querySelector("#footer-arrow-right").classList.remove("hidden")
    }

    switchPage(state.page);
}

function handleLoginAttempt() {
    const username = document.getElementById('loginName').value;
    const password = document.getElementById('loginPassword').value;
    switchPage("loginSuccessPage");
}

function switchPage(newPage, pushHistory = false) {
    const oldPage = state.page;
    const functionalitiesThatRequireSession = ["controlEdiromPage"];
    const contentContainer = document.querySelector("#content-container")

    // Clean ups
    contentContainer.innerHTML = "";
    if (oldPage === "connectToSessionPage" && html5QrCode) {
        html5QrCode.stop();
    }

    // Connect to session if required
    if (functionalitiesThatRequireSession.includes(newPage) && state.wsConnection.session.connected === false) {
        state.queuedPage = newPage;
        switchPage("connectToSessionPage", true);
        return;
    }

    state.page = newPage;
    if (pushHistory) {
        history.pushState(state, "");
    }

    if (newPage == "functionalitiesMenuPage") {
        buildFunctionalitiesMenuPage(contentContainer);
    }
    else if (newPage == "connectToSessionPage") {
        buildConnectToSessionPage(contentContainer);
    }
    else if (newPage == "textualRemarksMobilePage") {
        buildTextualRemarksMobilePage(contentContainer);
    }
    else if (newPage == "controlEdiromPage") {
        buildControlEdiromPage(contentContainer);
    }

    insertSvgs(contentContainer);

    console.log(history);
}

function buildFunctionalitiesMenuPage(contentContainer) {
    let htmlString = `<div class="page" id="functionalitiesMenuPage">
      <h1>Erweiterungen:</h1>
      <div id="functionalitiesMenu">
        <div><button id="lesartenBtn">Texkritische Anmerkungen</button></div>
        <div><button id="controlEdiromBtn">Edirom-Steuerung</button></div>
      </div>
    </div>`;

    // Create a temporary container
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlString.trim();

    contentContainer.appendChild(tempContainer.firstChild);

    contentContainer.querySelector("#lesartenBtn").addEventListener("click", (e) => {
        switchPage("textualRemarksMobilePage", true);
    });
    contentContainer.querySelector("#controlEdiromBtn").addEventListener("click", (e) => {
        switchPage("controlEdiromPage", true);
    });
}

function buildConnectToSessionPage(contentContainer) {
    let htmlString = `<div class="page" id="connectToSessionPage">
    <div class="explanation-container">
        <h1>Verbindung zu einer Edirom-Sitzung herstellen</h1>
        <ol>
            <li>Navigieren Sie auf Ihrem Computer auf die EWK-Edirom unter <a href="www.e-w-k.de/edirom">e-w-k.de/edirom</a>.</li>
            <li>Öffnen Sie in der Edirom das Verbindungsfenster mit einem Klick auf das grüne Feld oben rechts.</li>
            <li>Tippen Sie auf diesem Gerät auf den unteren Button und scannen Sie den in der Edirom angezeigten QR-Code.</li>
        </ol>
    </div>
    <div id="start-scan-btn-container">
        <button id="start-session-scan-btn">
            <span class="svg-container">qr_code_scanner</span>
            <span class="svg-container">devices</span>
            <p>Scanne Sitzungscode</p>
        </button>
    </div>
    <div class="reader-container" class="display-none">
        <div id="session-reader" class="reader"></div>
    </div>
    </div>`;

    // Create a temporary container
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlString.trim();

    contentContainer.appendChild(tempContainer.firstChild);

    contentContainer.querySelector("#start-session-scan-btn").addEventListener("click", (e) => {
        startSessionCodeScanning();
    });
}

function buildControlEdiromPage(contentContainer) {

    let documents_list = ""
    let pageCode = null;
    if (state.context.pages == "1-2") {
        documents_list = `<li>D-Msch AU-294 1</li>`;
        pageCode = "001";
    }
    if (state.context.pages == "3-4") {
        documents_list = `<li>D-Msch AU-294 2</li>`
        pageCode = "002";
    }
    if (state.context.pages == "5-6") {
        documents_list = `<li>D-Msch AU-294 4</li><li>F18 Schalk-444 11</li>`
        pageCode = "003";
    }
    if (state.context.pages == "7-8") {
        documents_list = `<li>D-Msch AU-294 5</li><li>F18 Schalk-444 12</li>`
        pageCode = "004";
    }

    const messageString = JSON.stringify({ message: "scanned-qr-code", code: pageCode }); //TODO: Das "scanned-qr-code" zu nennen ist natürlich noch großer Quatsch.
    webSocket.send(messageString);

    let htmlString = `<div class="page" id="controlEdiromPage">
    <h1>Edirom-Steuerung</h1>
    <h2>Geöffnet wurden:</h2>
    <ul>
        ${documents_list}
    </ul>
    </div>`;

    // Create a temporary container
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlString.trim();

    contentContainer.appendChild(tempContainer.firstChild);
}

function buildTextualRemarksMobilePage(contentContainer) {
    let row_data = "";
    if (state.context.pages == "1-2") {
        row_data = `<tr>
        <td>Auftakt zu 1 | Klav. Ia | 1. Note</td>
        <td>Legatobogen bis zur 3/4 in T. 2, Klav. Ia verlängert, analog T. 12–14, 26–28, 30–32.</td>
        </tr>
        <tr>
        <td>Takt 2 | Klav. Ia/b | Ganzer Takt</td>
        <td>Stimmen von Klav. I sind in C im System von Klav. II
        notiert; Stimmen hier im System von Klav. I gesetzt; Bassschlüssel bereits vor den
        Taktstrich zu T. 2 gesetzt, statt vor den Taktstrich zu T. 3, analog T. 13/14.
        </td>
        </tr>
        <tr>
        <td>Takt 3 | Singstimme | 2. Note</td>
        <td>Beginn der Crescendogabel bereits zur 2. Note gesetzt, analog T. 29 und gemäß A und B.
        </td>
        </tr>`;
    }

    if (state.context.pages == "3-4") {
        row_data = `<tr>
        <td>Takt 10 | Klav. Ib | 8/8</td>
        <td>gis korrigiert zu g, mit Blick auf harmonischen Kontext.</td>
        </tr>
        <tr>
        <td>Takt 12 | Klav. I | Ganzer Takt</td>
        <td>Stimmen von Klav. I sind in C im System von Klav. II
        notiert; Stimmen hier im System von Klav. I gesetzt, analog T. 13/14.
        </td>
        </tr>
        <tr>
        <td>Takt 12 | Klav. I | 4/4</td>
        <td>mp unter das System gesetzt, espr. über das System, analog T. 1.
        </td>
        </tr>`;
    }

    if (state.context.pages == "5-6") {
        row_data = `<tr>
        <td>Takt 19 | Klav. Ia/b | 1. Note</td>
        <td>Legatobogen zum 1/8 in Klav. Ib gesetzt statt zur Halben in Klav. Ia, analog T. 41,
        46 und 47.</td>
        </tr>
        <tr>
        <td>Takt 27 | Klav. IIa | 6–7/8</td>
        <td>SLegatobogen ergänzt, analog T. 1, 13, 31 und 48.
        </td>
        </tr>
        <tr>
        <td>Takt 27 | Klav. IIa | 7/8</td>
        <td>Staccatopunkt ergänzt, analog T. 1, 13, 31 und 48.
        </td>
        </tr>`;
    }

    if (state.context.pages == "7-8") {
        row_data = `<tr>
        <td>Takt 28 | Singstimme | 4/4</td>
        <td>Vortragsanweisung »(ruhiger)« getilgt, da allein aufgrund des Akkoladen- und Seitenumbruchs in C eingefügt.
        </td>
        </tr>
        <tr>
        <td>Takt 28 | Klav. Ia/b | Ganzer Takt</td>
        <td>Stimmen von Klav. I sind in C im System von Klav. II notiert; Stimmen hier im System von Klav. I gesetzt; Bassschlüssel bereits vor den Taktstrich zu T. 28 gesetzt, statt vor den Taktstrich zu T. 29, analog T. 13/14.
        </td>
        </tr>
        <tr>
        <td>Takt 44 | Klav. Ia | 4/4</td>
        <td>Viertel cis 3/e 3 in Klav. Ia rhythmisch verändert zu Achtel sowie der Stimme Klav. Ib zugeordnet, analog Klav. Ia/b, 2. Note bzw. 3/8 und gemäß B. 
        </td>
        </tr>`;
    }

    let htmlString = `<div class="page" id="textualRemarksMobilePage">
    <h1>Textkritische Anmerkungen:</h1>
    <table>
        <tr>
            <th>Takt</th>
            <th>Anmerkung</th>
        </tr>
        ${row_data}
    </table>
    </div>`;

    // Create a temporary container
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlString.trim();

    contentContainer.appendChild(tempContainer.firstChild);
}

function startSessionCodeScanning() {
    html5QrCode = new Html5Qrcode(/* element id */ "session-reader");
    document.querySelector("#start-session-scan-btn").classList.add("display-none");
    document.querySelector("#start-scan-btn-container").classList.add("display-none");
    document.querySelector("#connectToSessionPage .reader-container").classList.remove("display-none");
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
    html5QrCode = new Html5Qrcode(/* element id */ "page-reader");

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
                handlePageCodeScan(decodedText);
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

function destroyPageCodeScanning() {
    document.querySelector("#scanNewQrCodePopover").hidePopover();
    console.log(html5QrCode);
    html5QrCode.stop();
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
    changeConnectionColor();
    alertP.classList.add("green");
    alertP.textContent = "Sitzung erfolgreich beigetreten!";
    switchPage(state.queuedPage);
    history.replaceState(state, "");
    state.queuedPage = null;
}

function handlePageCodeScan(decodedText) {
    if (decodedText.startsWith("https://localhost:5500")) {
        const pageCode = decodedText.substring(decodedText.length - 3);
        destroyPageCodeScanning();
        const newContext = getContextFromQrCode(pageCode);
        switchContext(newContext);

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

function insertSvgs(node) {
    const allSvgContainer = node.querySelectorAll(".svg-container");
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

function setInitialContext() {
    const currentUrl = new URL(window.location.href);
    // Extract the pathname (e.g., "/001")
    const pathname = currentUrl.pathname;
    const pageCode = pathname.substring(pathname.length - 3);

    context = getContextFromQrCode(pageCode);
    switchContext(context);
    history.replaceState(state, "");
}

document.addEventListener("DOMContentLoaded", function () {
    setInitialContext();
    insertSvgs(document.querySelector("footer"));
});





