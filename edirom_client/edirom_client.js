
const connectBtn = document.querySelector("#connect-btn");

connectBtn.addEventListener("click", () => {
    if (connectBtn.dataset.connected === "false") {
        webSocket = new WebSocket("ws://localhost:8080");
    }
    else {
        webSocket.close();
    }

    webSocket.onopen = (event) => {
        console.log("Connection opened!");
        connectBtn.dataset.connected = "true";
        connectBtn.textContent = "Close Connection";
        console.log("Sending data!");
        webSocket.send("Here's some text that the server is urgently awaiting!");
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

