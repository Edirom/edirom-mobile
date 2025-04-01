const newQrCodeScanBtn = document.querySelector("#new-qr-code-scan-btn");
const loginPageSubmit = document.querySelector("#loginPageSubmit");
const headerConnectionStatus = document.querySelector("#header-connection-status");
const alertsContainer = document.querySelector("#alerts-container");
const alertP = document.querySelector("#alert");


const webSocket = new WebSocket("ws://localhost:3000");
var html5QrCode = null;


let videoplayerJsElement = document.createElement("script");
videoplayerJsElement.setAttribute("defer", "defer");
videoplayerJsElement.setAttribute("src", "https://127.0.0.1:5501/videoplayer.js")
document.querySelector("head").appendChild(videoplayerJsElement);


state = {
    first: true,
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
    else if (state.context.pages === "9-10") {
        newPages = "7-8";
    }
    else if (state.context.pages === "11-12") {
        newPages = "9-10";
    }
    else if (state.context.pages === "13-14") {
        newPages = "11-12";
    }
    else if (state.context.pages === "15-16") {
        newPages = "13-14";
    }
    newContext = {
        "volume": "robin_hood_1c", "pages": newPages
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
    else if (state.context.pages === "7-8") {
        newPages = "9-10";
    }
    else if (state.context.pages === "9-10") {
        newPages = "11-12";
    }
    else if (state.context.pages === "11-12") {
        newPages = "13-14";
    }
    else if (state.context.pages === "13-14") {
        newPages = "15-16";
    }
    newContext = {
        "volume": "robin_hood_1c", "pages": newPages
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
    document.querySelector("#loginSuccessPage").classList.add("display-none");
    document.querySelector("#functionalitiesMenuPage").classList.remove("display-none");
    document.querySelector("#footer").classList.remove("display-none");
    // switchPage("functionalitiesMenuPage", true);
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
        return { "volume": "robin_hood_1c", "pages": "1-2" };
    }
    if (pageCode == "002") {
        return { "volume": "robin_hood_1c", "pages": "3-4" };
    }
    if (pageCode == "003") {
        return { "volume": "robin_hood_1c", "pages": "5-6" };
    }
    if (pageCode == "004") {
        return { "volume": "robin_hood_1c", "pages": "7-8" };
    }
    if (pageCode == "005") {
        return { "volume": "robin_hood_1c", "pages": "9-10" };
    }
    if (pageCode == "006") {
        return { "volume": "robin_hood_1c", "pages": "11-12" };
    }
    if (pageCode == "007") {
        return { "volume": "robin_hood_1c", "pages": "13-14" };
    }
    if (pageCode == "008") {
        return { "volume": "robin_hood_1c", "pages": "15-16" };
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
    if (state.context.pages === "15-16") {
        document.querySelector("#footer-arrow-right").classList.add("hidden")
    }
    else {
        document.querySelector("#footer-arrow-right").classList.remove("hidden")
    }

    console.log("bbbb");
    switchPage(state.page);
}

function handleLoginAttempt() {
    const username = document.getElementById('loginName').value;
    const password = document.getElementById('loginPassword').value;
    document.querySelector("#loginPage").classList.add("display-none");
    document.querySelector("#loginSuccessPage").classList.remove("display-none");
}

function switchPage(newPage, pushHistory = false) {
    console.log("SwitchPage:", newPage);
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
    else if (newPage == "videoplayerPage") {
        buildVideoplayerPage(contentContainer);
    }

    insertSvgs(contentContainer);

    console.log(history);
}

function buildFunctionalitiesMenuPage(contentContainer) {
    let htmlString = `<div id="functionalitiesMenuPage">
      <h1>Erweiterungen:</h1>
      <div id="functionalitiesMenu">
        <div><button id="lesartenBtn">Textkritische Anmerkungen</button></div>
        <div><button id="videoplayerBtn">Videoplayer</button></div>
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
    contentContainer.querySelector("#videoplayerBtn").addEventListener("click", (e) => {
        switchPage("videoplayerPage", true);
    });

    if (state.first === true) {
        state.first = false;
        contentContainer.querySelector("#functionalitiesMenuPage").classList.add("display-none");
        document.querySelector("#footer").classList.add("display-none");
    }
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
        documents_list = `<li>D-MZsch AU-294 1</li>`;
        pageCode = "001";
    }
    if (state.context.pages == "3-4") {
        documents_list = `<li>D-MZsch AU-294 2</li>`
        pageCode = "002";
    }
    if (state.context.pages == "5-6") {
        documents_list = `<li>D-MZsch AU-294 4</li><li>F18 Schalk-444 11</li>`
        pageCode = "003";
    }
    if (state.context.pages == "7-8") {
        documents_list = `<li>D-MZsch AU-294 5</li><li>F18 Schalk-444 12</li>`
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

function buildVideoplayerPage(contentContainer) {

    // let htmlString = `<div class="page" id="videoplayerPage">
    // <h1>Textkritische Anmerkungen:</h1>
    // </div>`;

    // // Create a temporary container
    // const tempContainer = document.createElement('div');
    // tempContainer.innerHTML = htmlString.trim();

    // contentContainer.appendChild(tempContainer.firstChild);

    // const style = window.getComputedStyle(contentContainer); // To get the padding values
    // let paddingLeftAndRight = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    // let paddingTopAndBottom = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    let maxWidth = screen.availWidth - 20;
    let maxHeight = screen.availHeight - 20;

    let loopBeginningTimeMs = "";
    let loopEndingTimeMs = "";
    if (state.context.pages == "1-2") {
        loopBeginningTimeMs = "70000";
        loopEndingTimeMs = "80000";
    }
    if (state.context.pages == "3-4") {
        loopBeginningTimeMs = "80000";
        loopEndingTimeMs = "90000";
    }
    if (state.context.pages == "5-6") {
        loopBeginningTimeMs = "90000";
        loopEndingTimeMs = "100000";
    }
    if (state.context.pages == "7-8") {
        loopBeginningTimeMs = "100000";
        loopEndingTimeMs = "110000";
    }

    let measuresData = `[{"measureId" : "performance.m1",
  "measureLabel" : "0",
  "begin" : "00:00:00.00",
  "end" : "00:00:04.00"
}, {
  "measureId" : "performance.m2",
  "measureLabel" : "1",
  "begin" : "00:00:04.00",
  "end" : "00:00:08.00"
}, {
  "measureId" : "performance.m3",
  "measureLabel" : "2",
  "begin" : "00:00:08.00",
  "end" : "00:00:12.00"
}, {
  "measureId" : "performance.m4",
  "measureLabel" : "3",
  "begin" : "00:00:12.00",
  "end" : "00:00:16.00"
}, {
  "measureId" : "performance.m5",
  "measureLabel" : "4",
  "begin" : "00:00:16.00",
  "end" : "00:00:20.00"
}, {
  "measureId" : "performance.m6",
  "measureLabel" : "5",
  "begin" : "00:00:20.00",
  "end" : "00:00:24.00"
}, {
  "measureId" : "performance.m7",
  "measureLabel" : "6",
  "begin" : "00:00:24.00",
  "end" : "00:00:28.00"
}, {
  "measureId" : "performance.m8",
  "measureLabel" : "7",
  "begin" : "00:00:28.00",
  "end" : "00:00:32.00"
}, {
  "measureId" : "performance.m9",
  "measureLabel" : "8",
  "begin" : "00:00:32.00",
  "end" : "00:00:36.00"
}, {
  "measureId" : "performance.m10",
  "measureLabel" : "9",
  "begin" : "00:00:36.00",
  "end" : "00:00:40.00"
}, {
  "measureId" : "performance.m11",
  "measureLabel" : "10",
  "begin" : "00:00:40.00",
  "end" : "00:00:44.00"
}, {
  "measureId" : "performance.m12",
  "measureLabel" : "11",
  "begin" : "00:00:44.00",
  "end" : "00:00:48.00"
}, {
  "measureId" : "performance.m13",
  "measureLabel" : "12",
  "begin" : "00:00:48.00",
  "end" : "00:00:52.00"
}, {
  "measureId" : "performance.m14",
  "measureLabel" : "13",
  "begin" : "00:00:52.00",
  "end" : "00:00:56.00"
}, {
  "measureId" : "performance.m15",
  "measureLabel" : "14",
  "begin" : "00:00:56.00",
  "end" : "00:01:00.00"
}, {
  "measureId" : "performance.m16",
  "measureLabel" : "15",
  "begin" : "00:01:00.00",
  "end" : "00:01:04.00"
}, {
  "measureId" : "performance.m17",
  "measureLabel" : "16",
  "begin" : "00:01:04.00",
  "end" : "00:01:08.00"
}, {
  "measureId" : "performance.m18",
  "measureLabel" : "17",
  "begin" : "00:01:08.00",
  "end" : "00:01:12.00"
}, {
  "measureId" : "performance.m19",
  "measureLabel" : "18",
  "begin" : "00:01:12.00",
  "end" : "00:01:16.00"
}, {
  "measureId" : "performance.m20",
  "measureLabel" : "19",
  "begin" : "00:01:16.00",
  "end" : "00:01:20.00"
}, {
  "measureId" : "performance.m21",
  "measureLabel" : "20",
  "begin" : "00:01:20.00",
  "end" : "00:01:24.00"
}, {
  "measureId" : "performance.m22",
  "measureLabel" : "21",
  "begin" : "00:01:24.00",
  "end" : "00:01:28.00"
}, {
  "measureId" : "performance.m23",
  "measureLabel" : "22",
  "begin" : "00:01:28.00",
  "end" : "00:01:32.00"
}, {
  "measureId" : "performance.m24",
  "measureLabel" : "23",
  "begin" : "00:01:32.00",
  "end" : "00:01:36.00"
}, {
  "measureId" : "performance.m25",
  "measureLabel" : "24",
  "begin" : "00:01:36.00",
  "end" : "00:01:40.00"
}, {
  "measureId" : "performance.m26",
  "measureLabel" : "25",
  "begin" : "00:01:40.00",
  "end" : "00:01:44.00"
}, {
  "measureId" : "performance.m27",
  "measureLabel" : "26",
  "begin" : "00:01:44.00",
  "end" : "00:01:48.00"
}, {
  "measureId" : "performance.m28",
  "measureLabel" : "27",
  "begin" : "00:01:48.00",
  "end" : "00:01:52.00"
}, {
  "measureId" : "performance.m29",
  "measureLabel" : "28",
  "begin" : "00:01:52.00",
  "end" : "00:01:56.00"
}, {
  "measureId" : "performance.m30",
  "measureLabel" : "29",
  "begin" : "00:01:56.00",
  "end" : "00:02:00.00"
}, {
  "measureId" : "performance.m31",
  "measureLabel" : "30",
  "begin" : "00:02:00.00",
  "end" : "00:02:04.00"
}, {
  "measureId" : "performance.m32",
  "measureLabel" : "31",
  "begin" : "00:02:04.00",
  "end" : "00:02:08.00"
}, {
  "measureId" : "performance.m33",
  "measureLabel" : "32",
  "begin" : "00:02:08.00",
  "end" : "00:02:12.00"
}, {
  "measureId" : "performance.m34",
  "measureLabel" : "33",
  "begin" : "00:02:12.00",
  "end" : "00:02:16.00"
}, {
  "measureId" : "performance.m35",
  "measureLabel" : "34",
  "begin" : "00:02:16.00",
  "end" : "00:02:20.00"
}, {
  "measureId" : "performance.m36",
  "measureLabel" : "35",
  "begin" : "00:02:20.00",
  "end" : "00:02:25.00"
}]`;

    measuresData = measuresData.replace(/\n/g, "");

    let elementString = `<edirom-videoplayer id="videoplayer" state="pause" src-data="robinhood.mov" width="${maxWidth}" height="${maxHeight}" loop-beginning-time-ms="${loopBeginningTimeMs}" loop-ending-time-ms="${loopEndingTimeMs}" measures-data='${measuresData}'></edirom-videoplayer>`;

    contentContainer.innerHTML = elementString.trim();
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





