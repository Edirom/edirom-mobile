
const sessionConnectBtn = document.querySelector("#session-connect-btn");
const sessionIdInput = document.querySelector("#session-id-input");
const messageInput = document.querySelector("#message-input");
const sendMessageBtn = document.querySelector("#send-message-btn");
const serverConnectionStatusP = document.querySelector("#server-connection-status");
const sessionConnectionStatusP = document.querySelector("#session-connection-status");
const sessionConnectorControls = document.querySelector("#session-connector-controls");
const pageTurnerControls = document.querySelector("#page-turner-controls");

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
    connectionStatusP.textContent = "SERVER: Not Connected";
    connectionStatusP.classList.remove("connected");
    connectionStatusP.classList.add("disconnected");
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
        sessionConnectorControls.classList.add("hidden");
        pageTurnerControls.classList.remove("hidden");
    }
};

sessionConnectBtn.addEventListener("click", () => {
    sessionId = sessionIdInput.value;
    console.log(`Sending sessionId ${sessionId} to server`);
    const messageString = JSON.stringify({ request: "mergeSessions", sessionId: sessionId });
    webSocket.send(messageString);

    //TODO: What to do when merge with sessionId not successful
});

sendMessageBtn.addEventListener("click", () => {
    const message = messageInput.value;
    const messageString = JSON.stringify({ message: message });
    webSocket.send(messageString);
});

