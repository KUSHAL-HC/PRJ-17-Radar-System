import { useEffect, useState } from "react";
import socket from "./services/socket";

function App() {
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [message, setMessage] = useState("");

  useEffect(() => {
    socket.on("connect", () => {
      setConnectionStatus("Connected");
      console.log("Socket connected:", socket.id);
    });

    socket.on("radar:connected", (data) => {
      setMessage(data.message);
    });

    socket.on("disconnect", () => {
      setConnectionStatus("Disconnected");
    });

    return () => {
      socket.off("connect");
      socket.off("radar:connected");
      socket.off("disconnect");
    };
  }, []);

  return (
    <div>
      <h1>PRJ-17 Radar System</h1>

      <p>Socket Status: {connectionStatus}</p>

      <p>{message}</p>
    </div>
  );
}

export default App;