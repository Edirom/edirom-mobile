
// const sessionConnectBtn = document.querySelector("#session-connect-btn");
// const sessionIdInput = document.querySelector("#session-id-input");
// const messageInput = document.querySelector("#message-input");
// const sendMessageBtn = document.querySelector("#send-message-btn");
const serverConnectionStatusP = document.querySelector("#server-connection-status");
const sessionConnectionStatusP = document.querySelector("#session-connection-status");
// const sessionConnectorControls = document.querySelector("#session-connector-controls");
// const pageTurnerControls = document.querySelector("#page-turner-controls");


const webSocket = new WebSocket("http://localhost:3000");
let sessionId = null;

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
        console.log("Session connected!");
        sessionConnectionStatusP.classList.add("connected");
        sessionConnectionStatusP.classList.remove("disconnected");
        sessionConnectionStatusP.textContent = `SESSION: ${sessionId}`;
        // sessionConnectorControls.classList.add("hidden");
        // pageTurnerControls.classList.remove("hidden");
    }
};

// sessionConnectBtn.addEventListener("click", () => {
//     sessionId = sessionIdInput.value;
//     console.log(`Sending sessionId ${sessionId} to server`);
//     let deviceInfo = `${getDeviceType()} (${getOs()}; ${getBrowser()})`;
//     const messageString = JSON.stringify({ request: "mergeSessions", sessionId: sessionId, deviceInfo: deviceInfo });
//     webSocket.send(messageString);

//     //TODO: What to do when merge with sessionId not successful
// });

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


Html5Qrcode.getCameras().then(devices => {
    /**
     * devices would be an array of objects of type:
     * { id: "id", label: "label" }
     */
    console.log(devices);
    if (devices && devices.length) {
        var cameraId = devices[0].id;
        for (let device of devices) {
            if (device.label.includes("back")) { // Das ist noch sehr schlecht. Hier muss ich mal schauen, was der beste Weg ist. Irgendwie geht der Standardweg von der Library in Firefox nicht richtig?
                cameraId = device.id;
            }
        }
        // .. use this to start scanning.
        const html5QrCode = new Html5Qrcode(/* element id */ "reader");
        html5QrCode.start(
            cameraId,
            {
                fps: 20,    // Optional, frame per seconds for qr code scanning
                videoConstraints: { // Hier muss man in Firefox aufpassen. Manche Anageben, wie z.B. "ideal" scheinen nicht zu funktionieren. Außerdem: Wo wird jetzt die FPS gesetzt?
                    "width": 2000,
                    "height": 2000,
                    "frameRate": 30,
                    "deviceId": cameraId
                }
            },
            (decodedText, decodedResult) => {
                // do something when code is read
                window.alert(decodedText);
            },
            (errorMessage) => {
                // parse error, ignore it.
            })
            .catch((err) => {
                // Start failed, handle it.
            });
    }
}).catch(err => {
    // handle err
});



