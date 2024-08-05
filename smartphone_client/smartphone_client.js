
const connectBtn = document.querySelector("#connect-btn");

const sessionIdInput = document.querySelector("#session-id-input");
const messageInput = document.querySelector("#message-input");
const sendMessageBtn = document.querySelector("#send-message-btn");

const webSocket = new WebSocket("http://localhost:3000");
let sessionId = null;

connectBtn.addEventListener("click", () => {
    if (connectBtn.dataset.connected === "false") {
        sessionId = sessionIdInput.value;
        connectBtn.dataset.connected = "true";
        connectBtn.textContent = "Close Connection";
        console.log(`Sending sessionId ${sessionId} to server`);
        const messageString = JSON.stringify({ request: "mergeSessions", sessionId: sessionId });
        webSocket.send(messageString);
    }
    else {
        webSocket.close();
    }

    webSocket.onopen = (event) => {
        console.log("Connection opened!");

    };

    webSocket.onclose = (event) => {
        console.log("Connection closed!");
        connectBtn.dataset.connected = "false";
        connectBtn.textContent = "Open Connection";
    };

    webSocket.onmessage = (event) => {
        console.log("Received data!");
        console.log(event.data);
    };
});

sendMessageBtn.addEventListener("click", () => {
    const message = messageInput.value;
    const messageString = JSON.stringify({ message: message });
    webSocket.send(messageString);
});

