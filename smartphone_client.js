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
        loopBeginningTimeMs = "43000";
        loopEndingTimeMs = "61000";
    }
    if (state.context.pages == "3-4") {
        loopBeginningTimeMs = "61000";
        loopEndingTimeMs = "77000";
    }
    if (state.context.pages == "5-6") {
        loopBeginningTimeMs = "77000";
        loopEndingTimeMs = "91000";
    }
    if (state.context.pages == "7-8") {
        loopBeginningTimeMs = "91000";
        loopEndingTimeMs = "105000";
    }
    if (state.context.pages == "9-10") {
        loopBeginningTimeMs = "105000";
        loopEndingTimeMs = "116000";
    }
    if (state.context.pages == "11-12") {
        loopBeginningTimeMs = "116000";
        loopEndingTimeMs = "128300";
    }
    if (state.context.pages == "13-14") {
        loopBeginningTimeMs = "128300";
        loopEndingTimeMs = "139300";
    }
    if (state.context.pages == "15-16") {
        loopBeginningTimeMs = "139300";
        loopEndingTimeMs = "145000";
    }

    let measuresData = `[ {
  "measureId" : "measure_d3dd8566-e972-4cf6-92f6-538959fcd5c9",
  "measureLabel" : "1",
  "begin" : "00:00:43.00",
  "end" : "00:00:44.00"
}, {
  "measureId" : "measure_6b998bf0-55c9-40d1-8dfc-1c58e6b3b232",
  "measureLabel" : "2",
  "begin" : "00:00:44.00",
  "end" : "00:00:46.00"
}, {
  "measureId" : "measure_63766cf3-a0b5-4255-99ce-25e196c3f1d3",
  "measureLabel" : "3",
  "begin" : "00:00:46.00",
  "end" : "00:00:47.00"
}, {
  "measureId" : "measure_d8353f2b-aa5f-4e3e-9dd1-188cc09d4260",
  "measureLabel" : "4",
  "begin" : "00:00:47.00",
  "end" : "00:00:48.00"
}, {
  "measureId" : "measure_9cc03fae-0e40-4996-be15-6dd6b122f1ba",
  "measureLabel" : "5",
  "begin" : "00:00:48.00",
  "end" : "00:00:49.00"
}, {
  "measureId" : "measure_9237d89f-4335-469e-b183-ebc4e50ae60b",
  "measureLabel" : "6",
  "begin" : "00:00:49.00",
  "end" : "00:00:50.00"
}, {
  "measureId" : "measure_75de0d89-f502-4550-8d6f-ffd6663de9a6",
  "measureLabel" : "7",
  "begin" : "00:00:50.00",
  "end" : "00:00:51.00"
}, {
  "measureId" : "measure_bba9927e-2bf2-4cb7-b5e6-7d47e339c24c",
  "measureLabel" : "8",
  "begin" : "00:00:51.00",
  "end" : "00:00:53.50"
}, {
  "measureId" : "measure_d9fb58a6-2efb-4099-9caa-4e85b77402a4",
  "measureLabel" : "9",
  "begin" : "00:00:53.50",
  "end" : "00:00:55.00"
}, {
  "measureId" : "measure_f2d334d9-6647-44b8-abbf-a1f9f39789a0",
  "measureLabel" : "10",
  "begin" : "00:00:55.00",
  "end" : "00:00:58.00"
}, {
  "measureId" : "measure_adb301f7-e4a6-4317-a6c0-bf511475f6ce",
  "measureLabel" : "11",
  "begin" : "00:00:58.00",
  "end" : "00:00:59.00"
}, {
  "measureId" : "measure_9bead268-b9f4-4dc8-8fa7-1ee41bdea50d",
  "measureLabel" : "12",
  "begin" : "00:00:59.00",
  "end" : "00:01:01.00"
}, {
  "measureId" : "measure_78839da8-f825-4e0c-9fb0-6e2d636b8fe7",
  "measureLabel" : "13",
  "begin" : "00:01:01.00",
  "end" : "00:01:03.00"
}, {
  "measureId" : "measure_4747d058-3681-4236-9ada-d7f89385a9e4",
  "measureLabel" : "14",
  "begin" : "00:01:03.00",
  "end" : "00:01:04.00"
}, {
  "measureId" : "measure_f8b4cdfe-fadc-437b-a8ab-8b2c92487cb0",
  "measureLabel" : "15",
  "begin" : "00:01:04.00",
  "end" : "00:01:05.00"
}, {
  "measureId" : "measure_bd89b1cc-f817-41c5-bb00-81a18573309f",
  "measureLabel" : "16",
  "begin" : "00:01:05.00",
  "end" : "00:01:07.00"
}, {
  "measureId" : "measure_4d4450d4-407e-46ce-9ace-387aa3aa6bc1",
  "measureLabel" : "17",
  "begin" : "00:01:07.00",
  "end" : "00:01:08.00"
}, {
  "measureId" : "measure_1a67eb57-3506-4695-acfe-ddd9ee9ad96a",
  "measureLabel" : "18",
  "begin" : "00:01:08.00",
  "end" : "00:01:10.00"
}, {
  "measureId" : "measure_54bf872b-4512-4d1d-880a-311939c37ab9",
  "measureLabel" : "19",
  "begin" : "00:01:10.00",
  "end" : "00:01:12.00"
}, {
  "measureId" : "measure_9d88ca5b-c9d7-48a2-9f28-78ec09b83740",
  "measureLabel" : "20",
  "begin" : "00:01:12.00",
  "end" : "00:01:14.00"
}, {
  "measureId" : "measure_881c5e7d-6bb1-48ec-a563-28e1591f2282",
  "measureLabel" : "21",
  "begin" : "00:01:14.00",
  "end" : "00:01:15.00"
}, {
  "measureId" : "measure_57ffcacb-80ee-40da-8119-241a89246dad",
  "measureLabel" : "22",
  "begin" : "00:01:15.00",
  "end" : "00:01:17.00"
}, {
  "measureId" : "measure_d255cf40-bb7e-427d-a8e5-c5613b7f4806",
  "measureLabel" : "23",
  "begin" : "00:01:17.00",
  "end" : "00:01:19.00"
}, {
  "measureId" : "measure_1c998e94-ac0a-4e79-a55d-28ce07e4cef0",
  "measureLabel" : "24",
  "begin" : "00:01:19.00",
  "end" : "00:01:20.00"
}, {
  "measureId" : "measure_fd86b010-ccbc-425f-a25a-75cc8eab0861",
  "measureLabel" : "25",
  "begin" : "00:01:20.00",
  "end" : "00:01:21.00"
}, {
  "measureId" : "measure_722f2016-0382-4e89-90e1-6170fc5478be",
  "measureLabel" : "26",
  "begin" : "00:01:21.00",
  "end" : "00:01:24.00"
}, {
  "measureId" : "measure_340701c9-eea5-40e5-9d55-394c9def1a17",
  "measureLabel" : "27",
  "begin" : "00:01:24.00",
  "end" : "00:01:26.00"
}, {
  "measureId" : "measure_e1dc744f-d38c-44e3-bf2e-e850181e074e",
  "measureLabel" : "28",
  "begin" : "00:01:26.00",
  "end" : "00:01:26.30"
}, {
  "measureId" : "measure_b67508ba-34e6-4be1-b20a-427e64cb2ea7",
  "measureLabel" : "29",
  "begin" : "00:01:26.30",
  "end" : "00:01:27.00"
}, {
  "measureId" : "measure_c56b4438-222c-49ee-aaa6-bb2bb5a36d3c",
  "measureLabel" : "30",
  "begin" : "00:01:27.00",
  "end" : "00:01:29.00"
}, {
  "measureId" : "measure_5239fcee-d367-4075-ad58-f249f0527d87",
  "measureLabel" : "31",
  "begin" : "00:01:29.00",
  "end" : "00:01:30.00"
}, {
  "measureId" : "measure_398a8162-b4f1-4c15-8f15-3b6ff1fca7b0",
  "measureLabel" : "32",
  "begin" : "00:01:30.00",
  "end" : "00:01:31.00"
}, {
  "measureId" : "measure_b38b3294-65e6-46d0-8802-03f72e8162c7",
  "measureLabel" : "33",
  "begin" : "00:01:31.00",
  "end" : "00:01:32.00"
}, {
  "measureId" : "measure_a6514fc6-5018-47c2-bd75-db9f14f98214",
  "measureLabel" : "34",
  "begin" : "00:01:32.00",
  "end" : "00:01:33.00"
}, {
  "measureId" : "measure_92839fb0-7a48-45a3-90b8-b3d5895a9f16",
  "measureLabel" : "35",
  "begin" : "00:01:33.00",
  "end" : "00:01:34.00"
}, {
  "measureId" : "measure_835b1386-8b5c-4b20-9136-8b444db0233e",
  "measureLabel" : "36",
  "begin" : "00:01:34.00",
  "end" : "00:01:35.00"
}, {
  "measureId" : "measure_09827342-7dab-4a19-900a-9ade9188874e",
  "measureLabel" : "37",
  "begin" : "00:01:35.00",
  "end" : "00:01:36.00"
}, {
  "measureId" : "measure_66cff867-c8c4-431a-88a8-cfff84ff6d6c",
  "measureLabel" : "38",
  "begin" : "00:01:36.00",
  "end" : "00:01:37.00"
}, {
  "measureId" : "measure_7dd0e093-af03-4dc1-9fa0-53a814f71344",
  "measureLabel" : "39",
  "begin" : "00:01:37.00",
  "end" : "00:01:38.00"
}, {
  "measureId" : "measure_671b8d0e-3f8d-4c5f-82af-f9b00ca7f98e",
  "measureLabel" : "40",
  "begin" : "00:01:38.00",
  "end" : "00:01:40.00"
}, {
  "measureId" : "measure_77df7e4b-4f88-4891-9cb4-db69514d539f",
  "measureLabel" : "41",
  "begin" : "00:01:40.00",
  "end" : "00:01:42.00"
}, {
  "measureId" : "measure_151c3883-c20e-44bb-ba07-0d0f56f73eff",
  "measureLabel" : "42",
  "begin" : "00:01:42.00",
  "end" : "00:01:42.30"
}, {
  "measureId" : "measure_8c53d0dc-3725-4f11-beeb-74fb465f8d06",
  "measureLabel" : "43",
  "begin" : "00:01:42.30",
  "end" : "00:01:43.00"
}, {
  "measureId" : "measure_5652ead8-4bc9-4a88-b856-343fd21319ab",
  "measureLabel" : "44",
  "begin" : "00:01:43.00",
  "end" : "00:01:44.00"
}, {
  "measureId" : "measure_ca3be987-c44f-4eec-bb7f-17fbb91902dd",
  "measureLabel" : "45",
  "begin" : "00:01:44.00",
  "end" : "00:01:45.00"
}, {
  "measureId" : "measure_6ad53ef0-c250-4828-b2f6-0eb482f9d125",
  "measureLabel" : "46",
  "begin" : "00:01:45.00",
  "end" : "00:01:46.00"
}, {
  "measureId" : "measure_644593ad-08f1-4a3d-a0e3-df7423ce7246",
  "measureLabel" : "47",
  "begin" : "00:01:46.00",
  "end" : "00:01:47.00"
}, {
  "measureId" : "measure_ad057595-292c-4f8f-863f-bd12b1f66a10",
  "measureLabel" : "48",
  "begin" : "00:01:47.00",
  "end" : "00:01:47.30"
}, {
  "measureId" : "measure_337c16fe-fb69-4eec-82a3-71a492b1dfe6",
  "measureLabel" : "49",
  "begin" : "00:01:47.30",
  "end" : "00:01:48.00"
}, {
  "measureId" : "measure_f22c4430-445f-4c9c-8352-6ee9525414c0",
  "measureLabel" : "50",
  "begin" : "00:01:48.00",
  "end" : "00:01:49.00"
}, {
  "measureId" : "measure_44b9df3d-2a8f-40a9-9222-f4855e64d769",
  "measureLabel" : "51",
  "begin" : "00:01:49.00",
  "end" : "00:01:50.30"
}, {
  "measureId" : "measure_9d3afc76-834b-4420-95eb-c17a67607094",
  "measureLabel" : "52",
  "begin" : "00:01:50.30",
  "end" : "00:01:51.00"
}, {
  "measureId" : "measure_8534ee71-0cf1-4e7d-a7b2-cf5a5d40bd74",
  "measureLabel" : "53",
  "begin" : "00:01:51.00",
  "end" : "00:01:52.00"
}, {
  "measureId" : "measure_f8fca3a7-6ac4-4d79-910c-8869baebfe85",
  "measureLabel" : "54",
  "begin" : "00:01:52.00",
  "end" : "00:01:53.00"
}, {
  "measureId" : "measure_0a47eb8c-1347-4159-aac8-0d43aae390b5",
  "measureLabel" : "55",
  "begin" : "00:01:53.00",
  "end" : "00:01:54.00"
}, {
  "measureId" : "measure_9baf9f39-f751-45b5-8b31-b9fb78752f40",
  "measureLabel" : "56",
  "begin" : "00:01:54.00",
  "end" : "00:01:55.00"
}, {
  "measureId" : "measure_812fca2c-72b5-420c-bd31-ccc46c37bcb2",
  "measureLabel" : "57",
  "begin" : "00:01:55.00",
  "end" : "00:01:56.00"
}, {
  "measureId" : "measure_27562ecb-06a6-44a6-a722-5984c0d3e26e",
  "measureLabel" : "58",
  "begin" : "00:01:56.00",
  "end" : "00:01:57.00"
}, {
  "measureId" : "measure_2b9c26d2-e7d9-4f15-bd65-51d006863a2b",
  "measureLabel" : "59",
  "begin" : "00:01:57.00",
  "end" : "00:01:58.00"
}, {
  "measureId" : "measure_2cf7bdf9-5e35-4061-9227-91e685be757f",
  "measureLabel" : "60",
  "begin" : "00:01:58.00",
  "end" : "00:01:59.00"
}, {
  "measureId" : "measure_fe214826-ac44-41ff-a209-df9f23f6ea89",
  "measureLabel" : "61",
  "begin" : "00:01:59.00",
  "end" : "00:02:00.00"
}, {
  "measureId" : "measure_b2062339-2078-4be3-b13b-65db6e3da240",
  "measureLabel" : "62",
  "begin" : "00:02:00.00",
  "end" : "00:02:01.00"
}, {
  "measureId" : "measure_343ef182-2e27-4ac5-81fc-f9d6d356d20a",
  "measureLabel" : "63",
  "begin" : "00:02:01.00",
  "end" : "00:02:02.00"
}, {
  "measureId" : "measure_61aec1bf-6a15-4aba-b666-7a8e1315d879",
  "measureLabel" : "64",
  "begin" : "00:02:02.00",
  "end" : "00:02:03.00"
}, {
  "measureId" : "measure_842dc64b-1d0e-4af0-8a9b-55bf533855f3",
  "measureLabel" : "65",
  "begin" : "00:02:03.00",
  "end" : "00:02:04.00"
}, {
  "measureId" : "measure_ad26d54d-e74d-4c02-9e1f-feaabdc7241d",
  "measureLabel" : "66",
  "begin" : "00:02:04.00",
  "end" : "00:02:05.00"
}, {
  "measureId" : "measure_eccc45df-67e7-4feb-be89-143ce1769a93",
  "measureLabel" : "67",
  "begin" : "00:02:05.00",
  "end" : "00:02:06.00"
}, {
  "measureId" : "measure_a9c39d50-26b6-4168-92bc-f2f55f0d9f4b",
  "measureLabel" : "68",
  "begin" : "00:02:06.00",
  "end" : "00:02:07.00"
}, {
  "measureId" : "measure_4cdb2e2f-53d1-44f2-95ce-eb1b707f91f8",
  "measureLabel" : "69",
  "begin" : "00:02:07.00",
  "end" : "00:02:08.00"
}, {
  "measureId" : "measure_44f7671d-f058-4e30-bb91-ff7979ca3783",
  "measureLabel" : "70",
  "begin" : "00:02:08.00",
  "end" : "00:02:08.30"
}, {
  "measureId" : "measure_d0222e50-4e54-4a7e-88cf-6886bbb8b7d9",
  "measureLabel" : "71",
  "begin" : "00:02:08.30",
  "end" : "00:02:09.00"
}, {
  "measureId" : "measure_9bab9a74-3b1d-452a-8bb6-518feccf536d",
  "measureLabel" : "72",
  "begin" : "00:02:09.00",
  "end" : "00:02:10.00"
}, {
  "measureId" : "measure_f82086b0-e269-4796-b8d7-f7e6a702f980",
  "measureLabel" : "73",
  "begin" : "00:02:10.00",
  "end" : "00:02:11.00"
}, {
  "measureId" : "measure_625aac1e-dedc-4744-9c45-6a943a223f1d",
  "measureLabel" : "74",
  "begin" : "00:02:11.00",
  "end" : "00:02:12.00"
}, {
  "measureId" : "measure_b4975376-034a-4c9a-94f7-e7b1fb354b8a",
  "measureLabel" : "75",
  "begin" : "00:02:12.00",
  "end" : "00:02:12.30"
}, {
  "measureId" : "measure_46f1393b-c79f-4654-8a01-07296e5369e3",
  "measureLabel" : "76",
  "begin" : "00:02:12.30",
  "end" : "00:02:13.00"
}, {
  "measureId" : "measure_6134457f-4792-4e25-ad91-44aa889fd55d",
  "measureLabel" : "77",
  "begin" : "00:02:13.00",
  "end" : "00:02:14.00"
}, {
  "measureId" : "measure_d5edcd9f-74a0-4d16-a0ce-6fe751dce840",
  "measureLabel" : "78",
  "begin" : "00:02:14.00",
  "end" : "00:02:15.00"
}, {
  "measureId" : "measure_285db539-3e72-4016-b04b-a0a2bd39beaa",
  "measureLabel" : "79",
  "begin" : "00:02:15.00",
  "end" : "00:02:16.00"
}, {
  "measureId" : "measure_5855a0e3-70b7-4629-b917-48c4aef0e5af",
  "measureLabel" : "80",
  "begin" : "00:02:16.00",
  "end" : "00:02:17.00"
}, {
  "measureId" : "measure_d9d4e44f-c30d-4166-a4b6-a6cda0ffaa6f",
  "measureLabel" : "81",
  "begin" : "00:02:17.00",
  "end" : "00:02:18.00"
}, {
  "measureId" : "measure_be677941-7922-4861-9c47-66a505c857c4",
  "measureLabel" : "82",
  "begin" : "00:02:18.00",
  "end" : "00:02:18.30"
}, {
  "measureId" : "measure_878df383-0f71-485f-9a0a-8de65fecc9c4",
  "measureLabel" : "83",
  "begin" : "00:02:18.30",
  "end" : "00:02:19.00"
}, {
  "measureId" : "measure_24c29584-6265-43a3-a113-1be0c4f13db4",
  "measureLabel" : "84",
  "begin" : "00:02:19.00",
  "end" : "00:02:19.30"
}, {
  "measureId" : "measure_ceebba59-838b-4b9f-bf29-cf83a47a3433",
  "measureLabel" : "85",
  "begin" : "00:02:19.30",
  "end" : "00:02:20.00"
}, {
  "measureId" : "measure_aa0abe10-6d9d-4ad5-b75a-6e883769b055",
  "measureLabel" : "86",
  "begin" : "00:02:20.00",
  "end" : "00:02:21.00"
}, {
  "measureId" : "measure_6574f8fd-d7a8-4332-b7ab-c876978cb847",
  "measureLabel" : "87",
  "begin" : "00:02:21.00",
  "end" : "00:02:22.00"
}, {
  "measureId" : "measure_ddb00fb3-434e-463b-ac7b-e735e463e79b",
  "measureLabel" : "88",
  "begin" : "00:02:22.00",
  "end" : "00:02:23.00"
}, {
  "measureId" : "measure_6abc6a6e-7c8a-4843-aff5-e980e64910c0",
  "measureLabel" : "89",
  "begin" : "00:02:23.00",
  "end" : "00:02:24.00"
}, {
  "measureId" : "measure_bc75919e-fa8c-4659-b93d-1492f22c9191",
  "measureLabel" : "90",
  "begin" : "00:02:24.00",
  "end" : "00:00:25.00"
}, {
  "measureId" : "measure_8e247ca8-0826-4627-9a58-253b4587931f",
  "measureLabel" : "91",
  "begin" : "00:02:25.00",
  "end" : "00:02:25.30"
} ]
`;

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





