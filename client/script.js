webSocket = new WebSocket("ws://localhost:8080");

webSocket.onopen = (event) => {
    console.log("Sending data!");
    webSocket.send("Here's some text that the server is urgently awaiting!");
};

webSocket.onmessage = (event) => {
    console.log("Received data!");
    console.log(event.data);
};